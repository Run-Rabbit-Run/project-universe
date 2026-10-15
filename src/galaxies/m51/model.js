// Геометрия M51: два логарифмических рукава, приливный мост к NGC 5195 и поля плотности
// для звёзд, пыли и областей звездообразования.
//
// Единицы — тысячи световых лет (тыс. св. лет).
// Координаты диска (x, y): x — на запад (вправо на небе), y — на север (вверх на небе),
// h — высота над диском в сторону Земли. В сцене three.js: X = x, Y = h, Z = -y.

import { createSimplex2D, fbm, smoothstep, wrapAngle } from '../../lib/random.js';

const DEG = Math.PI / 180;

export const M51 = {
  seed: 5194,
  extent: 52, // половина стороны текстуры диска
  pitch: 21 * DEG, // угол закрутки рукавов
  rEnd: 31.7, // где рукав-мост упирается в NGC 5195
  // Направление на NGC 5195: 70″ к востоку и 255″ к северу от ядра (1″ ≈ 120 св. лет)
  thetaEnd: Math.atan2(30.6, -8.4),
  companion: { x: -8.4, y: 30.6, h: -6 }, // спутник лежит позади диска
};

const TAN_P = Math.tan(M51.pitch);
const SIN_P = Math.sin(M51.pitch);

// Если север сверху, рукава M51 закручиваются наружу по часовой стрелке:
// угол рукава уменьшается с ростом радиуса.
export function armTheta(k, r) {
  const base = M51.thetaEnd + Math.log(M51.rEnd / r) / TAN_P + k * Math.PI;
  const kink =
    k === 0
      ? 0.1 * Math.sin(0.33 * r + 0.6)
      : 0.13 * Math.sin(0.29 * r + 2.1) - 0.2 * smoothstep(17, 28, r);
  return base + kink;
}

export const armWidth = (r) => 0.9 + 0.07 * r;

export function armStrength(k, r) {
  const inner = smoothstep(0.9, 3.2, r);
  const outer = k === 0 ? 1 - smoothstep(29.5, 33.5, r) : 1 - smoothstep(23, 31, r);
  const mid = 0.72 + 0.28 * smoothstep(3, 9, r);
  return inner * outer * mid;
}

// Сколько молодых звёзд на радиусе r: мало у балджа, меньше на дальней периферии.
export const smoothstepRadial = (r) => smoothstep(1.2, 5, r) * (1 - 0.45 * smoothstep(20, 32, r));

