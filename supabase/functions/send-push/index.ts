// Supabase Edge Function: send-push
// Envía push notifications cuando se inserta en tabla notifications
// 
// CONFIGURACIÓN REQUERIDA (Supabase Dashboard → Settings → Edge Functions):
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY  
// - VAPID_SUBJECT (ej: mailto:admin@anvilstrength.com)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
        const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
        const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@anvilstrength.com'

        // El webhook envía el registro insertado
        const { record } = await req.json()

        if (!record) {
            return new Response(
                JSON.stringify({ error: 'No record provided' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { user_id, title, message, link } = record

        // Crear cliente Supabase con service role
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // Buscar suscripciones del usuario
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', user_id)

        if (error) {
            console.error('Error fetching subscriptions:', error)
            return new Response(
                JSON.stringify({ error: 'Failed to fetch subscriptions' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, message: 'No subscriptions found' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Payload de la notificación
        const payload = JSON.stringify({
            title: title || 'Anvil Strength',
            body: message,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `notification-${record.id}`,
            data: { url: link || '/' }
        })

        let sent = 0
        const expiredSubs: string[] = []

        // Enviar a cada dispositivo
        for (const sub of subscriptions) {
            try {
                const vapidHeaders = await generateVapidHeaders(
                    sub.endpoint,
                    VAPID_PUBLIC_KEY,
                    VAPID_PRIVATE_KEY,
                    VAPID_SUBJECT
                )

                const response = await fetch(sub.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Encoding': 'aes128gcm',
                        'TTL': '86400',
                        ...vapidHeaders
                    },
                    body: payload
                })

                if (response.status === 201 || response.status === 200) {
                    sent++
                    console.log(`✅ Push sent to endpoint: ${sub.endpoint.substring(0, 50)}...`)
                } else if (response.status === 404 || response.status === 410) {
                    // Suscripción expirada
                    expiredSubs.push(sub.id)
                    console.log(`⚠️ Subscription expired: ${sub.endpoint.substring(0, 50)}...`)
                } else {
                    console.error(`❌ Push failed with status ${response.status}`)
                }
            } catch (e) {
                console.error('Push error:', e)
            }
        }

        // Limpiar suscripciones expiradas
        if (expiredSubs.length > 0) {
            await supabase
                .from('push_subscriptions')
                .delete()
                .in('id', expiredSubs)
            console.log(`🧹 Cleaned ${expiredSubs.length} expired subscriptions`)
        }

        return new Response(
            JSON.stringify({
                sent,
                total: subscriptions.length,
                expired: expiredSubs.length
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Edge function error:', err)
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

/**
 * Genera headers VAPID para autenticación con push service
 */
async function generateVapidHeaders(
    endpoint: string,
    publicKey: string,
    privateKey: string,
    subject: string
): Promise<Record<string, string>> {
    const audience = new URL(endpoint).origin

    // Crear JWT para VAPID
    const header = { alg: 'ES256', typ: 'JWT' }
    const payload = {
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 horas
        sub: subject
    }

    const token = await createES256JWT(header, payload, privateKey)

    return {
        'Authorization': `vapid t=${token}, k=${publicKey}`,
    }
}

/**
 * Crea un JWT firmado con ES256
 */
async function createES256JWT(
    header: object,
    payload: object,
    privateKeyBase64: string
): Promise<string> {
    const enc = new TextEncoder()

    // Encode header y payload
    const headerB64 = base64UrlEncode(JSON.stringify(header))
    const payloadB64 = base64UrlEncode(JSON.stringify(payload))
    const unsignedToken = `${headerB64}.${payloadB64}`

    // Decodificar clave privada
    const keyData = base64ToUint8Array(privateKeyBase64)

    // Importar clave como ECDSA
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    )

    // Firmar
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        enc.encode(unsignedToken)
    )

    const signatureB64 = base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
    )

    return `${unsignedToken}.${signatureB64}`
}

function base64UrlEncode(str: string): string {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

function base64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(b64)
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
