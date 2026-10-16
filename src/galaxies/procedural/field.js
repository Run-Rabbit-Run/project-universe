// Поле плотности произвольного диска: рукава, кольца, бар, провал, пыль.
// Те же идеи, что в модели M51, только всё задаётся параметрами.
// Единицы — тыс. св. лет, координаты (x, y) в плоскости диска.

import { createSimplex2D, fbm, smoothstep, wrapAngle } from '../../lib/random.js';
import { addArm, dustTexture, flocDust, makeClump, nuclearDust, spurMask } from '../shared/diskProfile.js';

const DEG = Math.PI / 180;

export function withDiskDefaults(d) {
  const radius = d.radius ?? 30;
  return {
    radius,
    scale: radius / 4.5,
    thick: 0.25,
    extent: radius * 1.3,
    oldContrast: 0.9,
    young: 1,
    hii: 1,
    clumpScale: 0.42,
    brightness: 1,
    ...d,
    arms: d.arms
      ? {
          n: 2,
          pitch: 20,
          wind: -1,
          phase: 0,
          r0: radius * 0.06,
          r1: radius * 0.95,
          width0: 0.9,
          widthK: 0.07,
          strength: 1,
          floc: 0,
          segments: 0,
          ...d.arms,
        }
      : null,
    dust: { lanes: 1.1, spurs: 0.7, floc: 0.5, nuclear: 0.8, ...(d.dust ?? {}) },
    rings: d.rings ?? [],
    gap: d.gap ?? null,
    bar: d.bar ?? null,
    strip: d.strip ?? null,
  };
}

