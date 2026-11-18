import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page: uma pagina para o cliente e outra para o dashboard.
export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cliente: resolve(import.meta.dirname, 'web/cliente/index.html'),
        dashboard: resolve(import.meta.dirname, 'web/dashboard/index.html'),
      },
    },
  },
  test: { root: '.', include: ['src/**/*.test.ts'], environment: 'node', globals: true },
});
