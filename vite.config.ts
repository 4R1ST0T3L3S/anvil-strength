import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      /**
       * 'prompt' Y NO 'autoUpdate'. Decisión K11.
       *
       * Con 'autoUpdate', el service worker se actualiza solo y toma el
       * control en cuanto hay una versión nueva. En una aplicación cualquiera
       * eso es cómodo; aquí significa que el código puede cambiar debajo de
       * alguien que está A MITAD DE UNA SESIÓN DE ENTRENAMIENTO, con series
       * marcadas y otras por marcar. Es justo lo que no puede pasar.
       *
       * Con 'prompt' se avisa y decide la persona. `ReloadPrompt` ya está
       * escrito para esto: enseña un aviso que no caduca con un botón de
       * "Actualizar", y hasta que no se pulse sigue corriendo la versión que
       * había.
       */
      registerType: 'prompt',
      /**
       * `sw.js` YA NO ESTÁ EN ESTA LISTA, y es parte de reactivar la PWA.
       *
       * Era un service worker escrito a mano con manejadores de `push`, que
       * `usePushNotifications` registraba por su cuenta. Pero workbox genera
       * el SUYO y le inyecta `push-sw.js`, que trae exactamente los mismos
       * manejadores: había dos service workers con dos copias del mismo
       * código, y un aviso llegaba duplicado o no llegaba según cuál tuviera
       * el control. Mientras la PWA estaba desactivada no se notaba.
       *
       * Ahora manda uno solo: el generado. `push-sw.js` sigue entrando por
       * `importScripts`, más abajo. `public/sw.js` se puede borrar cuando se
       * confirme que nadie lo tiene registrado del despliegue anterior.
       *
       * (`masked-icon.svg` también estaba aquí y NO EXISTE en `public/`.)
       */
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Anvil Strength Powerlifting',
        short_name: 'Anvil Strength',
        description: 'Anvil Strength Powerlifting App',
        // `lang` lo rellenaba vite-plugin-pwa con 'en' por defecto, en una
        // aplicación que está entera en español.
        lang: 'es',
        // Los dos colores salen de tokens.css, no de un negro cualquiera:
        // `theme_color` pinta la barra del sistema y tiene que ser el mismo
        // `--surface-sunken` que declara `<meta name="theme-color">` en
        // index.html, o la barra cambia de color al instalar la app.
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // `any maskable` a la vez era mentira por partida doble: prometía
            // servir sin recorte (y el yunque tocaba el borde) y con recorte
            // (y no tenía margen para él). Ahora son dos ficheros distintos:
            // este sangra el rojo hasta el borde y encoge el yunque para que
            // quepa en el círculo seguro del 80%.
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
         *
         * `normativa_equipo.pdf` (14 MB) se añade como CINTURÓN, no porque
         * estuviera entrando. Comprobado en el manifiesto generado: no está.
         * El motivo es que `globPatterns` solo recoge js, css, html, ico, png
         * y svg por defecto, y `.pdf` no está en esa lista — no el límite de
         * tamaño de aquí arriba, que el fichero cumple de sobra.
         *
         * Se deja escrito porque el día que alguien amplíe `globPatterns` para
         * precachear, digamos, las fuentes, se llevaría catorce megas de
         * reglamento por delante sin enterarse.
         */
        globIgnores: ['**/opencv.js', '**/normativa_equipo.pdf'],

        /**
         * SIN ESTO, EL PDF DE LA NORMATIVA "RECARGABA LA WEB" AL ABRIRLO.
         *
         * `navigateFallback` (activado por defecto por vite-plugin-pwa) hace
         * que el service worker responda CUALQUIER navegación con fallo de
         * red devolviendo `index.html` — es lo que permite que las rutas de
         * React Router funcionen sin conexión. El problema es que un enlace
         * con `target="_blank"` a un PDF también es una "navegación", y sin
         * lista de exclusión el service worker la interceptaba igual: sacaba
         * `index.html` en vez del PDF, React Router no reconocía
         * `/normativa_equipo.pdf` como ruta propia y el comodín `*` mandaba
         * de vuelta a "/". Por fuera, parecía que el botón "recargaba la web".
         *
         * `opencv.js` entra por la misma razón que arriba: ni es una ruta de
         * la app ni debe servirse como una.
         */
        navigateFallbackDenylist: [/\.pdf$/, /^\/opencv\.js$/, /^\/api\//],

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
          /**
           * framer-motion YA NO va aquí, y quitarlo es lo que hace que
           * `LazyMotion` sirva de algo.
           *
           * Metiéndolo todo en un chunk propio, el núcleo (`m`, ~5 KB) y el
           * motor de animación (`domMax`, ~28 KB) acaban en el MISMO fichero.
           * Da igual que `App.tsx` pida el motor con un `import()` diferido:
           * si el chunk es uno solo y algo del arranque lo toca, se descarga
           * entero. El diferido no ahorraba un byte.
           *
           * Sin esta línea, Rollup sigue el grafo de importaciones de verdad
           * y separa el motor en su propio trozo, que es lo que se pretendía.
           */
          if (id.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@techstark/opencv-js']
  }
})
