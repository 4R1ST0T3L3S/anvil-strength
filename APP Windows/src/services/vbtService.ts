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
import {
    legacyMetricsToBag, sanitizeMetricBag, type MetricBag,
} from '../lib/vbt/metricRegistry';

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
    /**
     * MÉTRICAS SIN COLUMNA PROPIA.
     *
     * Aquí va todo lo que el analizador sepa medir y no quepa en las siete
     * de `VbtMetrics`: fuerza media, RFD, desviación horizontal de la
     * barra, duración de cada fase… Se guardan en la bolsa JSONB, así que
     * añadir una métrica nueva NO exige tocar este archivo ni migrar nada
     * (ver database/metrics_catalog.sql y src/lib/vbt/metricRegistry.ts).
     *
     * Las siete de `metrics` se mezclan aquí solas: no hay que repetirlas.
     */
    extraMetrics?: Record<string, number | null | undefined>;
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
function metricsToSetRow(
    m: VbtMetrics,
    source: VbtSource,
    fileUrl?: string | null,
    bag?: MetricBag
) {
    const row: Record<string, unknown> = {
        vbt_mean_velocity: round(m.meanVelocity, 3),
        vbt_peak_velocity: round(m.peakVelocity, 3),
        vbt_velocity_loss: round(m.velocityLoss, 2),
        vbt_mean_power: round(m.meanPower, 2),
        vbt_peak_power: round(m.peakPower, 2),
        vbt_rom: round(m.rom, 3),
        vbt_est_1rm: round(m.est1RM, 2),
        vbt_source: source,
        // La bolsa completa, con las siete de arriba y todo lo demás. Las
        // columnas se siguen escribiendo para no romper lo que ya consulta
        // por ellas; lo nuevo se lee de aquí.
        vbt_metrics: bag ?? legacyMetricsToBag(m),
    };
    // Solo se pisa el archivo si viene uno: una medición manual sobre una
    // serie que ya tenía su CSV no debe borrar el CSV.
    if (fileUrl) row.vbt_file_url = fileUrl;
    return row;
}

/**
 * La bolsa definitiva de una medición.
 *
 * Las siete con columna propia y las que no la tienen, en un solo objeto ya
 * saneado (sin NaN, sin valores imposibles, redondeado). El orden importa:
 * lo que venga en `extraMetrics` con una de las siete claves canónicas gana,
 * porque es lo más específico que ha dicho quien llama.
 */
function buildBag(m: VbtMetrics, extra?: Record<string, number | null | undefined>): MetricBag {
    return { ...legacyMetricsToBag(m), ...sanitizeMetricBag(extra ?? {}) };
}

/**
 * Reintento sin la bolsa cuando la columna todavía no existe.
 *
 * PGRST204 es "esa columna no está en el esquema". Es EXACTAMENTE lo que
 * devuelve PostgREST si `database/metrics_catalog.sql` no se ha ejecutado
 * aún, y hace que se rechace el lote entero: sin este reintento, desplegar
 * el código antes que la migración dejaría de guardar TODA medición, no
 * solo las métricas nuevas.
 *
 * El proyecto ya se ha comido este fallo antes (ver la nota de PGRST204 en
 * database/MIGRACION_PENDIENTE.sql). Aquí se degrada en vez de romper.
 */
function isMissingColumn(error: unknown, column: string): boolean {
    const e = (error ?? {}) as { code?: string; message?: string };
    return e.code === 'PGRST204' && Boolean(e.message?.includes(column));
}

/**
 * Copia el resumen de métricas a una serie.
 *
 * Devuelve el error en vez de lanzarlo: quien llama decide si es fatal.
 * Al guardar una medición NO lo es —el dato ya está a salvo en
 * `vbt_measurements`—, y al escribir directamente sobre la serie SÍ.
 */
