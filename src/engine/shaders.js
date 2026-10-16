// GLSL для всех слоёв галактики.
// uBand — веса диапазонов: x — видимый, y — инфракрасный, z — Hα, w — рентген.
// При смене фильтра веса плавно перетекают, поэтому каждый слой считает цвет во всех четырёх.

const noiseGLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

export const pointsVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aNormal;

  uniform vec4 uBand;
  uniform vec3 uVis;
  uniform vec3 uIr;
  uniform vec3 uHa;
  uniform vec3 uX;
  uniform float uXFromColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uFacingMode;
  uniform float uFadeBig;
  uniform float uIntensity;
  uniform vec3 uCamPos;

  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;

    float z = max(-mv.z, 0.001);
    float px = aSize * uScale / z;
    float minPx = uMinPx * uPixelRatio;
    float maxPx = uMaxPx * uPixelRatio;
    float k = 1.0;
    if (px < minPx) {
      // Слишком мелкие точки не мерцают, а тускнеют: поток света сохраняется.
      k = (px * px) / (minPx * minPx);
      px = minPx;
    } else if (px > maxPx) {
      // Облако у самой камеры гаснет, а не раздувается на весь экран:
      // иначе тысячи таких спрайтов перекрашивают каждый пиксель сотни раз.
      k = 1.0 - uFadeBig * smoothstep(maxPx, maxPx * 2.0, px);
      px = maxPx;
    }

    float lum = dot(aColor, vec3(0.299, 0.587, 0.114));
    float vary = 0.55 + 0.9 * aSeed;
    vec3 xCol = mix(uX * lum * vary, aColor * uX, uXFromColor);
    vec3 c = aColor * uVis * uBand.x
           + uIr * lum * vary * uBand.y
           + uHa * lum * vary * uBand.z
           + xCol * uBand.w;

    // Помощники для вида с ребра видны, только когда их диск повёрнут к нам ребром.
    // Точки без нормали (хвосты, облака) видны всегда.
    if (uFacingMode != 0.0 && dot(aNormal, aNormal) > 0.25) {
      float facing = abs(dot(normalize(uCamPos - world.xyz), aNormal));
      float f = smoothstep(0.08, 0.45, facing);
      c *= uFacingMode > 0.0 ? f : (1.0 - f);
    }
    vColor = c * k * uIntensity;

    // Невидимую точку (не тот фильтр, диск повёрнут плашмя, облако погасло) не растеризуем вовсе
    if (max(vColor.r, max(vColor.g, vColor.b)) < 1e-5) {
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    gl_Position = projectionMatrix * mv;
    gl_PointSize = px;
  }
`;

export const pointsFragment = /* glsl */ `
  ${noiseGLSL}
  uniform float uSoft;
  uniform float uNebula;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float a = (exp(-r2 * uSoft) - exp(-uSoft)) / (1.0 - exp(-uSoft));
    // Туманности и пыль — не ровные шарики, а рваные клочья
    if (uNebula > 0.0) {
      vec2 q = gl_PointCoord * 3.2 + vSeed * 37.0;
      float n = vnoise(q) * 0.65 + vnoise(q * 2.3 + 11.0) * 0.35;
      a *= mix(1.0, smoothstep(0.2, 0.8, n) * 1.7, uNebula);
    }
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

