/**
 * TOKENS DE PUSH NATIVO (Firebase Cloud Messaging)
 *
 * La tabla `push_subscriptions` es de Web Push (endpoint + claves) y no sirve
 * para un token de FCM, que es una cadena opaca. Van a `device_push_tokens`
 * (database/PUSH_NATIVO_2026-09-03.sql) y la función `send-push` lee de las
 * dos tablas y manda por el canal que toque.
 *
 * El token se guarda también en local: el plugin solo lo entrega en el evento
 * `registration`, así que para darse de baja hay que recordar cuál era.
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

const CLAVE_LOCAL = 'anvil_push_token_nativo';

export function tokenPushLocal(): string | null {
    try {
        return localStorage.getItem(CLAVE_LOCAL);
    } catch {
        return null;
    }
}

/** Asocia el token del dispositivo al usuario con sesión. `false` si no hay sesión o falla. */
export async function guardarTokenPushNativo(token: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // `onConflict: 'token'`: si otra persona entra en el mismo móvil, el token
    // pasa a ser suyo en vez de duplicarse o de avisar al anterior.
    const { error } = await supabase.from('device_push_tokens').upsert(
        {
            user_id: user.id,
            token,
            platform: Capacitor.getPlatform(),
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
    );

    if (error) {
        console.error('No se pudo guardar el token push:', error);
        return false;
    }

    try {
        localStorage.setItem(CLAVE_LOCAL, token);
    } catch {
        /* modo privado: sin memoria local, pero el token ya está en el servidor */
    }
    return true;
}

/** Borra el token de este dispositivo del servidor y de la memoria local. */
export async function borrarTokenPushNativo(): Promise<void> {
    const token = tokenPushLocal();
    if (token) {
        const { error } = await supabase.from('device_push_tokens').delete().eq('token', token);
        if (error) console.error('No se pudo borrar el token push:', error);
    }
    try {
        localStorage.removeItem(CLAVE_LOCAL);
    } catch {
        /* nada que borrar */
    }
}
