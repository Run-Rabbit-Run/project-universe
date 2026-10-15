import * as THREE from 'three';
import {
  pointsVertex,
  pointsFragment,
  planeVertex,
  diskLightFragment,
  diskDustFragment,
  billboardVertex,
  billboardFragment,
} from './shaders.js';

const v3 = (a) => new THREE.Vector3(...(a ?? [0, 0, 0]));

// Слои по умолчанию — те же, что подобраны для Водоворота.
// Порядок отрисовки важен: пыль гасит то, что нарисовано до неё.
export const DEFAULT_SCENE = {
  order: { diskLight: 1, diskDust: 4 },
  disk: {
    dustStrength: 2.0,
    light: [
      { y: -0.35, weight: 0.25 },
      { y: 0, weight: 0.5 },
      { y: 0.35, weight: 0.25 },
    ],
    dust: [
      { y: -0.06, weight: 0.55 },
      { y: 0.06, weight: 0.55 },
    ],
  },
  layers: [
    { name: 'glow', source: 'glow', order: 1.5, ir: [0.4, 0.55, 1.0], ha: [0.15, 0.15, 0.15], minPx: 2, maxPx: 900, soft: 2.4, facing: -1 },
    { name: 'old', source: 'old', order: 2, intensity: 0.75, ir: [0.4, 0.58, 1.0], ha: [0.32, 0.3, 0.3], minPx: 1.4, maxPx: 5, soft: 4.5 },
    { name: 'dustAbsorb', source: 'dust', order: 5, absorb: true, nebula: 0.8, ha: [1.5, 1.7, 2.0], minPx: 2, maxPx: 900, soft: 2.2, facing: -1 },
    { name: 'dustGlow', source: 'dust', order: 6, vis: [0, 0, 0], ir: [5.0, 1.6, 0.45], minPx: 2, maxPx: 900, soft: 2.2, facing: -1 },
    { name: 'young', source: 'young', order: 7, intensity: 0.55, ir: [0.35, 0.5, 1.0], ha: [0.25, 0.24, 0.24], minPx: 1.4, maxPx: 6, soft: 4.5 },
    { name: 'hii', source: 'hii', order: 8, intensity: 0.5, ir: [1.8, 1.15, 0.6], ha: [5.0, 0.55, 0.9], minPx: 1.8, maxPx: 900, soft: 3.6, nebula: 1 },
    // Газ, который светится почти только в линии Hα (хвост Медузы, облако MPG-CR3)
    { name: 'hagas', source: 'hagas', order: 8.5, vis: [0.035, 0.035, 0.035], ir: [0.2, 0.08, 0.04], ha: [4.0, 0.35, 0.6], minPx: 2, maxPx: 900, soft: 2.2, nebula: 0.7 },
    // Звёзды и облака, спрятанные пылью: в видимом свете их почти нет, в инфракрасном они горят
    { name: 'obscured', source: 'obscured', order: 8.2, vis: [0.05, 0.035, 0.03], ir: [2.4, 1.1, 0.5], ha: [0.6, 0.06, 0.1], minPx: 1.8, maxPx: 900, soft: 3.6, nebula: 1 },
    { name: 'xray', source: 'xray', order: 9, vis: [0, 0, 0], x: [1, 1, 1], xFromColor: 1, minPx: 1.8, maxPx: 900, soft: 3 },
  ],
  billboards: [],
};

function absorbBlending(material) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.ZeroFactor;
  material.blendDst = THREE.OneMinusSrcColorFactor;
  // Альфу кадра не трогаем, иначе постобработка проявляет квадрат плоскости диска.
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

function baseMaterial(opts) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...opts,
  });
}

function pointsGeometry(layer, needsNormal) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(layer.position, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(layer.color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(layer.size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(layer.seed, 1));
  let normal = layer.normal;
  if (!normal && needsNormal) {
    // Слои без своих нормалей (Водоворот) лежат в диске с нормалью вверх
    normal = new Float32Array(layer.count * 3);
    for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  }
  if (normal) g.setAttribute('aNormal', new THREE.BufferAttribute(normal, 3));
  g.computeBoundingSphere();
  return g;
}

function pointsMaterial(spec, shared) {
  const material = baseMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    uniforms: {
      uBand: shared.uBand,
      uPixelRatio: shared.uPixelRatio,
      uScale: shared.uScale,
      uCamPos: shared.uCamPos,
      uVis: { value: v3(spec.vis ?? [1, 1, 1]) },
      uIr: { value: v3(spec.ir) },
      uHa: { value: v3(spec.ha) },
      uX: { value: v3(spec.x) },
      uXFromColor: { value: spec.xFromColor ?? 0 },
      uMinPx: { value: spec.minPx ?? 1.5 },
      uMaxPx: { value: spec.maxPx ?? 6 },
      uFacingMode: { value: spec.facing ?? 0 },
      uIntensity: { value: spec.intensity ?? 1 },
      uSoft: { value: spec.soft ?? 4 },
      uNebula: { value: spec.nebula ?? 0 },
    },
  });
  return spec.absorb ? absorbBlending(material) : material;
}