export function createDiskField(disk, seed) {
  const D = disk;
  const A = D.arms;
  const tanP = A ? Math.tan(A.pitch * DEG) : 1;
  const sinP = A ? Math.sin(A.pitch * DEG) : 1;
  const nClump = createSimplex2D(seed);
  const nDust = createSimplex2D(seed + 1);
  const nSpur = createSimplex2D(seed + 2);
  const nFine = createSimplex2D(seed + 3);
  const nArm = createSimplex2D(seed + 4);
  const clump = makeClump(nClump, D.clumpScale);

  function armTheta(k, r) {
    let t = A.phase + (2 * Math.PI * k) / A.n + (A.wind * Math.log(r / A.r0)) / tanP;
    if (A.floc) t += A.floc * nArm(r * 0.08, k * 7.3) * 1.2;
    return t;
  }

  function armStrength(k, r) {
    let s = smoothstep(A.r0 * 0.6, A.r0 * 1.6, r) * (1 - smoothstep(A.r1 * 0.85, A.r1 * 1.08, r)) * A.strength;
    // Флоккулентные рукава рвутся на отрезки
    if (A.segments) s *= 1 - A.segments * smoothstep(-0.1, 0.4, nArm(r * 0.12 + 50, k * 3.1));
    return s;
  }

  // Множитель «провала»: у Объекта Хога между ядром и кольцом почти пусто
  function gapFactor(r) {
    const g = D.gap;
    if (!g) return 1;
    const inside = smoothstep(g.r0, g.r0 + g.soft, r) * (1 - smoothstep(g.r1 - g.soft, g.r1, r));
    return 1 - g.depth * inside;
  }

  function sample(x, y, out) {
    const r = Math.hypot(x, y) + 1e-6;
    const th = Math.atan2(y, x);
    const c = clump(x, y);
    const cl = c * c;
    const acc = { armOld: 0, young: 0, dust: 0, sf: 0, spur: 0 };

    if (A) {
      const w = A.width0 + A.widthK * r;
      const jitter = nSpur(x * 0.12, y * 0.12) * 1.3;
      for (let k = 0; k < A.n; k++) {
        const s = armStrength(k, r);
        if (s <= 0.001) continue;
        const d = A.wind * wrapAngle(th - armTheta(k, r)) * r * sinP;
        addArm(acc, s, d / w, cl, c, D.dust.lanes, D.dust.spurs, r / sinP, k, jitter);
      }
    }
    let { armOld, young, dust, sf } = acc;
    const { spur } = acc;

    for (const ring of D.rings) {
      const u = (r - ring.r) / ring.w;
      const g = Math.exp(-u * u);
      if (g < 1e-3) continue;
      let focus = 1;
      if (ring.focus) {
        const da = wrapAngle(th - ring.focus.angle * DEG);
        focus = (ring.focus.base ?? 1) + ring.focus.boost * Math.exp(-((da / (ring.focus.width * DEG)) ** 2));
      }
      const fs = Math.sqrt(focus);
      armOld += (ring.old ?? 0.5) * g * fs;
      young += (ring.young ?? 1) * g * ((ring.floor ?? 0.3) + 1.2 * cl) * focus;
      sf += (ring.hii ?? 1) * g * cl * c * focus;
      const lane = (r - (ring.r - 0.55 * ring.w)) / (0.3 * ring.w);
      dust += (ring.dust ?? 0.6) * Math.exp(-lane * lane) * (0.6 + 0.6 * c) * fs;
    }

    if (D.bar) {
      const b = D.bar;
      const ca = Math.cos(b.angle * DEG);
      const sa = Math.sin(b.angle * DEG);
      const bx = (x * ca + y * sa) / b.length;
      const by = (-x * sa + y * ca) / b.width;
      const g = Math.exp(-(bx * bx + by * by));
      armOld += b.strength * g;
      // Пылевые полосы вдоль переднего края бара
      dust += (b.dust ?? 0.6) * Math.exp(-((by - 0.8) ** 2) / 0.08 - bx * bx * 0.6) * 0.8;
    }

    // Пыль: «перья» у рукавов, клочковатые спирали и тугие спирали у ядра
    const dustTex = dustTexture(nDust, x, y);
    const spurs = spurMask(nSpur, x, y);
    const lnr = Math.log(r + 0.3);
    const flocArms = A ? A.wind * (5 * lnr) / tanP : 5 * lnr * 3;
    const floc = flocDust(nFine, x, y, r, 5 * th - flocArms, D.dust.floc, D.scale * 1.1);
    let nuclear = 0;
    const nr = D.dust.nuclearR ?? 6;
    if (D.dust.nuclear && r < nr) {
      const phase = 3 * th - (A ? (A.wind * lnr) / 0.33 : lnr * 3);
      nuclear = nuclearDust(nFine, x, y, r, phase, D.dust.nuclear, nr * 0.37);
    }
    let dustRing = 0;
    if (D.dust.ring) {
      // Плотное пылевое кольцо — «синяк» Чёрного Глаза
      const R = D.dust.ring;
      const u = (r - R.r) / R.w;
      const patch = 0.55 + 0.6 * fbm(nDust, x * 0.9 + 3, y * 0.9, 3);
      dustRing = R.s * Math.exp(-u * u) * patch;
    }

    const gap = gapFactor(r);
    const edge = 1 - smoothstep(D.radius * 0.9, D.radius * 1.2, r);
    let gas = 1;
    if (D.strip) {
      // Набегающий поток выдувает газ с окраин: остаётся только внутренний диск
      gas = 1 - smoothstep(D.strip.r, D.strip.r + D.strip.soft, r);
    }

    out.old = (Math.exp(-r / D.scale) * (0.55 + D.oldContrast * armOld) + 0.05 * Math.exp(-r / (D.scale * 2.5))) * edge * gap;
    out.young = (young * D.young * (0.35 + 0.65 * smoothstep(D.radius * 0.05, D.radius * 0.2, r)) + 0.05 * Math.exp(-r / (D.scale * 2))) *
      edge * gap * gas;
    out.dust = (dust * dustTex + spur * spurs * D.dust.spurs + floc + nuclear + dustRing) * edge * gap * Math.max(gas, 0.15);
    out.sf = sf * D.hii * edge * gap * gas;
    out.clump = c;
    out.armOld = armOld;
    return out;
  }

  return { sample, clump };
}
