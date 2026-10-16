import './style.css';
import * as THREE from 'three';
import { Viewer } from './engine/viewer.js';
import { buildGalaxyObjects } from './engine/galaxyObjects.js';
import { bandsFor } from './engine/bands.js';
import { galaxies, catalog, defaultGalaxy } from './galaxies/index.js';
import { createLabels } from './ui/labels.js';
import { createFilterWheel } from './ui/filterWheel.js';
import { createDossier } from './ui/dossier.js';
import { createCatalog } from './ui/catalog.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(innerWidth, innerHeight) < 700;
const QUALITY = { quality: small ? 0.55 : 1, textureSize: small ? 768 : 1024 };

const loader = $('loader');
function showLoader(text) {
  loader.classList.remove('is-done', 'is-error');
  loader.querySelector('.loader__text').textContent = text;
}
function fail(message) {
  loader.classList.remove('is-done');
  loader.classList.add('is-error');
  loader.querySelector('.loader__text').textContent = message;
}

let viewer;
try {
  viewer = new Viewer($('sky'));
} catch (err) {
  fail('Браузер не запустил WebGL, без него 3D-модель не покажется. Включите аппаратное ускорение или откройте страницу в Chrome, Firefox или Safari.');
  throw err;
}

// Всё, что относится к открытой галактике
const app = {
  galaxy: null,
  objects: null,
  hotspots: [],
  byId: {},
  labels: null,
  dossier: null,
  wheel: null,
  bands: [],
  bandId: 'visible',
  loadToken: 0,
  pending: null,
};

// ---------- Ракурсы ----------
const viewsNav = $('views');
let viewButtons = {};
const presetView = (p) => ({
  target: new THREE.Vector3(...p.target),
  radius: p.radius ?? viewer.fitDistance(p.fit, p.fitX),
  phi: p.phi,
  theta: p.theta,
});
function setPressedView(id) {
  for (const [key, btn] of Object.entries(viewButtons)) btn.setAttribute('aria-pressed', String(key === id));
}
function buildViews(galaxy) {
  viewsNav.replaceChildren();
  viewButtons = {};
  for (const [id, preset] of Object.entries(galaxy.views)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = preset.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      viewer.flyTo(presetView(preset), { duration: 2 });
      setPressedView(id);
      app.labels?.setActive(null);
    });
    viewButtons[id] = btn;
    viewsNav.append(btn);
  }
}

// ---------- Досье ----------
const dossierEl = $('dossier');
const toggleBtn = $('dossier-toggle');
function setDossier(open) {
  body.classList.toggle('dossier-open', open);
  toggleBtn.setAttribute('aria-expanded', String(open));
  dossierEl.setAttribute('aria-hidden', String(!open));
  dossierEl.inert = !open;
  const sideBySide = matchMedia('(min-width: 761px)').matches;
  viewer.setRightInset(open && sideBySide ? dossierEl.offsetWidth : 0);
}
setDossier(false);
toggleBtn.addEventListener('click', () => {
  const open = !body.classList.contains('dossier-open');
  if (open) app.dossier?.renderOverview();
  setDossier(open);
});
$('dossier-close').addEventListener('click', () => setDossier(false));

function select(id) {
  const h = app.byId[id];
  if (!h) return;
  const cur = viewer.currentView();
  viewer.flyTo(
    {
      target: new THREE.Vector3(...h.pos),
      radius: h.view.radius,
      phi: h.view.phi ?? Math.min(cur.phi, 0.9),
      theta: h.view.theta ?? cur.theta,
    },
    { duration: 1.9 },
  );
  app.labels.setActive(id);
  setPressedView(null);
  app.dossier.renderCard(h);
  setDossier(true);
}

