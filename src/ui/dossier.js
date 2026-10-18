// Досье: паспорт галактики, планеты, строение, вспышки, хроника — и карточка выбранного объекта.

import { showPlanet, planetThumbnail } from '../engine/planetView.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function factList(rows) {
  const dl = el('dl', 'facts');
  for (const [k, v] of rows) {
    dl.append(el('dt', null, k), el('dd', null, v));
  }
  return dl;
}

function section(title) {
  const sec = el('section', 'sec');
  sec.append(el('h2', 'sec__title', title));
  return sec;
}

export function createDossier(root, galaxy, hotspots, bands, { onSelect, onBand }) {
  const kindLabel = { structure: 'Строение', event: 'Вспышка или источник', planet: 'Планета' };

  function objectList(kind, thumbs) {
    const ul = el('ul', 'objects');
    for (const h of hotspots.filter((x) => x.kind === kind)) {
      const li = el('li');
      const btn = el('button', 'objects__item');
      btn.type = 'button';
      const name = el('span', 'objects__name', h.title);
      const sub = el('span', 'objects__sub', h.facts?.[0]?.[1] ?? '');
      const go = el('span', 'objects__go', 'Показать');
      btn.append(name, sub, go);
      const thumb = thumbs && h.look && planetThumbnail(h.look);
      if (thumb) {
        const img = el('img', 'objects__thumb');
        img.src = thumb;
        img.alt = '';
        btn.classList.add('objects__item--thumb');
        btn.prepend(img);
      }
      btn.addEventListener('click', () => onSelect(h.id));
      li.append(btn);
      ul.append(li);
    }
    return ul;
  }

  // Миниатюры планет рисует отдельный WebGL-холст — заводим его, только когда досье открывают
  function renderOverview({ thumbs = true } = {}) {
    root.replaceChildren();

    const passport = section('Паспорт');
    passport.append(factList(galaxy.passport));

    const planets = section('Планеты');
    planets.append(objectList('planet', thumbs));

    const structure = section('Строение');
    structure.append(objectList('structure'));

    const events = section('Вспышки и источники');
    events.append(objectList('event'));

    const chronicle = section('Хроника');
    const ol = el('ol', 'timeline');
    for (const [year, text] of galaxy.timeline) {
      const li = el('li');
      li.append(el('span', 'timeline__year', year), el('p', 'timeline__text', text));
      ol.append(li);
    }
    chronicle.append(ol);

    const expeditions = section('Экспедиции');
    const signal = el('p', 'signal');
    signal.append(el('span', 'signal__dot'), el('span', null, 'Сигнала нет'));
    expeditions.append(signal, el('p', 'sec__note', galaxy.expeditions));

    root.append(passport, planets, structure, events, chronicle, expeditions);
  }

  function renderCard(h) {
    root.replaceChildren();
    const card = el('article', 'card');

    const back = el('button', 'card__back', '← Всё досье');
    back.type = 'button';
    back.addEventListener('click', () => {
      renderOverview();
      root.scrollTop = 0;
    });

    card.append(back, el('p', 'eyebrow card__kicker', kindLabel[h.kind]), el('h2', 'card__title', h.title));
    let portrait = null;
    if (h.look) {
      portrait = el('figure', 'planet-view');
      portrait.append(el('figcaption', 'planet-view__note', 'Облик — художественный образ'));
      card.append(portrait);
    }
    // Вымышленные планеты помечены, чтобы их не спутали с настоящими находками
    const facts = h.kind === 'planet' ? [...h.facts, ['Статус', h.status ?? 'придумана для атласа']] : h.facts;
    if (facts?.length) card.append(factList(facts));
    for (const p of h.body) card.append(el('p', 'card__text', p));

    const band = bands.find((b) => b.id === h.band);
    if (band && h.bandHint) {
      const btn = el('button', 'band-hint');
      btn.type = 'button';
      const glass = el('span', 'band-hint__glass');
      glass.style.setProperty('--glass', band.glass);
      const text = el('span', 'band-hint__text');
      text.append(el('span', 'band-hint__action', `Включить фильтр «${band.short}»`), el('span', 'band-hint__why', h.bandHint));
      btn.append(glass, text);
      btn.addEventListener('click', () => onBand(band.id));
      card.append(btn);
    }
    root.append(card);
    root.scrollTop = 0;
    if (portrait && !showPlanet(portrait, h.look)) portrait.remove();
  }

  renderOverview({ thumbs: false });
  return { renderOverview, renderCard };
}
