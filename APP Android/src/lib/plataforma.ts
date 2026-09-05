/**
 * ANVIL STRENGTH — ¿DÓNDE ESTAMOS CORRIENDO?
 *
 * Esta carpeta es la variante Android: la misma aplicación envuelta en un
 * WebView de Capacitor. Casi todo el código no necesita saberlo, pero hay
 * cuatro cosas que dentro del APK son distintas y aquí se deciden UNA vez:
 *
 *   · El origen. En el WebView `window.location.origin` es `https://localhost`,
 *     que no existe fuera del móvil: no vale ni como URL de retorno de OAuth
 *     ni para pedir nada al servidor.
 *   · Lo que NO viaja dentro del APK. `opencv.js` (10 MB) y el reglamento en
 *     PDF (14 MB) se sirven desde la web y se descargan la primera vez que
 *     hacen falta. Meterlos en el paquete triplicaba su tamaño.
 *   · La vuelta desde el navegador (login con Google). Un esquema propio que
 *     Android reconoce y con el que vuelve a abrir la app.
 *   · Las notificaciones push, que aquí son de Firebase y no Web Push.
 */

import { Capacitor } from '@capacitor/core';

/** ¿Corre dentro del APK (WebView de Capacitor) y no en un navegador? */
export const esNativo = (): boolean => Capacitor.isNativePlatform();

/**
 * Origen público de la web, sin barra final. Desde el APK es la referencia
 * para todo lo que no va empaquetado: `/opencv.js`, el PDF, `/api/aep`.
 */
export const URL_WEB = (
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim() || 'https://anvilstrength.es'
).replace(/\/+$/, '');

/**
 * Esquema con el que Android vuelve a abrir la app desde fuera (OAuth).
 * Tiene que coincidir con el `<intent-filter>` de AndroidManifest.xml y con
 * `custom_url_scheme` en res/values/strings.xml.
 */
export const ESQUEMA_APP = 'com.anvilstrength.app';

/**
 * Un recurso de `public/` que en el APK no va dentro. En el navegador se pide
 * en el mismo origen; en el APK, a la web.
 */
export function urlRecursoRemoto(ruta: string): string {
    const limpia = ruta.startsWith('/') ? ruta : `/${ruta}`;
    return esNativo() ? `${URL_WEB}${limpia}` : limpia;
}

/**
 * Push nativo (Firebase Cloud Messaging) activado por configuración.
 *
 * `PushNotifications.register()` FALLA si `android/app/google-services.json`
 * no existe, así que no se intenta hasta que alguien ponga el fichero y
 * encienda esto con `VITE_FCM_ENABLED=true`. Ver docs/ANDROID.md.
 */
export const pushNativoActivado = (): boolean =>
    esNativo() && import.meta.env.VITE_FCM_ENABLED === 'true';
