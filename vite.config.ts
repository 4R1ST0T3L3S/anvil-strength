import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'sw.js'],
      manifest: {
        name: 'Anvil Strength Powerlifting',
        short_name: 'Anvil Strength',
        description: 'Anvil Strength Powerlifting App',
        // v2: Force icon update
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB
        importScripts: ['push-sw.js'], // manejadores de Web Push
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        /**
         * Separa las dependencias grandes en chunks propios.
         *
         * El motivo no es solo el peso inicial: es la CACHÉ. Antes iban todas
         * mezcladas con el código de la app, así que cualquier cambio en un
         * componente invalidaba los 720 KB del chunk `index` y el usuario se
         * los volvía a descargar enteros. Estas librerías cambian una vez cada
         * varios meses; el código de Anvil, cada día.
         */
        /**
         * SOLO librerías que la app necesita SIEMPRE, en todas las rutas.
         *
         * Nombrar aquí una dependencia que se carga en diferido es
         * contraproducente: Rollup la convierte en un chunk compartido, Vite
         * le añade un `<link rel="modulepreload">` en index.html y el
         * navegador se la descarga en el primer pintado — justo lo que el
         * `lazy()` pretendía evitar. Typebot (612 KB) y recharts (384 KB) se
         * quedan fuera a propósito: que Rollup los mantenga como chunks
         * dinámicos de quien los importa.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@techstark/opencv-js']
  }
})
