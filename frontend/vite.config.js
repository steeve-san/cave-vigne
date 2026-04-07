import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  // Expose REACT_APP_* env vars as import.meta.env.REACT_APP_*
  envPrefix: 'REACT_APP_',
  build: {
    outDir: 'build',
    sourcemap: false,
  },
});
