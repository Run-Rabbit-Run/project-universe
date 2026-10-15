// Роза из галактик (Arp 273): большая спираль UGC 1810, которую спутник UGC 1813
// пролетел насквозь и превратил в «розу». Спутник виден почти с ребра.

import { loadRecipe } from '../procedural/load.js';
import { skyFrame } from '../../lib/frame.js';
import { DEG, coreGlow, expeditionsText, onBodyPolar, onTail } from '../procedural/helpers.js';

const PHI = 26 * DEG;
const sky = skyFrame(PHI, 0);

const COMPANION = sky.at(8, -74, 14);
const MINI = sky.at(31, 24, 2);
const BRIDGE = [sky.at(2, -38, 6), sky.at(6, -52, 10), sky.at(8, -66, 13)];

const ROSE = {
  kind: 'disk',
  id: 'ugc1810',
  radius: 46,
  scale: 11,
  thick: 0.45,
  extent: 54,
  inner: 12,
  arms: { n: 2, pitch: 21, wind: -1, phase: 2.2, r0: 4, r1: 38, strength: 1.0, floc: 0.3, width0: 1.3 },
  // Внешний рукав-кольцо, а поверху — россыпь голубых «самоцветов»
  rings: [{ r: 41, w: 4.5, young: 0.7, hii: 1.2, dust: 0.5, old: 0.2, floor: 0.15, focus: { angle: 95, width: 60, boost: 3, base: 0.12 } }],
  young: 1.1,
  hii: 1.2,
  dust: { lanes: 1.1, spurs: 0.6, floc: 0.5, nuclear: 0.6, nuclearR: 6 },
  dustStrength: 2.0,
  counts: { young: 1.2, clusters: 1.4, hii: 1.3 },
  bulge: { scale: 0.5, max: 8, count: 20000 },
  xray: { hmxb: 150, lmxb: 50, ulx: 4, nucleus: 1, gas: 200 },
};

const COMP = {
  kind: 'disk',
  id: 'ugc1813',
  position: COMPANION,
  // Почти с ребра: нормаль диска смотрит «вверх» по небу, а не на нас
  rotation: [PHI - Math.PI / 2 + 12 * DEG, 0.1, 0.18],
  radius: 18,
  scale: 4,
  thick: 0.3,
  extent: 22,
  texture: 0.5,
  arms: { n: 2, pitch: 14, wind: 1, r0: 2, r1: 17, strength: 0.5 },
  bar: { length: 3, width: 1, angle: 0, strength: 0.8 },
  young: 0.6,
  hii: 0.6,
  dust: { lanes: 1.4, spurs: 0.2, floc: 0.6, nuclear: 0.8, nuclearR: 3 },
  dustStrength: 2.4,
  counts: { old: 0.5, young: 0.4, clusters: 0.4, hii: 0.4, dust: 0.6, glow: 0.5 },
  // Вспышка звездообразования в ядре
  bulge: {
    scale: 0.35,
    max: 4,
    count: 9000,
    young: { count: 2600, scale: 0.7, b: 0.4 },
    hii: { count: 320, scale: 0.8, size: 0.4, b: 0.5 },
  },
  xray: { hmxb: 60, lmxb: 20, ulx: 2, nucleus: 2.2, gas: 150 },
};

const RECIPE = {
  seed: 273,
  bodies: [
    ROSE,
    COMP,
    {
      kind: 'spheroid',
      id: 'mini',
      position: MINI,
      count: 2000,
      scale: 0.5,
      max: 4,
      brightness: 0.8,
      young: { count: 900, scale: 1.6, b: 0.28 },
      hii: { count: 40, scale: 1.4, size: 0.4 },
    },
    {
      kind: 'tail',
      id: 'bridge',
      points: BRIDGE,
      width: [3, 2],
      falloff: 0.2,
      brightness: 0.5,
      counts: { old: 1600, young: 300, haze: 120 },
      hazeSize: 6,
      hazeB: 0.004,
    },
  ],
};

