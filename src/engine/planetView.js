import * as THREE from 'three';
import { mulberry32 } from '../lib/random.js';

// Портрет планеты в досье: отдельный небольшой холст со своей WebGL-сценой.
// Поверхность, облака, атмосфера и кольца целиком рисуются шейдерами из шума — текстуры не нужны.
// Облик задаётся объектом look в модуле галактики; всё, что не указано, берётся из LOOK_DEFAULTS.

export const LOOK_DEFAULTS = {
  // 'gas' — газовый или ледяной гигант (полосы облаков), 'rock' — твёрдая поверхность
  type: 'rock',
  seed: 1,
  // gas: четыре цвета полос; rock: глубина, мелководье, низины, возвышенности, вершины
  colors: ['#123', '#246', '#563', '#875', '#eee'],
  // Гиганты: число полос, завихрённость, вихрь { lat, lon (градусы), size, color }
  bands: 8,
  turbulence: 0.5,
  storm: null,
  // Твёрдые планеты: уровень моря 0…1, масштаб материков, рельеф, широта полярных шапок (> 1 — без шапок)
  sea: 0.5,
  scale: 1.5,
  relief: 1,
  ice: 0.82,
  iceColor: '#eef3f8',
  // Трещины: сколько, какого цвета и светятся ли сами (лава) — вместе с glow светятся и «моря»
  cracks: 0,
  crackColor: '#ff7a2a',
  glow: 0,
  // Блик звезды на «морях» (0 — матовые, например солончаки)
  shine: 1,
  // Доля неба, закрытая облаками
  clouds: 0,
  cloudColor: '#ffffff',
  // Цвет атмосферы по краю диска (null — без атмосферы) и её плотность
  atmosphere: null,
  haze: 0.6,
  // Кольца в радиусах планеты: { inner, outer, colors: [a, b], opacity }
  ring: null,
  // Наклон оси (градусы), скорость вращения (1 — оборот примерно за 40 с), цвет и сила света звезды
  tilt: 15,
  spin: 1,
  star: '#fff4e6',
  light: 1,
};

const DEG = Math.PI / 180;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Звезда светит слева и чуть спереди: виден и день, и широкая полоса ночи справа
const LIGHT = new THREE.Vector3(-0.9, 0.28, 0.35).normalize();
const FOV = 30;
const HALO = 1.07;

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * noise(p);
      p = p * 2.03 + vec3(3.1, 1.7, 5.3);
      a *= 0.5;
    }
    return s / 0.96875;
  }
  // Изолиния шума: 1 на линии, где шум равен 0,5, и быстро спадает в стороны
  float ridge(vec3 p) {
    return 1.0 - abs(noise(p) * 2.0 - 1.0);
  }
  // fbm кучкуется около 0,5 — растягиваем на весь диапазон 0…1
  float spread(float v) {
    return clamp((v - 0.5) * 2.4 + 0.5, 0.0, 1.0);
  }

  uniform vec4 uRing; // внутренний и внешний радиус, непрозрачность, есть ли кольца
  uniform float uRingSeed;
  float ringDensity(float r) {
    float t = (r - uRing.x) / (uRing.y - uRing.x);
    if (t < 0.0 || t > 1.0) return 0.0;
    float n = noise(vec3(t * 22.0, uRingSeed, 0.5)) * 0.6 + noise(vec3(t * 70.0, uRingSeed, 3.5)) * 0.4;
    float d = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t) * (0.25 + 0.75 * n);
    // Тёмная щель, как деление Кассини у Сатурна
    return d * (1.0 - 0.9 * (1.0 - smoothstep(0.0, 0.025, abs(t - 0.64))));
  }
