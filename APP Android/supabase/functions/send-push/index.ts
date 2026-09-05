// Supabase Edge Function: send-push
// Envía un aviso a todos los dispositivos del usuario cuando se inserta una
// notificación. Se invoca desde el trigger de BD (ver database/push_reminders.sql).
//
// DOS CANALES, UNA FUNCIÓN
// =====================================================================
//
//   · Web Push (navegador / PWA): suscripciones en `push_subscriptions`,
//     cifrado VAPID con la librería web-push.
//   · Firebase Cloud Messaging (APK Android): tokens en `device_push_tokens`,
//     API HTTP v1 de FCM autenticada con una cuenta de servicio.
//
// Cada canal se enciende con sus secretos; sin ellos se salta en silencio y
// se manda por el otro. Así el mismo despliegue sirve antes y después de
// configurar Firebase.
//
// CONFIGURACIÓN (una vez):
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:anvilstrengthclub@gmail.com
//   supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat cuenta-servicio-firebase.json)"
//   supabase secrets set PUSH_HOOK_SECRET=<cadena larga y aleatoria>
//   supabase functions deploy send-push --no-verify-jwt
//
//
// POR QUÉ HAY UN SECRETO COMPARTIDO
// =====================================================================
//
// Esta función se despliega con `--no-verify-jwt`, y tiene que ser así: quien
// la llama es un disparador de la base de datos vía pg_net (ver
// database/push_reminders.sql), que no tiene ninguna sesión de usuario que
// presentar.
//
// El problema es que "sin JWT" significa que la puede llamar CUALQUIERA. La
// URL no es un secreto —es `<project-ref>.supabase.co/functions/v1/send-push`
// y el project-ref va dentro del bundle del navegador—, así que sin esta
// comprobación bastaba un POST desde cualquier sitio con
//
//     { "user_id": "<uuid>", "title": "...", "link": "..." }
//
// para hacerle llegar al móvil de cualquier usuario un aviso con el nombre y
// el icono de Anvil Strength y un enlace elegido por quien lo manda. Eso no
// es un aviso de más: es una notificación de confianza usada para llevar a
// alguien donde no quiere ir.
//
// El secreto lo comparten solo la función y el disparador. Se compara byte a
// byte y en tiempo constante para no filtrar por cuánto tarda en fallar.
//
// `link` se valida aparte, y no basta con el secreto: los avisos los escriben
// las propias tablas de la aplicación, así que un texto que acabe en `link`
// no debería poder sacar a nadie del dominio aunque venga de dentro.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:anvilstrengthclub@gmail.com';

const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';

const webPushActivo = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (webPushActivo) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------
// FIREBASE CLOUD MESSAGING (APK)
// ---------------------------------------------------------------------

/** Los tres campos de la cuenta de servicio que hacen falta. */
interface CuentaServicio {
    project_id: string;
    client_email: string;
    private_key: string;
}

let cuentaFcm: CuentaServicio | null = null;
try {
    const crudo = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';
    if (crudo) {
        const parsed = JSON.parse(crudo) as Partial<CuentaServicio>;
        if (parsed.project_id && parsed.client_email && parsed.private_key) {
            cuentaFcm = parsed as CuentaServicio;
        } else {
            console.error('FCM_SERVICE_ACCOUNT_JSON: faltan project_id, client_email o private_key');
        }
    }
} catch {
    console.error('FCM_SERVICE_ACCOUNT_JSON no es un JSON válido');
}

/**
 * Token OAuth2 para FCM, firmado con la cuenta de servicio. Dura una hora y
 * se guarda en memoria de la instancia: firmar un JWT por aviso sería tirar
 * CPU, y Google limita las peticiones de token.
 */
let tokenFcmCache: { valor: string; caduca: number } | null = null;

async function tokenAccesoFcm(): Promise<string | null> {
    if (!cuentaFcm) return null;
    if (tokenFcmCache && tokenFcmCache.caduca > Date.now() + 60_000) return tokenFcmCache.valor;

    const clave = await importPKCS8(cuentaFcm.private_key, 'RS256');
    const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(cuentaFcm.client_email)
        .setSubject(cuentaFcm.client_email)
        .setAudience('https://oauth2.googleapis.com/token')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(clave);

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!res.ok) {
        console.error('OAuth de Firebase respondió', res.status, await res.text());
        return null;
    }

    const datos = await res.json() as { access_token: string; expires_in: number };
    tokenFcmCache = { valor: datos.access_token, caduca: Date.now() + datos.expires_in * 1000 };
    return datos.access_token;
}

type ResultadoEnvio = 'ok' | 'caducado' | 'error';

