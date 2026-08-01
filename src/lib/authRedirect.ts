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
 *   1. Este archivo, que siempre pide volver al origen desde el que se empezó.
 *   2. La configuración del panel de Supabase (Authentication -> URL
 *      Configuration), que tiene que permitir ese origen. Ver
 *      docs/AUTENTICACION.md.
 *
 * `VITE_PUBLIC_SITE_URL` existe para los casos en que el origen del navegador
 * NO es la URL pública: previsualizaciones, un proxy delante, o una app
 * empaquetada. Si no está definida —lo normal— se usa el origen actual.
 */

/** Ruta interna que recoge la sesión y mete al usuario en su panel. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Origen público de la app, sin barra final. */
export function getSiteOrigin(): string {
    const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
    const origin = configured?.trim() || window.location.origin;
    return origin.replace(/\/+$/, '');
}

/**
 * URL completa a la que Supabase debe devolver al usuario tras un login con
 * proveedor externo o tras confirmar el email.
 */
export function getAuthCallbackUrl(): string {
    return `${getSiteOrigin()}${AUTH_CALLBACK_PATH}`;
}