`;

const sphereVertex = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vObj = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const planetFragment = /* glsl */ `
  ${NOISE}
  uniform float uGas;
  uniform vec3 uSeed;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  uniform vec3 uC4;
  uniform float uBands;
  uniform float uTurb;
  uniform vec4 uStorm; // широта, долгота (рад), размер, есть ли вихрь
  uniform vec3 uStormColor;
  uniform float uSea;
  uniform float uScale;
  uniform float uRelief;
  uniform float uIce;
  uniform vec3 uIceColor;
  uniform float uCracks;
  uniform vec3 uCrackColor;
  uniform float uGlow;
  uniform float uShine;
  uniform float uClouds;
  uniform vec3 uCloudColor;
  uniform vec3 uAtmo;
  uniform float uHaze;
  uniform vec3 uLight;
  uniform vec3 uLightColor;
  uniform vec3 uRingNormal;
  uniform float uTime;
  varying vec3 vObj;
  varying vec3 vNormal;
  varying vec3 vWorld;

  // Рельеф без карты нормалей: наклоняем нормаль по экранным производным высоты
  vec3 perturb(vec3 n, vec3 pos, float h) {
    vec3 dpx = dFdx(pos);
    vec3 dpy = dFdy(pos);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }

  vec3 gasColor(vec3 p) {
    vec3 q = p + uSeed;
    // Шум, растянутый вдоль параллелей, рисует полосы; второй слой их завихряет
    float w = fbm(vec3(q.x * 1.6, q.y * 9.0, q.z * 1.6)) - 0.5;
    float w2 = fbm(q * 4.0 + w * 3.0) - 0.5;
    float lat = p.y;
    float storm = 0.0;
    if (uStorm.w > 0.5) {
      float la = asin(clamp(p.y, -1.0, 1.0));
      float dl = atan(p.z, p.x) - uStorm.y;
      dl = atan(sin(dl), cos(dl));
      vec2 d = vec2(dl * cos(la) / (uStorm.z * 1.7), (la - uStorm.x) / uStorm.z);
      float r = length(d);
      storm = 1.0 - smoothstep(0.55, 1.0, r);
      // Полосы обтекают вихрь
      lat += (1.0 - smoothstep(0.0, 1.6, r)) * d.y * uStorm.z * 0.6;
      w2 += sin(atan(d.y, d.x) * 2.0 + r * 9.0) * 0.12 * (1.0 - smoothstep(0.3, 1.2, r));
    }
    float t = lat * uBands + w * uTurb * 2.0 + w2 * uTurb * 0.6;
    float s1 = 0.5 + 0.5 * sin(t * 3.14159);
    float s2 = 0.5 + 0.5 * sin(t * 3.14159 * 2.31 + 1.3);
    vec3 col = mix(uC0, uC1, smoothstep(0.15, 0.85, s1));
    col = mix(col, uC2, smoothstep(0.6, 0.95, s2) * 0.75);
    float spots = fbm(q * vec3(3.0, 16.0, 3.0) + w2);
    col = mix(col, uC3, smoothstep(0.58, 0.75, spots) * 0.5);
    col = mix(col, uStormColor * (1.0 + 0.4 * w2), storm);
    return col;
  }

  void main() {
    vec3 p = normalize(vObj);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = uLight;
    vec3 col;
    vec3 emit = vec3(0.0);
    float wet = 0.0;
    float bump = 0.0;

    if (uGas > 0.5) {
      col = gasColor(p);
      emit = col * uGlow * 0.3;
    } else {
      vec3 q = p * uScale + uSeed;
      vec3 warp = vec3(fbm(q * 0.8 + 11.3), fbm(q * 0.8 + 27.1), fbm(q * 0.8 + 41.7)) - 0.5;
      float h = spread(fbm(q + warp * 1.2));
      float detail = fbm(q * 5.0 + 7.0);
      float land = smoothstep(uSea - 0.004, uSea + 0.004, h);
      // Высота над морем; на океанских мирах суши мало, и без нижней границы она вся ушла бы в «вершины»
      float e = clamp((h - uSea) / max(1.0 - uSea, 0.45), 0.0, 1.0);
      vec3 water = mix(uC0, uC1, smoothstep(uSea - 0.16, uSea, h));
      float g = e + (detail - 0.5) * 0.35;
      vec3 ground = mix(uC2, uC3, smoothstep(0.05, 0.5, g));
      ground = mix(ground, uC4, smoothstep(0.5, 0.75, g));
      ground *= 0.85 + 0.3 * detail;
      col = mix(water, ground, land);

      float crack;
      if (uGlow > 0.0) {
        // Лава: сеть замкнутых швов между плитами застывшей коры
        float rg = ridge(q * 3.2 + warp * 2.0);
        float rg2 = ridge(q * 7.5 - warp * 3.0);
        crack = smoothstep(0.94, 0.99, rg) + 0.6 * smoothstep(0.95, 0.99, rg2);
      } else {
        // Лёд и камень: длинные пересекающиеся разломы, как на Европе
        vec3 cq = q + warp * 1.5;
        float a = ridge(cq * vec3(0.8, 3.6, 0.8));
        float b = ridge(cq.zxy * vec3(0.8, 3.6, 0.8) + 17.0);
        float c = ridge(cq.yzx * vec3(0.8, 3.6, 0.8) + 31.0);
        crack = smoothstep(0.965, 0.995, max(a, max(b, c)));
      }
      crack = clamp(crack * uCracks, 0.0, 1.0);

      float ice = smoothstep(uIce, uIce + 0.04, abs(p.y) + (detail - 0.5) * 0.3 + e * 0.12);
      col = mix(col, uIceColor * (0.9 + 0.2 * detail), ice);

      if (uGlow > 0.0) {
        // Лава: «моря» и трещины светятся сами, и на ночной стороне тоже
        emit = uGlow * ((1.0 - land) * water * (0.5 + detail) + crack * uCrackColor);
        col = mix(col, col * 0.4, crack);
      } else {
        col = mix(col, uCrackColor, crack);
        wet = (1.0 - land) * (1.0 - ice) * uShine;
      }
      bump = (land * e - crack * 0.3) * uRelief;
    }

    vec3 Nb = uGas > 0.5 ? N : perturb(N, vWorld, bump * 0.03);
    float ndl = dot(N, L);
    float soft = uHaze > 0.0 ? 0.12 : 0.03;
    float diff = clamp((dot(Nb, L) + soft) / (1.0 + soft), 0.0, 1.0);

    // Тень колец на планете
    float shade = 1.0;
    if (uRing.w > 0.5) {
      float dn = dot(L, uRingNormal);
      if (abs(dn) > 0.001) {
        float t = -dot(vWorld, uRingNormal) / dn;
        if (t > 0.0) shade = 1.0 - 0.75 * ringDensity(length(vWorld + L * t));
      }
    }

    vec3 lit = col * uLightColor * diff * shade + col * 0.012;
    // Блик звезды на воде
    vec3 H = normalize(L + V);
    lit += uLightColor * wet * pow(max(dot(N, H), 0.0), 70.0) * 0.5 * step(0.0, ndl) * shade;

    if (uClouds > 0.0) {
      // Облака плывут чуть быстрее поверхности
      float a = uTime * 0.012;
      vec3 cp = vec3(p.x * cos(a) - p.z * sin(a), p.y, p.x * sin(a) + p.z * cos(a));
      // Облака вытянуты вдоль параллелей и закручены, как циклоны
      vec3 cq = cp * 3.2 + uSeed * 1.7;
      vec3 cw = vec3(fbm(cq * 0.6 + 5.0), fbm(cq * 0.6 + 9.0), fbm(cq * 0.6 + 13.0)) - 0.5;
      float c = spread(fbm(cq * vec3(1.0, 2.4, 1.0) + cw * 3.0));
      float cover = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.35, c) * 0.94;
      float cdiff = clamp((ndl + 0.15) / 1.15, 0.0, 1.0);
      lit = mix(lit, uCloudColor * (uLightColor * cdiff * shade + 0.01), cover);
      emit *= 1.0 - 0.75 * cover;
    }
    lit += emit;

    if (uHaze > 0.0) {
      // Атмосфера: голубая (или другая) кайма по краю дневной стороны
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
      float day = smoothstep(-0.25, 0.5, ndl);
      lit = mix(lit, uAtmo * uLightColor * day, fres * uHaze * 0.85);
      lit += uAtmo * uLightColor * day * fres * uHaze * 0.25;
    }

    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 uAtmo;
  uniform float uHaze;
  uniform vec3 uLight;
  uniform vec3 uLightColor;
  uniform float uLimb;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    // Видна только задняя сторона сферы-ореола: у края планеты ярче, наружу гаснет
    float edge = -dot(normalize(vNormal), normalize(cameraPosition - vWorld));
    float k = pow(clamp(edge / uLimb, 0.0, 1.0), 3.0);
    float day = smoothstep(-0.35, 0.6, dot(normalize(vWorld), uLight));
    gl_FragColor = vec4(uAtmo * uLightColor * k * day * uHaze * 0.9, 1.0);
    #include <colorspace_fragment>
  }
