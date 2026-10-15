// Конструктор галактик: собирает модель из «рецепта» — списка тел.
//   disk     — диск с рукавами, кольцами, баром, пылью (текстура + звёзды);
//   spheroid — шаровое скопление звёзд: ядро, эллиптическая галактика, спутник, облако газа;
//   tail     — приливный хвост или хвост сорванного газа вдоль кривой.
// Рецепт — обычный JSON, поэтому его можно передать в Web Worker.

import { mulberry32, gaussian } from '../../lib/random.js';
import { bodyFrame } from '../../lib/frame.js';
import { createDiskField, withDiskDefaults } from './field.js';

const LAYERS = ['old', 'young', 'hii', 'xray', 'dust', 'glow', 'hagas', 'obscured'];
const WITH_NORMAL = new Set(['dust', 'glow']);
const ZERO = [0, 0, 0];

class Layer {
  constructor(withNormal) {
    this.n = 0;
    this.withNormal = withNormal;
    this.alloc(4096);
  }
  alloc(cap) {
    const grow = (src, size) => {
      const dst = new Float32Array(size);
      if (src) dst.set(src);
      return dst;
    };
    this.cap = cap;
    this.position = grow(this.position, cap * 3);
    this.color = grow(this.color, cap * 3);
    this.size = grow(this.size, cap);
    this.seed = grow(this.seed, cap);
    if (this.withNormal) this.normal = grow(this.normal, cap * 3);
  }
  push(p, c, b, size, seed, normal = ZERO) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    this.position[i * 3] = p[0];
    this.position[i * 3 + 1] = p[1];
    this.position[i * 3 + 2] = p[2];
    this.color[i * 3] = c[0] * b;
    this.color[i * 3 + 1] = c[1] * b;
    this.color[i * 3 + 2] = c[2] * b;
    this.size[i] = size;
    this.seed[i] = seed;
    if (this.withNormal) {
      this.normal[i * 3] = normal[0];
      this.normal[i * 3 + 1] = normal[1];
      this.normal[i * 3 + 2] = normal[2];
    }
  }
  finish() {
    const n = this.n;
    const out = {
      count: n,
      position: this.position.slice(0, n * 3),
      color: this.color.slice(0, n * 3),
      size: this.size.slice(0, n),
      seed: this.seed.slice(0, n),
    };
    if (this.withNormal) out.normal = this.normal.slice(0, n * 3);
    return out;
  }
}

const enc = (v) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const OLD = [1.0, 0.84, 0.66];
const RED_GIANT = [1.0, 0.66, 0.44];
const BULGE = [1.0, 0.8, 0.56];
const BLUE = [0.48, 0.64, 1.0];
const BLUE_WHITE = [0.68, 0.8, 1.0];
const HII = [1.0, 0.27, 0.47];
const XRAY = [0.62, 0.48, 1.0];
const EXTINCTION = [0.55, 0.63, 0.76];

