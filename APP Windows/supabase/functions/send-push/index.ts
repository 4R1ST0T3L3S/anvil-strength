// Supabase Edge Function: send-push
// Envía Web Push a las suscripciones del usuario cuando se inserta una notificación.
// Se invoca desde el trigger de BD (ver database/push_reminders.sql).
//
// CONFIGURACIÓN (una vez):
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:anvilstrengthclub@gmail.com
//   supabase secrets set PUSH_HOOK_SECRET=<cadena larga y aleatoria>
//   supabase functions deploy send-push --no-verify-jwt
//
// Usa la librería estándar web-push (npm) — cifra el payload correctamente (aes128gcm),
// cosa que la implementación manual anterior no hacía.
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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:anvilstrengthclub@gmail.com';

const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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

        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', user_id);

        if (error) throw error;

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, reason: 'sin suscripciones' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const payload = JSON.stringify({
            title: title || 'Anvil Strength',
            message: message || '',
            link: link || '/'
        });

        let sent = 0;
        const expired: string[] = [];

        await Promise.all(subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
                sent++;
            } catch (err) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) expired.push(sub.id);
                else console.error('Push error:', err);
            }
        }));

        if (expired.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', expired);
        }

        return new Response(
            JSON.stringify({ sent, total: subscriptions.length, expired: expired.length }),
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
