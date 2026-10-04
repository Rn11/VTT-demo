import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.VTT_SERVER ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: false },
      '/ws': { target: target.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
