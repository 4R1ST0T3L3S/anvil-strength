import { esAppEmpaquetada } from './entorno';

/**
 * A DÓNDE VUELVE EL USUARIO DESPUÉS DE AUTENTICARSE, Y CON QUÉ DIRECCIÓN SE
 * COMPARTE UN ENLACE.
 *
 * Supabase acepta la URL de retorno como parámetro, pero solo la respeta si
 * está en la lista blanca de "Redirect URLs" del panel. Si no lo está, ignora
 * lo que le mandemos y devuelve al usuario a la "Site URL" del proyecto — que
 * es exactamente por lo que un login desde el dominio propio terminaba en la
 * URL de vercel.app.
 *
 * Por eso hay dos piezas y las dos hacen falta:
 *
 *   1. Este archivo, que siempre pide volver a un origen PÚBLICO.
 *   2. La configuración del panel de Supabase (Authentication -> URL
 *      Configuration), que tiene que permitir ese origen. Ver
 *      docs/AUTENTICACION.md.
 */

/**
 * El dominio de verdad, el que existe fuera de este dispositivo.
 *
 * Está escrito aquí y no sale de `window.location` a propósito: ver
 * `esAppEmpaquetada()`. `VITE_PUBLIC_SITE_URL` lo sobreescribe para
 * previsualizaciones o si algún día cambia el dominio.
 */
const DOMINIO_PUBLICO = 'https://anvilstrength.es';

/** Ruta interna que recoge la sesión y mete al usuario en su panel. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/*
 * POR QUÉ TODO ESTO MIRA SI LA APP ESTÁ EMPAQUETADA
 * =====================================================================
 * En Android la aplicación no es un sitio web: es un WebView de Capacitor
 * que sirve los ficheros del propio APK bajo un esquema privado. Ahí
 * `window.location.origin` vale `app://anvil` (o `http://localhost`, según
 * cómo se haya empaquetado), que es una dirección que SOLO EXISTE DENTRO DEL
 * TELÉFONO. Lo mismo en la versión de escritorio.
 *
 * Construir cosas con ese origen daba dos fallos:
 *
 *   - enlaces de invitación tipo `app://anvil/reclamar/<token>`, que no
 *     llevan a ninguna parte cuando el atleta los abre en su móvil;
 *   - una URL de retorno `app://anvil/auth/callback` que Supabase rechaza
 *     por no estar en su lista blanca, así que entrar con Google o confirmar
 *     el correo desde la app dejaba al usuario tirado.
 *
 * La detección vive en src/lib/entorno.ts.
 */

function sinBarraFinal(url: string): string {
    return url.replace(/\/+$/, '');
}

/**
 * Origen público de la app, sin barra final.
 *
 * Dentro de la app empaquetada NO se usa el origen del navegador, porque no
 * es una dirección que exista fuera del dispositivo.
 */
export function getSiteOrigin(): string {
    const configurado = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
    if (configurado) return sinBarraFinal(configurado);

    if (esAppEmpaquetada()) return DOMINIO_PUBLICO;

    return sinBarraFinal(window.location.origin);
}

/**
 * URL completa a la que Supabase debe devolver al usuario tras un login con
 * proveedor externo o tras confirmar el email.
 */
export function getAuthCallbackUrl(): string {
    return `${getSiteOrigin()}${AUTH_CALLBACK_PATH}`;
}

/**
 * LA DIRECCIÓN DE UN ENLACE QUE SE LE MANDA A OTRA PERSONA.
 * =====================================================================
 * No es lo mismo que `getSiteOrigin()`, y por eso son dos funciones.
 *
 * `getSiteOrigin()` responde "¿dónde estoy yo?" y en la web vale el origen
 * actual: si el coach entró por una previsualización de Vercel, volver ahí
 * después de autenticarse es lo correcto.
 *
 * Esta responde "¿qué dirección le sirve a OTRO?", y ahí una previsualización
 * de Vercel no vale más que `app://anvil`: caduca, o no es la que el atleta
 * tiene asociada a la aplicación instalada. Un enlace que se manda por
 * WhatsApp se construye SIEMPRE sobre el dominio de verdad.
 *
 * En desarrollo se respeta localhost, que es lo que permite probar el flujo
 * entero sin salir del portátil.
 */
export function enlaceCompartible(ruta: string): string {
    const camino = ruta.startsWith('/') ? ruta : `/${ruta}`;

    const configurado = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
    if (configurado) return `${sinBarraFinal(configurado)}${camino}`;

    if (import.meta.env.DEV && !esAppEmpaquetada()) {
        return `${sinBarraFinal(window.location.origin)}${camino}`;
    }

    return `${DOMINIO_PUBLICO}${camino}`;
}
