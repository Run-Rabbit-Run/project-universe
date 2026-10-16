// Общие формулы дисков: профиль рукава поперёк и детали пыли.
// Ими пользуются и модель Водоворота (m51/model.js), и конструктор галактик (procedural/field.js).
// Порядок арифметики сохранён, чтобы модели собирались одинаково до и после выноса формул.

import { fbm, smoothstep } from '../../lib/random.js';

// «Бусины» на рукавах: 0..1
export function makeClump(noise, scale) {
  return (x, y) => {
    const v = fbm(noise, x * scale + 13.1, y * scale - 7.3, 3) * 0.5 + 0.5;
    return Math.min(1, Math.max(0, (v - 0.32) * 1.9));
  };
}

// Вклад одного рукава в точке на расстоянии u (в ширинах рукава) от его оси; u > 0 — внутренний край.
// acc — накопитель { armOld, young, dust, sf, spur }; spurs — рисовать ли пылевые «перья».
export function addArm(acc, s, u, cl, c, laneGain, spurs, along, k, jitter) {
  acc.armOld += s * Math.exp(-(u * u) / 2.4);
  const yc = (u + 0.25) / 0.8;
  const yb = (u + 0.2) / 1.7;
  acc.young += s * (Math.exp(-yc * yc) * (0.25 + 1.25 * cl) + 0.22 * Math.exp(-yb * yb));
  const lane = (u - 0.6) / 0.36;
  acc.dust += s * Math.exp(-lane * lane) * laneGain;
  const hii = (u + 0.45) / 0.45;
  acc.sf += s * Math.exp(-hii * hii) * cl * c;
  if (spurs && u > -3.6 && u < 1.0) {
    // Пылевые «перья»: тонкие отроги от пылевой полосы наружу
    const ph = along / 3.1 + u * 0.33 + k * 0.37 + jitter;
    const stripe = Math.pow(0.5 + 0.5 * Math.cos(ph * 2 * Math.PI), 14);
    acc.spur += s * stripe * Math.exp(-(((u + 0.5) / 0.95) ** 2));
  }
}

export const dustTexture = (nDust, x, y) => 0.55 + 0.45 * fbm(nDust, x * 0.55, y * 0.55, 2);

export const spurMask = (nSpur, x, y) => smoothstep(-0.25, 0.35, nSpur(x * 0.09 + 40, y * 0.09));

// Клочковатые пылевые спирали, идущие параллельно рукавам; phase задаёт их закрутку
export function flocDust(nFine, x, y, r, phase, gain, falloff) {
  const wobble = nFine(x * 0.35, y * 0.35) * 2.4;
  const floc = 0.5 + 0.5 * Math.cos(phase + wobble);
  const mask = smoothstep(-0.15, 0.45, nFine(x * 0.22 + 31, y * 0.22 - 17));
  return Math.pow(floc, 10) * mask * 0.5 * gain * Math.exp(-r / falloff) * smoothstep(0.3, 1.4, r);
}

// Тугие пылевые спирали у самого ядра
export function nuclearDust(nFine, x, y, r, phase, amp, scale) {
  const nw = nFine(x * 1.1 + 9, y * 1.1) * 1.8;
  const ring = 0.5 + 0.5 * Math.cos(phase + nw);
  return Math.pow(ring, 6) * amp * Math.exp(-r / scale) * smoothstep(0.12, 0.55, r);
}
