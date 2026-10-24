import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // shown in Settings; CI passes the build number
  define: { __APP_VERSION__: JSON.stringify(`1.0.${process.env.GITHUB_RUN_NUMBER || 'dev'}`) },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