async function enviarFcm(
    accessToken: string,
    token: string,
    title: string,
    message: string,
    link: string
): Promise<ResultadoEnvio> {
    const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${cuentaFcm!.project_id}/messages:send`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    token,
                    notification: { title, body: message },
                    // `data` viaja tal cual a `pushNotificationActionPerformed`:
                    // la app abre en `link` cuando se toca el aviso.
                    data: { link },
                    android: {
                        priority: 'high',
                        notification: { sound: 'default' },
                    },
                },
            }),
        }
    );

    if (res.ok) return 'ok';

    const cuerpo = await res.text();
    // 404 / UNREGISTERED: el token ya no existe (app desinstalada, datos
    // borrados). Se limpia. Cualquier otro fallo se conserva y se registra:
    // un INVALID_ARGUMENT puede ser un cuerpo mal formado, no un token malo.
    if (res.status === 404 || cuerpo.includes('UNREGISTERED')) return 'caducado';
    console.error('FCM error:', res.status, cuerpo);
    return 'error';
}

// ---------------------------------------------------------------------

/**
 * Comparación en tiempo constante.
 *
 * `a === b` corta en cuanto encuentra el primer byte distinto, así que cuánto
 * tarda en decir que no depende de cuántos caracteres se han acertado. Con
 * suficientes intentos eso permite ir adivinando el secreto letra a letra.
 */
function mismoSecreto(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/**
 * Un enlace de aviso solo puede llevar a un sitio DENTRO de la aplicación.
 *
 * Se exige una ruta absoluta del propio dominio y se rechaza cualquier cosa
 * con esquema (`https:`, y sobre todo `javascript:`) o con doble barra
 * inicial (`//otro-dominio.com`, que el navegador entiende como externa aun
 * sin escribir el protocolo).
 */
function enlaceSeguro(valor: unknown): string {
    if (typeof valor !== 'string') return '/';
    const limpio = valor.trim();
    if (!limpio.startsWith('/')) return '/';
    if (limpio.startsWith('//')) return '/';
    if (limpio.includes('\\')) return '/';
    return limpio.slice(0, 300);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Sin secreto configurado NO se abre la puerta: se cierra. Un despliegue
    // al que se le olvidó el `supabase secrets set` tiene que quedarse sin
    // avisos, no sin autenticación.
    if (!HOOK_SECRET || !mismoSecreto(req.headers.get('x-push-secret') ?? '', HOOK_SECRET)) {
        return new Response(
            JSON.stringify({ error: 'No autorizado.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await req.json();
        const record = body.record ?? body; // formato webhook o llamada directa
        const { user_id, title, message } = record || {};
        const link = enlaceSeguro(record?.link);

        if (!user_id || !title) {
            return new Response(
                JSON.stringify({ error: 'user_id y title requeridos' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const [webRes, nativoRes] = await Promise.all([
            webPushActivo
                ? supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user_id)
                : Promise.resolve({ data: [], error: null }),
            cuentaFcm
                ? supabase.from('device_push_tokens').select('id, token').eq('user_id', user_id)
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (webRes.error) throw webRes.error;
        if (nativoRes.error) throw nativoRes.error;

        const subscriptions = webRes.data ?? [];
        const tokens = nativoRes.data ?? [];

        if (subscriptions.length === 0 && tokens.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, reason: 'sin suscripciones ni dispositivos' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const titulo = title || 'Anvil Strength';
        const mensaje = message || '';

        let sentWeb = 0;
        let sentNativo = 0;
        const expiredWeb: string[] = [];
        const expiredNativo: string[] = [];

        // --- Web Push ---
        const payload = JSON.stringify({ title: titulo, message: mensaje, link });

        const enviosWeb = subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
                sentWeb++;
            } catch (err) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) expiredWeb.push(sub.id);
                else console.error('Push error:', err);
            }
        });

        // --- FCM ---
        const accessToken = tokens.length > 0 ? await tokenAccesoFcm() : null;
        const enviosNativo = accessToken
            ? tokens.map(async (t) => {
                const resultado = await enviarFcm(accessToken, t.token, titulo, mensaje, link);
                if (resultado === 'ok') sentNativo++;
                else if (resultado === 'caducado') expiredNativo.push(t.id);
            })
            : [];

        await Promise.all([...enviosWeb, ...enviosNativo]);

        if (expiredWeb.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', expiredWeb);
        }
        if (expiredNativo.length > 0) {
            await supabase.from('device_push_tokens').delete().in('id', expiredNativo);
        }

        return new Response(
            JSON.stringify({
                sent: sentWeb + sentNativo,
                web: { sent: sentWeb, total: subscriptions.length, expired: expiredWeb.length },
                nativo: { sent: sentNativo, total: tokens.length, expired: expiredNativo.length },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('Edge function error:', err);
        return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
