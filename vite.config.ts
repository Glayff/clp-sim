import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' é necessário para o Electron carregar dist/index.html via file://
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
