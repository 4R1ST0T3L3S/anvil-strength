import { supabase } from '../lib/supabase';
import type { Progression, ProgressionStep } from '../lib/planning/progression';

/**
 * Plantillas de progresión del coach.
 * Ver database/progression_templates.sql y database/PROGRESIONES_2026-08-30.sql.
 *
 * VISIBLE A TODOS LOS ENTRENADORES (B9, 30 ago 2026) — `list()` YA NO
 * filtra por `coach_id`: la RLS de la tabla es la que decide qué se ve
 * (ahora, cualquier sesión autenticada), y filtrar aquí ADEMÁS solo
 * escondería progresiones de otros coaches que el encargo pide mostrar.
 * Crear/editar/borrar SIGUE siendo solo de quien la creó — eso no lo
 * decide esta capa, lo decide la RLS de escritura, que no ha cambiado.
 */

export interface ProgressionWithAuthor extends Progression {
    /** Quién la creó, para que "todos los entrenadores" sepa de quién es cada una. `null` si no se pudo leer el perfil. */
    authorName: string | null;
}

/** Traduce el fallo de la tabla de plantillas a algo accionable. */
function explainStorageError(err: unknown): string {
    const raw = (err as { message?: string })?.message ?? '';

    if (
        raw.includes('does not exist') ||
        raw.includes('PGRST205') ||
        raw.includes('schema cache')
    ) {
        return 'falta la tabla de plantillas. Ejecuta database/MIGRACION_PENDIENTE.sql en Supabase.';
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        return 'el servidor ha rechazado la escritura por permisos. ¿Es tuya esta progresión?';
    }
    return raw || 'error desconocido';
}

export const progressionService = {
    /** TODAS las progresiones visibles — de cualquier entrenador (B9). */
    async list(): Promise<ProgressionWithAuthor[]> {
        const { data, error } = await supabase
            .from('progression_templates')
            .select('*, author:profiles(full_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data ?? []) as unknown as (Progression & { author: { full_name: string | null } | null })[])
            .map(({ author, ...row }) => ({ ...row, authorName: author?.full_name ?? null }));
    },

    async save(
        coachId: string,
        name: string,
        steps: ProgressionStep[],
        options?: { movementName?: string | null; frequency?: number }
    ): Promise<Progression> {
        const { data, error } = await supabase
            .from('progression_templates')
            .upsert(
                {
                    coach_id: coachId,
                    name: name.trim(),
                    steps,
                    movement_name: options?.movementName ?? null,
                    frequency: options?.frequency ?? 1,
                },
                // Guardar con un nombre que ya existe SUSTITUYE la progresión.
                // Es lo que espera quien acaba de retocar la suya y vuelve a
                // guardarla: crear un duplicado con el mismo nombre dejaría dos
                // entradas idénticas en la lista y ninguna forma de saber cuál
                // es la buena.
                { onConflict: 'coach_id,name' }
            )
            .select()
            .single();

        if (error) throw new Error(explainStorageError(error));
        return data as Progression;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('progression_templates')
            .delete()
            .eq('id', id);
        if (error) throw new Error(explainStorageError(error));
    },
};
