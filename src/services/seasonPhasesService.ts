import { supabase } from '../lib/supabase';
import type { FaseDeTemporada } from '../lib/period/fases';

/**
 * FASES DE TEMPORADA — ACCESO A DATOS
 *
 * La resolución de fechas y el cálculo de "en qué semana estamos" viven en
 * `src/lib/period/fases.ts`, que es puro y comprobable. Aquí solo se lee y
 * se escribe.
 */

export interface NuevaFase {
    coachId: string;
    athleteId: string;
    macroId?: string | null;
    /** 'SQ' | 'BP' | 'DL', o null para toda la temporada. */
    movement?: string | null;
    name: string;
    weeks: number;
    orderIndex: number;
    startDate?: string | null;
    endDate?: string | null;
    color?: string | null;
    icon?: string | null;
    notes?: string | null;
}

function explica(err: unknown): Error {
    const bruto = (err as { message?: string })?.message ?? '';
    if (bruto.includes('does not exist') || bruto.includes('schema cache') || /season_phases/i.test(bruto)) {
        return new Error(
            'Las fases de temporada todavía no están activadas en la base de datos. ' +
            'Ejecuta database/FASES_TEMPORADA_2026-09-07.sql en Supabase.'
        );
    }
    if (bruto.includes('row-level security') || bruto.includes('violates row-level')) {
        return new Error('El servidor ha rechazado el cambio por permisos. ¿Sigues siendo el entrenador de este atleta?');
    }
    if (bruto.includes('violates check constraint')) {
        return new Error('Alguna cifra está fuera de rango: las semanas van de 1 a 52 y el nombre no puede estar vacío.');
    }
    return err instanceof Error ? err : new Error(bruto || 'error desconocido');
}

export const seasonPhasesService = {
    /**
     * Las fases de un atleta, ordenadas.
     *
     * Lista VACÍA —no un error— si la tabla no existe: la pestaña de
     * estadísticas tiene que seguir enseñando el e1RM y la competición
     * aunque nadie haya ejecutado la migración. La sección de fase
     * simplemente no aparece.
     */
    async listForAthlete(athleteId: string): Promise<FaseDeTemporada[]> {
        const { data, error } = await supabase
            .from('season_phases')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('order_index', { ascending: true });

        if (error) {
            if (error.code === 'PGRST205' || /does not exist|schema cache/.test(error.message)) return [];
            throw explica(error);
        }
        return (data ?? []) as FaseDeTemporada[];
    },

    async create(entrada: NuevaFase): Promise<FaseDeTemporada> {
        const { data, error } = await supabase
            .from('season_phases')
            .insert({
                coach_id: entrada.coachId,
                athlete_id: entrada.athleteId,
                macro_id: entrada.macroId ?? null,
                movement: entrada.movement ?? null,
                name: entrada.name.trim(),
                weeks: entrada.weeks,
                order_index: entrada.orderIndex,
                start_date: entrada.startDate ?? null,
                end_date: entrada.endDate ?? null,
                color: entrada.color ?? null,
                icon: entrada.icon ?? null,
                notes: entrada.notes ?? null,
            })
            .select()
            .single();

        if (error) throw explica(error);
        return data as FaseDeTemporada;
    },

    async update(id: string, cambios: Partial<NuevaFase>): Promise<void> {
        // Se traducen solo los campos presentes: un `undefined` en el objeto
        // que va a PostgREST se serializa como null y BORRARÍA el valor.
        const parche: Record<string, unknown> = {};
        if (cambios.name !== undefined) parche.name = cambios.name.trim();
        if (cambios.weeks !== undefined) parche.weeks = cambios.weeks;
        if (cambios.orderIndex !== undefined) parche.order_index = cambios.orderIndex;
        if (cambios.movement !== undefined) parche.movement = cambios.movement;
        if (cambios.startDate !== undefined) parche.start_date = cambios.startDate;
        if (cambios.endDate !== undefined) parche.end_date = cambios.endDate;
        if (cambios.color !== undefined) parche.color = cambios.color;
        if (cambios.icon !== undefined) parche.icon = cambios.icon;
        if (cambios.notes !== undefined) parche.notes = cambios.notes;
        if (cambios.macroId !== undefined) parche.macro_id = cambios.macroId;

        if (Object.keys(parche).length === 0) return;

        const { error } = await supabase.from('season_phases').update(parche).eq('id', id);
        if (error) throw explica(error);
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('season_phases').delete().eq('id', id);
        if (error) throw explica(error);
    },

    /**
     * Reordena una lista entera de golpe.
     *
     * Una llamada por fila y no un upsert masivo: el upsert de PostgREST
     * exige mandar la fila COMPLETA, y aquí solo cambia el orden. Mandar el
     * resto arriesga pisar una edición que otro haya hecho en paralelo.
     */
    async reordenar(ids: readonly string[]): Promise<void> {
        for (let i = 0; i < ids.length; i++) {
            const { error } = await supabase
                .from('season_phases')
                .update({ order_index: i })
                .eq('id', ids[i]);
            if (error) throw explica(error);
        }
    },
};
