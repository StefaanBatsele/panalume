import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base so the app works behind HA ingress at any path.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  // safari15: wall tablets often run an iPad stuck on iOS 15 (e.g. iPad Air 2).
  build: { target: ['es2022', 'safari15'], cssCodeSplit: false },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8099', ws: true },
      '/ha': 'http://localhost:8099',
    },
  },
});