// Плоскость диска с текстурой; у Водоворота изогнута так же, как звёзды у приливного моста.
function diskGeometry(extent, warp, offsetY) {
  const g = new THREE.PlaneGeometry(extent * 2, extent * 2, warp ? 160 : 1, warp ? 160 : 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, (warp ? warp(x, -z) : 0) + offsetY);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

export function buildGalaxyObjects(data, sceneConfig, shared, renderer) {
  const config = {
    ...DEFAULT_SCENE,
    ...sceneConfig,
    disk: { ...DEFAULT_SCENE.disk, ...(sceneConfig.disk ?? {}) },
    order: { ...DEFAULT_SCENE.order, ...(sceneConfig.order ?? {}) },
  };
  const group = new THREE.Group();
  const textures = [];
  const occ = config.occluder
    ? new THREE.Vector4(...config.occluder.center, config.occluder.radius)
    : new THREE.Vector4(0, 0, 0, 0);

  const makeTexture = ({ data: pixels, size }) => {
    const t = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };

  // ---- Диски ----
  for (const disk of data.disks) {
    const texture = makeTexture(disk);
    const inner = disk.inner ? makeTexture(disk.inner) : texture;
    const warp = disk.warp ? config.disk.warp : null;
    const normal = v3(disk.normal ?? [0, 1, 0]);
    const common = () => ({
      uMap: { value: texture },
      uInner: { value: inner },
      uInnerScale: { value: disk.inner ? disk.extent / disk.inner.extent : 1 },
      uDetail: shared.uDetail,
      uBand: shared.uBand,
      uCamPos: shared.uCamPos,
      uNormal: { value: normal },
    });
    const place = (mesh, order) => {
      mesh.position.set(...(disk.position ?? [0, 0, 0]));
      mesh.rotation.set(...(disk.rotation ?? [0, 0, 0]));
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    for (const slice of config.disk.light) {
      const material = baseMaterial({
        vertexShader: planeVertex,
        fragmentShader: diskLightFragment,
        uniforms: { ...common(), uWeight: { value: slice.weight } },
        side: THREE.DoubleSide,
      });
      place(new THREE.Mesh(diskGeometry(disk.extent, warp, slice.y), material), config.order.diskLight);
    }
    for (const slice of config.disk.dust) {
      const material = absorbBlending(
        baseMaterial({
          vertexShader: planeVertex,
          fragmentShader: diskDustFragment,
          uniforms: {
            ...common(),
            uWeight: { value: slice.weight },
            uStrength: { value: disk.dustStrength ?? config.disk.dustStrength },
            uOcc: { value: occ },
          },
          side: THREE.DoubleSide,
        }),
      );
      place(new THREE.Mesh(diskGeometry(disk.extent, warp, slice.y), material), config.order.diskDust);
    }
  }

  // ---- Слои частиц ----
  for (const spec of config.layers) {
    const layer = data.layers[spec.source];
    if (!layer || layer.count === 0) continue;
    const points = new THREE.Points(pointsGeometry(layer, spec.facing), pointsMaterial(spec, shared));
    points.renderOrder = spec.order;
    points.frustumCulled = false;
    group.add(points);
  }

  // ---- Сфероиды: свечение ядер и спутников ----
  const quad = new THREE.PlaneGeometry(1, 1);
  for (const spec of config.billboards) {
    const mesh = new THREE.Mesh(
      quad,
      baseMaterial({
        vertexShader: billboardVertex,
        fragmentShader: billboardFragment,
        uniforms: {
          uBand: shared.uBand,
          uCenter: { value: v3(spec.center) },
          uRadius: { value: spec.radius },
          uVis: { value: v3(spec.vis) },
          uIr: { value: v3(spec.ir) },
          uHa: { value: v3(spec.ha) },
          uX: { value: v3(spec.x) },
          uCore: { value: spec.core },
          uHalo: { value: spec.halo },
          uLumpy: { value: spec.lumpy ?? 0 },
          uIntensity: { value: spec.intensity ?? 1 },
        },
      }),
    );
    mesh.renderOrder = spec.order ?? 3;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // Освобождаем память видеокарты, когда пользователь переключает галактику
  function dispose() {
    group.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    textures.forEach((t) => t.dispose());
  }

  return { group, dispose };
}
