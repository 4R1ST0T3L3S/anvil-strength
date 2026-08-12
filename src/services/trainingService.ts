import { supabase } from '../lib/supabase';
import { TrainingBlock, TrainingSession, ExerciseLibrary, SessionExercise, TrainingSet, Macrocycle, DayTemplate, DayTemplateExercise, WeekMeta, Weekday, weekdayIndex, weekdayLabel, countsForVolume } from '../types/training';
import type { ExerciseSection } from '../types/training';
import { getWeekNumber } from '../utils/dateUtils';

/**
 * POR QUÉ NO HAY NADA QUE HACER HOY.
 *
 * "No hay sesión" tenía cuatro causas distintas y la pantalla de inicio las
 * contaba todas igual: "tu entrenador aún no te ha pautado nada". Eso es
 * mentira en tres de los cuatro casos y, en el peor —la semana existe pero el
 * coach todavía no la ha abierto—, hace que el atleta escriba a su entrenador
 * para preguntar por un plan que ya está escrito.
 */
export type NoSessionReason =
    | 'rest'          // hoy toca descansar: la semana está abierta y no hay día
    | 'not-released'  // la semana existe pero el coach aún no la ha publicado
    | 'not-started'   // el bloque empieza más adelante
    | 'finished'      // el bloque ya terminó
    | 'empty';        // el bloque no tiene nada programado

/** Lo que le toca hoy a un atleta, resumido para la pantalla de inicio. */
export interface TodayTraining {
    blockName: string;
    /**
     * Ordinal de la semana DENTRO del bloque, que es como la nombra el atleta
     * ("semana 6"). `training_sessions.week_number` es la semana ISO del AÑO,
     * un número entre 1 y 53 que no significa nada para quien entrena.
     * Null si el bloque no declara `start_week`.
     */
    programWeek: number | null;
    totalWeeks: number | null;
    /** Informado solo cuando `session` es null. */
    reason: NoSessionReason | null;
    session: {
        id: string;
        title: string;
        /** Día dentro de la semana, tal y como lo numeró el coach. */
        dayNumber: number;
        /** "Viernes", o null si el día no está agendado a un día concreto. */
        weekday: string | null;
        completed: boolean;
        hasWarmup: boolean;
        /**
         * Consideraciones del entrenamiento. Viven en la columna `extras`:
         * ver la nota de `TrainingSession.extras` en src/types/training.ts.
         */
        considerations: string | null;
        exerciseNames: string[];
        totalSets: number;
        completedSets: number;
    } | null;
}

/** Fila del historial de un ejercicio para estadísticas de tendencia. */
export interface ExerciseHistoryRow {
    sessionExerciseId: string;
    exerciseId: string;
    exerciseName: string;
    variantName: string | null;
    blockId: string;
    blockName: string;
    /** Macrociclo al que pertenece el bloque. Null si el bloque es suelto. */
    macroId: string | null;
    sessionId: string;
    weekNumber: number;
    dayNumber: number;
    /** Fecha de calendario de la sesión (YYYY-MM-DD), o null si no está fijada. */
    date: string | null;
    rpeGlobal: string | null;
    velocityAvg: string | null;
    /**
     * Clasificación muscular fijada por el coach para ESTA prescripción.
     * Viaja con el historial para que el reparto de volumen de las
     * estadísticas coincida con el que se ve en el planificador; si no, las
     * dos pantallas darían cifras distintas del mismo bloque.
     */
    primaryMuscles: string[] | null;
    secondaryMuscles: string[] | null;
    sets: TrainingSet[];
}

/** Referencia a la última vez que el atleta hizo un ejercicio, en una sesión ya cerrada. */
export interface LastSessionSetReference {
    sessionId: string;
    /** Cuándo cerró esa sesión. De aquí sale el "hace N días". */
    completedAt: string;
    reps: number;
    /** Null en ejercicios corporales, donde no se pauta ni se registra peso. */
    weight: number | null;
    rpe: number | null;
}

/**
 * REGISTRO DE EJECUCIÓN
 * =====================================================================
 * Lo que el atleta HIZO, junto a lo que se le pidió, sin mezclarlos nunca.
 *
 * La prescripción vive en `target_*` y la ejecución en `actual_*`. Son
 * columnas distintas a propósito: si el atleta hace 7-9-9 donde ponía RPE 8,
 * el 8 sigue siendo lo prescrito —el plan no se reescribe solo— y el 7-9-9
 * es el dato con el que se decide la semana siguiente. Fundirlos borraría la
 * única pregunta que importa al revisar un entrenamiento: ¿se ha cumplido?
 */
export interface LoggedSet {
    id: string;
    orderIndex: number;
    /** Lo pautado. */
    targetReps: string | null;
    targetLoad: number | null;
    targetMetric: string | null;
    targetRpe: string | null;
    restSeconds: number | null;
    setType: string | null;
    setDetail: string | null;
    groupTag: string | null;
    /** Lo ejecutado. */
    actualReps: number | null;
    actualLoad: number | null;
    actualRpe: number | null;
    isCompleted: boolean;
    /** Lo que escribió el atleta sobre ESTA serie. */
    notes: string | null;
    videoUrl: string | null;
    vbtFileUrl: string | null;
    vbtMeanVelocity: number | null;
    vbtPeakVelocity: number | null;
    vbtVelocityLoss: number | null;
    vbtEst1RM: number | null;
}

export interface LoggedExercise {
    id: string;
    exerciseId: string;
    name: string;
    variantName: string | null;
    coachNotes: string | null;
    restSeconds: number | null;
    orderIndex: number;
    sets: LoggedSet[];
}

export interface LoggedSession {
    id: string;
    blockId: string;
    blockName: string;
    weekNumber: number;
    dayNumber: number;
    name: string | null;
    dayOfWeek: string | null;
    date: string | null;
    /** Cuándo cerró el día. Null = no lo ha dado por terminado. */
    completedAt: string | null;
    athleteNotes: string | null;
    warmup: string | null;
    extras: string | null;
    exercises: LoggedExercise[];
}

/** Resumen de constancia de un atleta, para la lista del coach. */
export interface AthleteAdherence {
    /** Días del bloque activo cuya fecha ya pasó. */
    dueSessions: number;
    /** De esos, cuántos ha cerrado el atleta. */
    completedSessions: number;
    /** ISO de la última sesión terminada. Null si nunca ha cerrado ninguna. */
    lastCompletedAt: string | null;
}

/**
 * "4x8" → { count: 4, reps: "8" }. Cualquier otra cosa → null.
 *
 * Solo se considera agrupada si el primer factor es un número mayor que uno.
 * "8" son ocho repeticiones en una serie; "AMRAP" o "5-8" no son grupos.
 */
export function parseGroupedReps(
    targetReps: string | null | undefined
): { count: number; reps: string } | null {
    if (!targetReps) return null;
    const [head, ...rest] = targetReps.toLowerCase().split('x');
    if (rest.length === 0) return null;
    const count = Number.parseInt(head.trim(), 10);
    if (!Number.isFinite(count) || count <= 1) return null;
    const reps = rest.join('x').trim();
    return reps ? { count, reps } : null;
}

/**
 * Inserta un lote y, si el servidor se queja de una COLUMNA QUE NO EXISTE,
 * lo reintenta sin las columnas opcionales.
 *
 * POR QUÉ HACE FALTA
 *
 * supabase-js arma el parámetro `columns` de la petición con las CLAVES del
 * objeto, valgan o no undefined. Si la base todavía no tiene aplicada una
 * migración, PostgREST rechaza el INSERT COMPLETO con PGRST204 — no la
 * columna, las cuarenta filas — y copiar una semana falla entera.
 *
 * La alternativa que había era no mandar nunca esas columnas, y eso es lo que
 * hacía que al copiar una semana se perdieran los descansos, el RPE global y
 * las técnicas de intensidad de cada serie. Preferimos mandarlo todo y
 * degradar solo cuando la base de verdad no puede guardarlo.
 */
async function insertWithOptionalColumns<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
    optionalKeys: string[],
    select?: string
): Promise<{ data: Record<string, unknown>[] | null }> {
    const attempt = async (payload: Record<string, unknown>[]) => {
        const query = supabase.from(table).insert(payload);
        return select ? await query.select(select) : await query.select();
    };

    const { data, error } = await attempt(rows);
    if (!error) return { data: data as Record<string, unknown>[] | null };

    const code = (error as { code?: string }).code;
    if (code !== 'PGRST204' && code !== '42703') throw error;

    console.warn(
        `[${table}] la base no admite alguna columna opcional (${error.message}). ` +
        'Se copia sin ella. Ejecuta database/MEJORAS_ANALISIS_VBT.sql para no perder datos.'
    );

    const stripped = rows.map(row => {
        const copy = { ...row } as Record<string, unknown>;
        optionalKeys.forEach(key => { delete copy[key]; });
        return copy;
    });

    const retry = await attempt(stripped);
    if (retry.error) throw retry.error;
    return { data: retry.data as Record<string, unknown>[] | null };
}

