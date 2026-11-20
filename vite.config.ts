import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Pages liefert unter /abc-werkstatt/ aus; `npm run preview -- --port 4173` passt zu playwright.config.ts.
export default defineConfig({
  base: '/abc-werkstatt/',
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // Registrierung in src/main.ts über virtual:pwa-register
      includeAssets: ['fonts/*.woff2', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'ABC-Werkstatt',
        short_name: 'ABC-Werkstatt',
        description: 'Laute hören, Buchstaben legen, Wörter schreiben – ruhig und nach Montessori.',
        lang: 'de',
        dir: 'ltr',
        start_url: '/abc-werkstatt/',
        scope: '/abc-werkstatt/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#fbf7f0',
        background_color: '#fbf7f0',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Alles offline: App, Schrift, Icons und der vorab vertonte Audio-Bestand
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,json,mp3}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
