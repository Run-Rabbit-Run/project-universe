import { generateM51 } from './generate.js';

self.onmessage = (event) => {
  const result = generateM51(event.data);
  const transfer = [result.disk.data.buffer, result.disk.inner.data.buffer];
  for (const layer of Object.values(result.layers)) {
    transfer.push(layer.position.buffer, layer.color.buffer, layer.size.buffer, layer.seed.buffer);
  }
  self.postMessage(result, transfer);
};