async function writeSetSummary(
    setId: string,
    metrics: VbtMetrics,
    source: VbtSource,
    fileUrl: string | null | undefined,
    bag: MetricBag
): Promise<unknown | null> {
    const row = metricsToSetRow(metrics, source, fileUrl, bag);

    const { error } = await supabase.from('training_sets').update(row).eq('id', setId);
    if (!error) return null;

    // Sin la columna `vbt_metrics`, PostgREST tumba el UPDATE COMPLETO: la
    // serie se quedaría sin ninguna métrica, ni siquiera las siete de
    // siempre. Se reintenta sin la bolsa.
    if (isMissingColumn(error, 'vbt_metrics')) {
        console.warn(
            'training_sets.vbt_metrics no existe: la serie se actualiza solo con las métricas ' +
            'clásicas. Ejecuta database/metrics_catalog.sql en el editor SQL de Supabase.'
        );
        const { vbt_metrics: _omit, ...legacyRow } = row;
        const retry = await supabase.from('training_sets').update(legacyRow).eq('id', setId);
        return retry.error ?? null;
    }

    return error;
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
        const bag = buildBag(input.metrics, input.extraMetrics);

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
            metrics: bag,
            rep_velocities: input.repVelocities?.length
                ? input.repVelocities.map(v => round(v, 3))
                : null,
            file_url: input.fileUrl ?? null,
            source: input.source,
            notes: input.notes?.trim() || null,
        };

        let { data, error } = await supabase
            .from('vbt_measurements')
            .insert(payload)
            .select()
            .single();

        // Migración sin ejecutar: se guarda igual, con las siete de siempre.
        // Perder la medición entera por no poder guardar las métricas nuevas
        // sería el peor de los dos resultados.
        if (error && isMissingColumn(error, 'metrics')) {
            console.warn(
                'vbt_measurements.metrics no existe: se guarda sin las métricas ampliadas. ' +
                'Ejecuta database/metrics_catalog.sql en el editor SQL de Supabase.'
            );
            const { metrics: _omit, ...legacyPayload } = payload;
            ({ data, error } = await supabase
                .from('vbt_measurements')
                .insert(legacyPayload)
                .select()
                .single());
        }

        if (error) throw explainVbtError(error);

        if (input.trainingSetId) {
            const setError = await writeSetSummary(
                input.trainingSetId, input.metrics, input.source, input.fileUrl, bag
            );
            // No se propaga: la medición ya está guardada y perderla por no
            // poder copiar el resumen sería el peor de los dos resultados.
            if (setError) {
                console.warn(
                    'Medición guardada, pero no se pudo copiar el resumen a la serie:',
                    (setError as { message?: string }).message
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
        fileUrl?: string | null,
        extraMetrics?: Record<string, number | null | undefined>
    ): Promise<void> {
        const error = await writeSetSummary(
            setId, metrics, source, fileUrl, buildBag(metrics, extraMetrics)
        );
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
                vbt_metrics: null,
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

// =====================================================================
// EL ÁRBOL DE PROGRAMACIÓN, PARA ELEGIR SERIE EN CASCADA
// =====================================================================
/**
 * POR QUÉ HAY DOS FORMAS DE ELEGIR SERIE
 *
 * `getAttachableSets` devuelve una LISTA PLANA de las series recientes, y
 * sirve para el caso rápido: el coach acaba de analizar un vídeo de
 * sentadilla y la serie que busca está entre las diez primeras.
 *
 * Esto de aquí devuelve el ÁRBOL: macro → bloque → semana → día →
 * ejercicio → serie. Es lo que hace falta cuando la serie NO es reciente
 * —un vídeo de hace tres semanas, un bloque anterior— o cuando el atleta
 * tiene varios macrociclos abiertos y la lista plana no distingue cuál es
 * cuál. Buscar "la tercera de press del jueves de la semana 2 del bloque de
 * fuerza" en una lista de cuatrocientas series es inviable.
 *
 * Se carga en DOS pasos y no en uno: los bloques de un atleta son media
 * docena, pero traerse las sesiones, ejercicios y series de TODOS ellos de
 * golpe son miles de filas para acabar usando cuatro. El segundo paso solo
 * baja el bloque elegido.
 */

/** Un macrociclo con los bloques que cuelgan de él. */
export interface TrainingTreeMacro {
    id: string | null;
    name: string;
    competitionDate: string | null;
    blocks: TrainingTreeBlock[];
}

export interface TrainingTreeBlock {
    id: string;
    name: string;
    isActive: boolean;
    startWeek: number | null;
    endWeek: number | null;
    createdAt: string;
}

/** Nivel 1: macrociclos y bloques del atleta. Consulta barata. */
export async function getAthleteTrainingTree(athleteId: string): Promise<TrainingTreeMacro[]> {
    const [{ data: macros }, { data: blocks, error }] = await Promise.all([
        supabase
            .from('macrocycles')
            .select('id, name, competition_date')
            .eq('athlete_id', athleteId)
            .order('competition_date', { ascending: false }),
        supabase
            .from('training_blocks')
            .select('id, name, is_active, start_week, end_week, macro_id, created_at')
            .eq('athlete_id', athleteId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: false }),
    ]);

    if (error) throw error;

    type BlockRow = {
        id: string; name: string; is_active: boolean;
        start_week: number | null; end_week: number | null;
        macro_id: string | null; created_at: string;
    };

    const toTreeBlock = (b: BlockRow): TrainingTreeBlock => ({
        id: b.id,
        name: b.name,
        isActive: b.is_active,
        startWeek: b.start_week,
        endWeek: b.end_week,
        createdAt: b.created_at,
    });

    const rows = (blocks ?? []) as BlockRow[];
    const out: TrainingTreeMacro[] = [];

    for (const m of (macros ?? []) as { id: string; name: string; competition_date: string | null }[]) {
        const own = rows.filter(b => b.macro_id === m.id);
        // Un macrociclo sin bloques no se ofrece: sería un callejón sin
        // salida en mitad de la cascada.
        if (own.length === 0) continue;
        out.push({
            id: m.id,
            name: m.name,
            competitionDate: m.competition_date,
            blocks: own.map(toTreeBlock),
        });
    }

    // Los bloques sueltos van juntos al final. No todo bloque pertenece a un
    // macrociclo, y esconderlos los haría inalcanzables desde aquí.
    const orphans = rows.filter(b => !b.macro_id || !out.some(m => m.id === b.macro_id));
    if (orphans.length > 0) {
        out.push({
            id: null,
            name: 'Sin macrociclo',
            competitionDate: null,
            blocks: orphans.map(toTreeBlock),
        });
    }

    return out;
}

/** Un día con sus ejercicios y series, ya ordenados. */
export interface TrainingTreeSession {
    id: string;
    weekNumber: number;
    dayNumber: number;
    name: string | null;
    dayOfWeek: string | null;
    date: string | null;
    exercises: TrainingTreeExercise[];
}

export interface TrainingTreeExercise {
    id: string;
    name: string;
    variantName: string | null;
    exerciseId: string | null;
    sets: TrainingTreeSet[];
}

export interface TrainingTreeSet {
    id: string;
    setNumber: number;
    targetReps: string | null;
    loadKg: number | null;
    reps: number | null;
    /** Ya tiene métricas: se avisa antes de pisarlas. */
    hasMetrics: boolean;
}

/** Nivel 2: todo el contenido de UN bloque. */
export async function getBlockTree(blockId: string): Promise<TrainingTreeSession[]> {
    const { data, error } = await supabase
        .from('training_sessions')
        .select(`
            id, week_number, day_number, name, day_of_week, date,
            session_exercises (
                id, order_index, variant_name,
                exercise:exercise_library (id, name),
                training_sets (
                    id, order_index, target_reps, target_load, target_metric,
                    actual_load, actual_reps, vbt_mean_velocity
                )
            )
        `)
        .eq('block_id', blockId)
        .order('week_number')
        .order('day_number');

    if (error) throw error;

    type Row = {
        id: string; week_number: number; day_number: number;
        name: string | null; day_of_week: string | null; date: string | null;
        session_exercises: {
            id: string; order_index: number; variant_name: string | null;
            exercise: { id: string; name: string } | null;
            training_sets: {
                id: string; order_index: number;
                target_reps: string | null; target_load: number | null;
                target_metric: string | null;
                actual_load: number | null; actual_reps: number | null;
                vbt_mean_velocity: number | null;
            }[];
        }[];
    };

    return ((data as unknown as Row[] | null) ?? []).map(s => ({
        id: s.id,
        weekNumber: s.week_number,
        dayNumber: s.day_number,
        name: s.name,
        dayOfWeek: s.day_of_week,
        date: s.date,
        exercises: [...(s.session_exercises ?? [])]
            .sort((a, b) => a.order_index - b.order_index)
            .map(ex => ({
                id: ex.id,
                name: ex.exercise?.name ?? 'Ejercicio',
                variantName: ex.variant_name,
                exerciseId: ex.exercise?.id ?? null,
                sets: [...(ex.training_sets ?? [])]
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((set, i) => ({
                        id: set.id,
                        setNumber: i + 1,
                        targetReps: set.target_reps,
                        // La carga movida manda sobre la pautada, y solo son
                        // kilos si la prescripción iba en kilos: un objetivo
                        // de 0,45 m/s no son 0,45 kg.
                        loadKg: set.actual_load
                            ?? ((set.target_metric ?? 'kg') === 'kg' ? set.target_load : null),
                        reps: set.actual_reps,
                        hasMetrics: set.vbt_mean_velocity !== null,
                    })),
            })),
    }));
}

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
