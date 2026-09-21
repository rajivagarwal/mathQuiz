import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves a project site from /<repo>/, and WebAuthn needs the
// HTTPS origin that Pages provides. Change this if the repo is renamed.
const BASE = '/mathQuiz/';

export default defineConfig({
  base: BASE,

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Math Flash',
        short_name: 'Math Flash',
        description: 'A memory game for times tables, addition and subtraction.',
        // Relative to the manifest, so these follow the base path automatically.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1d3417',
        theme_color: '#1d3417',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole shell, fonts included, so the app works offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
    }),
  ],

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
