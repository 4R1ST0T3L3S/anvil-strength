import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — QUÉ AVISOS QUIERE CADA USUARIO
 * =====================================================================
 *
 * Una fila por usuario en `notification_preferences` (JSONB: categoría →
 * sí/no). El filtro de verdad está EN EL SERVIDOR: un disparador descarta los
 * avisos de las categorías apagadas antes de guardarlos, y el push de los
 * mensajes también mira aquí. Así lo que se apaga no llega ni a la campana ni
 * al móvil, esté o no la app abierta.
 *
 * Ausente = sí: quien nunca ha tocado nada lo recibe todo, como hasta ahora.
 */

export type CategoriaAviso =
    | 'message'
    | 'feedback'
    | 'review'
    | 'inbox'
    | 'training'
    | 'competition'
    | 'checkin'
    | 'club'
    | 'system';

export type PreferenciasAvisos = Record<CategoriaAviso, boolean>;

export const PREFERENCIAS_POR_DEFECTO: PreferenciasAvisos = {
    message: true,
    feedback: true,
    review: true,
    inbox: true,
    training: true,
    competition: true,
    checkin: true,
    club: true,
    system: true,
};

export function resolverPreferencias(guardadas: unknown): PreferenciasAvisos {
    const g = (guardadas && typeof guardadas === 'object' ? guardadas : {}) as Partial<Record<string, unknown>>;
    const resultado = { ...PREFERENCIAS_POR_DEFECTO };
    for (const clave of Object.keys(resultado) as CategoriaAviso[]) {
        if (typeof g[clave] === 'boolean') resultado[clave] = g[clave] as boolean;
    }
    return resultado;
}

export const notificationPrefsService = {
    /** `disponible: false` si la tabla aún no existe: los interruptores se enseñan pero no guardan. */
    async get(userId: string): Promise<{ prefs: PreferenciasAvisos; disponible: boolean }> {
        const { data, error } = await supabase
            .from('notification_preferences')
            .select('prefs')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST205' || error.code === '42P01') {
                return { prefs: { ...PREFERENCIAS_POR_DEFECTO }, disponible: false };
            }
            throw error;
        }
        return { prefs: resolverPreferencias(data?.prefs), disponible: true };
    },

    async set(userId: string, prefs: PreferenciasAvisos): Promise<void> {
        const { error } = await supabase
            .from('notification_preferences')
            .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) {
            if (error.code === 'PGRST205' || error.code === '42P01') {
                throw new Error('Los ajustes de avisos estarán disponibles cuando se actualice la base de datos.');
            }
            throw error;
        }
    },
};
