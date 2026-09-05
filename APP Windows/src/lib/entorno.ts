/**
 * DÓNDE SE ESTÁ EJECUTANDO LA APLICACIÓN
 * =====================================================================
 * Anvil se reparte de tres formas y no son la misma cosa:
 *
 *   - anvilstrength.es, en un navegador
 *   - un APK de Android (Capacitor: un WebView que sirve los ficheros del
 *     propio paquete)
 *   - un envoltorio de escritorio
 *
 * En los dos últimos casos la página NO se está sirviendo desde un servidor
 * web: sale de dentro del dispositivo, bajo un esquema privado
 * (`app://anvil`, `http://localhost` sin puerto, `file://`...). Todo lo que
 * dé por hecho que `window.location` es una dirección pública se rompe ahí, y
 * se rompe en silencio.
 */

/** El puente que Capacitor inyecta en la página antes de cargar el bundle. */
interface PuenteCapacitor {
    isNativePlatform?: () => boolean;
    platform?: string;
}

/**
 * ¿Estamos dentro de un envoltorio nativo (Android / escritorio) en vez de en
 * un navegador apuntando a un dominio público?
 *
 * Se pregunta primero por el puente de Capacitor, que es la señal directa y
 * la única que distingue el `http://localhost` de la app de Android del
 * `http://localhost:5173` del servidor de desarrollo. El protocolo va después
 * y cubre cualquier otro envoltorio (`app://`, `file://`, `tauri://`).
 */
export function esAppEmpaquetada(): boolean {
    if (typeof window === 'undefined') return false;

    const puente = (window as { Capacitor?: PuenteCapacitor }).Capacitor;
    if (puente?.isNativePlatform?.() === true) return true;
    if (puente?.platform && puente.platform !== 'web') return true;

    return !/^https?:$/.test(window.location.protocol);
}
