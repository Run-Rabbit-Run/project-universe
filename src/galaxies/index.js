import andromeda from './andromeda/index.js';
import m64 from './m64/index.js';
import m51 from './m51/index.js';
import antennae from './antennae/index.js';
import medusa from './medusa/index.js';
import rose from './rose/index.js';
import hoag from './hoag/index.js';
import mpgcr3 from './mpgcr3/index.js';
import zfcosmos from './zfcosmos/index.js';

// Каталог галактик атласа. Новая галактика: модуль в своей папке + строка здесь.
const ALL = [andromeda, m64, m51, antennae, medusa, rose, hoag, mpgcr3, zfcosmos];

export const galaxies = Object.fromEntries(ALL.map((g) => [g.id, g]));
// В каталоге — от ближних к дальним
export const catalog = [...ALL].sort((a, b) => a.distance.ly - b.distance.ly);
export const defaultGalaxy = 'm51';
