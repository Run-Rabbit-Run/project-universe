// Объект Хога — почти идеальное кольцо голубых звёзд вокруг жёлтого ядра.
// Сквозь просвет между ними видна другая, гораздо более далёкая кольцевая галактика.

import { loadRecipe } from '../procedural/load.js';
import { skyFrame } from '../../lib/frame.js';
import { DEG, coreGlow, expeditionsText, onBodyPolar } from '../procedural/helpers.js';

const PHI = 16 * DEG; // наклон к лучу зрения в модели
const sky = skyFrame(PHI, 0);

// Далёкая кольцевая галактика за просветом «на час дня».
// Ставим её на луч от камеры (вид с Земли с расстояния ≈ 210 тыс. св. лет) через точку в просвете.
const EARTH_DIST = 210;
const gapPoint = onBodyPolar({ position: [0, 0, 0], rotation: [0, 0, 0] }, 23, 58);
const cam = sky.toCam.map((v) => v * EARTH_DIST);
const BG_DEPTH = 5.2; // во сколько раз дальше от камеры, чем точка в просвете
const BG_POS = [0, 1, 2].map((i) => cam[i] + (gapPoint[i] - cam[i]) * BG_DEPTH);

const RING = {
  kind: 'disk',
  id: 'ring',
  radius: 66,
  scale: 40,
  extent: 72,
  thick: 0.5,
  oldContrast: 0.5,
  clumpScale: 0.22,
  colors: { young: [0.42, 0.6, 1.0] },
  rings: [{ r: 49, w: 7.5, young: 1.8, hii: 0.8, dust: 0.25, old: 0.35, floor: 0.08 }],
  gap: { r0: 8.5, r1: 37.5, depth: 0.96, soft: 3 },
  dust: { lanes: 0, spurs: 0, floc: 0.08, nuclear: 0 },
  counts: { old: 0.6, young: 1.5, clusters: 1.8, hii: 0.9, dust: 0.25, glow: 0.8 },
  dustStrength: 1.2,
  xray: { hmxb: 140, lmxb: 20, ulx: 3, nucleus: 0, gas: 0 },
};

const RECIPE = {
  seed: 1950,
  bodies: [
    {
      kind: 'spheroid',
      id: 'core',
      position: [0, 0, 0],
      scale: 0.8,
      max: 9,
      count: 36000,
      flat: 0.95,
      color: [1.0, 0.82, 0.58],
      nucleus: 1.2,
      brightness: 1.1,
      xray: 1.2,
    },
    RING,
    {
      kind: 'disk',
      id: 'background',
      position: BG_POS,
      rotation: [PHI + 0.35, 0.5, 0.2],
      radius: 42,
      scale: 25,
      extent: 46,
      texture: 0.35,
      brightness: 0.45,
      clumpScale: 0.3,
      rings: [{ r: 28, w: 5, young: 1.4, hii: 0.5, dust: 0.2, old: 0.6 }],
      gap: { r0: 6, r1: 20, depth: 0.9, soft: 2 },
      dust: { lanes: 0, spurs: 0, floc: 0, nuclear: 0 },
      colors: { young: [0.8, 0.72, 0.85] },
      countScale: 0.3,
      xray: { hmxb: 0, lmxb: 0, ulx: 0, nucleus: 0, gas: 0 },
      bulge: { scale: 0.6, max: 6, count: 5000, brightness: 0.5 },
    },
  ],
};

