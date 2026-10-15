// Галактика-медуза ESO 137-001: летит сквозь горячий газ скопления Нормы,
// и встречный поток сдувает с неё газ — за диском тянутся «щупальца» и хвост длиной 260 тыс. св. лет.

import { loadRecipe } from '../procedural/load.js';
import { skyFrame } from '../../lib/frame.js';
import { mulberry32 } from '../../lib/random.js';
import { DEG, coreGlow, expeditionsText, onBodyPolar, onTail } from '../procedural/helpers.js';

const PHI = 42 * DEG;
const sky = skyFrame(PHI, 0);
// Направление хвоста на небе: вправо-вниз и немного от нас
const DIR = [0.86, -0.5];
const along = (dist, side = 0, depth = 0) => sky.at(DIR[0] * dist - DIR[1] * side, DIR[1] * dist + DIR[0] * side, depth - dist * 0.25);

const DISK = {
  kind: 'disk',
  id: 'eso',
  radius: 20,
  scale: 4,
  thick: 0.3,
  extent: 25,
  inner: 7,
  arms: { n: 2, pitch: 16, wind: -1, phase: 0.8, r0: 2, r1: 19, strength: 0.9, floc: 0.25 },
  bar: { length: 4, width: 1.4, angle: 30, strength: 0.6 },
  // Газ остался только во внутреннем диске: окраины уже «сдуты»
  strip: { r: 9, soft: 3 },
  young: 1.0,
  hii: 1.2,
  dust: { lanes: 1.0, spurs: 0.4, floc: 0.6, nuclear: 0.6, nuclearR: 4 },
  dustStrength: 2.2,
  bulge: { scale: 0.3, max: 5, count: 12000 },
  xray: { hmxb: 60, lmxb: 30, ulx: 1, nucleus: 0.8, gas: 150 },
};

// «Щупальца»: потоки молодых звёзд и сорванной пыли, стекающие с диска
const rand = mulberry32(137);
const TENTACLES = Array.from({ length: 6 }, (_, i) => {
  const side = -11 + i * 4.4 + (rand() - 0.5) * 2;
  const len = 34 + rand() * 30;
  const bend = (rand() - 0.5) * 10;
  return [along(3, side * 0.85, 1), along(len * 0.35, side + bend * 0.3), along(len * 0.7, side + bend * 0.8), along(len, side + bend)];
});

const HA_TAIL = [along(4, 0, 0), along(60, 2), along(140, 6), along(260, 12)];
const X_TAIL = [along(4, -1, 0), along(70, -3), along(160, -2), along(260, 2)];
const X_TAIL_2 = [along(10, 5, 0), along(80, 12), along(170, 22), along(250, 34)];

const RECIPE = {
  seed: 137,
  bodies: [
    DISK,
    ...TENTACLES.map((points, i) => ({
      kind: 'tail',
      id: `tentacle-${i}`,
      points,
      width: [0.8, 3],
      falloff: 0.8,
      brightness: 1,
      counts: { young: 1600, clusters: 150, hii: 70, dust: 220, haze: 60 },
      hazeSize: 2.5,
      hazeB: 0.02,
      hazeColor: [0.6, 0.72, 1.0],
      dustSize: 0.7,
    })),
    {
      kind: 'tail',
      id: 'ha-tail',
      points: HA_TAIL,
      width: [4, 18],
      falloff: 0.5,
      counts: { hagas: 3200, hii: 220 },
      hagasSize: 7,
      hagasB: 0.03,
      hiiSize: 0.8,
    },
    { kind: 'tail', id: 'x-tail', points: X_TAIL, width: [3, 14], falloff: 0.4, counts: { xgas: 2600 }, xgasSize: 8, xgasB: 0.05 },
    { kind: 'tail', id: 'x-tail-2', points: X_TAIL_2, width: [3, 12], falloff: 0.6, counts: { xgas: 1500 }, xgasSize: 8, xgasB: 0.035 },
  ],
};

