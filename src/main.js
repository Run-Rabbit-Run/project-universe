import './style.css';
import * as THREE from 'three';
import { Viewer } from './engine/viewer.js';
import { buildGalaxyObjects } from './engine/galaxyObjects.js';
import { BANDS } from './engine/bands.js';
import { galaxies, defaultGalaxy } from './galaxies/index.js';
import { createLabels } from './ui/labels.js';
import { createFilterWheel } from './ui/filterWheel.js';
import { createDossier } from './ui/dossier.js';

const $ = (id) => document.getElementById(id);
const galaxy = galaxies[defaultGalaxy];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

$('catalog').textContent = `${galaxy.catalog} · ${galaxy.constellation}`;
$('galaxy-name').textContent = galaxy.name;
$('lede').textContent = galaxy.lede;
document.title = `${galaxy.name} · Атлас галактик`;

function fail(message) {
  const loader = $('loader');
  loader.classList.add('is-error');
  loader.querySelector('.loader__text').textContent = message;
}

async function main() {
  let viewer;
  try {
    viewer = new Viewer($('sky'));
  } catch (err) {
    fail('Браузер не запустил WebGL, без него 3D-модель не покажется. Включите аппаратное ускорение или откройте страницу в Chrome, Firefox или Safari.');
    throw err;
  }

  const small = Math.min(innerWidth, innerHeight) < 700;
  let data;
  try {
    data = await galaxy.load({ quality: small ? 0.55 : 1, textureSize: small ? 768 : 1024 });
  } catch (err) {
    fail('Не удалось собрать модель галактики. Обновите страницу.');
    throw err;
  }

  const { group } = buildGalaxyObjects(data, galaxy.scene, viewer.shared, viewer.renderer);
  viewer.add(group);

  const hotspots = galaxy.hotspots(data.features);
  const byId = Object.fromEntries(hotspots.map((h) => [h.id, h]));

  // ---------- Ракурсы ----------
  const viewsNav = $('views');
  const viewButtons = {};
  const presetView = (p) => ({
    target: new THREE.Vector3(...p.target),
    radius: p.radius ?? viewer.fitDistance(p.fit, p.fitX),
    phi: p.phi,
    theta: p.theta,
  });
  function setPressedView(id) {
    for (const [key, btn] of Object.entries(viewButtons)) btn.setAttribute('aria-pressed', String(key === id));
  }
  for (const [id, preset] of Object.entries(galaxy.views)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = preset.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      viewer.flyTo(presetView(preset), { duration: 2 });
      setPressedView(id);
      labels.setActive(null);
    });
    viewButtons[id] = btn;
    viewsNav.append(btn);
  }

  // ---------- Досье ----------
  const body = document.body;
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
    if (open) dossier.renderOverview();
    setDossier(open);
  });
  $('dossier-close').addEventListener('click', () => setDossier(false));

  function select(id) {
    const h = byId[id];
    if (!h) return;
    const cur = viewer.currentView();
    viewer.flyTo(
      {
        target: new THREE.Vector3(...h.pos),
        radius: h.view.radius,
        phi: h.view.phi ?? Math.min(cur.phi, 0.9),
        theta: cur.theta,
      },
      { duration: 1.9 },
    );
    labels.setActive(id);
    setPressedView(null);
    dossier.renderCard(h);
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
  const wheel = createFilterWheel($('wheel'), BANDS, {
    onChange(band) {
      viewer.setBand(band);
      showBand(band);
    },
  });
  wheel.select(0, { silent: true });
  showBand(BANDS[0]);

  const dossier = createDossier($('dossier-body'), galaxy, hotspots, BANDS, {
    onSelect: select,
    onBand: (id) => wheel.selectById(id),
  });

  // ---------- Подписи ----------
  const labels = createLabels($('labels'), viewer, hotspots, { onSelect: select });
  const bindToggle = (id, fn) => {
    const btn = $(id);
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      fn(on);
    });
  };
  bindToggle('toggle-structure', (on) => labels.setKindVisible('structure', on));
  bindToggle('toggle-events', (on) => labels.setKindVisible('event', on));
  bindToggle('toggle-rotate', (on) => (viewer.controls.autoRotate = on));

  // ---------- Масштаб и показания ----------
  const scaleBar = $('scale-bar');
  const scaleLabel = $('scale-label');
  const readout = $('readout');
  const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  let lastScale = '';
  const fmtLy = (kly) =>
    kly >= 1 ? `${(kly * 1000).toLocaleString('ru-RU')} св. лет` : `${Math.round(kly * 1000)} св. лет`;
  const offset = new THREE.Vector3();

  viewer.onFrame(() => {
    labels.update();
    offset.copy(viewer.camera.position).sub(viewer.controls.target);
    const dist = offset.length();
    const pxPerKly = viewer.height / 2 / (Math.tan(THREE.MathUtils.degToRad(viewer.camera.fov) / 2) * dist);
    const L = NICE.find((n) => n * pxPerKly >= 70) ?? NICE[NICE.length - 1];
    const incl = Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(offset.y) / dist))));
    const key = `${L}|${Math.round(L * pxPerKly)}|${Math.round(dist)}|${incl}`;
    if (key !== lastScale) {
      lastScale = key;
      scaleBar.style.width = `${Math.round(L * pxPerKly)}px`;
      scaleLabel.textContent = fmtLy(L);
      readout.textContent = `Камера ${Math.round(dist).toLocaleString('ru-RU')} тыс. св. лет · наклон ${incl}°`;
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

  // ---------- Клавиатура ----------
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.classList.contains('dossier-open')) {
      setDossier(false);
      labels.setActive(null);
      toggleBtn.focus();
    }
  });

  // ---------- Старт ----------
  const earth = presetView(galaxy.views.earth);
  viewer.setView({ target: earth.target.clone(), radius: 700, phi: 1.05, theta: -0.9 });
  viewer.start();
  $('loader').classList.add('is-done');
  body.classList.add('is-ready');
  setPressedView('earth');
  viewer.flyTo(earth, { duration: reducedMotion ? 0 : 4.5 });

  // Только для разработки: доступ к сцене из консоли браузера
  if (import.meta.env.DEV) window.__atlas = { viewer };

}

main();