export default {
  id: 'hoag',
  catalog: 'PGC 54559',
  name: 'Объект Хога',
  constellation: 'Змея',
  distance: { ly: 594e6, label: '≈ 600 млн св. лет' },
  loading: 'Собираем кольцо Объекта Хога',
  lede: 'Почти идеальное кольцо молодых звёзд вокруг старого ядра. Как оно появилось, до сих пор неизвестно.',
  bandNotes: {
    visible: 'Жёлтое ядро из старых звёзд, тёмный просвет и голубое кольцо молодых звёзд. В просвете — далёкая кольцевая галактика.',
    halpha: 'Облака ионизованного водорода есть только в кольце: звёзды рождаются там, а не в ядре.',
  },

  load: (opts) => loadRecipe(RECIPE, opts),

  scene: {
    occluder: { center: [0, 0, 0], radius: 6 },
    billboards: [
      coreGlow([0, 0, 0], 16, { core: 0.05, halo: 0.3, intensity: 0.9, vis: [1.0, 0.8, 0.55] }),
      coreGlow(BG_POS, 7, { core: 0.08, halo: 0.3, intensity: 0.25, vis: [0.9, 0.7, 0.55] }),
    ],
  },

  views: {
    earth: { label: 'Вид с Земли', target: [0, 0, 0], fit: 66, fitX: 66, phi: PHI, theta: 0 },
    top: { label: 'Сверху', target: [0, 0, 0], fit: 66, fitX: 66, phi: 0.001, theta: 0 },
    edge: { label: 'С ребра', target: [0, 0, 0], fit: 20, fitX: 70, phi: 88 * DEG, theta: 0 },
    behind: { label: 'Кольцо вдали', target: BG_POS.map((v) => v * 0.5), radius: 1500, phi: 80 * DEG, theta: 70 * DEG },
  },

  passport: [
    ['Обозначения', 'PGC 54559 · Объект Хога'],
    ['Тип', 'кольцевая галактика (RP)E0 или (RP)SA0/a'],
    ['Созвездие', 'Змея (Голова Змеи)'],
    ['Координаты', 'α 15ч 17м 14,4с · δ +21° 35′ 08″'],
    ['Расстояние', '≈ 600 млн св. лет (z = 0,042)'],
    ['Диаметр кольца', '≈ 121 000 св. лет (внутренний край — 75 000)'],
    ['Ядро', '≈ 17 000 св. лет в поперечнике'],
    ['Масса', '≈ 700 млрд масс Солнца'],
    ['Блеск', '15,1m — только в крупный телескоп'],
    ['Скорость', 'удаляется ≈ 12 700 км/с'],
  ],

  timeline: [
    ['1950', 'Артур Хог находит необычный объект: жёлтое пятно в правильном кольце. Он допускает, что это планетарная туманность или что кольцо — изображение, искажённое гравитационной линзой.'],
    ['1987', 'Измерения показывают, что у ядра и кольца одинаковое красное смещение: это одна галактика, а не линза.'],
    ['2001', '«Хаббл» снимает Объект Хога; в просвете между ядром и кольцом замечают далёкую кольцевую галактику.'],
    ['Сейчас', 'Гипотез две: кольцо — след столкновения (но «пули»-галактики рядом нет) или результат неустойчивости бара (идея Ноа Броша).'],
  ],

  sources: [
    ['Wikipedia — Hoag’s Object', 'https://en.wikipedia.org/wiki/Hoag%27s_Object'],
    ['Википедия — Объект Хога', 'https://ru.wikipedia.org/wiki/Объект_Хога'],
  ],

  expeditions: expeditionsText('в Объекте Хога'),

  hotspots() {
    return [
      {
        id: 'core',
        kind: 'structure',
        title: 'Ядро',
        pos: [0, 0, 0],
        anchor: 'ne',
        view: { radius: 40 },
        facts: [
          ['Диаметр', '≈ 17 000 св. лет'],
          ['Звёзды', 'старые, жёлтые'],
        ],
        body: ['Почти круглое скопление старых жёлтых звёзд, похожее на маленькую эллиптическую галактику. Новых звёзд здесь почти не рождается.'],
      },
      {
        id: 'gap',
        kind: 'structure',
        title: 'Просвет',
        pos: onBodyPolar(RING, 24, 200),
        anchor: 'w',
        view: { radius: 70 },
        facts: [['Ширина', '≈ 30 000 св. лет']],
        body: ['Между ядром и кольцом почти пусто. Именно эта чёткая тёмная щель делает Объект Хога самой «идеальной» кольцевой галактикой из известных.'],
      },
      {
        id: 'ring',
        kind: 'structure',
        title: 'Кольцо молодых звёзд',
        pos: onBodyPolar(RING, 49, -40),
        anchor: 'e',
        view: { radius: 45 },
        facts: [
          ['Диаметр', '75 000–121 000 св. лет'],
          ['Возраст', 'не меньше 2–3 млрд лет'],
        ],
        body: [
          'Кольцо из горячих голубых звёзд и розовых облаков водорода. Кольцо существует уже миллиарды лет, а значит, это не короткая вспышка после столкновения.',
          'За видимым кольцом в радиодиапазоне тянется ещё одно — из холодного нейтрального водорода.',
        ],
        band: 'halpha',
        bandHint: 'В Hα светится только кольцо',
      },
      {
        id: 'background',
        kind: 'structure',
        title: 'Далёкий двойник',
        pos: BG_POS,
        anchor: 'ne',
        view: { radius: 160, phi: PHI, theta: 0 },
        facts: [['Где', 'за Объектом Хога, гораздо дальше']],
        body: [
          'В просвете «на час дня» видна ещё одна кольцевая галактика. Она лежит намного дальше и просто оказалась на одной линии с Объектом Хога — редкое совпадение.',
          'Нажмите «Кольцо вдали», чтобы посмотреть сбоку: двойник уедет из просвета.',
        ],
      },
    ];
  },
};