export default {
  id: 'medusa',
  catalog: 'ESO 137-001',
  name: 'Медуза',
  constellation: 'Южный Треугольник',
  distance: { ly: 220e6, label: '≈ 220 млн св. лет' },
  loading: 'Собираем галактику-медузу',
  lede: 'Галактика летит сквозь раскалённый газ скопления, и встречный поток срывает с неё газ — за ней тянутся щупальца.',
  bandNotes: {
    visible: 'Голубые «щупальца» — молодые звёзды, родившиеся прямо в сорванном газе. Бурые нити — сдутая пыль.',
    halpha: 'Хвост светящегося водорода тянется далеко за диск, а в нём рождаются звёзды.',
    xray: 'Двойной хвост раскалённого газа длиной ≈ 260 000 св. лет — в пару раз длиннее самой галактики. Отдалитесь, чтобы увидеть его целиком.',
  },

  load: (opts) => loadRecipe(RECIPE, opts),

  scene: {
    occluder: { center: [0, 0, 0], radius: 3 },
    billboards: [coreGlow([0, 0, 0], 6, { core: 0.06, halo: 0.28, intensity: 0.6 })],
  },

  views: {
    earth: { label: 'Вид с Земли', target: along(18), fit: 32, fitX: 58, phi: PHI, theta: 0 },
    top: { label: 'На диск', target: [0, 0, 0], fit: 24, fitX: 24, phi: 0.001, theta: 0 },
    tail: { label: 'Хвост целиком', target: along(120), radius: 560, phi: PHI, theta: 0 },
    side: { label: 'Сбоку', target: along(60), radius: 260, phi: 82 * DEG, theta: 70 * DEG },
  },

  passport: [
    ['Обозначение', 'ESO 137-001'],
    ['Тип', 'SBc — спираль с перемычкой'],
    ['Созвездие', 'Южный Треугольник'],
    ['Скопление', 'Норма (Abell 3627), у Великого аттрактора'],
    ['Расстояние', '≈ 220 млн св. лет'],
    ['Скорость в скоплении', '≈ 1900 км/с'],
    ['Хвост', '≈ 260 000 св. лет в рентгене'],
    ['Газ вокруг', 'около 100 млн градусов'],
  ],

  timeline: [
    ['2005', 'Мин Сунь с коллегами замечает за галактикой длинный хвост горячего газа.'],
    ['2010', '«Чандра» показывает, что хвостов два.'],
    ['2014', '«Хаббл» публикует снимок голубых «щупалец» и сорванной пыли.'],
    ['Дальше', 'Галактика лишится почти всего холодного газа, перестанет рождать звёзды и потеряет спиральный узор.'],
  ],

  sources: [
    ['Wikipedia — ESO 137-001', 'https://en.wikipedia.org/wiki/ESO_137-001'],
    ['ESA/Hubble — heic1404', 'https://esahubble.org/news/heic1404/'],
    ['Википедия — Галактика-медуза', 'https://ru.wikipedia.org/wiki/Галактика-медуза'],
  ],

  expeditions: expeditionsText('в Медузе'),

  hotspots() {
    return [
      {
        id: 'disk',
        kind: 'structure',
        title: 'Диск',
        pos: [0, 0, 0],
        anchor: 'nw',
        view: { radius: 26, phi: 30 * DEG },
        facts: [['Газа в диске', 'лишь около 10% от всего']],
        body: [
          'Обычная с виду спиральная галактика, но с окраин газ уже сорван: новые звёзды рождаются только в центральной части диска.',
        ],
      },
      {
        id: 'front',
        kind: 'structure',
        title: 'Набегающий край',
        pos: onBodyPolar(DISK, 10, 150),
        anchor: 'w',
        view: { radius: 22, phi: 35 * DEG },
        facts: [['Что происходит', 'давление встречного газа']],
        body: [
          'Галактика летит сквозь газ скопления со скоростью около 1900 км/с. Это похоже на ветер в лицо: он прижимает газ к переднему краю диска и сдувает его назад. Астрономы называют это лобовым давлением.',
        ],
      },
      {
        id: 'tentacles',
        kind: 'structure',
        title: 'Щупальца',
        pos: onTail(TENTACLES[3], 0.6),
        anchor: 'se',
        view: { radius: 45, phi: 40 * DEG },
        facts: [['Из чего', 'молодые звёзды и пыль']],
        body: [
          'Голубые полосы — скопления молодых звёзд. Они родились уже в хвосте, из сорванного газа, и теперь улетают от своей галактики навсегда.',
        ],
      },
      {
        id: 'ha',
        kind: 'structure',
        title: 'Хвост водорода',
        pos: onTail(HA_TAIL, 0.45),
        anchor: 'ne',
        view: { radius: 220, phi: PHI },
        facts: [['Видно', 'в линии Hα']],
        body: ['Светящийся водород тянется далеко за щупальцами. В нём тоже вспыхивают новые звёзды, хотя вокруг — газ в сотни миллионов градусов.'],
        band: 'halpha',
        bandHint: 'Хвост виден в фильтре Hα',
      },
      {
        id: 'xtail',
        kind: 'structure',
        title: 'Рентгеновский хвост',
        pos: onTail(X_TAIL, 0.75),
        anchor: 'e',
        view: { radius: 380, phi: PHI },
        facts: [['Длина', '≈ 260 000 св. лет']],
        body: ['Раскалённый сорванный газ. «Чандра» увидел два хвоста, вытянутых вдоль пути галактики через скопление.'],
        band: 'xray',
        bandHint: 'Хвост виден только в рентгене',
      },
    ];
  },
};