export const planeVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec2 vLocal;

  void main() {
    vUv = uv;
    vLocal = position.xz;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Две текстуры диска: общая и детальная для центра; на границе плавно сшиваются.
const diskSample = /* glsl */ `
  ${noiseGLSL}
  uniform float uDetail;
  uniform sampler2D uMap;
  uniform sampler2D uInner;
  uniform float uInnerScale;

  vec4 sampleDisk(vec2 uv) {
    vec2 iuv = (uv - 0.5) * uInnerScale + 0.5;
    vec2 q = abs(iuv - 0.5) * 2.0;
    float w = 1.0 - smoothstep(0.75, 0.97, max(q.x, q.y));
    vec4 outer = texture2D(uMap, uv);
    if (w <= 0.0) return outer;
    return mix(outer, texture2D(uInner, iuv), w);
  }

  // Мелкая структура, которой нет в текстуре: проявляется, когда камера подлетает близко.
  float diskDetail(vec2 p) {
    return vnoise(p * 1.7) * 0.55 + vnoise(p * 4.3 + 7.0) * 0.3 + vnoise(p * 9.7 + 3.0) * 0.15;
  }
`;

// Рассеянный свет диска: то, что на снимках выглядит гладким сиянием между звёздами.
export const diskLightFragment = /* glsl */ `
  ${diskSample}
  uniform vec4 uBand;
  uniform vec3 uCamPos;
  uniform vec3 uNormal;
  uniform float uWeight;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec2 vLocal;

  void main() {
    vec4 t = sampleDisk(vUv);
    vec4 d = t * t;
    // Шум мелкой структуры считаем, только когда камера близко
    float detail = 1.0;
    if (uDetail > 0.001) detail = mix(1.0, 0.7 + 0.6 * diskDetail(vLocal), uDetail);
    float old = d.r;
    float young = d.g * detail;
    float dust = d.b;
    float sf = d.a;

    vec3 vis = old * vec3(1.0, 0.78, 0.56) * 0.36
             + young * vec3(0.42, 0.6, 1.0) * 0.36
             + sf * vec3(1.0, 0.28, 0.46) * 0.22;
    vec3 ir  = old * vec3(0.35, 0.55, 1.0) * 0.3
             + dust * vec3(1.0, 0.3, 0.08) * 0.9
             + young * vec3(1.0, 0.36, 0.12) * 0.22
             + sf * vec3(1.0, 0.62, 0.32) * 0.5;
    vec3 ha  = old * vec3(0.6, 0.55, 0.55) * 0.05
             + sf * vec3(1.0, 0.1, 0.16) * 1.1;
    vec3 xr  = young * vec3(0.5, 0.32, 1.0) * 0.07
             + sf * vec3(0.55, 0.35, 1.0) * 0.05;

    vec3 col = vis * uBand.x + ir * uBand.y + ha * uBand.z + xr * uBand.w;
    float facing = abs(dot(normalize(uCamPos - vWorld), uNormal));
    float fade = smoothstep(0.06, 0.4, facing);
    float edge = 1.0 - smoothstep(0.62, 0.95, length(vUv - 0.5) * 2.0);
    gl_FragColor = vec4(col * uWeight * fade * edge, 1.0);
  }
`;

// Пыль поглощает свет: итоговый цвет = цвет под пылью × (1 − поглощение).
// Синий гасится сильнее красного — так пыль «краснит» звёзды.
export const diskDustFragment = /* glsl */ `
  ${diskSample}
  uniform vec4 uBand;
  uniform vec3 uCamPos;
  uniform vec3 uNormal;
  uniform float uWeight;
  uniform float uStrength;
  uniform vec4 uOcc;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec2 vLocal;

  void main() {
    float t = sampleDisk(vUv).b;
    float dust = t * t;
    if (uDetail > 0.001) dust *= mix(1.0, 0.25 + 1.5 * diskDetail(vLocal + 19.0), uDetail);
    float absorb = uBand.x + uBand.z * 0.55 + uBand.y * 0.03 + uBand.w * 0.12;
    vec3 toCam = normalize(uCamPos - vWorld);
    float facing = abs(dot(toCam, uNormal));
    float fade = smoothstep(0.06, 0.4, facing);
    // Пыль позади яркого балджа почти не видна: его свет идёт к нам, минуя её.
    // Поэтому тёмная полоса заметна только с ближней стороны ядра — как у Чёрного Глаза.
    if (uOcc.w > 0.0) {
      vec3 rel = vWorld - uOcc.xyz;
      float behind = smoothstep(0.0, uOcc.w * 0.35, -dot(rel, toCam));
      float inside = 1.0 - smoothstep(uOcc.w * 0.6, uOcc.w * 1.2, length(rel));
      absorb *= 1.0 - 0.92 * behind * inside;
    }
    float a = clamp(dust * uStrength, 0.0, 1.0) * absorb * fade * uWeight;
    gl_FragColor = vec4(vec3(0.8, 0.88, 0.97) * a, 1.0);
  }
`;

// Сфероид (балдж, NGC 5195): плоская «наклейка», всегда повёрнутая к камере.
export const billboardVertex = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uRadius;
  varying vec2 vP;

  void main() {
    vP = position.xy * 2.0;
    vec4 mv = viewMatrix * vec4(uCenter, 1.0);
    mv.xy += position.xy * 2.0 * uRadius;
    gl_Position = projectionMatrix * mv;
  }
`;

export const billboardFragment = /* glsl */ `
  uniform vec4 uBand;
  uniform vec3 uVis;
  uniform vec3 uIr;
  uniform vec3 uHa;
  uniform vec3 uX;
  uniform float uCore;
  uniform float uHalo;
  uniform float uLumpy;
  uniform float uIntensity;
  varying vec2 vP;

  void main() {
    float ang = atan(vP.y, vP.x);
    float lump = 1.0 + uLumpy * (0.16 * sin(3.0 * ang + 0.7) + 0.09 * sin(5.0 * ang + 2.3));
    float r = length(vP) / lump;
    if (r > 1.0) discard;
    float edge = 1.0 - smoothstep(0.55, 1.0, r);
    float core = exp(-r / uCore);
    float halo = exp(-pow(r / uHalo, 1.4));
    float prof = (core * 0.45 + halo * 0.55) * edge;
    float xcore = exp(-r / (uCore * 0.5));
    vec3 col = uVis * prof * uBand.x
             + uIr * prof * uBand.y
             + uHa * prof * uBand.z
             + uX * (xcore + halo * 0.15) * edge * uBand.w;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

export const backgroundVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  uniform vec4 uBand;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSoft;

  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    float xr = step(0.985, aSeed) * 2.5;
    float w = uBand.x + uBand.y * 0.55 + uBand.z * 0.22 + uBand.w * xr;
    vColor = aColor * w;
    vSoft = aSize > 2.6 ? 2.2 : 4.0;
  }
`;

export const backgroundFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vSoft;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r2 * vSoft), 1.0);
  }
`;
