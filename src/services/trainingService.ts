import { supabase } from '../lib/supabase';
import { TrainingBlock, TrainingSession, ExerciseLibrary, SessionExercise, TrainingSet, Macrocycle, DayTemplate, DayTemplateExercise, WeekMeta, Weekday, weekdayIndex, weekdayLabel } from '../types/training';
import { getWeekNumber } from '../utils/dateUtils';

/** Lo que le toca hoy a un atleta, resumido para la pantalla de inicio. */
export interface TodayTraining {
    blockName: string;
    /** No hay sesión agendada para hoy en la semana en curso. */
    isRestDay: boolean;
    session: {
        id: string;
        title: string;
        completed: boolean;
        hasWarmup: boolean;
        hasExtras: boolean;
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
    rpeGlobal: string | null;
    velocityAvg: string | null;
    sets: TrainingSet[];
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
        if (sessions.length === 0) return null;

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
            return { blockName: block.name, session: null, isRestDay: true };
        }

        const exercises = [...(session.session_exercises ?? [])]
            .sort((a, b) => a.order_index - b.order_index);

        const allSets = exercises.flatMap(e => e.training_sets ?? []);

        return {
            blockName: block.name,
            isRestDay: false,
            session: {
                id: session.id,
                title: session.name || weekdayLabel(session.day_of_week) || `Día ${session.day_number}`,
                completed: Boolean(session.completed_at),
                hasWarmup: Boolean(session.warmup?.trim()),
                hasExtras: Boolean(session.extras?.trim()),
                exerciseNames: exercises.map(e => e.exercise?.name ?? 'Ejercicio'),
                totalSets: allSets.length,
                completedSets: allSets.filter(s => s.is_completed).length,
            },
        };
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

    async addSessionExercise(
        sessionId: string,
        exerciseId: string,
        orderIndex: number
    ): Promise<SessionExercise> {
        const { data, error } = await supabase
            .from('session_exercises')
            .insert({
                session_id: sessionId,
                exercise_id: exerciseId,
                order_index: orderIndex
            })
            .select(`
                *,
                exercise:exercise_library(*)
            `)
            .single();

        if (error) throw error;
        return data;
    },

