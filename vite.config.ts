import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces a normal multi-file site in dist/ (GitHub Pages).
// `npm run build:single` produces one self-contained HTML file in dist-single/
// that can be opened straight from disk or hosted anywhere.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    worker: { format: 'es' },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 4000,
      assetsInlineLimit: single ? 100000000 : 4096,
    },
  };
});
