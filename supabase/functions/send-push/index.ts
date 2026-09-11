// Supabase Edge Function: send-push
// =====================================================================
//
// Envía Web Push a las suscripciones de un usuario. La llaman los
// disparadores de la base (`public.push_send`, ver
// database/NOTIFICACIONES_2026-09-11.sql) a través de pg_net.
//
// DESPLIEGUE: SIN verificación de JWT (quien llama es la base, que no tiene
// sesión de usuario). La autenticación es el secreto compartido, y ese
// secreto NO se configura a mano: lo genera Postgres y vive en Vault. Esta
// función lo comprueba preguntándole a la base (`push_hook_secret_ok`).
//
// CLAVES VAPID: tampoco hay que configurarlas. Si Vault no tiene ninguna, la
// primera llamada las genera (o adopta VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY si
// existían como secretos de la función) y las guarda. La pública la sirve la
// RPC `get_vapid_public_key()` o esta misma función con `action: 'public_key'`,
// así que el navegador no depende de ninguna variable de entorno de Vercel.
//
// POR QUÉ HAY UN SECRETO
//
// "Sin JWT" significa que la puede llamar cualquiera: la URL no es secreta.
// Sin el secreto bastaría un POST para hacerle llegar al móvil de cualquier
// usuario un aviso con el nombre y el icono de Anvil y un enlace elegido por
// quien lo manda. `link` se valida aparte: un aviso solo lleva DENTRO de la
// aplicación.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:anvilstrengthclub@gmail.com';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

interface VapidPair {
    publicKey: string;
    privateKey: string;
}

/** Vive lo que viva el aislamiento: una lectura de Vault por arranque en frío. */
let vapidCache: VapidPair | null = null;

async function vapidKeys(): Promise<VapidPair> {
    if (vapidCache) return vapidCache;

    const { data, error } = await admin.rpc('push_vapid_keys');
    if (error) throw error;

    let pair: VapidPair | null =
        data && typeof data === 'object' && data.public_key && data.private_key
            ? { publicKey: String(data.public_key), privateKey: String(data.private_key) }
            : null;

    if (!pair) {
        const envPublic = Deno.env.get('VAPID_PUBLIC_KEY');
        const envPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
        const seed = envPublic && envPrivate
            ? { publicKey: envPublic, privateKey: envPrivate }
            : webpush.generateVAPIDKeys();

        // La base devuelve el par que QUEDE guardado: si otro arranque se
        // adelantó, se usa el suyo y no el recién generado.
        const { data: saved, error: saveError } = await admin.rpc('push_vapid_save', {
            p_public: seed.publicKey,
            p_private: seed.privateKey,
        });
        if (saveError) throw saveError;
        pair = { publicKey: String(saved.public_key), privateKey: String(saved.private_key) };
    }

    webpush.setVapidDetails(VAPID_SUBJECT, pair.publicKey, pair.privateKey);
    vapidCache = pair;
    return pair;
}

/**
 * Un enlace de aviso solo puede llevar a un sitio DENTRO de la aplicación:
 * ruta absoluta propia, sin esquema (`javascript:`) ni doble barra
 * (`//otro-dominio`).
 */
function enlaceSeguro(valor: unknown): string {
    if (typeof valor !== 'string') return '/';
    const limpio = valor.trim();
    if (!limpio.startsWith('/') || limpio.startsWith('//') || limpio.includes('\\')) return '/';
    return limpio.slice(0, 300);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{64}$/i;

/** El testigo de entrega de un mensaje de chat, si viene bien formado. */
function ackPayload(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const { id, token } = value as { id?: unknown; token?: unknown };
    if (typeof id !== 'string' || !UUID_RE.test(id)) return undefined;
    if (typeof token !== 'string' || !HEX_RE.test(token)) return undefined;
    return { url: `${SUPABASE_URL}/functions/v1/chat-ack`, id, token };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'La función no está configurada.' }, 500);

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        /* cuerpo vacío: se valida abajo */
    }

    // PÚBLICO: la clave pública VAPID no es un secreto. Es lo que el
    // navegador necesita para suscribirse, y pedirla prepara el par si aún
    // no existía.
    if (body.action === 'public_key') {
        try {
            const keys = await vapidKeys();
            return json({ public_key: keys.publicKey });
        } catch (err) {
            console.error('VAPID:', err);
            return json({ error: 'No se pudo preparar el push.' }, 500);
        }
    }

    const secret = req.headers.get('x-push-secret') ?? '';
    if (!secret) return json({ error: 'No autorizado.' }, 401);
    const { data: ok, error: okError } = await admin.rpc('push_hook_secret_ok', { p_secret: secret });
    if (okError || ok !== true) return json({ error: 'No autorizado.' }, 401);

    const record = ((body.record ?? body) || {}) as Record<string, unknown>;
    const userId = typeof record.user_id === 'string' ? record.user_id : '';
    const title = typeof record.title === 'string' ? record.title.slice(0, 120) : '';
    if (!UUID_RE.test(userId) || !title) {
        return json({ error: 'user_id y title requeridos.' }, 400);
    }
    const message = typeof record.message === 'string' ? record.message.slice(0, 240) : '';
    const link = enlaceSeguro(record.link);
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {};
    const category = typeof data.category === 'string' ? data.category : 'system';

    try {
        await vapidKeys();

        const { data: subscriptions, error } = await admin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', userId);
        if (error) throw error;

        if (!subscriptions || subscriptions.length === 0) {
            return json({ sent: 0, reason: 'sin suscripciones' });
        }

        const payload = JSON.stringify({
            title,
            message,
            link,
            tag: typeof data.tag === 'string' ? data.tag.slice(0, 80) : undefined,
            category,
            ack: ackPayload(data.ack),
        });

        let sent = 0;
        const expired: string[] = [];

        await Promise.all(subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                    // Un mensaje de chat caduca pronto y va con prioridad; un
                    // aviso de bloque nuevo puede esperar a que el móvil despierte.
                    { TTL: category === 'message' ? 60 * 60 * 6 : 60 * 60 * 24 * 2, urgency: category === 'message' ? 'high' : 'normal' }
                );
                sent++;
            } catch (err) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) expired.push(sub.id);
                else console.error('Push error:', status, err);
            }
        }));

        if (expired.length > 0) {
            await admin.from('push_subscriptions').delete().in('id', expired);
        }

        return json({ sent, total: subscriptions.length, expired: expired.length });
    } catch (err) {
        console.error('send-push:', err);
        return json({ error: 'No se pudo enviar.' }, 500);
    }
});
