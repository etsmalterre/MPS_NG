import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // `png` is intentionally NOT in workbox.globPatterns below (so the 4.92 MB
      // tricobot mascot isn't globbed into the precache and fails the build), so
      // the real shell pngs we DO want offline are precached explicitly here.
      // includeAssets are globbed from publicDir and injected as manifest
      // entries, bypassing the precache-size check — safe because all of these
      // are small (logos < 15 KB, icons < 150 KB).
      includeAssets: ['favicon.ico', 'icons/*.png', 'logo-full.png', 'logo-small.png'],
      manifest: {
        name: 'MPS - ETS Malterre',
        short_name: 'MPS',
        description: 'Système ERP pour ETS Malterre - Textile/Tricotage',
        theme_color: '#00243E',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // `png` is deliberately omitted here. The Tricobot reception-modal
        // mascot (public/tricobot/tricobot-wave.png, ~5 MB) is loaded only
        // inside the ennoblisseur reception dialog and must NOT land in the
        // offline precache. With `png` in this glob it gets precached and the
        // build fails ("Assets exceeding the limit" — workbox's 2 MiB cap).
        // The small pngs we DO want offline (logos, icons) are precached
        // explicitly via `includeAssets` above instead.
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
