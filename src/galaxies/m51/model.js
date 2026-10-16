// Геометрия M51: два логарифмических рукава, приливный мост к NGC 5195 и поля плотности
// для звёзд, пыли и областей звездообразования.
//
// Единицы — тысячи световых лет (тыс. св. лет).
// Координаты диска (x, y): x — на запад (вправо на небе), y — на север (вверх на небе),
// h — высота над диском в сторону Земли. В сцене three.js: X = x, Y = h, Z = -y.

import { createSimplex2D, fbm, smoothstep, wrapAngle } from '../../lib/random.js';
import { addArm, dustTexture, flocDust, makeClump, nuclearDust, spurMask } from '../shared/diskProfile.js';

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

  const clump = makeClump(nClump, 0.42);

  function sample(x, y, out) {
    const r = Math.hypot(x, y) + 1e-6;
    const th = Math.atan2(y, x);
    const w = armWidth(r);
    const c = clump(x, y);
    const cl = c * c;
    const acc = { armOld: 0, young: 0, dust: 0, sf: 0, spur: 0 };
    const spurJitter = nSpur(x * 0.12, y * 0.12) * 1.3;
    for (let k = 0; k < 2; k++) {
      const s = armStrength(k, r);
      if (s <= 0) continue;
      const d = -wrapAngle(th - armTheta(k, r)) * r * SIN_P;
      addArm(acc, s, d / w, cl, c, 1.1, true, r / SIN_P, k, spurJitter);
    }
    const { armOld, young, dust, sf, spur } = acc;

    const dustTex = dustTexture(nDust, x, y);
    const spurs = spurMask(nSpur, x, y);
    // Клочковатые пылевые спирали, идущие параллельно рукавам, и тугие спирали у самого ядра
    const lnr = Math.log(r + 0.3);
    const fine = flocDust(nFine, x, y, r, 5 * (th + lnr / TAN_P), 1, 7);
    const nuclear = r < 6 ? nuclearDust(nFine, x, y, r, 3 * (th + lnr / 0.33), 0.9, 2.2) : 0;
    // Пыль рукава-моста, видимая на фоне южной половины NGC 5195
    const dc = Math.hypot(x - cx, y - cy);
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
    out.dust = dust * dustTex + spur * spurs * 0.7 + fine + nuclear + compDust;
    out.sf = sf;
    out.clump = c;
    out.armOld = armOld;
    return out;
  }

  return { sample, clump };
}
