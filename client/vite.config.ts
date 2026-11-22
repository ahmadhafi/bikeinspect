import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isStandalone = process.env.VITE_OFFLINE_STANDALONE === 'true';

export default defineConfig({
  base: isStandalone ? './' : process.env.VITE_BASE_PATH || '/',
  plugins: isStandalone ? [react(), viteSingleFile()] : [react()],
  build: isStandalone
    ? {
        outDir: 'dist-standalone',
        assetsInlineLimit: 100000000,
        cssCodeSplit: false,
      }
    : undefined,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