`;

const ringVertex = /* glsl */ `
  varying vec3 vWorld;
  varying float vR;
  void main() {
    vR = length(position.xy);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const ringFragment = /* glsl */ `
  ${NOISE}
  uniform vec3 uRingA;
  uniform vec3 uRingB;
  uniform vec3 uLight;
  uniform vec3 uLightColor;
  varying vec3 vWorld;
  varying float vR;
  void main() {
    float d = ringDensity(vR);
    if (d < 0.002) discard;
    float t = (vR - uRing.x) / (uRing.y - uRing.x);
    vec3 col = mix(uRingA, uRingB, noise(vec3(t * 9.0, uRingSeed + 4.0, 1.0)));
    // Тень планеты на кольцах
    float tt = dot(-vWorld, uLight);
    float sh = tt > 0.0 ? smoothstep(0.97, 1.03, length(vWorld + uLight * tt)) : 1.0;
    gl_FragColor = vec4(col * uLightColor * (0.06 + 0.94 * sh), clamp(d * uRing.z, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

let ctx = null;

function setup() {
  if (ctx !== null) return ctx;
  try {
    const canvas = document.createElement('canvas');
    canvas.className = 'planet-view__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const color = () => ({ value: new THREE.Color() });
    const u = {
      uGas: { value: 0 },
      uSeed: { value: new THREE.Vector3() },
      uC0: color(),
      uC1: color(),
      uC2: color(),
      uC3: color(),
      uC4: color(),
      uBands: { value: 8 },
      uTurb: { value: 0.5 },
      uStorm: { value: new THREE.Vector4() },
      uStormColor: color(),
      uSea: { value: 0.5 },
      uScale: { value: 1.5 },
      uRelief: { value: 1 },
      uIce: { value: 0.8 },
      uIceColor: color(),
      uCracks: { value: 0 },
      uCrackColor: color(),
      uGlow: { value: 0 },
      uShine: { value: 1 },
      uClouds: { value: 0 },
      uCloudColor: color(),
      uAtmo: color(),
      uHaze: { value: 0 },
      uLight: { value: LIGHT },
      uLightColor: color(),
      uRing: { value: new THREE.Vector4() },
      uRingSeed: { value: 0 },
      uRingA: color(),
      uRingB: color(),
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uLimb: { value: Math.sqrt(1 - 1 / (HALO * HALO)) },
      uTime: { value: 0 },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    // Наклон оси — на этой группе; кольца лежат в её экваторе и не вращаются
    const tilt = new THREE.Group();
    scene.add(tilt);
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 64),
      new THREE.ShaderMaterial({ vertexShader: sphereVertex, fragmentShader: planetFragment, uniforms: u }),
    );
    tilt.add(planet);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(HALO, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: sphereVertex,
        fragmentShader: haloFragment,
        uniforms: u,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    tilt.add(halo);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.2, 192, 1),
      new THREE.ShaderMaterial({
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        uniforms: u,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);

    ctx = { canvas, renderer, scene, camera, tilt, planet, halo, ring, u, look: null, ringKey: '', time: 0, last: 0, raf: 0, visible: false };

    // Рисуем только пока портрет на экране: досье закрыто или прокручено — видеокарта отдыхает
    new IntersectionObserver(([entry]) => {
      ctx.visible = entry.isIntersecting;
      if (ctx.visible) kick();
    }).observe(canvas);
    new ResizeObserver(() => {
      if (!canvas.isConnected) return;
      resize();
      kick();
    }).observe(canvas);
  } catch {
    // Без второго WebGL-контекста досье просто обходится без портрета
    ctx = false;
  }
  return ctx;
}

function apply(look) {
  const L = { ...LOOK_DEFAULTS, ...look };
  const { u, tilt, halo, ring } = ctx;
  const gas = L.type === 'gas';
  const rand = mulberry32(L.seed * 7919 + 13);
  u.uGas.value = gas ? 1 : 0;
  u.uSeed.value.set(rand() * 100, rand() * 100, rand() * 100);
  for (let i = 0; i < 5; i++) u[`uC${i}`].value.set(L.colors[Math.min(i, L.colors.length - 1)]);
  u.uBands.value = L.bands;
  u.uTurb.value = L.turbulence;
  if (L.storm) {
    u.uStorm.value.set(L.storm.lat * DEG, L.storm.lon * DEG, L.storm.size, 1);
    u.uStormColor.value.set(L.storm.color);
  } else {
    u.uStorm.value.set(0, 0, 1, 0);
  }
  u.uSea.value = L.sea;
  u.uScale.value = L.scale;
  u.uRelief.value = L.relief;
  u.uIce.value = L.ice;
  u.uIceColor.value.set(L.iceColor);
  u.uCracks.value = L.cracks;
  u.uCrackColor.value.set(L.crackColor);
  u.uGlow.value = L.glow;
  u.uShine.value = L.shine;
  u.uClouds.value = L.clouds;
  u.uCloudColor.value.set(L.cloudColor);
  u.uHaze.value = L.atmosphere ? L.haze : 0;
  if (L.atmosphere) u.uAtmo.value.set(L.atmosphere);
  halo.visible = Boolean(L.atmosphere);
  u.uLightColor.value.set(L.star).multiplyScalar(L.light * 1.35);

  ring.visible = Boolean(L.ring);
  if (L.ring) {
    const key = `${L.ring.inner}|${L.ring.outer}`;
    if (key !== ctx.ringKey) {
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(L.ring.inner, L.ring.outer, 192, 1);
      ctx.ringKey = key;
    }
    u.uRing.value.set(L.ring.inner, L.ring.outer, L.ring.opacity ?? 0.8, 1);
    u.uRingSeed.value = rand() * 50;
    u.uRingA.value.set(L.ring.colors[0]);
    u.uRingB.value.set(L.ring.colors[1]);
  } else {
    u.uRing.value.set(1, 2, 0, 0);
  }

  // Северный полюс чуть повёрнут к нам — кольца раскрываются эллипсом
  tilt.rotation.set(0.38, 0, -L.tilt * DEG);
  tilt.updateMatrixWorld(true);
  u.uRingNormal.value.set(0, 1, 0).applyQuaternion(tilt.quaternion);
  ctx.spin = L.spin;
  ctx.ringR = L.ring ? L.ring.outer : 0;
  ctx.look = look;
}

// Камера отходит так, чтобы планета с ореолом занимала долю fill высоты кадра,
// а кольца (не шире ringR) помещались в ширину
function frameCamera(w, h, fill, ringR = ctx.ringR) {
  const { camera } = ctx;
  camera.aspect = w / h;
  const t = Math.tan((FOV * DEG) / 2);
  const dist = Math.max(HALO / (t * fill * Math.min(1, camera.aspect)), ringR / (t * camera.aspect * 0.94));
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function resize() {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  if (!w || !h) return;
  ctx.renderer.setSize(w, h, false);
  frameCamera(w, h, 0.66);
}

function draw(dt) {
  ctx.time += dt;
  ctx.u.uTime.value = ctx.time;
  ctx.planet.rotation.y = ctx.time * 0.16 * ctx.spin;
  ctx.renderer.render(ctx.scene, ctx.camera);
}

function frame(now) {
  ctx.raf = 0;
  if (!ctx.canvas.isConnected || !ctx.visible || !ctx.look) {
    // После паузы вращение продолжится с того же места, без рывка
    ctx.last = 0;
    return;
  }
  const dt = reducedMotion || !ctx.last ? 0 : Math.min((now - ctx.last) / 1000, 0.1);
  ctx.last = now;
  draw(dt);
  if (!reducedMotion) kick();
}

function kick() {
  if (!ctx.raf) ctx.raf = requestAnimationFrame(frame);
}

// Показать вращающуюся планету внутри container. Возвращает false, если WebGL недоступен.
export function showPlanet(container, look) {
  if (!setup()) return false;
  apply(look);
  ctx.time = 0;
  container.append(ctx.canvas);
  resize();
  kick();
  return true;
}

const thumbs = new WeakMap();

// Неподвижная миниатюра планеты для списка в досье (data-URL) или null без WebGL.
export function planetThumbnail(look, size = 96) {
  if (thumbs.has(look)) return thumbs.get(look);
  if (!setup()) return null;
  const { renderer, canvas } = ctx;
  apply(look);
  renderer.setSize(size, size, false);
  // Кольца в миниатюре можно и обрезать — важнее, чтобы сама планета была крупной
  frameCamera(size, size, 0.9, Math.min(ctx.ringR, 1.75));
  ctx.planet.rotation.y = 0.6;
  ctx.u.uTime.value = 0;
  renderer.render(ctx.scene, ctx.camera);
  const url = canvas.toDataURL();
  thumbs.set(look, url);
  ctx.look = null;
  return url;
}
