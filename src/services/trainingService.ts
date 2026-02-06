import { supabase } from '../lib/supabase';
import { TrainingBlock, TrainingSession, ExerciseLibrary, SessionExercise, TrainingSet } from '../types/training';

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
            .order('created_at', { ascending: false });

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

    /**
     * Toggle block active status
     */
    async toggleBlockStatus(blockId: string, isActive: boolean): Promise<void> {
        const { error } = await supabase
            .from('training_blocks')
            .update({ is_active: isActive })
            .eq('id', blockId);

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

    async updateSessionExercise(id: string, updates: Partial<SessionExercise>): Promise<SessionExercise> {
        const { data, error } = await supabase
            .from('session_exercises')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                exercise:exercise_library(*)
            `)
            .single();

        if (error) throw error;
        return data;
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

    async updateSetActuals(setId: string, actuals: { actual_reps?: string; actual_load?: number; actual_rpe?: string }): Promise<TrainingSet> {
        // This is wrapper around updateSet but semantically for athletes
        return this.updateSet(setId, actuals as unknown as Partial<TrainingSet>);
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

    async findOrCreateExercise(name: string, coachId?: string): Promise<string> {
        // 1. Search for existing (public or owned by coach) - Case insensitive search would be ideal but exact match is faster/simpler for now
        // We can use ilike name
        const { data: existing } = await supabase
            .from('exercise_library')
            .select('id')
            .ilike('name', name)
            .maybeSingle();

        if (existing) return existing.id;

        // 2. Create new if not found
        // If coachId is provided, assign to coach, else it's questionable (maybe public=false, coach=payload.user.id?)
        // For now we assume the current user (coach) is creating it.
        // We need to handle the case where coachId is needed.
        // Actually, let's just insert. RLS will handle the auth.uid() usually, but we need to pass coach_id explicitly if we want it in the column.

        // We'll trust supabase.auth.getUser() on the client side calls or pass it in. 
        // Ideally we pass coachId.

        const insertPayload: any = { name };

        if (coachId) {
            console.log("Creating exercise for coach:", coachId);
        }

        const { data: newExercise, error } = await supabase
            .from('exercise_library')
            .insert(insertPayload)
            .select('id')
            .single();

        if (error) throw error;
        return newExercise.id;
    }
};