    async updateSessionExercise(id: string, updates: Partial<SessionExercise>): Promise<void> {
        const { error } = await supabase
            .from('session_exercises')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
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
     * Devuelve las series del ejercicio ya renumeradas, o `null` si no había
     * nada que separar (la inmensa mayoría de las llamadas).
     */
    async expandGroupedSet(setId: string): Promise<TrainingSet[] | null> {
        const { data: set, error } = await supabase
            .from('training_sets')
            .select('*')
            .eq('id', setId)
            .single();

        if (error) throw error;

        const parsed = parseGroupedReps(set.target_reps);
        if (!parsed || parsed.count <= 1) return null;

        // Las hermanas que van DETRÁS tienen que desplazarse para dejar hueco,
        // o el orden de la sesión queda al azar.
        const { data: siblings, error: siblingsError } = await supabase
            .from('training_sets')
            .select('id, order_index')
            .eq('session_exercise_id', set.session_exercise_id)
            .gt('order_index', set.order_index);

        if (siblingsError) throw siblingsError;

        const shift = parsed.count - 1;
        await Promise.all(
            (siblings ?? []).map(s =>
                supabase
                    .from('training_sets')
                    .update({ order_index: s.order_index + shift })
                    .eq('id', s.id)
            )
        );

        // La fila original se queda como la PRIMERA repetición del grupo y
        // conserva lo que el atleta ya hubiera escrito en ella.
        const { error: updateError } = await supabase
            .from('training_sets')
            .update({ target_reps: parsed.reps })
            .eq('id', set.id);

        if (updateError) throw updateError;

        const clones = Array.from({ length: shift }, (_, i) => ({
            session_exercise_id: set.session_exercise_id,
            order_index: set.order_index + i + 1,
            target_reps: parsed.reps,
            target_rpe: set.target_rpe,
            target_load: set.target_load,
            target_metric: set.target_metric,
            rest_seconds: set.rest_seconds,
            is_video_required: set.is_video_required,
            // Las columnas de ejecución (`actual_*`, `notes`) NO se copian:
            // pertenecen a la serie que el atleta ya hizo, no a las que
            // todavía le quedan.
        }));

        const { error: insertError } = await supabase.from('training_sets').insert(clones);
        if (insertError) throw insertError;

        const { data: refreshed, error: refreshError } = await supabase
            .from('training_sets')
            .select('*')
            .eq('session_exercise_id', set.session_exercise_id)
            .order('order_index', { ascending: true });

        if (refreshError) throw refreshError;
        return refreshed ?? null;
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
            .select('end_week')
            .eq('id', blockId)
            .single();

        if (blockError || !block) throw blockError || new Error("Block not found");

        const newEndWeek = (block.end_week || 0) + 1;

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

        // 1. Todas las sesiones de golpe. El orden que devuelve un INSERT
        //    múltiple de PostgREST es el mismo del payload, así que la
        //    posición i del resultado corresponde a la sesión origen i.
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
                notes: session.notes,
                warmup: session.warmup ?? null,
                extras: session.extras ?? null,
            })))
            .select('id');

        if (createSessionError) throw createSessionError;
        if (!newSessions) return;

        // 2. Todos los ejercicios de todas las sesiones, de golpe.
        type SourceExercise = SessionExercise & { training_sets?: TrainingSet[] };

        const exercisePayload: Record<string, unknown>[] = [];
        const exerciseSources: SourceExercise[] = [];

        sourceSessions.forEach((session, i) => {
            const targetSessionId = newSessions[i]?.id;
            if (!targetSessionId) return;

            for (const ex of ((session.session_exercises ?? []) as SourceExercise[])) {
                exerciseSources.push(ex);
                exercisePayload.push({
                    session_id: targetSessionId,
                    exercise_id: ex.exercise_id,
                    order_index: ex.order_index,
                    notes: ex.notes,
                    variant_name: ex.variant_name,
                    rpe: ex.rpe,
                    velocity_avg: ex.velocity_avg,
                    rest_seconds: ex.rest_seconds,
                });
            }
        });

        if (exercisePayload.length === 0) return;

        const { data: newExercises, error: createExError } = await supabase
            .from('session_exercises')
            .insert(exercisePayload)
            .select('id');

        if (createExError) throw createExError;
        if (!newExercises) return;

        // 3. Todas las series de todos los ejercicios, de golpe.
        const setsPayload = exerciseSources.flatMap((ex, i) => {
            const targetExerciseId = newExercises[i]?.id;
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
            }));
        });

        if (setsPayload.length === 0) return;

        const { error: createSetsError } = await supabase
            .from('training_sets')
            .insert(setsPayload);

        if (createSetsError) throw createSetsError;
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

        const { data: newExercises, error } = await supabase
            .from('session_exercises')
            .insert(template.payload.map((ex, i) => ({
                session_id: sessionId,
                exercise_id: exerciseIds[i],
                order_index: startOrder + i,
                notes: ex.notes || null,
                variant_name: ex.variant_name || null,
                rpe: ex.rpe || null,
                velocity_avg: ex.velocity_avg || null,
                rest_seconds: ex.rest_seconds || null,
            })))
            .select('id');

        if (error) throw error;
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
    async getExerciseHistoryByAthlete(athleteId: string): Promise<ExerciseHistoryRow[]> {
        const { data, error } = await supabase
            .from('session_exercises')
            .select(`
                id, exercise_id, variant_name, rpe, velocity_avg,
                exercise:exercise_library (id, name),
                training_sets (*),
                session:training_sessions!inner (
                    id, week_number, day_number,
                    block:training_blocks!inner (id, name, athlete_id, created_at, macro_id)
                )
            `)
            .eq('session.block.athlete_id', athleteId);

        if (error) throw error;

        type RawRow = {
            id: string;
            exercise_id: string;
            variant_name: string | null;
            rpe: string | null;
            velocity_avg: string | null;
            exercise: { id: string; name: string } | null;
            training_sets: TrainingSet[];
            session: {
                id: string;
                week_number: number;
                day_number: number;
                block: { id: string; name: string; athlete_id: string; created_at: string; macro_id: string | null };
            };
        };

        const rows = (data as unknown as RawRow[] | null) || [];

        return rows
            .filter(r => r.exercise && r.session?.block)
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
                rpeGlobal: r.rpe,
                velocityAvg: r.velocity_avg,
                sets: (r.training_sets || []).sort((a, b) => a.order_index - b.order_index)
            }))
            .sort((a, b) => a.weekNumber - b.weekNumber || a.dayNumber - b.dayNumber);
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
