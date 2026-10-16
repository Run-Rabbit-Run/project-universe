// Антенны (NGC 4038/4039): две галактики посреди столкновения и два длинных приливных хвоста.
// Мир здесь — плоскость неба: камера «с Земли» смотрит сверху, вправо — +X, вверх — −Z.

import { loadRecipe } from '../procedural/load.js';
import { DEG, coreGlow, expeditionsText, onTail } from '../procedural/helpers.js';

// Небо → мир: sx вправо, sy вверх, d к зрителю
const S = (sx, sy, d = 0) => [sx, d, -sy];

const N4038 = S(-5, 9, 0);
const N4039 = S(6, -8, -2);
const OVERLAP = S(1, 1, -1);

// Оба хвоста уходят на юг почти параллельными дугами — как усики насекомого
const TAIL_N = [S(-18, 10, 0), S(-42, 2, -10), S(-58, -40, -22), S(-64, -92, -32), S(-58, -146, -40)];
const TAIL_S = [S(18, -12, 0), S(12, -52, 10), S(-6, -104, 22), S(-26, -158, 32), S(-36, -212, 40)];
const DWARF = TAIL_S[TAIL_S.length - 1];

const BIG = {
  kind: 'disk',
  id: 'n4038',
  position: N4038,
  rotation: [42 * DEG, 0.2, 25 * DEG],
  radius: 21,
  scale: 6,
  thick: 0.5,
  extent: 26,
  clumpScale: 0.35,
  arms: { n: 2, pitch: 26, wind: -1, phase: 1.1, r0: 2.5, r1: 21, strength: 0.75, floc: 0.7, segments: 0.4, width0: 1.2 },
  bar: { length: 4, width: 1.5, angle: 20, strength: 0.4 },
  young: 1.3,
  hii: 1.6,
  dust: { lanes: 1.2, spurs: 0.3, floc: 0.9, nuclear: 0.6, nuclearR: 4 },
  dustStrength: 2.2,
  counts: { young: 1.2, clusters: 1.8, hii: 1.6 },
  bulge: { scale: 0.3, max: 4, count: 9000 },
  xray: { hmxb: 220, lmxb: 40, ulx: 9, nucleus: 1.2, gas: 260 },
};

const SMALL = {
  kind: 'disk',
  id: 'n4039',
  position: N4039,
  rotation: [-55 * DEG, 0.3, -20 * DEG],
  radius: 15,
  scale: 4.5,
  thick: 0.45,
  extent: 19,
  texture: 0.6,
  clumpScale: 0.35,
  arms: { n: 2, pitch: 28, wind: 1, phase: 0.3, r0: 2, r1: 15, strength: 0.7, floc: 0.6, segments: 0.3 },
  young: 1.2,
  hii: 1.3,
  dust: { lanes: 1.1, spurs: 0.2, floc: 0.8, nuclear: 0.6, nuclearR: 3.5 },
  dustStrength: 2.2,
  counts: { old: 0.7, young: 0.8, clusters: 1.0, hii: 1.0, dust: 0.7, glow: 0.6 },
  bulge: { scale: 0.3, max: 4, count: 8000 },
  xray: { hmxb: 140, lmxb: 30, ulx: 6, nucleus: 1.2, gas: 200 },
};

const tail = (id, points) => ({
  kind: 'tail',
  id,
  points,
  width: [2.6, 5.5],
  falloff: 1.1,
  brightness: 1,
  counts: { old: 16000, young: 1800, clusters: 110, hii: 80, dust: 220, haze: 600 },
  hazeSize: 8,
  hazeB: 0.006,
});

const RECIPE = {
  seed: 4038,
  bodies: [
    BIG,
    SMALL,
    {
      kind: 'spheroid',
      id: 'overlap',
      position: OVERLAP,
      count: 2500,
      scale: 1.6,
      max: 7,
      flat: 0.5,
      brightness: 0.7,
      young: { count: 4200, scale: 3.6, b: 0.32 },
      hii: { count: 950, scale: 3.3, size: 0.7, b: 0.3 },
      dust: { count: 1300, scale: 3.6, size: 1.3, flat: 0.35, b: 0.5 },
    },
    tail('tail-n', TAIL_N),
    tail('tail-s', TAIL_S),
    {
      kind: 'spheroid',
      id: 'dwarf',
      position: DWARF,
      count: 2600,
      scale: 0.8,
      max: 6,
      brightness: 0.8,
      young: { count: 700, scale: 2, b: 0.25 },
      hii: { count: 70, scale: 2, size: 0.5 },
    },
  ],
};

