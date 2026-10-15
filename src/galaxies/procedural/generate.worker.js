import { generateFromRecipe } from './generate.js';

self.onmessage = (event) => {
  const { recipe, quality, textureSize } = event.data;
  const result = generateFromRecipe(recipe, { quality, textureSize });
  const transfer = [];
  for (const d of result.disks) {
    transfer.push(d.data.buffer);
    if (d.inner) transfer.push(d.inner.data.buffer);
  }
  for (const layer of Object.values(result.layers)) {
    for (const key of ['position', 'color', 'size', 'seed', 'normal']) if (layer[key]) transfer.push(layer[key].buffer);
  }
  self.postMessage(result, transfer);
};
