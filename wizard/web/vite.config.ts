import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core'),
    },
  },
  publicDir: 'public',
});
