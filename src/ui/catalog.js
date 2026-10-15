// Каталог галактик атласа: список по удалённости от Земли.
// Полоска под названием — расстояние в логарифмическом масштабе: от миллионов до миллиардов световых лет.

const LOG_MIN = 6; // 1 млн св. лет
const LOG_MAX = 10.2; // ≈ 16 млрд св. лет

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createCatalog(panel, toggle, entries, { onPick }) {
  const list = panel.querySelector('.catalog__list');
  const items = new Map();

  for (const g of entries) {
    const li = el('li');
    const btn = el('button', 'catalog__item');
    btn.type = 'button';
    const depth = (Math.log10(g.distance.ly) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    btn.style.setProperty('--depth', Math.min(1, Math.max(0.02, depth)).toFixed(3));
    btn.append(
      el('span', 'catalog__name', g.name),
      el('span', 'catalog__id', g.catalog),
      el('span', 'catalog__dist', g.distance.label),
      el('span', 'catalog__ruler'),
    );
    btn.addEventListener('click', () => onPick(g.id));
    li.append(btn);
    list.append(li);
    items.set(g.id, btn);
  }

  function setOpen(open) {
    document.body.classList.toggle('catalog-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    if (open) (list.querySelector('[aria-current="true"]') ?? list.querySelector('button'))?.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('catalog-open')));
  panel.querySelector('.catalog__close').addEventListener('click', () => setOpen(false));
  setOpen(false);

  return {
    close: () => setOpen(false),
    isOpen: () => document.body.classList.contains('catalog-open'),
    setCurrent(id) {
      for (const [key, btn] of items) btn.setAttribute('aria-current', String(key === id));
    },
  };
}
