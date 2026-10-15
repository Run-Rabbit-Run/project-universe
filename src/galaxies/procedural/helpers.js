// Общие помощники для модулей галактик, собранных конструктором.

import { bodyFrame } from '../../lib/frame.js';

export const DEG = Math.PI / 180;

// Точка в плоскости тела-диска → мировые координаты (для подписей).
export function onBody(body, x, y, h = 0) {
  return bodyFrame(body.position, body.rotation).toWorld(x, y, h);
}

// Точка на диске по полярным координатам: радиус и угол (градусы, 0° — вправо, 90° — «север» диска).
export function onBodyPolar(body, r, deg, h = 0) {
  return onBody(body, r * Math.cos(deg * DEG), r * Math.sin(deg * DEG), h);
}

// Точка на кривой хвоста (та же интерполяция, что в конструкторе).
export function onTail(points, t) {
  const n = points.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(f);
  const u = f - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  return [0, 1, 2].map((k) => {
    const a = p0[k];
    const b = p1[k];
    const c = p2[k];
    const d = p3[k];
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  });
}

export const expeditionsText = (where) =>
  `Колоний ${where} в архиве пока нет. Когда экспедиции выйдут на связь, здесь появятся их миры и расы.`;

// Свечение старых звёзд ядра (балджа, эллиптической галактики)
export function coreGlow(center, radius, opts = {}) {
  return {
    center,
    radius,
    vis: opts.vis ?? [0.95, 0.74, 0.5],
    ir: opts.ir ?? [0.45, 0.6, 1.0],
    ha: opts.ha ?? [0.06, 0.05, 0.05],
    x: opts.x ?? [0.8, 0.62, 1.2],
    core: opts.core ?? 0.04,
    halo: opts.halo ?? 0.22,
    lumpy: opts.lumpy ?? 0,
    intensity: opts.intensity ?? 0.6,
  };
}
