/**
 * ANVIL STRENGTH — VBT (ENTRENAMIENTO BASADO EN VELOCIDAD)
 * =====================================================================
 *
 * Tres puertas de entrada a los mismos datos, porque la velocidad se mide de
 * tres formas y ninguna cubre a las otras:
 *
 *   1. Un CSV de encoder subido a una serie del plan.
 *   2. Un vídeo pasado por PWR Análisis, dentro o fuera del plan.
 *   3. A mano, cuando el dato viene de otro dispositivo o de una libreta.
 *
 * Las medidas que SÍ corresponden a una serie programada se escriben en
 * `training_sets` (columnas `vbt_*`) y además dejan una fila en
 * `vbt_measurements`. Duplicar es a propósito:
 *
 *   · en la serie, para que el registro del día enseñe la velocidad junto al
 *     peso y las repeticiones sin una segunda consulta;
 *   · en `vbt_measurements`, porque una serie solo puede guardar UNA medición
 *     y un perfil de cargas son cinco mediciones del mismo ejercicio el
 *     mismo día, muchas veces sin serie programada detrás.
 *
 * Todas las velocidades están en m/s, las potencias en W, el recorrido en
 * metros y las pérdidas en porcentaje. No hay conversión implícita en ningún
 * sitio: si un fichero viene en cm, se convierte AL PARSEARLO.
 */

import { supabase } from '../lib/supabase';
import type { VbtMeasurement, VbtMetrics, VbtSource } from '../types/training';

/** Lo que hace falta para registrar una medición. */
export interface NewMeasurement {
    athleteId: string;
    createdBy?: string | null;
    exerciseName: string;
    exerciseId?: string | null;
    /** Enlace con el plan, si la medición es de una serie programada. */
    trainingSetId?: string | null;
    sessionExerciseId?: string | null;
    performedAt?: string;
    setNumber?: number | null;
    reps?: number | null;
    loadKg?: number | null;
    metrics: VbtMetrics;
    /** Velocidad de cada repetición, en orden. Dibuja la caída de la serie. */
    repVelocities?: number[] | null;
    fileUrl?: string | null;
    source: VbtSource;
    notes?: string | null;
}

/**
 * Error legible cuando la migración no está aplicada.
 *
 * Sin esto, el coach ve "relation public.vbt_measurements does not exist" y no
 * tiene forma de saber que lo que falta es ejecutar un fichero SQL.
 */
function explainVbtError(error: unknown): Error {
    const e = (error ?? {}) as { code?: string; message?: string };

    if (e.code === '42P01' || e.message?.includes('vbt_measurements')) {
        return new Error(
            'La tabla de mediciones VBT no existe todavía. Ejecuta ' +
            'database/MEJORAS_ANALISIS_VBT.sql en el editor SQL de Supabase.'
        );
    }
    if (e.code === 'PGRST204') {
        return new Error(
            'A la base de datos le faltan columnas VBT. Ejecuta ' +
            'database/MEJORAS_ANALISIS_VBT.sql en el editor SQL de Supabase.'
        );
    }
    return error instanceof Error ? error : new Error(e.message ?? 'Error desconocido');
}

/** Redondea a `decimals` sin arrastrar la basura del coma flotante. */
function round(value: number | null | undefined, decimals: number): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** Las métricas, con la precisión que admite cada columna de la base. */
function metricsToRow(m: VbtMetrics) {
    return {
        mean_velocity: round(m.meanVelocity, 3),
        peak_velocity: round(m.peakVelocity, 3),
        velocity_loss: round(m.velocityLoss, 2),
        mean_power: round(m.meanPower, 2),
        peak_power: round(m.peakPower, 2),
        rom: round(m.rom, 3),
        est_1rm: round(m.est1RM, 2),
    };
}

/** Las mismas métricas con el prefijo que usan las columnas de la serie. */
function metricsToSetRow(m: VbtMetrics, source: VbtSource, fileUrl?: string | null) {
    const row: Record<string, unknown> = {
        vbt_mean_velocity: round(m.meanVelocity, 3),
        vbt_peak_velocity: round(m.peakVelocity, 3),
        vbt_velocity_loss: round(m.velocityLoss, 2),
        vbt_mean_power: round(m.meanPower, 2),
        vbt_peak_power: round(m.peakPower, 2),
        vbt_rom: round(m.rom, 3),
        vbt_est_1rm: round(m.est1RM, 2),
        vbt_source: source,
    };
    // Solo se pisa el archivo si viene uno: una medición manual sobre una
    // serie que ya tenía su CSV no debe borrar el CSV.
    if (fileUrl) row.vbt_file_url = fileUrl;
    return row;
}

