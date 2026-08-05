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

        /**
         * QUÉ NO SE PRECACHEA, Y POR QUÉ IMPORTA TANTO.
         *
         * El precache no es una caché: es una DESCARGA OBLIGATORIA. El
         * service worker se baja todo lo que hay en esta lista en la primera
         * visita, de golpe y en segundo plano, lo abra el usuario o no.
         *
         * `opencv.js` son 10,6 MB — el 74% de los 14,3 MB que se precacheaban
         * antes de esta línea. Está en `public/`, así que entraba por el
         * patrón `**\/*.js` de vite-plugin-pwa sin que nadie lo decidiera.
         *
         * Y no hace falta ahí: lo carga `src/lib/cv/cv.worker.js` con
         * `importScripts('/opencv.js')`, dentro de un worker, y solo cuando
         * alguien abre el análisis de vídeo de una serie. O sea que la
         * inmensa mayoría de las visitas se bajaban diez megas de visión por
         * computador para no usarlos ni una vez.
         *
         * Excluirlo NO lo rompe: se sigue sirviendo desde `/opencv.js` y el
         * worker se lo pide cuando le toca. Lo único que cambia es CUÁNDO.
         * A cambio se pierde el análisis de vídeo sin conexión, que tampoco
         * funcionaba: necesita subir el vídeo.
         */
        globIgnores: ['**/opencv.js'],

        /**
         * SIN ESTO, LA PWA SOLO ERA INSTALABLE, NO USABLE SIN CONEXIÓN.
         *
         * El service worker guardaba el HTML, el JS y el CSS, así que la app
         * ABRÍA sin cobertura... y se quedaba en blanco, porque todos los
         * datos vienen de Supabase por red y esas peticiones fallaban.
         *
         * El gimnasio es un sótano de hormigón: el atleta abre la sesión con
         * cobertura en la puerta y la pierde al bajar. Con esto, la última
         * respuesta buena se guarda y se sirve mientras no haya red, así que
         * la sesión del día se puede LEER. Escribir ya lo cubre la cola de
         * src/lib/offlineQueue.ts, que persiste en el dispositivo y sube
         * cuando vuelve la señal. Las dos piezas juntas son lo que hace que
         * se pueda entrenar sin conexión.
         *
         * `NetworkFirst` y no `CacheFirst`: con cobertura mandan siempre los
         * datos frescos. La caché es el plan B, nunca el plan A — un
         * entrenamiento de la semana pasada servido como si fuera el de hoy
         * sería peor que una pantalla de error.
         */
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'anvil-datos',
              // 4s: por encima de eso, en una conexión agonizante, es mejor
              // pintar lo de la caché que dejar la pantalla girando.
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // una semana
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Fotos de atletas y logros. Cambian casi nunca y pesan mucho.
            urlPattern: ({ url, request }) =>
              request.destination === 'image' && url.pathname.includes('/storage/v1/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'anvil-imagenes',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
