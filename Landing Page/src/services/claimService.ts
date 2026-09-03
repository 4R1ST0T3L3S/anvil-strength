import { supabase } from '../lib/supabase';

/**
 * RECLAMAR LA FICHA DE UN ATLETA FICTICIO — lado de quien reclama.
 * =====================================================================
 * Sin sesión a propósito: quien abre `/reclamar/<token>` todavía no tiene
 * cuenta abierta —es literalmente lo que este flujo resuelve—, así que
 * estas llamadas no pueden depender de un usuario autenticado. Las dos
 * acciones (`peek_claim`, `claim`) son públicas en la función de borde
 * `athletes`; el token es la única puerta.
 *
 * Ver athletesService.createClaimLink() para el lado del entrenador.
 */

export interface ClaimPreview {
    valid: boolean;
    athleteName: string | null;
    coachName: string | null;
    reason: 'no_existe' | 'usado' | 'caducado' | 'ya_reclamado' | null;
}

async function callAthletesFunction<T>(payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('athletes', { body: payload });
    if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail ?? error.message);
    }
    if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error));
    }
    return data as T;
}

/** Igual que en athletesService: el cuerpo real del fallo, no el genérico de PostgREST/Functions. */
async function readFunctionError(error: unknown): Promise<string | null> {
    const context = (error as { context?: Response })?.context;
    if (!context) return null;
    try {
        const raw = typeof context.text === 'function' ? (await context.text()).trim() : '';
        if (raw.startsWith('{')) {
            const body = JSON.parse(raw) as { error?: unknown };
            if (body.error) return String(body.error);
        }
    } catch {
        // Cuerpo no legible o ya consumido: se sigue con el mensaje genérico.
    }
    return null;
}

export const claimService = {
    async peek(token: string): Promise<ClaimPreview> {
        const raw = await callAthletesFunction<{
            valid: boolean;
            athleteName?: string | null;
            coachName?: string | null;
            reason?: ClaimPreview['reason'];
        }>({ action: 'peek_claim', token });

        return {
            valid: Boolean(raw.valid),
            athleteName: raw.athleteName ?? null,
            coachName: raw.coachName ?? null,
            reason: raw.reason ?? null,
        };
    },

    /**
     * Pone email y contraseña sobre la cuenta latente. Tras esto la cuenta
     * está activa, pero SIN SESIÓN todavía en este navegador: quien llama
     * tiene que iniciar sesión a continuación con esas mismas credenciales
     * (ver ClaimAthletePage.tsx).
     */
    async claim(token: string, email: string, password: string): Promise<{ email: string }> {
        const raw = await callAthletesFunction<{ outcome: string; email: string }>({
            action: 'claim',
            token,
            email: email.trim().toLowerCase(),
            password,
        });
        return { email: raw.email };
    },
};