// ---------- Фильтры ----------
function showBand(band) {
  body.dataset.band = band.id;
  $('band-range').textContent = `Диапазон · ${band.range}`;
  $('band-title').textContent = band.title;
  $('band-instrument').textContent = band.instrument;
  $('band-text').textContent = band.text;
}
function buildWheel(galaxy) {
  app.bands = bandsFor(galaxy);
  $('wheel').replaceChildren();
  app.wheel = createFilterWheel($('wheel'), app.bands, {
    onChange(band) {
      app.bandId = band.id;
      viewer.setBand(band);
      showBand(band);
    },
  });
  // Если у новой галактики есть тот же фильтр — остаёмся в нём
  let index = app.bands.findIndex((b) => b.id === app.bandId);
  if (index < 0) index = 0;
  const band = app.bands[index];
  app.bandId = band.id;
  app.wheel.select(index, { silent: true });
  viewer.setBand(band, { instant: true });
  showBand(band);
}

// ---------- Подписи ----------
const labelVisibility = { structure: true, event: true };
const bindToggle = (id, fn) => {
  const btn = $(id);
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    fn(on);
  });
};
bindToggle('toggle-structure', (on) => {
  labelVisibility.structure = on;
  app.labels?.setKindVisible('structure', on);
  viewer.invalidate();
});
bindToggle('toggle-events', (on) => {
  labelVisibility.event = on;
  app.labels?.setKindVisible('event', on);
  viewer.invalidate();
});
bindToggle('toggle-rotate', (on) => (viewer.controls.autoRotate = on));

// ---------- Масштаб и показания ----------
const scaleBar = $('scale-bar');
const scaleLabel = $('scale-label');
const readout = $('readout');
const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
let lastScale = '';
const fmtLy = (kly) => `${Math.round(kly * 1000).toLocaleString('ru-RU')} св. лет`;
const fmtDist = (kly) =>
  kly < 10 ? kly.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : Math.round(kly).toLocaleString('ru-RU');
const offset = new THREE.Vector3();

viewer.onFrame(() => {
  app.objects?.updateVisibility(viewer.shared.uBand.value);
  app.labels?.update();
  offset.copy(viewer.camera.position).sub(viewer.controls.target);
  const dist = offset.length();
  const pxPerKly = viewer.height / 2 / (Math.tan(THREE.MathUtils.degToRad(viewer.camera.fov) / 2) * dist);
  const L = NICE.find((n) => n * pxPerKly >= 70) ?? NICE[NICE.length - 1];
  const incl = Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(offset.y) / dist))));
  const key = `${L}|${Math.round(L * pxPerKly)}|${fmtDist(dist)}|${incl}`;
  if (key !== lastScale) {
    lastScale = key;
    scaleBar.style.width = `${Math.round(L * pxPerKly)}px`;
    scaleLabel.textContent = fmtLy(L);
    readout.textContent = `Камера ${fmtDist(dist)} тыс. св. лет · наклон ${incl}°`;
  }
});

// ---------- Подсказка ----------
const hint = $('hint');
hint.textContent = coarse
  ? 'Один палец — вращать · два — приблизить'
  : 'Тяните — вращать · колесо — приблизить · правая кнопка — сдвинуть';
viewer.onUserInteract = () => {
  setPressedView(null);
  hint.classList.add('is-gone');
};

// ---------- Заголовок ----------
function showMasthead(galaxy) {
  $('catalog-line').textContent = `${galaxy.catalog} · ${galaxy.constellation}`;
  const title = $('galaxy-name');
  title.textContent = galaxy.name;
  // Длинные названия (ZF-COSMOS-20115) набираются мельче, чтобы не вылезать за экран
  const len = galaxy.name.length;
  title.style.setProperty('--fit', String(len <= 9 ? 136 : Math.round(1000 / len)));
  $('lede').textContent = galaxy.lede;
  document.title = `${galaxy.name} · Атлас галактик`;
}

// ---------- Каталог ----------
const catalogUi = createCatalog($('catalog-panel'), $('catalog-toggle'), catalog, {
  onPick: (id) => openGalaxy(id),
});