export const vbtService = {
    /**
     * Guarda una medición.
     *
     * Si viene enlazada a una serie, ADEMÁS escribe el resumen en la propia
     * serie. Las dos escrituras van en este orden: primero la medición —que
     * es el dato— y después el resumen —que es una comodidad—. Si la segunda
     * falla, se avisa pero no se pierde la medición.
     */
    async saveMeasurement(input: NewMeasurement): Promise<VbtMeasurement> {
        const payload = {
            athlete_id: input.athleteId,
            created_by: input.createdBy ?? null,
            exercise_id: input.exerciseId ?? null,
            exercise_name: input.exerciseName.trim(),
            training_set_id: input.trainingSetId ?? null,
            session_exercise_id: input.sessionExerciseId ?? null,
            performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
            set_number: input.setNumber ?? null,
            reps: input.reps ?? null,
            load_kg: input.loadKg ?? null,
            ...metricsToRow(input.metrics),
            rep_velocities: input.repVelocities?.length
                ? input.repVelocities.map(v => round(v, 3))
                : null,
            file_url: input.fileUrl ?? null,
            source: input.source,
            notes: input.notes?.trim() || null,
        };

        const { data, error } = await supabase
            .from('vbt_measurements')
            .insert(payload)
            .select()
            .single();

        if (error) throw explainVbtError(error);

        if (input.trainingSetId) {
            const { error: setError } = await supabase
                .from('training_sets')
                .update(metricsToSetRow(input.metrics, input.source, input.fileUrl))
                .eq('id', input.trainingSetId);

            // No se propaga: la medición ya está guardada y perderla por no
            // poder copiar el resumen sería el peor de los dos resultados.
            if (setError) {
                console.warn(
                    'Medición guardada, pero no se pudo copiar el resumen a la serie:',
                    setError.message
                );
            }
        }

        return data as VbtMeasurement;
    },

    /** Escribe solo el resumen en una serie, sin crear una medición aparte. */
    async attachMetricsToSet(
        setId: string,
        metrics: VbtMetrics,
        source: VbtSource,
        fileUrl?: string | null
    ): Promise<void> {
        const { error } = await supabase
            .from('training_sets')
            .update(metricsToSetRow(metrics, source, fileUrl))
            .eq('id', setId);

        if (error) throw explainVbtError(error);
    },

    /** Borra las métricas VBT de una serie sin tocar nada más. */
    async clearSetMetrics(setId: string): Promise<void> {
        const { error } = await supabase
            .from('training_sets')
            .update({
                vbt_mean_velocity: null,
                vbt_peak_velocity: null,
                vbt_velocity_loss: null,
                vbt_mean_power: null,
                vbt_peak_power: null,
                vbt_rom: null,
                vbt_est_1rm: null,
                vbt_source: null,
            })
            .eq('id', setId);

        if (error) throw explainVbtError(error);
    },

    /**
     * Todas las mediciones de un atleta, de la más reciente a la más antigua.
     *
     * Devuelve `[]` —y no un error— si la tabla todavía no existe: la
     * pestaña VBT tiene que poder abrirse y explicar qué falta, no quedarse
     * en una pantalla de error.
     */
    async getMeasurements(athleteId: string): Promise<VbtMeasurement[]> {
        const { data, error } = await supabase
            .from('vbt_measurements')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('performed_at', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            if ((error as { code?: string }).code === '42P01') {
                console.warn(
                    'vbt_measurements no existe. Ejecuta database/MEJORAS_ANALISIS_VBT.sql.'
                );
                return [];
            }
            throw explainVbtError(error);
        }

        return (data ?? []) as VbtMeasurement[];
    },

    async deleteMeasurement(id: string): Promise<void> {
        const { error } = await supabase.from('vbt_measurements').delete().eq('id', id);
        if (error) throw explainVbtError(error);
    },

    async updateMeasurement(id: string, updates: Partial<VbtMeasurement>): Promise<void> {
        const { error } = await supabase.from('vbt_measurements').update(updates).eq('id', id);
        if (error) throw explainVbtError(error);
    },

    /**
     * Sube un archivo de encoder al almacén y devuelve su URL pública.
     *
     * El nombre lleva el id del atleta por delante para que dos ficheros
     * llamados igual —"export.csv" es lo que exporta media la industria— no
     * se pisen entre atletas.
     */
    async uploadFile(athleteId: string, file: File): Promise<string> {
        const ext = file.name.split('.').pop() ?? 'csv';
        const name = `${athleteId}/${Date.now()}.${ext}`;

        const { error } = await supabase.storage.from('vbt_files').upload(name, file);
        if (error) throw error;

        return supabase.storage.from('vbt_files').getPublicUrl(name).data.publicUrl;
    },

    /**
     * Series del plan a las que se puede enganchar una medición.
     *
     * Devuelve las de los bloques recientes del atleta con su ejercicio, su
     * día y su semana, que es lo mínimo para que el coach pueda decir "esta
     * es la tercera de sentadilla del martes" sin abrir el planificador.
     */
    async getAttachableSets(athleteId: string): Promise<AttachableSet[]> {
        const { data: blocks, error: blocksError } = await supabase
            .from('training_blocks')
            .select('id, name')
            .eq('athlete_id', athleteId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(2);

        if (blocksError) throw blocksError;
        if (!blocks?.length) return [];

        const { data, error } = await supabase
            .from('training_sessions')
            .select(`
                id, block_id, week_number, day_number, name, date,
                session_exercises (
                    id, order_index, variant_name,
                    exercise:exercise_library (id, name),
                    training_sets (id, order_index, target_reps, target_load, target_metric, actual_load, actual_reps)
                )
            `)
            .in('block_id', blocks.map(b => b.id))
            .order('week_number', { ascending: false })
            .order('day_number', { ascending: false });

        if (error) throw error;

        const blockName = new Map(blocks.map(b => [b.id, b.name as string]));

        type Row = {
            id: string; block_id: string; week_number: number; day_number: number;
            name: string | null; date: string | null;
            session_exercises: {
                id: string; order_index: number; variant_name: string | null;
                exercise: { id: string; name: string } | null;
                training_sets: {
                    id: string; order_index: number;
                    target_reps: string | null; target_load: number | null;
                    target_metric: string | null;
                    actual_load: number | null; actual_reps: number | null;
                }[];
            }[];
        };

        const out: AttachableSet[] = [];

        for (const session of ((data as unknown as Row[] | null) ?? [])) {
            for (const ex of [...(session.session_exercises ?? [])].sort((a, b) => a.order_index - b.order_index)) {
                const sets = [...(ex.training_sets ?? [])].sort((a, b) => a.order_index - b.order_index);
                sets.forEach((set, i) => {
                    out.push({
                        setId: set.id,
                        sessionExerciseId: ex.id,
                        exerciseId: ex.exercise?.id ?? null,
                        exerciseName: ex.exercise?.name ?? 'Ejercicio',
                        variantName: ex.variant_name,
                        blockName: blockName.get(session.block_id) ?? 'Bloque',
                        weekNumber: session.week_number,
                        dayNumber: session.day_number,
                        sessionName: session.name,
                        date: session.date,
                        setNumber: i + 1,
                        targetReps: set.target_reps,
                        // La carga que se le asocia a la medición: la movida
                        // manda sobre la pautada, y solo son kilos si la
                        // prescripción iba en kilos.
                        loadKg: set.actual_load
                            ?? ((set.target_metric ?? 'kg') === 'kg' ? set.target_load : null),
                        reps: set.actual_reps,
                    });
                });
            }
        }

        return out;
    },
};

/** Una serie del plan, descrita lo justo para poder elegirla en una lista. */
export interface AttachableSet {
    setId: string;
    sessionExerciseId: string;
    exerciseId: string | null;
    exerciseName: string;
    variantName: string | null;
    blockName: string;
    weekNumber: number;
    dayNumber: number;
    sessionName: string | null;
    date: string | null;
    setNumber: number;
    targetReps: string | null;
    loadKg: number | null;
    reps: number | null;
}