export default {
  id: 'antennae',
  catalog: 'NGC 4038 · NGC 4039',
  name: 'Антенны',
  constellation: 'Ворон',
  distance: { ly: 60e6, label: '45–70 млн св. лет' },
  loading: 'Собираем Антенны',
  lede: 'Две галактики в разгаре столкновения. Выброшенные хвосты звёзд похожи на усики насекомого.',
  bandNotes: {
    visible: 'Розовые и голубые узлы — тысячи новорождённых скоплений, бурые пятна — пыль, сжатая столкновением.',
    infrared: 'Ярче всего светится пыль в зоне перекрытия: там самая бурная вспышка звездообразования.',
    xray: 'Горячий газ, обогащённый магнием и кремнием от взрывов сверхновых, и множество ультраярких рентгеновских источников.',
  },

  load: (opts) => loadRecipe(RECIPE, opts),

  scene: {
    billboards: [
      coreGlow(N4038, 5, { core: 0.07, halo: 0.3, intensity: 0.45 }),
      coreGlow(N4039, 5.5, { core: 0.07, halo: 0.3, intensity: 0.55 }),
    ],
  },

  views: {
    earth: { label: 'Вид с Земли', target: S(-20, -96), fit: 122, fitX: 64, phi: 0.001, theta: 0 },
    core: { label: 'Сердце столкновения', target: S(0, 0), fit: 28, fitX: 34, phi: 0.001, theta: 0 },
    side: { label: 'Сбоку', target: S(-20, -96), radius: 520, phi: 78 * DEG, theta: 90 * DEG },
    dwarf: { label: 'Карликовая галактика', target: DWARF, radius: 70, phi: 30 * DEG, theta: 0 },
  },

  passport: [
    ['Обозначения', 'NGC 4038 и NGC 4039 · Arp 244'],
    ['Типы', 'SB(s)m pec и SA(s)m pec'],
    ['Созвездие', 'Ворон'],
    ['Координаты', 'α 12ч 01м 53с · δ −18° 52′ 10″'],
    ['Расстояние', '45–70 млн св. лет — оценки расходятся'],
    ['Блеск', '11,2m и 11,1m'],
    ['Хвосты', 'сотни тысяч световых лет'],
    ['Будущее', 'через ≈ 400 млн лет ядра сольются в одну эллиптическую галактику'],
  ],

  timeline: [
    ['≈ 1,2 млрд лет назад', 'Две спиральные галактики начинают сближаться.'],
    ['≈ 600 млн лет назад', 'Галактики проходят сквозь друг друга.'],
    ['≈ 300 млн лет назад', 'Приливные силы вытягивают из дисков длинные хвосты.'],
    ['1785', 'Уильям Гершель открывает Антенны.'],
    ['1921', 'Сверхновая SN 1921A в NGC 4039.'],
    ['1974', 'Сверхновая SN 1974E в NGC 4038.'],
    ['1997', '«Хаббл» находит в зоне столкновения больше тысячи молодых звёздных скоплений.'],
    ['2004–2013', 'Ещё три сверхновые в NGC 4038: SN 2004gt, SN 2007sr и SN 2013dk.'],
  ],

  sources: [
    ['Wikipedia — Antennae Galaxies', 'https://en.wikipedia.org/wiki/Antennae_Galaxies'],
    ['Википедия — Антенны (галактики)', 'https://ru.wikipedia.org/wiki/Антенны_(галактики)'],
  ],

  expeditions: expeditionsText('в Антеннах'),

  hotspots() {
    return [
      {
        id: 'n4038',
        kind: 'structure',
        title: 'NGC 4038',
        pos: N4038,
        anchor: 'nw',
        view: { radius: 45, phi: 20 * DEG },
        facts: [['Тип', 'спираль с перемычкой, сильно искажена']],
        body: ['Северная, более крупная галактика пары. Её рукава превратились в дугу из ярких скоплений молодых звёзд.'],
      },
      {
        id: 'n4039',
        kind: 'structure',
        title: 'NGC 4039',
        pos: N4039,
        anchor: 'se',
        view: { radius: 40, phi: 20 * DEG },
        facts: [['Тип', 'спираль, сильно искажена']],
        body: ['Южная галактика пары. Её ядро сольётся с ядром соседки примерно через 400 млн лет.'],
      },
      {
        id: 'overlap',
        kind: 'structure',
        title: 'Зона перекрытия',
        pos: OVERLAP,
        anchor: 'e',
        view: { radius: 22, phi: 25 * DEG },
        facts: [['Скопления', 'больше тысячи молодых']],
        body: [
          'Там, где диски налетели друг на друга, газ сжался и вспыхнуло звездообразование. Многие новые скопления настолько массивны, что через миллиарды лет станут шаровыми скоплениями.',
        ],
        band: 'infrared',
        bandHint: 'В инфракрасном здесь ярче всего',
      },
      {
        id: 'tail',
        kind: 'structure',
        title: 'Приливные хвосты',
        pos: onTail(TAIL_N, 0.55),
        anchor: 'w',
        view: { radius: 260, phi: 35 * DEG },
        facts: [['Возраст', '≈ 300 млн лет']],
        body: [
          'Звёзды и газ, вырванные из дисков приливными силами во время сближения. Из-за них система и получила имя «Антенны».',
          'Нажмите «Сбоку»: хвосты не лежат в одной плоскости, а изгибаются в пространстве.',
        ],
      },
      {
        id: 'dwarf',
        kind: 'structure',
        title: 'Приливная карликовая галактика',
        pos: DWARF,
        anchor: 'e',
        view: { radius: 45 },
        facts: [['Где', 'на конце южного хвоста']],
        body: ['На кончике хвоста собралось столько газа и звёзд, что там формируется новая маленькая галактика — дитя столкновения.'],
      },
    ];
  },
};
