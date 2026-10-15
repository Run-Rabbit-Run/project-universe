// Запуск конструктора в фоновом потоке; если поток недоступен — в основном.
export function loadRecipe(recipe, { quality, textureSize }) {
  const inPage = () =>
    import('./generate.js').then((m) => m.generateFromRecipe(recipe, { quality, textureSize }));
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./generate.worker.js', import.meta.url), { type: 'module' });
    } catch {
      resolve(inPage());
      return;
    }
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate();
      resolve(inPage());
    };
    worker.postMessage({ recipe, quality, textureSize });
  });
}
