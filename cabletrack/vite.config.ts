import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built app run from any sub-path (GitHub Pages, Netlify, a USB stick via a local server).
export default defineConfig({
  base: './',
  plugins: [react()],
});
