// Supabase Edge Function: send-push
// Envía Web Push a las suscripciones del usuario cuando se inserta una notificación.
// Se invoca desde el trigger de BD (ver database/push_reminders.sql).
//
// CONFIGURACIÓN (una vez):
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:anvilstrengthclub@gmail.com
//   supabase functions deploy send-push --no-verify-jwt
//
// Usa la librería estándar web-push (npm) — cifra el payload correctamente (aes128gcm),
// cosa que la implementación manual anterior no hacía.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:anvilstrengthclub@gmail.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const record = body.record ?? body; // formato webhook o llamada directa
        const { user_id, title, message, link } = record || {};

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
