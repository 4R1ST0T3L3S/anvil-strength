/**
 * PROXY DEL CALENDARIO AEP
 * =====================================================================
 *
 * Devuelve, en CSV, la hoja de competiciones que publica la Asociación
 * Española de Powerlifting.
 *
 * POR QUÉ HACE FALTA UN PROXY
 *
 * La hoja vive en Google Drive y no manda cabeceras CORS, así que el navegador
 * no la puede pedir directamente. La versión anterior lo resolvía saltando por
 * proxies públicos gratuitos —codetabs, corsproxy, allorigins—, que es una
 * dependencia de tres servicios ajenos, sin acuerdo de servicio, con límites
 * de peticiones y con caídas. Cuando fallaban los tres, el calendario se
 * quedaba vacío.
 *
 * Desde el servidor no hay CORS que valga: esto pide la hoja y la devuelve
 * desde NUESTRO dominio. Además encaja con la política de contenido del sitio
 * (`connect-src 'self'`), que nunca llegó a incluir a los proxies.
 *
 * La respuesta se cachea en el borde: el calendario de la federación cambia
 * unas pocas veces al año, así que servirlo desde caché durante una hora y
 * dejar que se revalide en segundo plano durante un día es de sobra.
 */

export const config = { runtime: 'edge' };

const SHEET_URL =
    'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';

/** Google puede tardar; sin tope, la función se queda colgada hasta el límite. */
const TIMEOUT_MS = 8000;

export default async function handler(): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const upstream = await fetch(SHEET_URL, {
            signal: controller.signal,
            headers: {
                // Sin esto Google responde a veces con una página de
                // consentimiento en HTML en lugar del CSV.
                'User-Agent': 'AnvilStrength/1.0 (+https://anvilstrength.club)',
                Accept: 'text/csv,*/*',
            },
            redirect: 'follow',
        });

        if (!upstream.ok) {
            return json({ error: `La hoja respondió ${upstream.status}` }, 502);
        }

        const body = await upstream.text();

        // Una hoja publicada tiene siempre cabecera y filas. Si lo que vuelve
        // es HTML es que Google ha servido un login o un error: devolverlo
        // como CSV haría que el cliente lo intentara parsear y acabara con
        // una lista de basura en pantalla.
        if (!body.trim() || body.trimStart().startsWith('<')) {
            return json({ error: 'La hoja no devolvió un CSV válido' }, 502);
        }

        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        return json({ error: aborted ? 'Tiempo de espera agotado' : 'No se pudo leer la hoja' }, 504);
    } finally {
        clearTimeout(timeout);
    }
}

function json(payload: Record<string, string>, status: number): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}
