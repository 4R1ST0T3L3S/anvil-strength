import { supabase } from '../lib/supabase';
import type { Progression, ProgressionStep } from '../lib/planning/progression';

/**
 * Plantillas de progresión del coach.
 * Ver database/progression_templates.sql.
 */
export const progressionService = {
    async list(coachId: string): Promise<Progression[]> {
        const { data, error } = await supabase
            .from('progression_templates')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data ?? []) as Progression[];
    },

    async save(coachId: string, name: string, steps: ProgressionStep[]): Promise<Progression> {
        const { data, error } = await supabase
            .from('progression_templates')
            .upsert(
                { coach_id: coachId, name: name.trim(), steps },
                // Guardar con un nombre que ya existe SUSTITUYE la progresión.
                // Es lo que espera quien acaba de retocar la suya y vuelve a
                // guardarla: crear un duplicado con el mismo nombre dejaría dos
                // entradas idénticas en la lista y ninguna forma de saber cuál
                // es la buena.
                { onConflict: 'coach_id,name' }
            )
            .select()
            .single();

        if (error) throw error;
        return data as Progression;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('progression_templates')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
