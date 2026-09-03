/**
 * ANVIL STRENGTH — MEJORES MARCAS POR REPETICIONES
 * =====================================================================
 *
 * La puerta a `athlete_rep_maxes`. La lógica de qué marca supera a cuál vive
 * en `src/lib/stats/repMaxes.ts`, que es puro y comprobable; aquí solo se
 * lee y se escribe.
 *
 *
 * DEGRADA CON ELEGANCIA, Y LO DICE
 *
 * `database/CALENDARIO_Y_MARCAS_2026-08-30.sql` es una migración manual: el
 * código se despliega con el push, el SQL no. Entre las dos cosas hay un
 * hueco de horas o de días en el que la tabla no existe.
 *
 * Durante ese hueco, `list()` devuelve lista vacía en vez de reventar, y las
 * escrituras traducen el 42P01 a una instrucción concreta —qué archivo hay
 * que ejecutar— en vez de a "Failed to fetch". Es el mismo patrón de
 * `calibrationService`, y existe porque el fallo contrario ya ha pasado en
 * este proyecto: una pantalla en blanco sin ningún mensaje que explique que
 * falta una migración.
 */

import { supabase } from '../lib/supabase';
import { exerciseKey } from '../lib/planning/blockAnalytics';
import type { RepMax, RepMaxCandidate } from '../lib/stats/repMaxes';

/** La tabla todavía no existe: falta ejecutar la migración. */
const TABLE_MISSING = '42P01';
/** Falta una columna concreta: migración a medias. */
const COLUMN_MISSING = ['PGRST204', '42703'];

const MIGRATION_HINT =
    'Falta ejecutar database/CALENDARIO_Y_MARCAS_2026-08-30.sql en el editor SQL de Supabase.';

function isMissingTable(error: { code?: string } | null): boolean {
    return error?.code === TABLE_MISSING;
}

function explain(error: { code?: string; message?: string } | null): string {
    if (!error) return 'Error desconocido';
    if (isMissingTable(error) || COLUMN_MISSING.includes(error.code ?? '')) {
        return `${MIGRATION_HINT} (${error.code})`;
    }
    return error.message ?? 'Error desconocido';
}

export const repMaxesService = {
    /**
     * Todas las marcas de un atleta.
     *
     * Sin la migración devuelve `[]` y avisa por consola. NO lanza: la
     * pestaña Histórico tiene que poder pintarse y explicar qué falta, no
     * quedarse en un error genérico.
     */
    async list(athleteId: string): Promise<RepMax[]> {
        const { data, error } = await supabase
            .from('athlete_rep_maxes')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('exercise_name', { ascending: true })
            .order('reps', { ascending: true });

        if (error) {
            if (isMissingTable(error)) {
                console.warn(`[athlete_rep_maxes] ${MIGRATION_HINT}`);
                return [];
            }
            throw error;
        }

        return (data ?? []) as RepMax[];
    },

    /**
     * Crea o actualiza la marca de (atleta, ejercicio, repeticiones).
     *
     * `onConflict` sobre las tres columnas porque un atleta tiene UNA marca
     * vigente por ejercicio y número de repeticiones: escribir la nueva
     * sustituye a la anterior en vez de acumular filas que después habría que
     * ordenar por fecha. El histórico de series ya vive en `training_sets`.
     */
    async upsert(input: {
        athleteId: string;
        exerciseName: string;
        reps: number;
        loadKg: number;
        rpe?: number | null;
        meanVelocity?: number | null;
        achievedOn?: string | null;
        source?: 'manual' | 'detected';
        trainingSetId?: string | null;
        notes?: string | null;
    }): Promise<RepMax> {
        const { data, error } = await supabase
            .from('athlete_rep_maxes')
            .upsert(
                {
                    athlete_id: input.athleteId,
                    exercise_key: exerciseKey(input.exerciseName),
                    exercise_name: input.exerciseName.trim(),
                    reps: input.reps,
                    load_kg: input.loadKg,
                    rpe: input.rpe ?? null,
                    mean_velocity: input.meanVelocity ?? null,
                    achieved_on: input.achievedOn ?? null,
                    source: input.source ?? 'manual',
                    training_set_id: input.trainingSetId ?? null,
                    notes: input.notes ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'athlete_id,exercise_key,reps' }
            )
            .select()
            .single();

        if (error) throw new Error(explain(error));
        return data as RepMax;
    },

    /**
     * Confirma una marca detectada en el registro.
     *
     * Es un `upsert` con `source: 'detected'` y el enlace a la serie de la
     * que salió. Existe como método propio y no como una llamada suelta
     * porque el paso de "candidata" a "marca" es una decisión del coach y
     * conviene que se vea en el código quién la toma: la detección propone
     * (ver `detectRepMaxes`), esto es lo que ocurre cuando alguien acepta.
     */
    async confirm(athleteId: string, candidate: RepMaxCandidate): Promise<RepMax> {
        return this.upsert({
            athleteId,
            exerciseName: candidate.exercise_name,
            reps: candidate.reps,
            loadKg: candidate.load_kg,
            rpe: candidate.rpe,
            meanVelocity: candidate.mean_velocity,
            achievedOn: candidate.achieved_on,
            source: 'detected',
            trainingSetId: candidate.training_set_id,
        });
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('athlete_rep_maxes')
            .delete()
            .eq('id', id);

        if (error) throw new Error(explain(error));
    },

    /**
     * ¿Está la migración ejecutada?
     *
     * Una consulta de coste cero (`limit 0`) que solo mira si la tabla
     * responde. La interfaz la usa para decidir si enseña el aviso de
     * migración pendiente o el estado vacío normal — que son dos cosas
     * distintas con salidas distintas: una la arregla quien administra la
     * base, la otra el coach registrando marcas.
     */
    async isAvailable(): Promise<boolean> {
        const { error } = await supabase
            .from('athlete_rep_maxes')
            .select('id')
            .limit(0);

        return !isMissingTable(error);
    },
};
