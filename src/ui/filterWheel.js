// Колесо светофильтров, как у телескопа: выбранный фильтр поворачивается к метке сверху.
export function createFilterWheel(root, bands, { onChange }) {
  const step = 360 / bands.length;
  let current = -1;
  let rot = 0;

  const disc = document.createElement('div');
  disc.className = 'wheel__disc';

  const buttons = bands.map((band, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wheel__filter';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', band.title);
    btn.style.setProperty('--a', `${i * step}deg`);
    btn.style.setProperty('--glass', band.glass);
    btn.tabIndex = -1;
    const glass = document.createElement('span');
    glass.className = 'wheel__glass';
    const name = document.createElement('span');
    name.className = 'wheel__name';
    name.textContent = band.short;
    btn.append(glass, name);
    btn.addEventListener('click', () => select(i, { focus: true }));
    btn.addEventListener('keydown', onKey);
    disc.appendChild(btn);
    return btn;
  });

  const index = document.createElement('div');
  index.className = 'wheel__index';
  index.setAttribute('aria-hidden', 'true');
  const hub = document.createElement('div');
  hub.className = 'wheel__hub';
  hub.setAttribute('aria-hidden', 'true');
  root.append(disc, index, hub);

  function select(i, { focus = false, silent = false } = {}) {
    if (i === current) return;
    let delta = -i * step - rot;
    delta = ((((delta + 180) % 360) + 360) % 360) - 180;
    rot += delta;
    root.style.setProperty('--rot', `${rot}deg`);
    buttons.forEach((b, j) => {
      b.setAttribute('aria-checked', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    hub.style.setProperty('--glass', bands[i].glass);
    current = i;
    if (focus) buttons[i].focus({ preventScroll: true });
    if (!silent) onChange(bands[i], i);
  }

  function onKey(e) {
    const n = bands.length;
    const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in map) {
      e.preventDefault();
      select((current + map[e.key] + n) % n, { focus: true });
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(0, { focus: true });
    } else if (e.key === 'End') {
      e.preventDefault();
      select(n - 1, { focus: true });
    }
  }

  return {
    select,
    selectById(id, opts) {
      const i = bands.findIndex((b) => b.id === id);
      if (i >= 0) select(i, opts);
    },
  };
}
