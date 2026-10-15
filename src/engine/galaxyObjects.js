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

function pointsGeometry(layer) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(layer.position, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(layer.color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(layer.size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(layer.seed, 1));
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

// Плоскость диска с текстурой; изогнута так же, как звёзды у приливного моста.
function diskGeometry(extent, warp, offsetY) {
  const g = new THREE.PlaneGeometry(extent * 2, extent * 2, 160, 160);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, warp(x, -z) + offsetY);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

export function buildGalaxyObjects(data, config, shared, renderer) {
  const group = new THREE.Group();
  const handles = {};

  // ---- Диск ----
  const { disk } = data;
  const makeTexture = ({ data: pixels, size }) => {
    const t = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    return t;
  };
  const texture = makeTexture(disk);
  const inner = makeTexture(disk.inner);
  const diskUniforms = () => ({
    uMap: { value: texture },
    uInner: { value: inner },
    uInnerScale: { value: disk.extent / disk.inner.extent },
    uDetail: shared.uDetail,
  });

  for (const slice of config.disk.light) {
    const mesh = new THREE.Mesh(
      diskGeometry(disk.extent, config.disk.warp, slice.y),
      baseMaterial({
        vertexShader: planeVertex,
        fragmentShader: diskLightFragment,
        uniforms: {
          ...diskUniforms(),
          uBand: shared.uBand,
          uCamPos: shared.uCamPos,
          uWeight: { value: slice.weight },
        },
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = config.order.diskLight;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  for (const slice of config.disk.dust) {
    const mesh = new THREE.Mesh(
      diskGeometry(disk.extent, config.disk.warp, slice.y),
      absorbBlending(
        baseMaterial({
          vertexShader: planeVertex,
          fragmentShader: diskDustFragment,
          uniforms: {
            ...diskUniforms(),
            uBand: shared.uBand,
            uCamPos: shared.uCamPos,
            uWeight: { value: slice.weight },
            uStrength: { value: config.disk.dustStrength },
          },
          side: THREE.DoubleSide,
        }),
      ),
    );
    mesh.renderOrder = config.order.diskDust;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- Слои частиц ----
  for (const spec of config.layers) {
    const layer = data.layers[spec.source];
    if (!layer || layer.count === 0) continue;
    const points = new THREE.Points(pointsGeometry(layer), pointsMaterial(spec, shared));
    points.renderOrder = spec.order;
    points.frustumCulled = false;
    group.add(points);
    handles[spec.name] = points;
  }

  // ---- Сфероиды ----
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
    mesh.renderOrder = spec.order;
    mesh.frustumCulled = false;
    group.add(mesh);
    handles[spec.name] = mesh;
  }

  return { group, handles };
}
