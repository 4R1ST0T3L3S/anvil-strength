/**
 * A DÓNDE VUELVE EL USUARIO DESPUÉS DE AUTENTICARSE
 *
 * Supabase acepta la URL de retorno como parámetro, pero solo la respeta si
 * está en la lista blanca de "Redirect URLs" del panel. Si no lo está, ignora
 * lo que le mandemos y devuelve al usuario a la "Site URL" del proyecto — que
 * es exactamente por lo que un login desde el dominio propio terminaba en la
 * URL de vercel.app.
 *
 * Por eso hay dos piezas y las dos hacen falta:
 *
 *   1. Este archivo, que pide volver al sitio correcto según dónde corre.
 *   2. La configuración del panel de Supabase (Authentication -> URL
 *      Configuration), que tiene que permitir esas URLs. Ver docs/ANDROID.md.
 *
 *
 * EN EL APK HAY DOS RETORNOS DISTINTOS, Y NO ES CAPRICHO
 * ---------------------------------------------------------------------
 *
 * · Login con Google: se abre el navegador del sistema y la vuelta tiene que
 *   ABRIR LA APP. Eso solo lo hace un esquema propio
 *   (`com.anvilstrength.app://auth/callback`), que Android reconoce por el
 *   `<intent-filter>` del manifiesto y entrega a `appUrlOpen`
 *   (src/hooks/useNativeFeatures.ts).
 *
 * · Confirmación de email / recuperar contraseña: el enlace se pulsa desde un
 *   cliente de correo, y los clientes de correo NO abren esquemas propios
 *   (los tratan como texto). Ese enlace va a la WEB, que sí existe, y la
 *   persona entra después en la app con su contraseña ya confirmada.
 *
 * `VITE_PUBLIC_SITE_URL` existe para los casos en que el origen del navegador
 * NO es la URL pública: previsualizaciones o un proxy delante. Si no está
 * definida —lo normal— se usa el origen actual (o la web, desde el APK).
 */

import { esNativo, ESQUEMA_APP, URL_WEB } from './plataforma';

/** Ruta interna que recoge la sesión y mete al usuario en su panel. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Origen público de la app, sin barra final. Desde el APK, el de la web. */
export function getSiteOrigin(): string {
    if (esNativo()) return URL_WEB;
    const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
    const origin = configured?.trim() || window.location.origin;
    return origin.replace(/\/+$/, '');
}

/**
 * URL a la que Supabase debe devolver al usuario tras un login con proveedor
 * externo (Google). En el APK es el esquema propio que vuelve a abrir la app.
 */
export function getAuthCallbackUrl(): string {
    if (esNativo()) return `${ESQUEMA_APP}://auth/callback`;
    return `${getSiteOrigin()}${AUTH_CALLBACK_PATH}`;
}

/**
 * URL para los enlaces que llegan POR EMAIL (confirmar el alta, recuperar la
 * contraseña). Siempre la web: un esquema propio dentro de un correo no abre
 * nada.
 */
export function getEmailCallbackUrl(): string {
    return `${getSiteOrigin()}${AUTH_CALLBACK_PATH}`;
}

/** ¿Es esta URL entrante (deep link) una vuelta de autenticación? */
export function esUrlDeCallback(url: string): boolean {
    if (url.startsWith(`${ESQUEMA_APP}://`)) return true;
    return url.includes(AUTH_CALLBACK_PATH);
}
