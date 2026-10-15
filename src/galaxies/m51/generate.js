// Процедурная сборка M51: текстура диска + слои частиц.
// Работает в Web Worker, чтобы страница не замирала, пока считаются сотни тысяч звёзд.

import { mulberry32, gaussian } from '../../lib/random.js';
import {
  M51,
  armPoint,
  armDistance,
  armStrength,
  armWidth,
  createField,
  fromSky,
  smoothstepRadial,
  toWorld,
} from './model.js';

class Layer {
  constructor(capacity) {
    this.n = 0;
    this.alloc(capacity);
  }
  alloc(cap) {
    const grow = (src, size) => {
      const dst = new Float32Array(size);
      if (src) dst.set(src.subarray(0, Math.min(src.length, size)));
      return dst;
    };
    this.cap = cap;
    this.position = grow(this.position, cap * 3);
    this.color = grow(this.color, cap * 3);
    this.size = grow(this.size, cap);
    this.seed = grow(this.seed, cap);
  }
  push(p, r, g, b, size, seed) {
    if (this.n >= this.cap) this.alloc(Math.ceil(this.cap * 1.5) + 16);
    const i = this.n++;
    this.position[i * 3] = p[0];
    this.position[i * 3 + 1] = p[1];
    this.position[i * 3 + 2] = p[2];
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
    this.size[i] = size;
    this.seed[i] = seed;
  }
  finish() {
    const n = this.n;
    return {
      count: n,
      position: this.position.slice(0, n * 3),
      color: this.color.slice(0, n * 3),
      size: this.size.slice(0, n),
      seed: this.seed.slice(0, n),
    };
  }
}

const enc = (v) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255);

