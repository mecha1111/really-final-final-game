import { defineConfig } from 'vite';

export default defineConfig({
  root: 'game',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