export function generateFromRecipe(recipe, { quality = 1, textureSize = 1024 } = {}) {
  const rand = mulberry32(recipe.seed ?? 1);
  const L = Object.fromEntries(LAYERS.map((k) => [k, new Layer(WITH_NORMAL.has(k))]));
  const disks = [];
  const features = { hii: {} };
  const q = quality;
  const g = () => gaussian(rand);

  const blue = () => {
    const t = rand();
    return t < 0.55 ? BLUE : t < 0.85 ? BLUE_WHITE : [1.0, 0.95, 0.86];
  };

  // ---------- Сфероид: ядро, эллиптическая галактика, спутник, облако ----------
  function spheroid(S, frame) {
    const F = frame ?? bodyFrame(S.position, S.rotation);
    const n = Math.round((S.count ?? 20000) * q);
    const scale = S.scale ?? 1;
    const max = S.max ?? scale * 12;
    const flat = S.flat ?? 0.8;
    const stretch = S.stretch ?? 1;
    const color = S.color ?? BULGE;
    const bright = S.brightness ?? 1;
    for (let i = 0; i < n; ) {
      const r = scale * Math.pow(-Math.log(1 - rand() * 0.997), S.profile ?? 1.8);
      if (r > max) continue;
      const u = 2 * rand() - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const lobe = S.lumpy ? 1 + S.lumpy * (0.18 * Math.sin(3 * phi + 0.7) + 0.1 * Math.sin(5 * phi + 2.1)) : 1;
      const b = 0.12 * bright * (0.45 + Math.pow(rand(), 2) * 1.6);
      const red = rand() * 0.08;
      L.old.push(
        F.offset(r * lobe * s * Math.cos(phi) * stretch, r * u * flat, r * lobe * s * Math.sin(phi)),
        [color[0], color[1] - red, color[2] - red],
        b,
        0.045 + rand() * 0.03,
        rand(),
      );
      i++;
    }
    if (S.nucleus) L.old.push(F.offset(0, 0, 0), [1.0, 0.92, 0.8], S.nucleus, Math.max(0.05, scale * 0.25), 1);

    // Молодые звёзды и облака водорода внутри сфероида (вспышка звездообразования, облако MPG-CR3)
    if (S.young) {
      const Y = S.young;
      const m = Math.round(Y.count * q);
      for (let i = 0; i < m; i++) {
        const rr = Math.abs(g()) * Y.scale;
        const d = randomDir();
        L.young.push(F.offset(d[0] * rr, d[1] * rr * flat, d[2] * rr), Y.color ?? blue(), (Y.b ?? 0.3) * (0.4 + Math.pow(rand(), 3) * 3), 0.05 + rand() * 0.03, rand());
      }
    }
    if (S.hii) {
      const H = S.hii;
      const m = Math.round(H.count * q);
      for (let i = 0; i < m; i++) {
        const rr = Math.abs(g()) * H.scale;
        const d = randomDir();
        const size = H.size * (0.4 + rand() * 0.9);
        L.hii.push(F.offset(d[0] * rr, d[1] * rr * flat, d[2] * rr), H.color ?? HII, (H.b ?? 0.35) * (0.5 + rand()), size, rand());
      }
    }
    if (S.hagas) {
      const H = S.hagas;
      const m = Math.round(H.count * q);
      for (let i = 0; i < m; i++) {
        const rr = Math.abs(g()) * H.scale;
        const d = randomDir();
        L.hagas.push(F.offset(d[0] * rr, d[1] * rr, d[2] * rr), H.color ?? HII, (H.b ?? 0.05) * (0.5 + rand()), H.size * (0.5 + rand()), rand());
      }
    }
    if (S.dust) {
      const Dd = S.dust;
      const m = Math.round(Dd.count * q);
      for (let i = 0; i < m; i++) {
        const rr = Math.abs(g()) * Dd.scale;
        const d = randomDir();
        L.dust.push(F.offset(d[0] * rr, d[1] * rr * (Dd.flat ?? flat), d[2] * rr), EXTINCTION, (Dd.b ?? 0.3) * (0.6 + rand() * 0.8), Dd.size * (0.6 + rand() * 0.8), rand());
      }
    }
    if (S.xray) L.xray.push(F.offset(0, 0, 0), [1, 0.92, 1.1], S.xray, Math.max(0.1, scale * 0.6), 1);
    if (S.glow) {
      const m = Math.round(S.glow.count * q);
      for (let i = 0; i < m; i++) {
        const rr = Math.abs(g()) * S.glow.scale;
        const d = randomDir();
        L.glow.push(F.offset(d[0] * rr, d[1] * rr * flat, d[2] * rr), color, S.glow.b ?? 0.01, S.glow.size * (0.6 + rand() * 0.8), rand());
      }
    }
  }

  function randomDir() {
    const u = 2 * rand() - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [s * Math.cos(phi), u, s * Math.sin(phi)];
  }

  // ---------- Диск ----------
  function disk(raw, index) {
    const D = withDiskDefaults(raw);
    const F = bodyFrame(raw.position, raw.rotation);
    const field = createDiskField(D, (recipe.seed ?? 1) + index * 101);
    const tmp = {};
    const N = Math.max(128, Math.round(textureSize * (raw.texture ?? 1)));
    const E = D.extent;
    const cnt = (k, base) => Math.round((raw.counts?.[k] ?? 1) * base * q * (raw.countScale ?? 1));
    const bright = D.brightness;

    function bake(size, ext) {
      const data = new Uint8Array(size * size * 4);
      for (let j = 0; j < size; j++) {
        const y = -ext + ((j + 0.5) * 2 * ext) / size;
        for (let i = 0; i < size; i++) {
          const x = -ext + ((i + 0.5) * 2 * ext) / size;
          field.sample(x, y, tmp);
          const o = (j * size + i) * 4;
          data[o] = enc(tmp.old * 0.9 * bright);
          data[o + 1] = enc(tmp.young * 0.72 * bright);
          data[o + 2] = enc(tmp.dust * 0.7);
          data[o + 3] = enc(tmp.sf * 1.3 * bright);
        }
      }
      return { size, extent: ext, data };
    }

    // У спрятанной в пыли галактики (Хайд) молодые звёзды и облака идут в отдельный слой
    const Y = raw.obscured ? L.obscured : L.young;
    const H = raw.obscured ? L.obscured : L.hii;
    const tex = bake(N, E);
    if (raw.inner) tex.inner = bake(Math.round(N / 2), raw.inner);
    disks.push({
      id: raw.id,
      ...tex,
      position: raw.position ?? [0, 0, 0],
      rotation: raw.rotation ?? [0, 0, 0],
      normal: F.normal,
      dustStrength: raw.dustStrength,
    });

    // Выборка точек по запечённой текстуре: где ярче канал, там больше точек.
    const chanMax = [0, 0, 0, 0];
    for (let i = 0; i < tex.data.length; i += 4) for (let c = 0; c < 4; c++) chanMax[c] = Math.max(chanMax[c], tex.data[i + c]);
    function pick(channel, power = 1, tries = 4000) {
      const cmax = chanMax[channel] || 1;
      for (let t = 0; t < tries; t++) {
        const i = Math.floor(rand() * N);
        const j = Math.floor(rand() * N);
        const v = tex.data[(j * N + i) * 4 + channel] / cmax;
        if (rand() < Math.pow(v * v, power)) {
          return [-E + ((i + rand()) * 2 * E) / N, -E + ((j + rand()) * 2 * E) / N, v];
        }
      }
      return null;
    }

    // Старые звёзды диска
    const nOld = cnt('old', 80000);
    for (let n = 0; n < nOld; n++) {
      const p = pick(0, 1);
      if (!p) break;
      const r = Math.hypot(p[0], p[1]);
      const t = rand();
      const c = t < 0.14 ? RED_GIANT : t > 0.88 ? [1.0, 0.95, 0.88] : raw.colors?.old ?? OLD;
      L.old.push(F.toWorld(p[0], p[1], g() * D.thick * (0.7 + r / D.radius)), c, 0.15 * bright * (0.35 + Math.pow(rand(), 3) * 2.4), 0.05 + rand() * 0.035, rand());
    }
    // Молодые звёзды
    const youngColor = raw.colors?.young;
    const nYoung = cnt('young', 55000);
    for (let n = 0; n < nYoung; n++) {
      const p = pick(1, 0.7);
      if (!p) break;
      Y.push(F.toWorld(p[0], p[1], g() * D.thick * 0.4), youngColor ?? blue(), 0.2 * bright * (0.35 + Math.pow(rand(), 4) * 3.2), 0.05 + rand() * 0.03, rand());
    }
    // Скопления молодых звёзд
    const nClusters = cnt('clusters', 2200);
    for (let n = 0; n < nClusters; n++) {
      const p = pick(1, 2.2);
      if (!p) break;
      const m = 5 + Math.floor(Math.pow(rand(), 2) * 24);
      const sigma = 0.07 + 0.22 * rand();
      for (let i = 0; i < m; i++) {
        Y.push(F.toWorld(p[0] + g() * sigma, p[1] + g() * sigma, g() * 0.06), youngColor ?? blue(), 0.26 * bright * (0.4 + Math.pow(rand(), 3) * 3), 0.05 + rand() * 0.03, rand());
      }
    }
    // Области H II
    const nHII = cnt('hii', 2400);
    let best = { score: -1, x: D.radius * 0.5, y: 0 };
    for (let n = 0; n < nHII; n++) {
      const p = pick(3, 0.8);
      if (!p) break;
      const size = (0.1 + Math.pow(rand(), 2.2) * 0.42) * (0.7 + p[2] * 0.6) * (raw.hiiSize ?? 1);
      const b = 0.4 * bright * (0.55 + p[2]);
      const h = g() * 0.05;
      H.push(F.toWorld(p[0], p[1], h), HII, b, size, rand());
      const sat = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < sat; i++) {
        const off = size * 0.8;
        H.push(F.toWorld(p[0] + g() * off, p[1] + g() * off, h), [1.0, 0.32, 0.52], b * (0.35 + rand() * 0.5), size * (0.3 + rand() * 0.45), rand());
      }
      const hot = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < hot; i++) {
        Y.push(F.toWorld(p[0] + g() * size * 0.3, p[1] + g() * size * 0.3, h), [0.8, 0.9, 1.0], (0.28 + rand() * 0.35) * bright, 0.06, rand());
      }
      const r = Math.hypot(p[0], p[1]);
      const score = size * p[2];
      if (r > D.radius * 0.3 && r < D.radius * 0.9 && score > best.score) best = { score, x: p[0], y: p[1] };
    }
    features.hii[raw.id] = [best.x, best.y];

    // Пыль частицами и мягкое свечение — для вида с ребра
    const nDust = cnt('dust', 15000);
    for (let n = 0; n < nDust; n++) {
      const p = pick(2, 0.8);
      if (!p) break;
      const d = 0.2 + rand() * 0.15;
      L.dust.push(F.toWorld(p[0], p[1], g() * D.thick * 0.3), EXTINCTION, d, (0.45 + rand() * 0.55) * (raw.dustSize ?? 1), rand(), F.normal);
    }
    const nGlow = cnt('glow', 4500);
    for (let n = 0; n < nGlow; n++) {
      const p = pick(0, 0.5);
      if (!p) break;
      L.glow.push(F.toWorld(p[0], p[1], g() * D.thick), [1, 0.85, 0.68], 0.012 * bright, (1.4 + rand() * 2.2) * (D.radius / 30), rand(), F.normal);
    }

    // Балдж
    if (raw.bulge) spheroid({ ...raw.bulge, flat: raw.bulge.flat ?? 0.72 }, F);

    // Рентген: двойные системы в рукавах, старые двойные в балдже, ультраяркие источники, ядро
    const X = { hmxb: 200, lmxb: 70, ulx: 6, nucleus: 3, gas: 300, ...(raw.xray ?? {}) };
    for (let n = 0; n < Math.round(X.hmxb * q); n++) {
      const p = pick(1, 1);
      if (!p) break;
      const br = Math.pow(rand(), 3);
      L.xray.push(F.toWorld(p[0], p[1], 0), mix3(XRAY, [1, 0.98, 1], br), 0.5 + br * 2, 0.09 + br * 0.12, rand());
    }
    for (let n = 0; n < Math.round(X.lmxb * q); n++) {
      const p = pick(0, 1.5);
      if (!p) break;
      const br = Math.pow(rand(), 3);
      L.xray.push(F.toWorld(p[0], p[1], 0), mix3(XRAY, [1, 0.98, 1], br), 0.4 + br * 1.5, 0.08 + br * 0.1, rand());
    }
    for (let n = 0; n < X.ulx; n++) {
      const p = pick(1, 1.5);
      if (!p) break;
      L.xray.push(F.toWorld(p[0], p[1], 0), [1, 0.95, 1.15], 3.2, 0.3 * (D.radius / 30), 1);
    }
    if (X.nucleus) L.xray.push(F.toWorld(0, 0, 0), [1, 0.92, 1.1], X.nucleus, 0.5, 1);
    const coreR = raw.bulge?.scale ? raw.bulge.scale * 6 : D.radius * 0.08;
    for (let n = 0; n < Math.round(X.gas * q); n++) {
      const r = Math.abs(g()) * coreR;
      const th = rand() * Math.PI * 2;
      L.xray.push(F.toWorld(r * Math.cos(th), r * Math.sin(th), g() * coreR * 0.25), [0.7, 0.45, 1.0], 0.05 + rand() * 0.05, (0.9 + rand() * 0.8) * (coreR / 2.6), rand());
    }
  }

  // ---------- Хвост вдоль кривой Катмулла — Рома ----------
  function curve(points) {
    const n = points.length - 1;
    return (t) => {
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
    };
  }

  function tail(T) {
    const path = curve(T.points);
    const [w0, w1] = T.width ?? [2, 6];
    const fall = T.falloff ?? 1;
    const sampleT = () => {
      for (;;) {
        const t = rand();
        if (rand() < Math.pow(1 - t, fall) * 0.85 + 0.15) return t;
      }
    };
    const at = (t, spread = 1) => {
      const c = path(t);
      const w = (w0 + (w1 - w0) * t) * spread;
      return [c[0] + g() * w, c[1] + g() * w * (T.flat ?? 1), c[2] + g() * w];
    };
    const C = T.counts ?? {};
    const b = T.brightness ?? 1;
    for (let n = 0; n < Math.round((C.old ?? 0) * q); n++) {
      L.old.push(at(sampleT()), T.color ?? [1.0, 0.86, 0.72], 0.07 * b * (0.4 + rand()), 0.05 + rand() * 0.03, rand());
    }
    for (let n = 0; n < Math.round((C.young ?? 0) * q); n++) {
      L.young.push(at(sampleT(), 0.8), blue(), 0.16 * b * (0.35 + Math.pow(rand(), 4) * 3), 0.05 + rand() * 0.03, rand());
    }
    for (let n = 0; n < Math.round((C.clusters ?? 0) * q); n++) {
      const c = at(sampleT(), 0.7);
      const m = 4 + Math.floor(rand() * 16);
      const s = 0.1 + rand() * 0.3;
      for (let i = 0; i < m; i++) {
        L.young.push([c[0] + g() * s, c[1] + g() * s, c[2] + g() * s], blue(), 0.24 * b * (0.4 + Math.pow(rand(), 3) * 3), 0.05 + rand() * 0.03, rand());
      }
    }
    for (let n = 0; n < Math.round((C.hii ?? 0) * q); n++) {
      const c = at(sampleT(), 0.7);
      const size = (0.12 + Math.pow(rand(), 2) * 0.45) * (T.hiiSize ?? 1);
      L.hii.push(c, HII, 0.35 * b * (0.5 + rand()), size, rand());
      for (let i = 0; i < 2; i++) L.hii.push([c[0] + g() * size, c[1] + g() * size, c[2] + g() * size], [1, 0.32, 0.52], 0.15 * b, size * 0.5, rand());
    }
    for (let n = 0; n < Math.round((C.dust ?? 0) * q); n++) {
      L.dust.push(at(sampleT(), 0.6), EXTINCTION, 0.18 * (0.6 + rand()), (T.dustSize ?? 1.2) * (0.6 + rand() * 0.8), rand());
    }
    for (let n = 0; n < Math.round((C.haze ?? 0) * q); n++) {
      L.glow.push(at(sampleT(), 0.8), T.hazeColor ?? [1, 0.88, 0.75], (T.hazeB ?? 0.006) * b, (T.hazeSize ?? 6) * (0.6 + rand() * 0.8), rand());
    }
    for (let n = 0; n < Math.round((C.hagas ?? 0) * q); n++) {
      L.hagas.push(at(sampleT(), 1.1), HII, (T.hagasB ?? 0.04) * (0.5 + rand()), (T.hagasSize ?? 4) * (0.5 + rand()), rand());
    }
    for (let n = 0; n < Math.round((C.xgas ?? 0) * q); n++) {
      L.xray.push(at(sampleT(), 1.2), [0.7, 0.5, 1.0], (T.xgasB ?? 0.04) * (0.5 + rand()), (T.xgasSize ?? 5) * (0.5 + rand()), rand());
    }
  }

  recipe.bodies.forEach((body, i) => {
    if (body.kind === 'disk') disk(body, i);
    else if (body.kind === 'spheroid') spheroid(body);
    else if (body.kind === 'tail') tail(body);
  });

  return {
    disks,
    layers: Object.fromEntries(LAYERS.map((k) => [k, L[k].finish()])),
    features,
  };
}