export default {
  id: 'rose',
  catalog: 'Arp 273 · UGC 1810 + UGC 1813',
  name: 'Роза из галактик',
  constellation: 'Андромеда',
  distance: { ly: 300e6, label: '≈ 300 млн св. лет' },
  loading: 'Собираем Розу из галактик',
  lede: 'Маленькая галактика пролетела сквозь большую, и та распустилась, как роза. Снимок «Хаббла» к его 21-му дню рождения.',
  bandNotes: {
    visible: 'Наверху «розы» — россыпь голубых скоплений молодых звёзд. Внизу — спутник почти с ребра, с ярким ядром.',
    halpha: 'Водород светится во внешнем рукаве-кольце и в ядре спутника, где идёт вспышка звездообразования.',
  },

  load: (opts) => loadRecipe(RECIPE, opts),

  scene: {
    occluder: { center: [0, 0, 0], radius: 5 },
    billboards: [
      coreGlow([0, 0, 0], 12, { core: 0.05, halo: 0.25, intensity: 0.6 }),
      coreGlow(COMPANION, 6, { core: 0.06, halo: 0.25, intensity: 0.9, vis: [0.85, 0.82, 0.9] }),
    ],
  },

  views: {
    earth: { label: 'Вид с Земли', target: sky.at(2, -28), fit: 80, fitX: 56, phi: PHI, theta: 0 },
    rose: { label: 'Роза сверху', target: [0, 0, 0], fit: 50, fitX: 50, phi: 0.001, theta: 0 },
    side: { label: 'Сбоку', target: sky.at(2, -20), radius: 230, phi: 80 * DEG, theta: 90 * DEG },
    companion: { label: 'К UGC 1813', target: COMPANION, radius: 45, phi: 50 * DEG, theta: 30 * DEG },
  },

  passport: [
    ['Обозначения', 'Arp 273 · UGC 1810 + UGC 1813'],
    ['Типы', 'SA(s)b pec и SB(s)a pec'],
    ['Созвездие', 'Андромеда'],
    ['Расстояние', '≈ 300 млн св. лет'],
    ['Массы', 'большая тяжелее спутника примерно в 5 раз'],
    ['Блеск', '13,7m'],
    ['Между ними', 'десятки тысяч световых лет'],
  ],

  timeline: [
    ['1962', 'В Ликской обсерватории замечают сверхновую SN 1962R — единственную, известную в этой паре.'],
    ['1966', 'Холтон Арп включает пару в «Атлас пекулярных галактик» под номером 273.'],
    ['2011', '«Хаббл» к своему 21-му дню рождения публикует снимок — «галактическую розу».'],
  ],

  sources: [
    ['Wikipedia — Arp 273', 'https://en.wikipedia.org/wiki/Arp_273'],
    ['ESA/Hubble — heic1107', 'https://esahubble.org/news/heic1107/'],
  ],

  expeditions: expeditionsText('в Розе из галактик'),

  hotspots() {
    return [
      {
        id: 'ugc1810',
        kind: 'structure',
        title: 'UGC 1810 — роза',
        pos: onBodyPolar(ROSE, 20, 200),
        anchor: 'w',
        view: { radius: 70, phi: 20 * DEG },
        facts: [['Тип', 'спираль, искажённая приливом']],
        body: [
          'Большая галактика пары. Притяжение спутника изогнуло её внутренние рукава, а внешний рукав вытянуло почти в кольцо — так и получилась «роза».',
        ],
      },
      {
        id: 'jewels',
        kind: 'structure',
        title: 'Голубые самоцветы',
        pos: onBodyPolar(ROSE, 41, 95),
        anchor: 'ne',
        view: { radius: 38, phi: 25 * DEG },
        facts: [['Что это', 'скопления молодых горячих звёзд']],
        body: ['Полоса ярких голубых скоплений поверху «розы». Звёзды здесь рождаются вслед за ударной волной от пролёта спутника.'],
        band: 'halpha',
        bandHint: 'В Hα видны облака вокруг молодых звёзд',
      },
      {
        id: 'ugc1813',
        kind: 'structure',
        title: 'UGC 1813',
        pos: COMPANION,
        anchor: 'e',
        view: { radius: 34, phi: 45 * DEG },
        facts: [['Видна', 'почти с ребра']],
        body: [
          'Спутник, который, по-видимому, пролетел сквозь большую галактику. В его ядре — бурная вспышка звездообразования, возможно, разбуженная этим столкновением.',
        ],
      },
      {
        id: 'mini',
        kind: 'structure',
        title: 'Третья галактика?',
        pos: MINI,
        anchor: 'ne',
        view: { radius: 22 },
        facts: [['Статус', 'не подтверждена']],
        body: ['В рукавах справа вверху, возможно, прячется крошечная спиральная галактика. Если она есть, то тоже влияет на форму внешнего рукава.'],
      },
    ];
  },
};
