import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути: собранный сайт работает из любой папки на хостинге
  base: './',
  build: {
    // three.js сам по себе весит около 600 КБ — это ожидаемо
    chunkSizeWarningLimit: 900,
  },
});
