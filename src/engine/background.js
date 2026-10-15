import * as THREE from 'three';
import { mulberry32, gaussian } from '../lib/random.js';
import { backgroundVertex, backgroundFragment } from './shaders.js';

// Звёзды нашей Галактики на переднем плане и далёкие галактики за M51.
// Сфера едет вместе с камерой, поэтому фон всегда «на бесконечности».
export function createBackground(shared, { stars = 3200, galaxies = 700, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const n = stars + galaxies;
  const position = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const seedAttr = new Float32Array(n);
  const R = 1500;

  for (let i = 0; i < n; i++) {
    const u = 2 * rand() - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    position.set([R * s * Math.cos(phi), R * u, R * s * Math.sin(phi)], i * 3);
    seedAttr[i] = rand();
    if (i < stars) {
      const t = rand();
      const bright = Math.pow(rand(), 9);
      const b = 0.12 + bright * 2.4;
      const c = t < 0.2 ? [1.0, 0.78, 0.58] : t < 0.75 ? [1.0, 0.96, 0.9] : [0.75, 0.84, 1.0];
      color.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      size[i] = 1.6 + bright * 3.2;
    } else {
      // Далёкие галактики: тусклые, чуть крупнее и мягче звёзд
      const b = 0.05 + Math.abs(gaussian(rand)) * 0.04;
      const warm = rand();
      color.set([b * (0.9 + warm * 0.2), b * 0.85, b * (0.75 - warm * 0.15)], i * 3);
      size[i] = 2.8 + rand() * 2.2;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr, 1));

  const points = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      vertexShader: backgroundVertex,
      fragmentShader: backgroundFragment,
      uniforms: { uBand: shared.uBand, uPixelRatio: shared.uPixelRatio },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.renderOrder = -10;
  points.frustumCulled = false;
  return points;
}