export const trainingService = {
    /**
     * Fetch all training blocks for a specific athlete.
     * Ordered by: Active first, then by Creation Date (newest first).
     */
    async getBlocksByAthlete(athleteId: string): Promise<TrainingBlock[]> {
        const { data, error } = await supabase
            .from('training_blocks')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching training blocks:', error);
            throw error;
        }

        return data || [];
    },

    /**
     * Create a new Training Block.
     */
    async createBlock(block: Omit<TrainingBlock, 'id' | 'created_at'>): Promise<TrainingBlock> {
        const { data, error } = await supabase
            .from('training_blocks')
            .insert(block)
            .select() // Return the created record
            .single();

        if (error) {
            console.error('Error creating training block:', error);
            throw error;
        }

        return data;
    },

    async getBlock(blockId: string): Promise<TrainingBlock> {
        const { data, error } = await supabase
            .from('training_blocks')
            .select('*')
            .eq('id', blockId)
            .single();

        if (error) throw error;
        return data;
    },

    async toggleBlockStatus(blockId: string, isActive: boolean): Promise<void> {
        const { error } = await supabase
            .from('training_blocks')
            .update({ is_active: isActive })
            .eq('id', blockId);

        if (error) throw error;
    },

    /**
     * WEEKS METADATA
     */
    /**
     * Metadatos de las semanas de un bloque: nombre y visibilidad.
     *
     * Solo hay fila en `training_weeks` para las semanas que el coach ha
     * tocado. Las que no aparecen son visibles y sin nombre, que es como se
     * ha comportado la app desde siempre — de ahí que el consumidor tenga
     * que tratar la ausencia como "visible", no como "oculta".
     */
    async getWeekMetaByBlock(blockId: string): Promise<Record<number, WeekMeta>> {
        try {
            const { data, error } = await supabase
                .from('training_weeks')
                .select('week_number, name, is_visible')
                .eq('block_id', blockId);

            // La tabla o la columna pueden no estar migradas todavía: los
            // nombres y la visibilidad son accesorios, no motivo para tumbar
            // el constructor entero.
            if (error) return {};

            return (data || []).reduce((acc, curr) => {
                acc[curr.week_number] = {
                    name: curr.name ?? null,
                    isVisible: curr.is_visible ?? true,
                };
                return acc;
            }, {} as Record<number, WeekMeta>);
        } catch {
            return {};
        }
    },

    async saveWeekName(blockId: string, weekNumber: number, name: string): Promise<void> {
        const { error } = await supabase
            .from('training_weeks')
            .upsert({
                block_id: blockId,
                week_number: weekNumber,
                name: name
            }, { onConflict: 'block_id, week_number' });

        if (error) throw error;
    },

    /**
     * Publica u oculta una semana para el atleta.
     *
     * El upsert manda solo `is_visible`, así que un nombre ya guardado
     * sobrevive al cambio. Quien de verdad impide leer una semana oculta es
     * la RLS (`week_is_released()`), no esta llamada.
     */
    async setWeekVisibility(blockId: string, weekNumber: number, isVisible: boolean): Promise<void> {
        const { error } = await supabase
            .from('training_weeks')
            .upsert({
                block_id: blockId,
                week_number: weekNumber,
                is_visible: isVisible
            }, { onConflict: 'block_id, week_number' });

        if (error) throw error;
    },

    /** Agenda (o desagenda, con null) una sesión en un día concreto de la semana. */
    async setSessionDayOfWeek(sessionId: string, dayOfWeek: Weekday | null): Promise<void> {
        const { error } = await supabase
            .from('training_sessions')
            .update({ day_of_week: dayOfWeek })
            .eq('id', sessionId);

        if (error) throw error;
    },

    /**
     * Guarda el calentamiento o los extras de un día.
     *
     * Las dos columnas llegaron con database/session_warmup_extras.sql. Si esa
     * migración todavía no está aplicada contra la base, PostgREST responde
     * PGRST204 ("column not found"). Eso NO puede tumbar el editor: el resto
     * del día se sigue pudiendo programar sin apéndices, así que se traduce a
     * un error con instrucciones en vez de propagar el código críptico.
     */
    async setSessionAppendix(
        sessionId: string,
        updates: { warmup?: string | null; extras?: string | null }
    ): Promise<void> {
        const { error } = await supabase
            .from('training_sessions')
            .update(updates)
            .eq('id', sessionId);

        if (!error) return;

        if ((error as { code?: string }).code === 'PGRST204') {
            throw new Error(
                'Faltan las columnas de calentamiento y extras. Ejecuta ' +
                'database/session_warmup_extras.sql contra la base de datos.'
            );
        }

        throw error;
    },

    async updateBlock(blockId: string, updates: Partial<TrainingBlock>): Promise<TrainingBlock> {
        const { data, error } = await supabase
            .from('training_blocks')
            .update(updates)
            .eq('id', blockId)
            .select()
            .single();

        if (error) {
            console.error('Error updating training block:', error);
            throw error;
        }

        return data;
    },

    async deleteBlock(blockId: string): Promise<void> {
        const { error } = await supabase
            .from('training_blocks')
            .delete()
            .eq('id', blockId);

        if (error) throw error;
    },

    /**
     * El entrenamiento que le toca HOY a un atleta, resumido.
     *
     * Lo usa la pantalla de inicio, que hasta ahora solo tenía un botón de
     * "Entrenar" sin decir a qué. Un atleta que abre la aplicación quiere saber
     * qué le ha puesto su entrenador para hoy; tener que entrar en otra
     * pantalla para averiguarlo es la fricción que hace que la gente deje de
     * abrir la app.
     *
     * Solo devuelve lo que la RLS deja ver, que es justo lo que el coach ha
     * publicado: las semanas ocultas o todavía sin abrir no llegan hasta aquí.
     */
    async getTodayForAthlete(athleteId: string): Promise<TodayTraining | null> {
        const blocks = await this.getBlocksByAthlete(athleteId);
        const block = blocks.find(b => b.is_active);
        if (!block) return null;

        const week = getWeekNumber();

        // La semana del bloque, que es como la nombra el atleta. Un bloque sin
        // `start_week` es anterior a que existieran: se deja en null y la
        // pantalla no promete un ordinal que no puede calcular.
        const programWeek = block.start_week ? week - block.start_week + 1 : null;
        const totalWeeks = block.start_week && block.end_week
            ? block.end_week - block.start_week + 1
            : null;

        const { data, error } = await supabase
            .from('training_sessions')
            .select(`
                id, name, day_number, day_of_week, date, completed_at, warmup, extras, week_number,
                session_exercises (
                    id, order_index,
                    exercise:exercise_library (name),
                    training_sets (id, target_reps, target_load, target_metric, target_rpe, is_completed)
                )
            `)
            .eq('block_id', block.id)
            .eq('week_number', week);

        // Un fallo aquí no puede tumbar el inicio: es un resumen, no el
        // entrenamiento en sí. La pantalla de "Entrenar" sigue siendo la
        // fuente de verdad.
        if (error) {
            console.warn('No se pudo leer el entrenamiento de hoy:', error.message);
            return null;
        }

        type Row = {
            id: string; name: string | null; day_number: number;
            day_of_week: string | null; date: string | null;
            completed_at: string | null; warmup: string | null; extras: string | null;
            session_exercises: {
                id: string; order_index: number;
                exercise: { name: string } | null;
                training_sets: { is_completed?: boolean | null }[];
            }[];
        };

        const sessions = (data as unknown as Row[] | null) ?? [];

        /**
         * Sin filas para la semana en curso hay que decir POR QUÉ.
         *
         * La consulta devuelve lo que la RLS deja ver, así que cero filas
         * puede significar cosas muy distintas: que el bloque aún no ha
         * empezado, que ya terminó, o —el caso que más confunde— que la semana
         * está escrita pero el coach todavía no la ha abierto. Todas se
         * contaban como "no te han pautado nada", que es lo único que NO era.
         */
        if (sessions.length === 0) {
            const reason: NoSessionReason =
                block.start_week && week < block.start_week ? 'not-started'
                    : block.end_week && week > block.end_week ? 'finished'
                        : block.start_week ? 'not-released'
                            : 'empty';

            return {
                blockName: block.name,
                programWeek,
                totalWeeks,
                reason,
                session: null,
            };
        }

        // Hoy es, por este orden: la sesión con la fecha exacta de hoy, o la
        // agendada en este día de la semana. Si no hay ninguna, hoy toca
        // descansar — y eso también es una respuesta que hay que dar.
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayIndex = now.getDay() || 7;

        const session =
            sessions.find(s => s.date === todayStr)
            ?? sessions.find(s => weekdayIndex(s.day_of_week) === todayIndex)
            ?? null;

        if (!session) {
            return {
                blockName: block.name,
                programWeek,
                totalWeeks,
                reason: 'rest',
                session: null,
            };
        }

        const exercises = [...(session.session_exercises ?? [])]
            .sort((a, b) => a.order_index - b.order_index);

        const allSets = exercises.flatMap(e => e.training_sets ?? []);

        return {
            blockName: block.name,
            programWeek,
            totalWeeks,
            reason: null,
            session: {
                id: session.id,
                title: session.name || weekdayLabel(session.day_of_week) || `Día ${session.day_number}`,
                dayNumber: session.day_number,
                weekday: weekdayLabel(session.day_of_week),
                completed: Boolean(session.completed_at),
                hasWarmup: Boolean(session.warmup?.trim()),
                considerations: session.extras?.trim() || null,
                exerciseNames: exercises.map(e => e.exercise?.name ?? 'Ejercicio'),
                totalSets: allSets.length,
                completedSets: allSets.filter(s => s.is_completed).length,
            },
        };
    },

    /**
     * REGISTRO DE EJECUCIÓN de un atleta: qué se le pidió y qué hizo.
     *
     * POR QUÉ NO VALÍA `getExerciseHistoryByAthlete`
     *
     * Aquella devuelve filas de EJERCICIO sueltas, sin el día al que
     * pertenecen ni las notas del atleta ni la hora de cierre. Sirve para una
     * gráfica de progresión, pero no para la pregunta que se hace un
     * entrenador el martes por la mañana: "¿cómo le fue ayer?". Eso necesita
     * la SESIÓN entera, en orden, con lo prescrito y lo ejecutado uno al lado
     * del otro.
     *
     * Se limita a los últimos bloques por la misma razón que el historial: un
     * año de registro son decenas de miles de filas y el servidor corta la
     * consulta por tiempo. Con dos bloques se cubre el mesociclo en curso y
     * el anterior, que es el horizonte con el que se toman decisiones.
     */
    async getExecutionLog(
        athleteId: string,
        options?: { blockIds?: string[]; blockLimit?: number }
    ): Promise<LoggedSession[]> {
        let blockIds = options?.blockIds ?? null;
        const blockNames = new Map<string, string>();

        if (!blockIds) {
            const { data: blocks, error: blocksError } = await supabase
                .from('training_blocks')
                .select('id, name')
                .eq('athlete_id', athleteId)
                .order('is_active', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(options?.blockLimit ?? 2);

            if (blocksError) throw blocksError;
            if (!blocks || blocks.length === 0) return [];

            blockIds = blocks.map(b => b.id);
            blocks.forEach(b => blockNames.set(b.id, b.name));
        } else {
            const { data: blocks } = await supabase
                .from('training_blocks')
                .select('id, name')
                .in('id', blockIds);
            (blocks ?? []).forEach(b => blockNames.set(b.id, b.name));
        }

        if (blockIds.length === 0) return [];

        const { data, error } = await supabase
            .from('training_sessions')
            .select(`
                id, block_id, week_number, day_number, name, date, day_of_week,
                completed_at, athlete_notes, warmup, extras,
                session_exercises (
                    id, exercise_id, order_index, notes, variant_name, rest_seconds, section,
                    exercise:exercise_library (name),
                    training_sets (*)
                )
            `)
            .in('block_id', blockIds)
            .order('week_number', { ascending: true })
            .order('day_number', { ascending: true });

        if (error) throw error;

        type Row = {
            id: string; block_id: string; week_number: number; day_number: number;
            name: string | null; date: string | null; day_of_week: string | null;
            completed_at: string | null; athlete_notes: string | null;
            warmup: string | null; extras: string | null;
            session_exercises: {
                id: string; exercise_id: string; order_index: number;
                notes: string | null; variant_name: string | null;
                rest_seconds: number | null;
                section: string | null;
                exercise: { name: string } | null;
                training_sets: TrainingSet[];
            }[];
        };

        return ((data as unknown as Row[] | null) ?? []).map(session => ({
            id: session.id,
            blockId: session.block_id,
            blockName: blockNames.get(session.block_id) ?? 'Bloque',
            weekNumber: session.week_number,
            dayNumber: session.day_number,
            name: session.name,
            dayOfWeek: session.day_of_week,
            date: session.date,
            completedAt: session.completed_at,
            athleteNotes: session.athlete_notes,
            warmup: session.warmup,
            extras: session.extras,
            exercises: [...(session.session_exercises ?? [])]
                // Fuera el calentamiento: de este registro salen el
                // cumplimiento, el tonelaje y la comparación de RPE pautado
                // contra real. Las aproximaciones no son series que cumplir —
                // ni el atleta las registra ni el entrenador las revisa.
                .filter(ex => countsForVolume(ex.section))
                .sort((a, b) => a.order_index - b.order_index)
                .map(ex => ({
                    id: ex.id,
                    exerciseId: ex.exercise_id,
                    // La RLS puede filtrar el join a la biblioteca sin dar
                    // error: el ejercicio llega como null y no por eso hay que
                    // esconder las series que el atleta sí registró.
                    name: ex.exercise?.name ?? 'Ejercicio',
                    variantName: ex.variant_name,
                    coachNotes: ex.notes,
                    restSeconds: ex.rest_seconds,
                    orderIndex: ex.order_index,
                    sets: [...(ex.training_sets ?? [])]
                        .sort((a, b) => a.order_index - b.order_index)
                        .map(set => ({
                            id: set.id,
                            orderIndex: set.order_index,
                            targetReps: set.target_reps ?? null,
                            targetLoad: set.target_load ?? null,
                            targetMetric: set.target_metric ?? null,
                            targetRpe: set.target_rpe ?? null,
                            restSeconds: set.rest_seconds ?? null,
                            setType: set.set_type ?? null,
                            setDetail: set.set_detail ?? null,
                            groupTag: set.group_tag ?? null,
                            actualReps: set.actual_reps ?? null,
                            actualLoad: set.actual_load ?? null,
                            actualRpe: set.actual_rpe ?? null,
                            // "Hecha" es la columna, no una deducción. Las
                            // filas antiguas no la tienen: ahí sí hay que
                            // deducirla de lo registrado o darían todas por
                            // pendientes.
                            isCompleted: set.is_completed
                                ?? Boolean(set.actual_reps || set.actual_load),
                            notes: set.notes ?? null,
                            videoUrl: set.video_url ?? null,
                            vbtFileUrl: set.vbt_file_url ?? null,
                            vbtMeanVelocity: set.vbt_mean_velocity ?? null,
                            vbtPeakVelocity: set.vbt_peak_velocity ?? null,
                            vbtVelocityLoss: set.vbt_velocity_loss ?? null,
                            vbtEst1RM: set.vbt_est_1rm ?? null,
                        })),
                })),
        }));
    },

    /**
     * SESSIONS
     */
    async getSessionsByBlock(blockId: string): Promise<TrainingSession[]> {
        const { data, error } = await supabase
            .from('training_sessions')
            .select('*')
            .eq('block_id', blockId)
            .order('day_number', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    async createSession(session: Omit<TrainingSession, 'id' | 'created_at'>): Promise<TrainingSession> {
        const { data, error } = await supabase
            .from('training_sessions')
            .insert(session)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Crea varias sesiones de una vez.
     *
     * "Días por semana" creaba hasta 40 sesiones con un `await` por cada una,
     * en serie. Con la latencia normal contra Supabase eso son varios segundos
     * mirando un spinner para una decisión que se toma una sola vez al empezar
     * el bloque.
     */
    async createSessions(sessions: Omit<TrainingSession, 'id' | 'created_at'>[]): Promise<TrainingSession[]> {
        if (sessions.length === 0) return [];

        const { data, error } = await supabase
            .from('training_sessions')
            .insert(sessions)
            .select();

        if (error) throw error;
        return data || [];
    },

    async deleteSession(sessionId: string): Promise<void> {
        const { error } = await supabase
            .from('training_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) throw error;
    },

    /**
     * EXERCISES
     */
    async getExerciseLibrary(): Promise<ExerciseLibrary[]> {
        const { data, error } = await supabase
            .from('exercise_library')
            .select('*')
            .order('name');

        if (error) throw error;
        return data || [];
    },

    async createExercise(exercise: Omit<ExerciseLibrary, 'id' | 'created_at'>): Promise<ExerciseLibrary> {
        const { data, error } = await supabase
            .from('exercise_library')
            .insert(exercise)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Enlace de vídeo de un ejercicio de la BIBLIOTECA.
     *
     * `exercise_library.video_url` existía desde el esquema original, el
     * constructor pintaba un icono cuando estaba informada y el registro la
     * traía en la consulta — pero NINGUNA pantalla la dejaba escribir. Era una
     * columna que solo se podía rellenar a mano desde el editor SQL.
     *
     * Afecta a TODOS los atletas que tengan ese ejercicio, porque es la ficha
     * del movimiento y no de una prescripción. Cuando el vídeo es para un
     * atleta concreto o refleja la técnica preferida de un coach, eso ya tiene
     * su sitio: `exercise_videos` (ver database/exercise_videos.sql), que gana
     * sobre este enlace.
     */
    async setExerciseVideoUrl(exerciseId: string, videoUrl: string | null): Promise<void> {
        const url = videoUrl?.trim() || null;

        const { error } = await supabase
            .from('exercise_library')
            .update({ video_url: url })
            .eq('id', exerciseId);

        if (error) throw error;
    },

    async getSessionExercises(sessionId: string): Promise<SessionExercise[]> {
        const { data, error } = await supabase
            .from('session_exercises')
            .select(`
                *,
                exercise:exercise_library(*)
            `)
            .eq('session_id', sessionId)
            .order('order_index');

        if (error) throw error;
        return data || [];
    },

    /**
     * `section` solo viaja cuando NO es 'main'.
     *
     * Es lo que permite desplegar esto antes de ejecutar
     * database/CALENTAMIENTO_ESTRUCTURADO.sql: supabase-js arma el parámetro
     * `columns` con las CLAVES del objeto, así que mandar `section: 'main'`
     * contra una base sin la columna haría que PostgREST rechazara el INSERT
     * entero con PGRST204 — y añadir un ejercicio dejaría de funcionar para
     * todo el mundo. Omitirla da exactamente el mismo resultado, porque el
     * valor por defecto de la columna ES 'main'.
     */
    async addSessionExercise(
        sessionId: string,
        exerciseId: string,
        orderIndex: number,
        section: ExerciseSection = 'main'
    ): Promise<SessionExercise> {
        const { data, error } = await supabase
            .from('session_exercises')
            .insert({
                session_id: sessionId,
                exercise_id: exerciseId,
                order_index: orderIndex,
                ...(section !== 'main' ? { section } : {}),
            })
            .select(`
                *,
                exercise:exercise_library(*)
            `)
            .single();

        if (error) {
            if (section !== 'main' && (error as { code?: string }).code === 'PGRST204') {
                throw new Error(
                    'La base de datos todavía no distingue secciones del día. Ejecuta ' +
                    'database/CALENTAMIENTO_ESTRUCTURADO.sql para poder programar el ' +
                    'calentamiento con ejercicios.'
                );
            }
            throw error;
        }
        return data;
    },

    /**
     * Materializa un calentamiento estructurado a partir de una propuesta.
     *
     * Se llama SOLO cuando el entrenador ha confirmado lo que ha visto: la
     * conversión del texto libre nunca se aplica sola (ver
     * src/lib/planning/warmupParser.ts).
     *
     * El texto original NO se toca aquí. Borrarlo sería la única parte
     * irreversible de la operación, y no tiene por qué ir en el mismo gesto:
     * el entrenador compara las dos versiones en la vista previa y quita el
     * texto cuando le convence.
     */
    async createWarmupExercises(
        sessionId: string,
        coachId: string,
        items: {
            name: string;
            notes: string | null;
            groupTag: string | null;
            rounds: number | null;
            sets: { reps: string; load: number | null }[];
        }[],
        startOrder: number
    ): Promise<void> {
        if (items.length === 0) return;

        for (const [i, item] of items.entries()) {
            // Reutiliza la biblioteca: si el ejercicio ya existe se enlaza, y
            // si no se crea. Es lo que hace que un "Band pull apart" convertido
            // hoy comparta ficha —y vídeo— con el que se pautó a mano ayer.
            const exerciseId = await this.findOrCreateExercise(item.name, coachId);

            const exercise = await this.addSessionExercise(
                sessionId,
                exerciseId,
                startOrder + i,
                'warmup'
            );

            const updates: Partial<SessionExercise> = {};
            if (item.notes) updates.notes = item.notes;
            if (item.rounds) updates.round_count = item.rounds;
            if (Object.keys(updates).length > 0) {
                await this.updateSessionExercise(exercise.id, updates);
            }

            if (item.sets.length === 0) continue;

            await this.addSets(item.sets.map((set, j) => ({
                session_exercise_id: exercise.id,
                order_index: j,
                target_reps: set.reps,
                target_load: set.load,
                target_metric: 'kg' as const,
                is_video_required: false,
                // La etiqueta del circuito vive en las SERIES, igual que en las
                // superseries del trabajo principal: es lo que hace que la
                // pantalla del atleta sepa con qué se encadena cada ejercicio.
                ...(item.groupTag ? { group_tag: item.groupTag } : {}),
            })));
        }
    },

    async updateSessionExercise(id: string, updates: Partial<SessionExercise>): Promise<void> {
        const { error } = await supabase
            .from('session_exercises')
            .update(updates)
            .eq('id', id);

        if (!error) return;

        // Mismo caso que arriba: sin la migración, `section` y `round_count`
        // no existen. Se traduce a un mensaje con instrucciones en vez de
        // propagar un código que no dice qué hacer.
        if (
            (error as { code?: string }).code === 'PGRST204' &&
            ('section' in updates || 'round_count' in updates)
        ) {
            throw new Error(
                'La base de datos todavía no distingue secciones del día. Ejecuta ' +
                'database/CALENTAMIENTO_ESTRUCTURADO.sql.'
            );
        }

        throw error;
    },

    /**
     * Fija qué músculos cuentan como DIRECTOS y cuáles como INDIRECTOS en
     * esta prescripción concreta.
     *
     * `null` en los dos borra la anulación y devuelve el ejercicio a la
     * clasificación heredada (biblioteca → reglas por patrón). Es importante
     * poder volver: una anulación equivocada que no se pueda quitar es peor
     * que no tener anulación.
     */
    async setExerciseMuscles(
        sessionExerciseId: string,
        primary: string[] | null,
        secondary: string[] | null
    ): Promise<void> {
        const { error } = await supabase
            .from('session_exercises')
            .update({ primary_muscles: primary, secondary_muscles: secondary })
            .eq('id', sessionExerciseId);

        if (!error) return;

        if ((error as { code?: string }).code === 'PGRST204') {
            throw new Error(
                'La base de datos todavía no tiene las columnas de músculos por ' +
                'prescripción. Ejecuta database/MEJORAS_ANALISIS_VBT.sql.'
            );
        }

        throw error;
    },

    async getVbtExercisesByAthlete(athleteId: string): Promise<(SessionExercise & { session: TrainingSession; block: TrainingBlock })[]> {
        // We need session_exercises joined with exercise_library, training_sessions, and training_blocks
        // to filter by athlete_id and only where vbt_file_url is not null.
        const { data, error } = await supabase
            .from('session_exercises')
            .select(`
                *,
                exercise:exercise_library(*),
                session:training_sessions!inner(
                    *,
                    block:training_blocks!inner(*)
                )
            `)
            .not('vbt_file_url', 'is', null)
            .eq('session.block.athlete_id', athleteId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Transform Supabase nested object structure to match the expected return type
        return (data || []).map((row: SessionExercise & { session: TrainingSession & { block: TrainingBlock } }) => ({
            ...row,
            session: {
                ...row.session,
                block: row.session.block
            },
            block: row.session.block
        }));
    },

    /**
     * SETS
     */
    async getSetsByExercise(sessionExerciseId: string): Promise<TrainingSet[]> {
        const { data, error } = await supabase
            .from('training_sets')
            .select('*')
            .eq('session_exercise_id', sessionExerciseId)
            .order('order_index');

        if (error) throw error;
        return data || [];
    },

    async addSet(set: Partial<TrainingSet>): Promise<TrainingSet> {
        const { data, error } = await supabase
            .from('training_sets')
            .insert(set)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async addSets(sets: Partial<TrainingSet>[]): Promise<TrainingSet[]> {
        const { data, error } = await supabase
            .from('training_sets')
            .insert(sets)
            .select();

        if (error) throw error;
        return data || [];
    },

    async updateSet(setId: string, updates: Partial<TrainingSet>): Promise<TrainingSet> {
        const { data, error } = await supabase
            .from('training_sets')
            .update(updates)
            .eq('id', setId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateSetActuals(setId: string, actuals: Partial<TrainingSet>): Promise<void> {
        // This is wrapper around updateSet but semantically for athletes
        const { error } = await supabase
            .from('training_sets')
            .update(actuals)
            .eq('id', setId);

        if (error) throw error;
    },

    /**
     * Convierte una serie AGRUPADA ("4x8") en cuatro filas reales de 8.
     *
     * POR QUÉ HACE FALTA
     *
     * El coach programa "4x8" como UNA fila de `training_sets`, y el registro
     * la pintaba como cuatro renglones para que el atleta los fuese marcando.
     * Pero los cuatro renglones compartían el mismo `id`: registrar la serie
     * 3 machacaba lo escrito en la 1. Mientras la única columna editable era
     * el peso apenas se notaba —solían coincidir—, pero en cuanto el atleta
     * puede anotar las repeticiones REALES el problema es evidente: un 4x8
     * donde se hacen 8, 8, 7 y 6 no se puede representar con una fila.
     *
     * CUÁNDO SE EJECUTA
     *
     * En el primer cambio que el atleta hace sobre una serie agrupada, no al
     * cargar la pantalla. Un bloque programado y no empezado no se toca, y
     * quien no llega a registrar nada no genera escrituras.
     *
     * POR QUÉ ES UNA FUNCIÓN DEL SERVIDOR Y NO TRES PETICIONES DESDE AQUÍ
     *
     * Porque desde aquí NO SE PUEDE, y ese era el fallo: separar el grupo
     * exige reescribir `target_reps` de la fila original —lo prohíbe el
     * trigger `protect_target_fields()`— e INSERTAR filas nuevas en
     * `training_sets`, donde el atleta solo tiene SELECT y UPDATE. Las tres
     * peticiones que había aquí fallaban SIEMPRE para el atleta, los cuatro
     * renglones del "4x8" se quedaban apuntando al mismo id y solo
     * sobrevivía la última serie registrada.
     *
     * `expand_grouped_set` (database/expand_grouped_set.sql) hace lo mismo
     * en una sola transacción, comprobando que quien llama es el atleta o el
     * coach de ese bloque. Ver ese archivo para el detalle.
     *
     * Devuelve las series del ejercicio ordenadas por `order_index`, hubiera
     * o no algo que separar: quien llama resuelve por posición qué fila le
     * toca a cada renglón. `null` solo si el ejercicio se quedó sin series.
     */
    async expandGroupedSet(setId: string): Promise<TrainingSet[] | null> {
        const { data, error } = await supabase.rpc('expand_grouped_set', { p_set_id: setId });

        if (error) {
            // PGRST202 = la función no existe todavía en esta base. Es un
            // despliegue a medias, no un error del usuario: se dice qué falta
            // en vez de dejar un "failed to fetch" en la consola.
            if ((error as { code?: string }).code === 'PGRST202') {
                throw new Error(
                    'Falta la migración database/expand_grouped_set.sql en la base de datos.'
                );
            }
            throw error;
        }

        const refreshed = (data ?? []) as TrainingSet[];
        return refreshed.length > 0 ? refreshed : null;
    },

    /**
     * Marca (o desmarca) un día como terminado.
     *
     * Es una marca de TIEMPO, no un booleano: "cuándo" responde a preguntas
     * que "sí/no" no puede —a qué hora entrena, si entrena el día que le
     * toca, cuántos días lleva sin aparecer— y el booleano se deriva de ella.
     */
    /**
     * Copia un bloque entero —semanas, días, ejercicios y series— a uno o
     * varios atletas más.
     *
     * POR QUÉ
     *
     * Un club programa por grupos: los seis atletas de nivel iniciación
     * hacen el mismo bloque con distintas cargas. Sin esto, el coach lo
     * construye seis veces desde cero, y construir un mesociclo de cuatro
     * semanas son unos cuarenta minutos. Es, con diferencia, la tarea que
     * más tiempo le come.
     *
     * QUÉ SE COPIA Y QUÉ NO
     *
     * Se copia la PRESCRIPCIÓN: días, ejercicios, series, objetivos, notas
     * del coach y descansos. NO se copia nada de la ejecución (`actual_*`,
     * `is_completed`, vídeos, archivos VBT): eso pertenece al atleta que lo
     * hizo, y aparecer en el plan de otro sería sencillamente falso.
     *
     * El bloque nuevo nace INACTIVO. Activar seis bloques de golpe le
     * cambiaría el entrenamiento a seis personas sin que el coach haya
     * revisado las cargas de ninguna.
     *
     * Devuelve cuántos se han creado y a quién ha fallado, en vez de tirar
     * al primer error: que un atleta falle no es razón para dejar a los
     * otros cinco sin bloque.
     */
    async duplicateBlockToAthletes(
        blockId: string,
        athleteIds: string[],
        options?: { nameSuffix?: string }
    ): Promise<{ created: string[]; failed: string[] }> {
        const source = await this.getBlock(blockId);

        const { data: sessions, error: sessionsError } = await supabase
            .from('training_sessions')
            .select(`
                *,
                session_exercises (
                    *,
                    training_sets (*)
                )
            `)
            .eq('block_id', blockId)
            .order('day_number', { ascending: true });

        if (sessionsError) throw sessionsError;

        const created: string[] = [];
        const failed: string[] = [];

        for (const athleteId of athleteIds) {
            try {
                const { data: newBlock, error: blockError } = await supabase
                    .from('training_blocks')
                    .insert({
                        coach_id: source.coach_id,
                        athlete_id: athleteId,
                        name: options?.nameSuffix ? `${source.name} ${options.nameSuffix}` : source.name,
                        start_date: source.start_date,
                        end_date: source.end_date,
                        start_week: source.start_week,
                        end_week: source.end_week,
                        color: source.color,
                        description: source.description,
                        objectives: source.objectives,
                        release_offset_days: source.release_offset_days,
                        is_active: false,
                    })
                    .select()
                    .single();

                if (blockError) throw blockError;

                for (const session of sessions ?? []) {
                    const { data: newSession, error: sessionError } = await supabase
                        .from('training_sessions')
                        .insert({
                            block_id: newBlock.id,
                            week_number: session.week_number,
                            day_number: session.day_number,
                            name: session.name,
                            date: session.date,
                            day_of_week: session.day_of_week,
                        })
                        .select()
                        .single();

                    if (sessionError) throw sessionError;

                    for (const exercise of session.session_exercises ?? []) {
                        const { data: newExercise, error: exerciseError } = await supabase
                            .from('session_exercises')
                            .insert({
                                session_id: newSession.id,
                                exercise_id: exercise.exercise_id,
                                order_index: exercise.order_index,
                                notes: exercise.notes,
                                variant_name: exercise.variant_name,
                                rpe: exercise.rpe,
                                velocity_avg: exercise.velocity_avg,
                                rest_seconds: exercise.rest_seconds,
                                modifiers: exercise.modifiers,
                                primary_muscles: exercise.primary_muscles,
                                secondary_muscles: exercise.secondary_muscles,
                                // Igual que al copiar una semana: sin esto el
                                // calentamiento del bloque original llegaría al
                                // atleta nuevo como trabajo principal.
                                //
                                // Solo se manda cuando NO es 'main', para que
                                // duplicar un bloque siga funcionando contra
                                // una base sin CALENTAMIENTO_ESTRUCTURADO.sql
                                // aplicado — un PGRST204 aquí abortaría la copia
                                // del atleta entero.
                                ...(exercise.section && exercise.section !== 'main'
                                    ? { section: exercise.section, round_count: exercise.round_count ?? null }
                                    : {}),
                            })
                            .select()
                            .single();

                        if (exerciseError) throw exerciseError;

                        const sets = (exercise.training_sets ?? []).map((set: TrainingSet) => ({
                            session_exercise_id: newExercise.id,
                            order_index: set.order_index,
                            target_reps: set.target_reps,
                            target_rpe: set.target_rpe,
                            target_load: set.target_load,
                            target_metric: set.target_metric,
                            rest_seconds: set.rest_seconds,
                            is_video_required: set.is_video_required,
                            notes: set.notes,
                            // Técnicas de intensidad y encadenados: son
                            // prescripción, no ejecución, y sin ellos el bloque
                            // copiado no es el mismo bloque.
                            set_type: set.set_type ?? null,
                            set_detail: set.set_detail ?? null,
                            group_tag: set.group_tag ?? null,
                        }));

                        if (sets.length > 0) {
                            const { error: setsError } = await supabase.from('training_sets').insert(sets);
                            if (setsError) throw setsError;
                        }
                    }
                }

                created.push(athleteId);
            } catch (err) {
                console.error(`No se pudo copiar el bloque a ${athleteId}:`, err);
                failed.push(athleteId);
            }
        }

        return { created, failed };
    },

    async setSessionCompleted(sessionId: string, completed: boolean, notes?: string | null): Promise<void> {
        const payload: Record<string, unknown> = {
            completed_at: completed ? new Date().toISOString() : null,
        };
        if (notes !== undefined) payload.athlete_notes = notes;

        const { error } = await supabase
            .from('training_sessions')
            .update(payload)
            .eq('id', sessionId);

        if (error) throw error;
    },

    /**
     * Adherencia y última sesión de varios atletas, en UNA consulta.
     *
     * El panel del coach lo necesita para cada tarjeta de la lista. Pedirlo
     * atleta por atleta serían N+1 consultas y con veinte atletas la lista
     * tardaría segundos en pintarse.
     *
     * "Adherencia" aquí es: de los días que ya han PASADO en el bloque
     * activo, cuántos están marcados como terminados. No se cuentan los días
     * futuros — un atleta al que le quedan tres días de la semana no está al
     * 40% de adherencia, está al día.
     */
    async getTeamAdherence(athleteIds: string[]): Promise<Record<string, AthleteAdherence>> {
        if (athleteIds.length === 0) return {};

        const { data: blocks, error: blocksError } = await supabase
            .from('training_blocks')
            .select('id, athlete_id')
            .in('athlete_id', athleteIds)
            .eq('is_active', true);

        if (blocksError) throw blocksError;
        if (!blocks || blocks.length === 0) return {};

        const blockToAthlete = new Map(blocks.map(b => [b.id, b.athlete_id as string]));

        const { data: sessions, error: sessionsError } = await supabase
            .from('training_sessions')
            .select('id, block_id, week_number, day_number, day_of_week, date, completed_at')
            .in('block_id', [...blockToAthlete.keys()]);

        if (sessionsError) throw sessionsError;

        const result: Record<string, AthleteAdherence> = {};
        const todayMs = Date.now();

        (sessions ?? []).forEach(session => {
            const athleteId = blockToAthlete.get(session.block_id);
            if (!athleteId) return;

            const entry = result[athleteId] ?? (result[athleteId] = {
                dueSessions: 0,
                completedSessions: 0,
                lastCompletedAt: null,
            });

            if (session.completed_at) {
                entry.completedSessions += 1;
                if (!entry.lastCompletedAt || session.completed_at > entry.lastCompletedAt) {
                    entry.lastCompletedAt = session.completed_at;
                }
            }

            // Un día cuenta como "vencido" si tiene fecha y ya pasó. Los días
            // sin fecha agendada no se pueden situar en el calendario, así que
            // no entran en el cálculo: inventar que vencían hoy castigaría a
            // quien programa por "Día 1 / Día 2" sin fechas.
            if (session.date && new Date(session.date).getTime() <= todayMs) {
                entry.dueSessions += 1;
            }
        });

        return result;
    },

    async deleteSet(setId: string): Promise<void> {
        const { error } = await supabase
            .from('training_sets')
            .delete()
            .eq('id', setId);

        if (error) throw error;
    },
    async deleteWeek(blockId: string, weekNumber: number): Promise<void> {
        // 1. Get current block to know end_week
        const { data: block, error: blockError } = await supabase
            .from('training_blocks')
            .select('*')
            .eq('id', blockId)
            .single();

        if (blockError || !block) throw blockError || new Error("Block not found");

        // 2. Delete sessions for the target week
        const { error: deleteError } = await supabase
            .from('training_sessions')
            .delete()
            .eq('block_id', blockId)
            .eq('week_number', weekNumber);

        if (deleteError) throw deleteError;

        // 3. Shift subsequent weeks (week > weekNumber) down by 1
        // We need to do this carefully. Since there's no unique constraint on (block_id, week_number, day_number) that strictly prevents temp duplicates, 
        // we might be okay. But safer to fetch and update or use RPC. 
        // For now, client-side loop is easiest but less atomic. 
        // Let's fetch all sessions with week > weekNumber
        const { data: sessionsToShift } = await supabase
            .from('training_sessions')
            .select('id, week_number')
            .eq('block_id', blockId)
            .gt('week_number', weekNumber);

        if (sessionsToShift && sessionsToShift.length > 0) {
            // Update each session (or batch via upsert if we had full objects, but we only have IDs)
            // A simple way is to loop. For small number of sessions (max 4-8 weeks usually), this is fine.
            for (const s of sessionsToShift) {
                await supabase
                    .from('training_sessions')
                    .update({ week_number: s.week_number - 1 })
                    .eq('id', s.id);
            }
        }

        /**
         * 3b. DESPLAZAR TAMBIÉN EL NOMBRE Y LA VISIBILIDAD DE LAS SEMANAS.
         *
         * Faltaba esto. `training_weeks` guarda nombre y publicación por
         * (block_id, week_number), y el paso de arriba mueve las SESIONES un
         * número hacia atrás sin tocarla: al borrar la semana 32, las sesiones
         * de la 33 pasan a llamarse 32, pero el nombre "Semana de descarga" o
         * el candado de visibilidad seguían enganchados al número 33 —que ya
         * no tiene sesiones— y la semana 32 heredaba el nombre de la semana
         * BORRADA o se quedaba sin ninguno. Un bloque con una semana oculta a
         * propósito podía acabar publicándola sin que nadie lo pidiera.
         *
         * Primero se borra la fila de la semana eliminada —su nombre y su
         * candado desaparecen con ella, que es lo correcto—, y LUEGO se
         * desplazan las siguientes en orden ASCENDENTE: así cada `week_number`
         * queda libre justo antes de que la semana de detrás lo ocupe, y el
         * UNIQUE(block_id, week_number) no choca en ningún paso.
         */
        await supabase
            .from('training_weeks')
            .delete()
            .eq('block_id', blockId)
            .eq('week_number', weekNumber);

        const { data: weekMetaToShift } = await supabase
            .from('training_weeks')
            .select('id, week_number')
            .eq('block_id', blockId)
            .gt('week_number', weekNumber)
            .order('week_number', { ascending: true });

        if (weekMetaToShift && weekMetaToShift.length > 0) {
            for (const w of weekMetaToShift) {
                await supabase
                    .from('training_weeks')
                    .update({ week_number: w.week_number - 1 })
                    .eq('id', w.id);
            }
        }

        // 4. Update Block end_week
        const newEndWeek = (block.end_week || 0) - 1;
        // Recalc end_date? Not strictly necessary if only weeks matter, but good for consistency.
        // We won't touch end_date for now unless we want to be very precise with dates. 
        // User asked to just allow extending/deleting weeks. 
        await supabase
            .from('training_blocks')
            .update({ end_week: newEndWeek })
            .eq('id', blockId);
    },

    async addWeek(blockId: string): Promise<number> {
        // 1. Get current block
        const { data: block, error: blockError } = await supabase
            .from('training_blocks')
            .select('start_week, end_week')
            .eq('id', blockId)
            .single();

        if (blockError || !block) throw blockError || new Error("Block not found");

        /**
         * DE DÓNDE SALE EL NÚMERO DE LA SEMANA NUEVA.
         *
         * Esto era `(block.end_week || 0) + 1`. Las semanas son SEMANAS ISO
         * del año —la 31, la 32—, no un contador que empiece en uno, así que
         * en un bloque sin `end_week` el `|| 0` daba la semana 1: un número
         * por debajo de `start_week`, fuera del rango que pinta el
         * constructor. La semana se creaba en la base y no aparecía por
         * ninguna parte, y si además se copiaba contenido en ella, se perdía
         * de vista.
         *
         * Sin `end_week` se parte de la última semana que EXISTE de verdad, y
         * si tampoco hay sesiones, de `start_week`.
         */
        let base = block.end_week ?? null;

        if (base === null) {
            const { data: ultima } = await supabase
                .from('training_sessions')
                .select('week_number')
                .eq('block_id', blockId)
                .order('week_number', { ascending: false })
                .limit(1)
                .maybeSingle();

            base = ultima?.week_number ?? block.start_week ?? getWeekNumber();
        }

        const newEndWeek = base + 1;

        // 2. Update block
        const { error: updateError } = await supabase
            .from('training_blocks')
            .update({ end_week: newEndWeek })
            .eq('id', blockId);

        if (updateError) throw updateError;

        return newEndWeek;
    },

    async findOrCreateExercise(name: string, coachId?: string): Promise<string> {
        // 1. Buscar uno existente. `limit(1)` es obligatorio: la biblioteca
        // tiene nombres duplicados de migraciones antiguas y `maybeSingle()`
        // a secas fallaba con PGRST116 en cuanto había más de una fila.
        const { data: existing } = await supabase
            .from('exercise_library')
            .select('id')
            .ilike('name', name)
            .limit(1)
            .maybeSingle();

        if (existing) return existing.id;

        // 2. Crearlo. `coach_id` NO es opcional en la práctica: la política
        // exlib_insert_own exige coach_id = auth.uid(), así que sin él el
        // INSERT se rechaza. Ver database/SECURITY_HARDENING.sql.
        const insertPayload: { name: string; coach_id?: string; is_public: boolean } = {
            name,
            is_public: false,
        };

        if (coachId) {
            insertPayload.coach_id = coachId;
        }

        const { data: newExercise, error } = await supabase
            .from('exercise_library')
            .insert(insertPayload)
            .select('id')
            .single();

        if (error) {
            // 23505 = ya existe un ejercicio con ese nombre pero la RLS no nos
            // dejó verlo en el paso 1 (ejercicio de otro coach, o fila
            // huérfana sin coach_id). Se reintenta la búsqueda para poder dar
            // un mensaje útil en vez de un choque de clave única.
            if ((error as { code?: string }).code === '23505') {
                const { data: retry } = await supabase
                    .from('exercise_library')
                    .select('id')
                    .ilike('name', name)
                    .limit(1)
                    .maybeSingle();

                if (retry) return retry.id;

                throw new Error(
                    `El ejercicio "${name}" ya existe en la biblioteca pero no es visible para tu usuario. ` +
                    'Ejecuta database/FIX_ENTRENAMIENTO.sql para reparar la visibilidad.'
                );
            }

            console.error('Error creando ejercicio:', error);
            throw error;
        }

        return newExercise.id;
    },

    /**
     * Copia el contenido de una semana SOBRE otra semana ya existente del mismo bloque.
     * Borra las sesiones actuales de la semana destino y clona las de la semana origen.
     */
    async copyWeekInto(blockId: string, sourceWeek: number, targetWeek: number): Promise<void> {
        if (sourceWeek === targetWeek) throw new Error('La semana origen y destino son la misma');

        // 1. Borrar las sesiones actuales de la semana destino
        const { error: deleteError } = await supabase
            .from('training_sessions')
            .delete()
            .eq('block_id', blockId)
            .eq('week_number', targetWeek);

        if (deleteError) throw deleteError;

        // 2. Clonar la semana origen dentro de la destino
        await this.cloneWeekContents(blockId, sourceWeek, targetWeek);
    },

    /**
     * Clona sesiones + ejercicios + series de sourceWeek a targetWeek.
     *
     * TRES viajes al servidor, no uno por serie.
     *
     * Esto insertaba fila a fila y esperando: una sesión, luego cada ejercicio
     * uno a uno, y dentro de cada uno sus series. Una semana normal de 4 días
     * con 6 ejercicios son 4 + 24 inserciones encadenadas, cada una con su ida
     * y vuelta completa; a 80 ms de latencia eso son más de dos segundos de
     * reloj para copiar una semana, y es exactamente la operación con la que
     * se construye un bloque entero. De ahí la lentitud de la pantalla.
     *
     * Ahora se insertan los tres niveles en lote. Solo hacen falta tres
     * llamadas porque cada nivel necesita los ids que devuelve el anterior.
     */
    async cloneWeekContents(blockId: string, sourceWeek: number, targetWeek: number): Promise<void> {
        const { data: sourceSessions, error: sessionError } = await supabase
            .from('training_sessions')
            .select(`
                *,
                session_exercises (
                    *,
                    training_sets (*)
                )
            `)
            .eq('block_id', blockId)
            .eq('week_number', sourceWeek);

        if (sessionError) throw sessionError;
        if (!sourceSessions || sourceSessions.length === 0) return;

        /**
         * 1. Todas las sesiones de golpe.
         *
         * Se pide de vuelta `day_number` y no solo el `id`, y los tres niveles
         * se emparejan por ese valor en lugar de por la POSICIÓN en el array.
         * El emparejamiento posicional daba por hecho que un INSERT múltiple
         * devuelve las filas en el orden del payload; es lo que suele pasar,
         * pero no está garantizado, y el día que no pase la copia sale con los
         * ejercicios de un día colgando de otro. Nadie se daría cuenta hasta
         * ver la semana ya programada.
         */
        const { data: newSessions, error: createSessionError } = await supabase
            .from('training_sessions')
            .insert(sourceSessions.map(session => ({
                block_id: blockId,
                week_number: targetWeek,
                day_number: session.day_number,
                day_of_week: session.day_of_week ?? null,
                name: session.name,
                // La fecha NO se copia: pertenece a la semana de origen.
                date: null,
                /**
                 * NO se manda `notes`.
                 *
                 * training_sessions no tiene esa columna y TrainingSession
                 * tampoco declara ese campo —lo del día son `warmup`, `extras`
                 * y `athlete_notes`—, así que `session.notes` valía siempre
                 * undefined. Pero supabase-js arma el parámetro `columns` de la
                 * petición con las CLAVES del objeto, no con las que llevan
                 * valor, así que "notes" viajaba igual y PostgREST rechazaba el
                 * INSERT completo con PGRST204. Copiar una semana no ha
                 * funcionado nunca por esto.
                 *
                 * `athlete_notes` tampoco se copia, y ahí es a propósito: es lo
                 * que escribió el atleta sobre CÓMO le fue ese día, y no
                 * significa nada en una semana que todavía no ha entrenado.
                 */
                warmup: session.warmup ?? null,
                extras: session.extras ?? null,
            })))
            .select('id, day_number');

        if (createSessionError) throw createSessionError;
        if (!newSessions) return;

        const sessionIdByDay = new Map<number, string>(
            newSessions.map(s => [s.day_number, s.id])
        );

        // 2. Todos los ejercicios de todas las sesiones, de golpe.
        type SourceExercise = SessionExercise & { training_sets?: TrainingSet[] };

        const exercisePayload: Record<string, unknown>[] = [];
        const exerciseSources: SourceExercise[] = [];

        for (const session of sourceSessions) {
            const targetSessionId = sessionIdByDay.get(session.day_number);
            if (!targetSessionId) continue;

            for (const ex of ((session.session_exercises ?? []) as SourceExercise[])) {
                exerciseSources.push(ex);
                exercisePayload.push({
                    session_id: targetSessionId,
                    exercise_id: ex.exercise_id,
                    order_index: ex.order_index,
                    /**
                     * SE COPIA LA PRESCRIPCIÓN ENTERA.
                     *
                     * Antes solo viajaban `notes` y `variant_name`, con el
                     * argumento de que el resto "pertenece a training_sets".
                     * No es cierto: el editor del día escribe `rest_seconds`,
                     * `rpe` y `velocity_avg` en ESTA tabla. El resultado era
                     * que el coach programaba la semana 1 con sus descansos,
                     * la copiaba a las tres siguientes, y las tres salían sin
                     * descanso ninguno — que es exactamente el "no se guardan
                     * los tiempos de descanso" que se veía.
                     *
                     * Si la base no tiene alguna de estas columnas, el
                     * reintento de `insertWithOptionalColumns` copia sin ella
                     * en vez de tumbar la semana completa.
                     */
                    notes: ex.notes,
                    variant_name: ex.variant_name,
                    rest_seconds: ex.rest_seconds ?? null,
                    rpe: ex.rpe ?? null,
                    velocity_avg: ex.velocity_avg ?? null,
                    modifiers: ex.modifiers ?? null,
                    // La clasificación muscular que haya fijado el coach para
                    // esta prescripción viaja con ella: si no, el volumen de la
                    // semana copiada no coincidiría con el de la original.
                    primary_muscles: ex.primary_muscles ?? null,
                    secondary_muscles: ex.secondary_muscles ?? null,
                    // La sección y las rondas viajan también. Sin esto, copiar
                    // una semana convertiría su calentamiento en trabajo
                    // principal: aparecería entre los ejercicios del día y
                    // empezaría a contar para el tonelaje de la copia.
                    section: ex.section ?? 'main',
                    round_count: ex.round_count ?? null,
                });
            }
        }

        if (exercisePayload.length === 0) return;

        const { data: newExercisesRaw } = await insertWithOptionalColumns(
            'session_exercises',
            exercisePayload,
            [
                'rest_seconds', 'rpe', 'velocity_avg', 'modifiers',
                'primary_muscles', 'secondary_muscles',
                'section', 'round_count',
            ],
            'id, session_id, order_index'
        );

        const newExercises = newExercisesRaw as { id: string; session_id: string; order_index: number }[] | null;
        if (!newExercises) return;

        /**
         * Cada ejercicio se identifica por el día al que pertenece y su
         * posición dentro de él.
         *
         * Una LISTA de ids por clave y no un id suelto: los datos antiguos
         * pueden tener dos ejercicios con el mismo `order_index` en el mismo
         * día, y con un solo id por clave los dos apuntarían al mismo destino
         * —uno se quedaría con las series de ambos y el otro vacío—. Al ir
         * sacándolos en orden, ese caso se reparte como antes y el resto deja
         * de depender de la posición.
         */
        const exerciseIdsByPlace = new Map<string, string[]>();
        for (const e of newExercises) {
            const key = `${e.session_id}|${e.order_index}`;
            const lista = exerciseIdsByPlace.get(key);
            if (lista) lista.push(e.id);
            else exerciseIdsByPlace.set(key, [e.id]);
        }

        // 3. Todas las series de todos los ejercicios, de golpe.
        const setsPayload = exerciseSources.flatMap((ex, i) => {
            const sessionId = exercisePayload[i].session_id as string;
            const targetExerciseId = exerciseIdsByPlace.get(`${sessionId}|${ex.order_index}`)?.shift();
            if (!targetExerciseId) return [];

            return (ex.training_sets ?? []).map((set: TrainingSet) => ({
                session_exercise_id: targetExerciseId,
                order_index: set.order_index,
                target_reps: set.target_reps,
                target_rpe: set.target_rpe,
                target_load: set.target_load,
                target_metric: set.target_metric ?? 'kg',
                rest_seconds: set.rest_seconds,
                is_video_required: set.is_video_required,
                notes: set.notes,
                /**
                 * Las técnicas de intensidad también son prescripción.
                 *
                 * Un dropset o una superserie programados en la semana 1
                 * desaparecían al copiarla: el coach veía los mismos
                 * ejercicios y los mismos kilos y daba por buena la copia, sin
                 * notar que había perdido la mitad de la intención del bloque.
                 *
                 * Lo que NO se copia sigue siendo la ejecución: `actual_*`,
                 * `is_completed`, vídeos y archivos VBT pertenecen a la semana
                 * en la que se hicieron.
                 */
                set_type: set.set_type ?? null,
                set_detail: set.set_detail ?? null,
                group_tag: set.group_tag ?? null,
            }));
        });

        if (setsPayload.length === 0) return;

        await insertWithOptionalColumns(
            'training_sets',
            setsPayload,
            ['set_type', 'set_detail', 'group_tag', 'target_metric', 'notes'],
            'id'
        );
    },

    /**
     * COPIAR UN DÍA ENTERO A UNO O VARIOS DÍAS.
     * =====================================================================
     *
     * `cloneWeekContents` copia una semana completa CREANDO las sesiones de
     * destino. Aquí los días de destino YA EXISTEN — son días del propio
     * bloque, o de otra semana, elegidos uno a uno desde el constructor — así
     * que la copia es de ejercicios y series hacia una sesión que ya tiene
     * fila propia.
     *
     * Los mismos campos que en `cloneWeekContents` viajan (prescripción
     * completa: notas, variante, descanso, RPE, velocidad, modificadores,
     * músculos, sección, rondas, técnicas de intensidad) y los mismos NO
     * viajan (ejecución: `actual_*`, `is_completed`, vídeos, VBT). El nombre
     * del día y los apéndices (calentamiento/consideraciones) son opcionales
     * y por defecto NO se copian: la mayoría de veces se pega el contenido de
     * un día sobre uno que ya tiene su propio nombre y sus propias notas.
     *
     * `mode: 'replace'` borra los ejercicios que el día de destino ya tuviera
     * antes de copiar; `'append'` los deja y añade los nuevos detrás,
     * continuando el `order_index`.
     */
    async copyDayInto(
        sourceSessionId: string,
        targetSessionIds: string[],
        mode: 'replace' | 'append',
        opts?: { copyName?: boolean; copyAppendices?: boolean }
    ): Promise<void> {
        const targets = targetSessionIds.filter(id => id !== sourceSessionId);
        if (targets.length === 0) return;

        const { data: source, error: sourceError } = await supabase
            .from('training_sessions')
            .select(`
                *,
                session_exercises (
                    *,
                    training_sets (*)
                )
            `)
            .eq('id', sourceSessionId)
            .single();

        if (sourceError) throw sourceError;
        const sourceExercises = (source.session_exercises ?? []) as (SessionExercise & { training_sets?: TrainingSet[] })[];

        for (const targetSessionId of targets) {
            if (mode === 'replace') {
                // Cascada hasta `training_sets`: es el mismo borrado que usa
                // "Eliminar ejercicio" en el constructor, aquí para todos los
                // ejercicios del día de destino de golpe.
                const { error: clearError } = await supabase
                    .from('session_exercises')
                    .delete()
                    .eq('session_id', targetSessionId);
                if (clearError) throw clearError;
            }

            // El punto de partida del `order_index`: 0 si se ha vaciado el
            // día, o justo detrás de lo último que ya tenía si se añade.
            let startOrder = 0;
            if (mode === 'append') {
                const { data: existing } = await supabase
                    .from('session_exercises')
                    .select('order_index')
                    .eq('session_id', targetSessionId)
                    .order('order_index', { ascending: false })
                    .limit(1);
                startOrder = existing?.[0] ? existing[0].order_index + 1 : 0;
            }

            if (sourceExercises.length === 0) continue;

            const exercisePayload = sourceExercises.map((ex, i) => ({
                session_id: targetSessionId,
                exercise_id: ex.exercise_id,
                order_index: startOrder + i,
                notes: ex.notes,
                variant_name: ex.variant_name,
                rest_seconds: ex.rest_seconds ?? null,
                rpe: ex.rpe ?? null,
                velocity_avg: ex.velocity_avg ?? null,
                modifiers: ex.modifiers ?? null,
                primary_muscles: ex.primary_muscles ?? null,
                secondary_muscles: ex.secondary_muscles ?? null,
                section: ex.section ?? 'main',
                round_count: ex.round_count ?? null,
            }));

            const { data: newExercisesRaw } = await insertWithOptionalColumns(
                'session_exercises',
                exercisePayload,
                [
                    'rest_seconds', 'rpe', 'velocity_avg', 'modifiers',
                    'primary_muscles', 'secondary_muscles',
                    'section', 'round_count',
                ],
                'id, order_index'
            );
            const newExercises = newExercisesRaw as { id: string; order_index: number }[] | null;
            if (!newExercises) continue;

            // Emparejados por posición dentro de ESTE lote (todos comparten
            // `session_id`), con lista para el caso de `order_index` repetido
            // — mismo motivo que en `cloneWeekContents`.
            const idsByOrder = new Map<number, string[]>();
            for (const e of newExercises) {
                const list = idsByOrder.get(e.order_index);
                if (list) list.push(e.id);
                else idsByOrder.set(e.order_index, [e.id]);
            }

            const setsPayload = sourceExercises.flatMap((ex, i) => {
                const targetExerciseId = idsByOrder.get(startOrder + i)?.shift();
                if (!targetExerciseId) return [];

                return (ex.training_sets ?? []).map((set: TrainingSet) => ({
                    session_exercise_id: targetExerciseId,
                    order_index: set.order_index,
                    target_reps: set.target_reps,
                    target_rpe: set.target_rpe,
                    target_load: set.target_load,
                    target_metric: set.target_metric ?? 'kg',
                    rest_seconds: set.rest_seconds,
                    is_video_required: set.is_video_required,
                    notes: set.notes,
                    set_type: set.set_type ?? null,
                    set_detail: set.set_detail ?? null,
                    group_tag: set.group_tag ?? null,
                }));
            });

            if (setsPayload.length > 0) {
                await insertWithOptionalColumns(
                    'training_sets',
                    setsPayload,
                    ['set_type', 'set_detail', 'group_tag', 'target_metric', 'notes'],
                    'id'
                );
            }

            if (opts?.copyName || opts?.copyAppendices) {
                const updates: Record<string, unknown> = {};
                if (opts.copyName) updates.name = source.name;
                if (opts.copyAppendices) {
                    updates.warmup = source.warmup ?? null;
                    updates.extras = source.extras ?? null;
                }
                await supabase.from('training_sessions').update(updates).eq('id', targetSessionId);
            }
        }
    },

    /**
     * PLANTILLAS DE DÍA
     */
    async getDayTemplates(coachId: string): Promise<DayTemplate[]> {
        const { data, error } = await supabase
            .from('day_templates')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async saveDayTemplate(coachId: string, name: string, payload: DayTemplateExercise[]): Promise<DayTemplate> {
        const { data, error } = await supabase
            .from('day_templates')
            .insert({ coach_id: coachId, name, payload })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteDayTemplate(templateId: string): Promise<void> {
        const { error } = await supabase.from('day_templates').delete().eq('id', templateId);
        if (error) throw error;
    },

    /**
     * Aplica una plantilla a una sesión: crea ejercicios + series al final.
     *
     * Los ejercicios se resuelven en paralelo y se insertan en dos lotes. Antes
     * era una cadena de esperas por cada ejercicio de la plantilla (buscar o
     * crear el ejercicio, insertarlo, insertar sus series), así que aplicar una
     * plantilla de ocho ejercicios costaba veinticuatro viajes seguidos.
     */
    async applyDayTemplate(sessionId: string, template: DayTemplate, coachId: string, startOrder: number): Promise<void> {
        if (template.payload.length === 0) return;

        // `findOrCreateExercise` puede insertar, así que se lanzan a la vez pero
        // se conserva el orden del array para no barajar la plantilla.
        const exerciseIds = await Promise.all(
            template.payload.map(ex => this.findOrCreateExercise(ex.name, coachId))
        );

        // `section`/`round_count` solo viajan cuando NO son el valor por
        // defecto, igual que en `addSessionExercise`: así una plantilla sin
        // calentamiento estructurado se sigue aplicando contra una base sin
        // database/CALENTAMIENTO_ESTRUCTURADO.sql ejecutado.
        const needsOptionalColumns = template.payload.some(
            ex => (ex.section && ex.section !== 'main') || ex.round_count
        );

        const { data: newExercisesRaw } = await insertWithOptionalColumns(
            'session_exercises',
            template.payload.map((ex, i) => ({
                session_id: sessionId,
                exercise_id: exerciseIds[i],
                order_index: startOrder + i,
                notes: ex.notes || null,
                variant_name: ex.variant_name || null,
                rpe: ex.rpe || null,
                velocity_avg: ex.velocity_avg || null,
                rest_seconds: ex.rest_seconds || null,
                ...(needsOptionalColumns
                    ? { section: ex.section ?? 'main', round_count: ex.round_count ?? null }
                    : {}),
            })),
            ['section', 'round_count'],
            'id'
        );

        const newExercises = newExercisesRaw as { id: string }[] | null;
        if (!newExercises) return;

        const setsPayload = template.payload.flatMap((ex, i) => {
            const sessionExerciseId = newExercises[i]?.id;
            if (!sessionExerciseId) return [];

            return (ex.sets ?? []).map((set, index) => ({
                session_exercise_id: sessionExerciseId,
                order_index: index,
                target_reps: set.target_reps,
                target_rpe: set.target_rpe,
                target_load: set.target_load,
                rest_seconds: set.rest_seconds,
                is_video_required: false,
            }));
        });

        if (setsPayload.length === 0) return;

        const { error: setsError } = await supabase.from('training_sets').insert(setsPayload);
        if (setsError) throw setsError;
    },

    /** Persiste el nuevo orden de los ejercicios de una sesión. */
    async reorderSessionExercises(orderedIds: string[]): Promise<void> {
        await Promise.all(orderedIds.map((id, index) =>
            supabase.from('session_exercises').update({ order_index: index }).eq('id', id)
        ));
    },

    /**
     * MACROCICLOS
     */
    async getMacrosByAthlete(athleteId: string): Promise<Macrocycle[]> {
        const { data, error } = await supabase
            .from('macrocycles')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async createMacro(macro: Omit<Macrocycle, 'id' | 'created_at'>): Promise<Macrocycle> {
        const { data, error } = await supabase
            .from('macrocycles')
            .insert(macro)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteMacro(macroId: string): Promise<void> {
        // Los bloques quedan sin macro (ON DELETE SET NULL)
        const { error } = await supabase.from('macrocycles').delete().eq('id', macroId);
        if (error) throw error;
    },

    async assignBlockToMacro(blockId: string, macroId: string | null): Promise<void> {
        const { error } = await supabase
            .from('training_blocks')
            .update({ macro_id: macroId })
            .eq('id', blockId);

        if (error) throw error;
    },

    /**
     * ESTADÍSTICAS: historial completo de ejercicios del atleta
     * (todas las prescripciones + registros, con bloque y semana para ordenar).
     */
    /**
     * Historial de cargas de ejercicios.
     *
     * Limita a los últimos 2 bloques activos para evitar cargar gigabytes de
     * histórico completo. El WorkoutBuilder solo necesita las últimas 8 cargas
     * de cada ejercicio para los sparklines; tomar 2 bloques es más que
     * suficiente y evita tabletear la base en bloque grande.
     */
    async getExerciseHistoryByAthlete(athleteId: string): Promise<ExerciseHistoryRow[]> {
        // 1. Últimos 2 bloques del atleta (probablemente el actual + el anterior)
        const { data: blocks, error: blocksError } = await supabase
            .from('training_blocks')
            .select('id')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false })
            .limit(2);

        if (blocksError) throw blocksError;
        if (!blocks || blocks.length === 0) return [];

        const blockIds = blocks.map(b => b.id);

        // 2. Ejercicios en esos bloques únicamente
        const { data, error } = await supabase
            .from('session_exercises')
            .select(`
                id, exercise_id, variant_name, rpe, velocity_avg,
                primary_muscles, secondary_muscles, section,
                exercise:exercise_library (id, name, primary_muscles, secondary_muscles),
                training_sets (*),
                session:training_sessions!inner (
                    id, week_number, day_number, date,
                    block:training_blocks!inner (id, name, athlete_id, created_at, macro_id)
                )
            `)
            .in('session.block_id', blockIds);

        if (error) throw error;

        type RawRow = {
            id: string;
            exercise_id: string;
            variant_name: string | null;
            rpe: string | null;
            velocity_avg: string | null;
            primary_muscles: string[] | null;
            secondary_muscles: string[] | null;
            section: string | null;
            exercise: {
                id: string; name: string;
                primary_muscles: string[] | null;
                secondary_muscles: string[] | null;
            } | null;
            training_sets: TrainingSet[];
            session: {
                id: string;
                week_number: number;
                day_number: number;
                date: string | null;
                block: { id: string; name: string; athlete_id: string; created_at: string; macro_id: string | null };
            };
        };

        const rows = (data as unknown as RawRow[] | null) || [];

        return rows
            .filter(r => r.exercise && r.session?.block)
            // EL CALENTAMIENTO NO ES HISTORIAL DE RENDIMIENTO. De aquí salen el
            // tonelaje, el 1RM estimado, el reparto muscular y las tendencias:
            // dejar entrar las aproximaciones y la movilidad inflaría todas
            // esas cifras. Ver `countsForVolume` en src/types/training.ts.
            .filter(r => countsForVolume(r.section))
            .map(r => ({
                sessionExerciseId: r.id,
                exerciseId: r.exercise_id,
                exerciseName: r.exercise!.name,
                variantName: r.variant_name,
                blockId: r.session.block.id,
                blockName: r.session.block.name,
                macroId: r.session.block.macro_id ?? null,
                sessionId: r.session.id,
                weekNumber: r.session.week_number,
                dayNumber: r.session.day_number,
                date: r.session.date ?? null,
                rpeGlobal: r.rpe,
                velocityAvg: r.velocity_avg,
                // La de la prescripción manda; si no la hay, la de la
                // biblioteca; si tampoco, null y que decidan las reglas.
                primaryMuscles: r.primary_muscles ?? r.exercise?.primary_muscles ?? null,
                secondaryMuscles: r.secondary_muscles ?? r.exercise?.secondary_muscles ?? null,
                sets: (r.training_sets || []).sort((a, b) => a.order_index - b.order_index)
            }))
            .sort((a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber);
    },

    /**
     * Última sesión CERRADA en la que el atleta hizo cada uno de estos
     * ejercicios — la referencia que se enseña durante el entrenamiento
     * cuando el coach no ha pautado un peso explícito.
     *
     * Va por `exercise_id`, no por nombre: dos ejercicios con el mismo
     * nombre visible (uno del coach, otro global, o uno renombrado) no son
     * el mismo ejercicio, y mezclarlos daría una referencia que no
     * corresponde a lo que el atleta hizo.
     *
     * Un solo batch por TODOS los ejercicios de la sesión — nunca uno por
     * tarjeta — por la misma razón de siempre: N consultas por pantalla no
     * escala y en móvil se nota.
     *
     * Limita a los últimos 2 bloques, igual que `getExerciseHistoryByAthlete`:
     * cubre el mesociclo en curso y el anterior, que es donde de verdad se
     * busca "la última vez". Un ejercicio que no aparece ahí simplemente no
     * devuelve referencia — no hay error, no hay tarjeta vacía.
     */
    async getLastSessionSetsForExercises(
        athleteId: string,
        exerciseIds: string[],
        excludeSessionId?: string | null
    ): Promise<Map<string, LastSessionSetReference>> {
        const result = new Map<string, LastSessionSetReference>();
        if (exerciseIds.length === 0) return result;

        const { data: blocks, error: blocksError } = await supabase
            .from('training_blocks')
            .select('id')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false })
            .limit(2);

        if (blocksError) throw blocksError;
        if (!blocks || blocks.length === 0) return result;

        const blockIds = blocks.map(b => b.id);

        const { data, error } = await supabase
            .from('session_exercises')
            .select(`
                id, exercise_id,
                training_sets (*),
                session:training_sessions!inner (id, completed_at, block_id)
            `)
            .in('exercise_id', exerciseIds)
            .in('session.block_id', blockIds)
            .not('session.completed_at', 'is', null);

        if (error) throw error;

        type RawRow = {
            id: string;
            exercise_id: string;
            training_sets: TrainingSet[];
            session: { id: string; completed_at: string | null; block_id: string };
        };

        const rows = (data as unknown as RawRow[] | null) || [];

        // Para cada ejercicio, la sesión cerrada más reciente por fecha de
        // cierre real — no por semana/día del programa, que es orden de
        // plan y no de calendario.
        const latestByExercise = new Map<string, RawRow>();
        for (const row of rows) {
            if (excludeSessionId && row.session.id === excludeSessionId) continue;
            if (!row.session.completed_at) continue;
            const current = latestByExercise.get(row.exercise_id);
            if (!current || row.session.completed_at > current.session.completed_at!) {
                latestByExercise.set(row.exercise_id, row);
            }
        }

        for (const [exerciseId, row] of latestByExercise) {
            const doneSets = (row.training_sets || [])
                .filter(s => s.is_completed && s.actual_reps != null);
            if (doneSets.length === 0) continue;

            // La serie principal de esa sesión: la de más peso movido: y si
            // dos empatan, la primera de las dos — la de antes de que la
            // fatiga bajara las repeticiones en la siguiente.
            let best = doneSets[0];
            for (const s of doneSets) {
                const bestLoad = best.actual_load ?? -Infinity;
                const load = s.actual_load ?? -Infinity;
                if (load > bestLoad || (load === bestLoad && s.order_index < best.order_index)) {
                    best = s;
                }
            }

            result.set(exerciseId, {
                sessionId: row.session.id,
                completedAt: row.session.completed_at!,
                reps: best.actual_reps!,
                weight: best.actual_load ?? null,
                rpe: best.actual_rpe ?? null,
            });
        }

        return result;
    },

    /**
     * Duplica una semana AL FINAL del bloque y devuelve su número.
     *
     * Reutiliza `cloneWeekContents` en vez de repetir el copiado aquí. La copia
     * propia que tenía se dejaba por el camino la variante, el RPE global, la
     * velocidad, el descanso y la métrica de cada serie: el coach duplicaba una
     * semana y la copia salía con los mismos ejercicios pero sin la mitad de la
     * prescripción, y había que repasarla entera a mano.
     */
    async copyWeek(blockId: string, sourceWeek: number): Promise<number> {
        const newEndWeek = await this.addWeek(blockId);
        await this.cloneWeekContents(blockId, sourceWeek, newEndWeek);
        return newEndWeek;
    }
};
