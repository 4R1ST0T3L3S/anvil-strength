import { supabase } from '../lib/supabase';
import { TrainingBlock, TrainingSession, ExerciseLibrary, SessionExercise, TrainingSet, Macrocycle, DayTemplate, DayTemplateExercise, WeekMeta, Weekday } from '../types/training';

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

    /** Clona sesiones + ejercicios + series de sourceWeek a targetWeek (mismo bloque). */
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

        for (const session of sourceSessions) {
            const { data: newSession, error: createSessionError } = await supabase
                .from('training_sessions')
                .insert({
                    block_id: blockId,
                    week_number: targetWeek,
                    day_number: session.day_number,
                    day_of_week: session.day_of_week ?? null,
                    name: session.name,
                    date: null,
                    notes: session.notes
                })
                .select()
                .single();

            if (createSessionError) throw createSessionError;

            for (const ex of (session.session_exercises || [])) {
                const { data: newEx, error: createExError } = await supabase
                    .from('session_exercises')
                    .insert({
                        session_id: newSession.id,
                        exercise_id: ex.exercise_id,
                        order_index: ex.order_index,
                        notes: ex.notes,
                        variant_name: ex.variant_name,
                        rpe: ex.rpe,
                        velocity_avg: ex.velocity_avg,
                        rest_seconds: ex.rest_seconds
                    })
                    .select()
                    .single();

                if (createExError) throw createExError;

                if (ex.training_sets && ex.training_sets.length > 0) {
                    const newSets = ex.training_sets.map((set: TrainingSet) => ({
                        session_exercise_id: newEx.id,
                        order_index: set.order_index,
                        target_reps: set.target_reps,
                        target_rpe: set.target_rpe,
                        target_load: set.target_load,
                        rest_seconds: set.rest_seconds,
                        is_video_required: set.is_video_required,
                        notes: set.notes
                    }));

                    const { error: createSetsError } = await supabase
                        .from('training_sets')
                        .insert(newSets);

                    if (createSetsError) throw createSetsError;
                }
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

    /** Aplica una plantilla a una sesión: crea ejercicios + series al final del día. */
    async applyDayTemplate(sessionId: string, template: DayTemplate, coachId: string, startOrder: number): Promise<void> {
        let order = startOrder;
        for (const ex of template.payload) {
            const exerciseId = await this.findOrCreateExercise(ex.name, coachId);
            const { data: newEx, error } = await supabase
                .from('session_exercises')
                .insert({
                    session_id: sessionId,
                    exercise_id: exerciseId,
                    order_index: order++,
                    notes: ex.notes || null,
                    variant_name: ex.variant_name || null,
                    rpe: ex.rpe || null,
                    velocity_avg: ex.velocity_avg || null,
                    rest_seconds: ex.rest_seconds || null
                })
                .select()
                .single();

            if (error) throw error;

            if (ex.sets && ex.sets.length > 0) {
                const { error: setsError } = await supabase
                    .from('training_sets')
                    .insert(ex.sets.map((s, i) => ({
                        session_exercise_id: newEx.id,
                        order_index: i,
                        target_reps: s.target_reps,
                        target_rpe: s.target_rpe,
                        target_load: s.target_load,
                        rest_seconds: s.rest_seconds,
                        is_video_required: false
                    })));
                if (setsError) throw setsError;
            }
        }
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

    async copyWeek(blockId: string, sourceWeek: number): Promise<number> {
        // 1. Add a new week to the block
        const newEndWeek = await this.addWeek(blockId);

        // 2. Get sessions from source week
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
        if (!sourceSessions || sourceSessions.length === 0) return newEndWeek;

        // 3. Duplicate sessions
        for (const session of sourceSessions) {
            // Create new session
            const { data: newSession, error: createSessionError } = await supabase
                .from('training_sessions')
                .insert({
                    block_id: blockId,
                    week_number: newEndWeek,
                    day_number: session.day_number,
                    day_of_week: session.day_of_week ?? null,
                    name: session.name,
                    date: null, // Clear date for copied session
                    notes: session.notes
                })
                .select()
                .single();

            if (createSessionError) throw createSessionError;

            // Copy exercises
            if (session.session_exercises && session.session_exercises.length > 0) {
                for (const ex of session.session_exercises) {
                    const { data: newEx, error: createExError } = await supabase
                        .from('session_exercises')
                        .insert({
                            session_id: newSession.id,
                            exercise_id: ex.exercise_id,
                            order_index: ex.order_index,
                            notes: ex.notes
                        })
                        .select()
                        .single();

                    if (createExError) throw createExError;

                    // Copy sets
                    if (ex.training_sets && ex.training_sets.length > 0) {
                        const newSets = ex.training_sets.map((set: TrainingSet) => ({
                            session_exercise_id: newEx.id,
                            order_index: set.order_index,
                            target_reps: set.target_reps,
                            target_rpe: set.target_rpe,
                            target_load: set.target_load,
                            rest_seconds: set.rest_seconds,
                            is_video_required: set.is_video_required,
                            notes: set.notes
                        }));

                        const { error: createSetsError } = await supabase
                            .from('training_sets')
                            .insert(newSets);

                        if (createSetsError) throw createSetsError;
                    }
                }
            }
        }

        return newEndWeek;
    }
};
