import * as THREE from 'three';

// Если подпись не помещается у края экрана, она перескакивает на другую сторону точки.
const FLIP_TO_WEST = { e: 'w', ne: 'nw', se: 'sw' };
const FLIP_TO_EAST = { w: 'e', nw: 'ne', sw: 'se' };

// Подписи точек интереса: HTML поверх холста, позиции пересчитываются из 3D в каждом кадре.
export function createLabels(container, viewer, hotspots, { onSelect }) {
  const v = new THREE.Vector3();
  const visibleKinds = { structure: true, event: true };

  const items = hotspots.map((h) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `label label--${h.kind}`;
    el.dataset.anchor = h.anchor;
    el.setAttribute('aria-label', `${h.title}: показать`);
    const dot = document.createElement('span');
    dot.className = 'label__dot';
    const text = document.createElement('span');
    text.className = 'label__text';
    text.textContent = h.title;
    el.append(dot, text);
    el.addEventListener('click', () => onSelect(h.id));
    container.appendChild(el);
    return {
      h,
      el,
      text,
      pos: new THREE.Vector3(...h.pos),
      shown: true,
      collapsed: false,
      anchor: h.anchor,
      width: 0,
      height: 0,
    };
  });
  let activeId = null;
  // Ширину подписей меряем заново, когда догрузятся шрифты
  document.fonts?.ready.then(() => {
    items.forEach((it) => (it.width = 0));
    viewer.invalidate();
  });

  function anchorFor(it, x, w) {
    if (!it.width) {
      it.width = it.text.offsetWidth;
      it.height = it.text.offsetHeight;
    }
    const reach = it.width + 20;
    const base = it.h.anchor;
    if (base in FLIP_TO_WEST && x + reach > w - viewer.inset - 8) return FLIP_TO_WEST[base];
    if (base in FLIP_TO_EAST && x - reach < 8) return FLIP_TO_EAST[base];
    return base;
  }

  // Прямоугольник текста подписи на экране — чтобы подписи не налезали друг на друга.
  function textRect(it, x, y) {
    const east = it.anchor === 'e' || it.anchor === 'ne' || it.anchor === 'se';
    const left = east ? x + 16 : x - 16 - it.width;
    let top = y - 10;
    if (it.anchor[0] === 'n') top = y - 6 - it.height;
    else if (it.anchor[0] === 's') top = y + 6;
    return { l: left, t: top, r: left + it.width, b: top + it.height };
  }

  const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  function update() {
    const w = viewer.width;
    const ht = viewer.height;
    const placed = [];
    // Выбранная подпись важнее всех, строение важнее вспышек
    const ordered = activeId ? [...items].sort((a, b) => (b.h.id === activeId) - (a.h.id === activeId)) : items;
    for (const it of ordered) {
      v.copy(it.pos).project(viewer.camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const show =
        visibleKinds[it.h.kind] && v.z < 1 && sx > -20 && sx < w - viewer.inset + 4 && Math.abs(v.y) < 1.05;
      if (show !== it.shown) {
        it.el.classList.toggle('is-hidden', !show);
        it.el.tabIndex = show ? 0 : -1;
        it.shown = show;
      }
      if (show) {
        const x = sx;
        const y = (-v.y * 0.5 + 0.5) * ht;
        const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (transform !== it.transform) {
          it.el.style.transform = transform;
          it.transform = transform;
        }
        const anchor = anchorFor(it, x, w);
        if (anchor !== it.anchor) {
          it.anchor = anchor;
          it.el.dataset.anchor = anchor;
        }
        const rect = textRect(it, x, y);
        const collapsed = placed.some((p) => overlaps(p, rect));
        if (!collapsed) placed.push(rect);
        if (collapsed !== it.collapsed) {
          it.el.classList.toggle('is-collapsed', collapsed);
          it.collapsed = collapsed;
        }
      }
    }
  }

  return {
    update,
    setKindVisible(kind, on) {
      visibleKinds[kind] = on;
    },
    setActive(id) {
      activeId = id;
      for (const it of items) it.el.classList.toggle('is-active', it.h.id === id);
    },
  };
}
