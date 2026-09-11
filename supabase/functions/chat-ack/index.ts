// Supabase Edge Function: chat-ack
// =====================================================================
//
// "ENTREGADO" CON LA APP CERRADA.
//
// Cuando llega el push de un mensaje de chat, el service worker del
// destinatario (public/push-sw.js) llama aquí con el id del mensaje y un
// testigo HMAC que calculó la base al enviarlo. Si el testigo cuadra, el
// mensaje queda entregado: el remitente ve ✓✓ aunque el destinatario no haya
// abierto la aplicación, que es exactamente lo que significa "entregado".
//
// Sin JWT (el service worker no tiene la sesión del usuario a mano): la
// autenticación es el testigo, que solo puede fabricar quien conoce el
// secreto de Vault. Un testigo por mensaje, así que no sirve para nada más.
//
// Despliegue: supabase functions deploy chat-ack --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{64}$/i;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

    let body: { id?: unknown; token?: unknown } = {};
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Cuerpo no válido.' }, 400);
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const token = typeof body.token === 'string' ? body.token : '';
    if (!UUID_RE.test(id) || !HEX_RE.test(token)) {
        return json({ error: 'Testigo no válido.' }, 400);
    }

    const { data, error } = await admin.rpc('chat_ack_by_token', { p_id: id, p_token: token.toLowerCase() });
    if (error) {
        console.error('chat-ack:', error);
        return json({ error: 'No se pudo confirmar.' }, 500);
    }
    return json({ ok: data === true }, data === true ? 200 : 403);
});