// Точка рядом с рукавом k на радиусе r; dIn > 0 — к внутреннему краю рукава.
export function armPoint(k, r, dIn = 0) {
  const theta = armTheta(k, r) - dIn / (r * SIN_P);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

// Знаковое расстояние от точки до рукава k поперёк рукава (> 0 — внутренняя сторона).
export function armDistance(k, x, y) {
  const r = Math.hypot(x, y) + 1e-6;
  return -wrapAngle(Math.atan2(y, x) - armTheta(k, r)) * r * SIN_P;
}

const THETA_C = Math.atan2(M51.companion.y, M51.companion.x);

// Приливный изгиб: край диска у моста оттянут к спутнику, который лежит позади.
export function warp(x, y) {
  const r = Math.hypot(x, y);
  if (r < 17) return 0;
  const d = wrapAngle(Math.atan2(y, x) - THETA_C);
  return M51.companion.h * smoothstep(17, M51.rEnd, r) * Math.exp(-((d / 0.55) ** 2));
}

export function toWorld(x, y, h = 0) {
  return [x, h + warp(x, y), -y];
}

// Угловое смещение на небе (″ к востоку, ″ к северу) → координаты диска.
export const ARCSEC = 0.1196;
export function fromSky(eastArcsec, northArcsec) {
  return { x: -eastArcsec * ARCSEC, y: northArcsec * ARCSEC };
}

// Поля плотности: старые звёзды, молодые звёзды, пыль, звездообразование (Hα).
export function createField(seed = M51.seed) {
  const nClump = createSimplex2D(seed);
  const nDust = createSimplex2D(seed + 1);
  const nSpur = createSimplex2D(seed + 2);
  const nFine = createSimplex2D(seed + 3);
  const cx = M51.companion.x;
  const cy = M51.companion.y;

  // «Бусины» на рукавах: 0..1
  function clump(x, y) {
    const v = fbm(nClump, x * 0.42 + 13.1, y * 0.42 - 7.3, 3) * 0.5 + 0.5;
    return Math.min(1, Math.max(0, (v - 0.32) * 1.9));
  }

  function sample(x, y, out) {
    const r = Math.hypot(x, y) + 1e-6;
    const th = Math.atan2(y, x);
    const w = armWidth(r);
    const c = clump(x, y);
    const cl = c * c;
    let armOld = 0;
    let young = 0;
    let dust = 0;
    let sf = 0;
    let spur = 0;
    const spurJitter = nSpur(x * 0.12, y * 0.12) * 1.3;
    for (let k = 0; k < 2; k++) {
      const s = armStrength(k, r);
      if (s <= 0) continue;
      const d = -wrapAngle(th - armTheta(k, r)) * r * SIN_P;
      const u = d / w;
      armOld += s * Math.exp(-(u * u) / 2.4);
      const yc = (u + 0.25) / 0.8;
      const yb = (u + 0.2) / 1.7;
      young += s * (Math.exp(-yc * yc) * (0.25 + 1.25 * cl) + 0.22 * Math.exp(-yb * yb));
      const lane = (u - 0.6) / 0.36;
      dust += s * Math.exp(-lane * lane) * 1.1;
      const hii = (u + 0.45) / 0.45;
      sf += s * Math.exp(-hii * hii) * cl * c;
      if (u > -3.6 && u < 1.0) {
        // Пылевые «перья»: тонкие отроги от пылевой полосы наружу
        const along = r / SIN_P;
        const ph = along / 3.1 + u * 0.33 + k * 0.37 + spurJitter;
        const stripe = Math.pow(0.5 + 0.5 * Math.cos(ph * 2 * Math.PI), 14);
        spur += s * stripe * Math.exp(-(((u + 0.5) / 0.95) ** 2));
      }
    }

    const dustTex = 0.55 + 0.45 * fbm(nDust, x * 0.55, y * 0.55, 2);
    const spurMask = smoothstep(-0.25, 0.35, nSpur(x * 0.09 + 40, y * 0.09));
    // Клочковатые пылевые спирали, идущие параллельно рукавам, и тугие спирали у самого ядра
    const lnr = Math.log(r + 0.3);
    const wobble = nFine(x * 0.35, y * 0.35) * 2.4;
    const floc = 0.5 + 0.5 * Math.cos(5 * (th + lnr / TAN_P) + wobble);
    const flocMask = smoothstep(-0.15, 0.45, nFine(x * 0.22 + 31, y * 0.22 - 17));
    const fine = Math.pow(floc, 10) * flocMask * 0.5 * Math.exp(-r / 7) * smoothstep(0.3, 1.4, r);
    let nuclear = 0;
    if (r < 6) {
      const nw = nFine(x * 1.1 + 9, y * 1.1) * 1.8;
      const ring = 0.5 + 0.5 * Math.cos(3 * (th + lnr / 0.33) + nw);
      nuclear = Math.pow(ring, 6) * 0.9 * Math.exp(-r / 2.2) * smoothstep(0.12, 0.55, r);
    }
    // Пыль рукава-моста на фоне NGC 5195
    const dc = Math.hypot(x - cx, y - cy);
    // Пыль рукава-моста, видимая на фоне южной половины NGC 5195
    const compDust =
      dc < 14
        ? smoothstep(0.2, 0.6, fbm(nDust, x * 0.32 + 5, y * 0.5, 3)) *
          0.75 *
          Math.exp(-((dc / 6.5) ** 2)) *
          (1 - smoothstep(cy - 1, cy + 4, y))
        : 0;

    out.old = Math.exp(-r / 6.5) * (0.55 + 0.9 * armOld) + 0.05 * Math.exp(-r / 16) * (1 - smoothstep(28, 46, r));
    out.young =
      young * (0.35 + 0.65 * smoothstep(2, 7, r)) + 0.05 * Math.exp(-r / 13) * (1 - smoothstep(30, 44, r));
    out.dust = dust * dustTex + spur * spurMask * 0.7 + fine + nuclear + compDust;
    out.sf = sf;
    out.clump = c;
    out.armOld = armOld;
    return out;
  }

  return { sample, clump };
}