// ---------- Загрузка галактики ----------
async function openGalaxy(id, { first = false } = {}) {
  const galaxy = galaxies[id] ?? galaxies[defaultGalaxy];
  if (!first && galaxy === app.galaxy) {
    // Вернулись к открытой галактике (например, кнопкой «Назад») — недогруженную отменяем
    if (app.pending) {
      app.loadToken++;
      app.pending = null;
      loader.classList.add('is-done');
      if (location.hash.slice(1) !== galaxy.id) history.replaceState(null, '', `#${galaxy.id}`);
    }
    return;
  }
  if (app.pending === galaxy.id) return;
  const token = ++app.loadToken;
  app.pending = galaxy.id;
  catalogUi.close();
  setDossier(false);
  showLoader(galaxy.loading ?? `Собираем галактику ${galaxy.name}`);

  let data;
  try {
    data = await galaxy.load(QUALITY);
  } catch (err) {
    fail('Не удалось собрать модель галактики. Обновите страницу.');
    throw err;
  }
  // Пока считали, пользователь мог выбрать другую галактику или вернуться к прежней
  if (token !== app.loadToken) return;
  app.pending = null;

  const prev = app.objects;
  app.objects = buildGalaxyObjects(data, galaxy.scene, viewer.shared, viewer.renderer);
  viewer.add(app.objects.group);
  if (prev) {
    viewer.scene.remove(prev.group);
    // Новые материалы получают шейдерные программы, пока старые их ещё держат, — без перекомпиляции
    viewer.renderer.compile(viewer.scene, viewer.camera);
    prev.dispose();
  }
  app.galaxy = galaxy;

  app.hotspots = galaxy.hotspots(data.features);
  app.byId = Object.fromEntries(app.hotspots.map((h) => [h.id, h]));
  $('labels').replaceChildren();
  app.labels = createLabels($('labels'), viewer, app.hotspots, { onSelect: select });
  app.labels.setKindVisible('structure', labelVisibility.structure);
  app.labels.setKindVisible('event', labelVisibility.event);

  showMasthead(galaxy);
  buildViews(galaxy);
  buildWheel(galaxy);
  app.dossier = createDossier($('dossier-body'), galaxy, app.hotspots, app.bands, {
    onSelect: select,
    onBand: (bandId) => app.wheel.selectById(bandId),
  });
  catalogUi.setCurrent(galaxy.id);
  if (location.hash.slice(1) !== galaxy.id) history.replaceState(null, '', `#${galaxy.id}`);

  // Подлёт издалека к виду с Земли
  const earth = presetView(galaxy.views.earth);
  viewer.setDistanceLimits(0, Infinity);
  viewer.setView({ target: earth.target.clone(), radius: earth.radius * 6, phi: earth.phi + 0.6, theta: earth.theta - 0.9 });
  setPressedView('earth');
  viewer.flyTo(earth, { duration: reducedMotion ? 0 : first ? 4.5 : 3.2 });
  // Пределы зума — по ракурсам самой галактики, чтобы ни один ракурс не «отскакивал» после перелёта
  const radii = [
    ...Object.values(galaxy.views).map((p) => presetView(p).radius),
    ...app.hotspots.map((h) => h.view.radius),
  ];
  viewer.setDistanceLimits(Math.min(...radii) * 0.25, Math.max(...radii, earth.radius * 4) * 1.3);
  loader.classList.add('is-done');
  body.classList.add('is-ready');
}

// ---------- Клавиатура ----------
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (catalogUi.isOpen()) {
    catalogUi.close();
    $('catalog-toggle').focus();
  } else if (body.classList.contains('dossier-open')) {
    setDossier(false);
    app.labels?.setActive(null);
    toggleBtn.focus();
  }
});

addEventListener('hashchange', () => openGalaxy(location.hash.slice(1)));

viewer.start();
openGalaxy(location.hash.slice(1) || defaultGalaxy, { first: true });

// Только для разработки: доступ к сцене из консоли браузера
if (import.meta.env.DEV) window.__atlas = { viewer, app, openGalaxy };