export function generateM51({ quality = 1, textureSize = 1024 } = {}) {
  const rand = mulberry32(M51.seed);
  const field = createField(M51.seed);
  const tmp = {};
  const q = quality;
  const C = M51.companion;

  // ---------- Текстуры диска: R — старые звёзды, G — молодые, B — пыль, A — Hα ----------
  // Общая текстура на всю галактику и детальная — на центр, чтобы ядро не мылилось вблизи.
  function bake(N, E) {
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      const y = -E + ((j + 0.5) * 2 * E) / N;
      for (let i = 0; i < N; i++) {
        const x = -E + ((i + 0.5) * 2 * E) / N;
        field.sample(x, y, tmp);
        const o = (j * N + i) * 4;
        data[o] = enc(tmp.old * 0.9);
        data[o + 1] = enc(tmp.young * 0.72);
        data[o + 2] = enc(tmp.dust * 0.7);
        data[o + 3] = enc(tmp.sf * 1.3);
      }
    }
    return { size: N, extent: E, data };
  }
  const disk = bake(textureSize, M51.extent);
  disk.inner = bake(Math.round(textureSize / 2), 9);

  // Точка у рукава, выбранная с учётом «бусин» — тех же, что в текстуре.
  function sampleArm(mean, sigma, clumpPow, rMin = 1.2, rMax = 33.5) {
    for (let tries = 0; tries < 200; tries++) {
      const k = rand() < 0.5 ? 0 : 1;
      const r = rMin + (rMax - rMin) * rand();
      const s = armStrength(k, r) * smoothstepRadial(r);
      if (rand() > s) continue;
      const w = armWidth(r);
      const p = armPoint(k, r, w * (mean + gaussian(rand) * sigma));
      const c = field.clump(p.x, p.y);
      if (rand() > 0.1 + 0.9 * Math.pow(c, clumpPow)) continue;
      return { k, r, x: p.x, y: p.y, c };
    }
    return { k: 0, r: 8, ...armPoint(0, 8, 0), c: 0.5 };
  }

  function armOldAt(x, y) {
    const r = Math.hypot(x, y);
    let a = 0;
    for (let k = 0; k < 2; k++) {
      const s = armStrength(k, r);
      if (s <= 0) continue;
      const u = armDistance(k, x, y) / armWidth(r);
      a += s * Math.exp(-(u * u) / 2.4);
    }
    return a;
  }

  // ---------- Старое население: диск, балдж, NGC 5195 ----------
  const old = new Layer(Math.round(150000 * q));
  const nDisk = Math.round(85000 * q);
  for (let n = 0; n < nDisk; ) {
    const r = -6 * Math.log(rand() * rand() + 1e-12);
    if (r > 46) continue;
    const th = rand() * Math.PI * 2;
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    if (rand() > (0.5 + 0.6 * armOldAt(x, y)) / 1.15) continue;
    const h = gaussian(rand) * (0.16 + r * 0.012);
    const t = rand();
    const b = 0.15 * (0.35 + Math.pow(rand(), 3) * 2.4);
    let c = [1.0, 0.84, 0.66];
    if (t < 0.14) c = [1.0, 0.66, 0.44];
    else if (t > 0.88) c = [1.0, 0.95, 0.88];
    old.push(toWorld(x, y, h), c[0] * b, c[1] * b, c[2] * b, 0.05 + rand() * 0.035, rand());
    n++;
  }

  const nBulge = Math.round(28000 * q);
  for (let n = 0; n < nBulge; ) {
    const r = 0.3 * Math.pow(-Math.log(1 - rand() * 0.995), 2.0);
    if (r > 6.5) continue;
    const u = 2 * rand() - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const b = 0.1 * (0.45 + Math.pow(rand(), 2) * 1.6);
    const red = rand() * 0.08;
    old.push(
      [r * s * Math.cos(phi), r * u * 0.72, r * s * Math.sin(phi)],
      1.0 * b,
      (0.8 - red) * b,
      (0.56 - red) * b,
      0.045 + rand() * 0.03,
      rand(),
    );
    n++;
  }
  // Яркое ядро
  old.push([0, 0, 0], 2.6, 2.3, 1.9, 0.16, 1);

  const nComp = Math.round(30000 * q);
  for (let n = 0; n < nComp; ) {
    const r = 0.55 * Math.pow(-Math.log(1 - rand() * 0.997), 1.75);
    if (r > 13) continue;
    const u = 2 * rand() - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    // Изуродованная приливом форма: не эллипсоид, а «смятый» ком
    const lobe = 1 + 0.18 * Math.sin(3 * phi + 0.7) + 0.1 * Math.sin(5 * phi + 2.1);
    const dx = r * lobe * s * Math.cos(phi) * 1.12;
    const dz = r * lobe * s * Math.sin(phi) * 0.95;
    const dy = r * u * 0.8;
    const b = 0.15 * (0.45 + Math.pow(rand(), 2) * 1.6);
    old.push([C.x + dx, C.h + dy, -C.y + dz], 1.0 * b, 0.81 * b, 0.6 * b, 0.05 + rand() * 0.03, rand());
    n++;
  }
  old.push([C.x, C.h, -C.y], 1.6, 1.35, 1.0, 0.13, 1);

  // Слабый приливный шлейф за NGC 5195
  const nPlume = Math.round(5000 * q);
  for (let n = 0; n < nPlume; n++) {
    const t = Math.pow(rand(), 0.8);
    const ang = M51.thetaEnd + 0.15 - t * 0.9;
    const rad = 3 + t * 15;
    const sc = 1.2 + t * 2.6;
    const x = C.x + rad * Math.cos(ang) + gaussian(rand) * sc;
    const y = C.y + rad * Math.sin(ang) + gaussian(rand) * sc;
    const b = 0.06 * (0.4 + rand()) * (1 - t * 0.6);
    old.push([x, C.h - t * 3 + gaussian(rand) * 0.8, -y], b, 0.86 * b, 0.7 * b, 0.05 + rand() * 0.03, rand());
  }

  // ---------- Молодые звёзды и скопления ----------
  const young = new Layer(Math.round(130000 * q));
  const blue = () => {
    const t = rand();
    if (t < 0.55) return [0.48, 0.64, 1.0];
    if (t < 0.85) return [0.68, 0.8, 1.0];
    return [1.0, 0.95, 0.86];
  };
  const nField = Math.round(60000 * q);
  for (let n = 0; n < nField; n++) {
    const a = sampleArm(-0.25, 0.6, 1.4);
    const c = blue();
    const b = 0.2 * (0.35 + Math.pow(rand(), 4) * 3.2);
    young.push(toWorld(a.x, a.y, gaussian(rand) * 0.12), c[0] * b, c[1] * b, c[2] * b, 0.05 + rand() * 0.03, rand());
  }
  const nInter = Math.round(9000 * q);
  for (let n = 0; n < nInter; n++) {
    const r = -8 * Math.log(rand() * rand() + 1e-12);
    if (r > 40) continue;
    const th = rand() * Math.PI * 2;
    const c = blue();
    const b = 0.12 * (0.3 + rand());
    young.push(toWorld(r * Math.cos(th), r * Math.sin(th), gaussian(rand) * 0.2), c[0] * b, c[1] * b, c[2] * b, 0.05, rand());
  }
  const nClusters = Math.round(2400 * q);
  for (let n = 0; n < nClusters; n++) {
    const a = sampleArm(-0.3, 0.45, 2.5);
    const m = 5 + Math.floor(Math.pow(rand(), 2) * 26);
    const sigma = 0.07 + 0.22 * rand();
    for (let i = 0; i < m; i++) {
      const c = blue();
      const b = 0.26 * (0.4 + Math.pow(rand(), 3) * 3);
      young.push(
        toWorld(a.x + gaussian(rand) * sigma, a.y + gaussian(rand) * sigma, gaussian(rand) * 0.06),
        c[0] * b,
        c[1] * b,
        c[2] * b,
        0.05 + rand() * 0.03,
        rand(),
      );
    }
  }

  // ---------- Области H II: розовые облака ионизованного водорода ----------
  const hii = new Layer(Math.round(16000 * q));
  const nHII = Math.round(2600 * q);
  let best = { score: -1, x: 12, y: 8 };
  for (let n = 0; n < nHII; n++) {
    const a = sampleArm(-0.45, 0.32, 3.0);
    const size = (0.1 + Math.pow(rand(), 2.2) * 0.42) * (0.7 + a.c * 0.6);
    const b = 0.4 * (0.55 + a.c);
    const h = gaussian(rand) * 0.05;
    hii.push(toWorld(a.x, a.y, h), 1.0 * b, 0.27 * b, 0.47 * b, size, rand());
    // Облако не шар, а рваный комок из нескольких сгустков
    const sat = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < sat; i++) {
      const off = size * 0.8;
      const sb = b * (0.35 + rand() * 0.5);
      hii.push(
        toWorld(a.x + gaussian(rand) * off, a.y + gaussian(rand) * off, h),
        1.0 * sb,
        0.32 * sb,
        0.52 * sb,
        size * (0.3 + rand() * 0.45),
        rand(),
      );
    }
    const hot = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < hot; i++) {
      const hb = 0.28 + rand() * 0.35;
      young.push(
        toWorld(a.x + gaussian(rand) * size * 0.3, a.y + gaussian(rand) * size * 0.3, h),
        0.8 * hb,
        0.9 * hb,
        1.0 * hb,
        0.06,
        rand(),
      );
    }
    const score = size * a.c;
    if (a.x > 3 && a.y > 3 && a.r > 9 && a.r < 19 && score > best.score) best = { score, x: a.x, y: a.y };
  }

  // ---------- Рентгеновские источники (видны только в рентгене) ----------
  const xray = new Layer(Math.round(2000 * q));
  const xc = (bright) => {
    const t = Math.min(1, bright);
    return [0.62 + 0.38 * t, 0.48 + 0.5 * t, 1.0];
  };
  const nHMXB = Math.round(240 * q);
  for (let n = 0; n < nHMXB; n++) {
    const a = sampleArm(-0.2, 0.6, 1.0);
    const br = Math.pow(rand(), 3);
    const c = xc(br);
    const b = 0.5 + br * 2;
    xray.push(toWorld(a.x, a.y, 0), c[0] * b, c[1] * b, c[2] * b, 0.09 + br * 0.12, rand());
  }
  const nLMXB = Math.round(90 * q);
  for (let n = 0; n < nLMXB; n++) {
    const r = rand() < 0.4 ? Math.abs(gaussian(rand)) * 2 : -5 * Math.log(rand() * rand() + 1e-9);
    const th = rand() * Math.PI * 2;
    const br = Math.pow(rand(), 3);
    const c = xc(br);
    const b = 0.4 + br * 1.5;
    xray.push(toWorld(r * Math.cos(th), r * Math.sin(th), 0), c[0] * b, c[1] * b, c[2] * b, 0.08 + br * 0.1, rand());
  }
  for (let n = 0; n < 9; n++) {
    const a = sampleArm(-0.2, 0.5, 1.0, 4, 26);
    xray.push(toWorld(a.x, a.y, 0), 3.2, 3.0, 3.6, 0.3, 1);
  }
  const uls = fromSky(-95, -8);
  xray.push(toWorld(uls.x, uls.y, 0), 3.4, 3.2, 3.8, 0.3, 1);
  xray.push([0, 0, 0], 6, 5.5, 6.5, 0.55, 1);
  xray.push([C.x, C.h, -C.y], 4, 3.6, 4.6, 0.45, 1);
  // Горячий газ в центре M51
  const nGas = Math.round(500 * q);
  for (let n = 0; n < nGas; n++) {
    const r = Math.abs(gaussian(rand)) * 2.6;
    const th = rand() * Math.PI * 2;
    const b = 0.05 + rand() * 0.05;
    xray.push(toWorld(r * Math.cos(th), r * Math.sin(th), gaussian(rand) * 0.6), 0.7 * b, 0.45 * b, 1.0 * b, 0.9 + rand() * 0.8, rand());
  }
  // Две дуги горячего газа вокруг ядра NGC 5195 («отрыжка» чёрной дыры, Chandra, 2016)
  const nArc = Math.round(380 * q);
  for (let arc = 0; arc < 2; arc++) {
    const rad = arc === 0 ? 1.4 : 2.9;
    for (let n = 0; n < nArc; n++) {
      const ang = M51.thetaEnd + 0.5 + arc * 0.4 + (rand() - 0.5) * (1.7 + arc * 0.6);
      const rr = rad * (1 + 0.12 * Math.sin(ang * 3 + arc)) + gaussian(rand) * (0.22 + arc * 0.12);
      const x = C.x + rr * Math.cos(ang);
      const y = C.y + rr * Math.sin(ang);
      const b = 0.11 + rand() * 0.08;
      xray.push([x, C.h + gaussian(rand) * 0.3, -y], 0.85 * b, 0.6 * b, 1.0 * b, 0.32 + rand() * 0.2, rand());
    }
  }

  // ---------- Пыль частицами: видна, когда диск повёрнут ребром ----------
  const dust = new Layer(Math.round(18000 * q));
  const nDust = Math.round(17000 * q);
  for (let n = 0; n < nDust; n++) {
    const a = sampleArm(0.62, 0.35, 0);
    const d = 0.2 + rand() * 0.15;
    dust.push(toWorld(a.x, a.y, gaussian(rand) * 0.07), 0.55 * d, 0.63 * d, 0.76 * d, 0.45 + rand() * 0.55, rand());
  }

  // ---------- Мягкое свечение: тоже для вида с ребра ----------
  const glow = new Layer(Math.round(6000 * q));
  const nGlow = Math.round(5000 * q);
  for (let n = 0; n < nGlow; n++) {
    const r = -5.5 * Math.log(rand() * rand() + 1e-12);
    if (r > 36) continue;
    const th = rand() * Math.PI * 2;
    const b = 0.012;
    glow.push(toWorld(r * Math.cos(th), r * Math.sin(th), gaussian(rand) * 0.25), b, 0.85 * b, 0.68 * b, 1.4 + rand() * 2.2, rand());
  }

  return {
    disk,
    layers: {
      old: old.finish(),
      young: young.finish(),
      hii: hii.finish(),
      xray: xray.finish(),
      dust: dust.finish(),
      glow: glow.finish(),
    },
    features: { hii: [best.x, best.y] },
  };
}
