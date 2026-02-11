/**
 * ANVIL STRENGTH - TRAINING TYPES
 * Complete type definitions for the Efort Coach style training system.
 */

// 1. EXERCISE LIBRARY
export interface ExerciseLibrary {
    id: string;
    coach_id?: string | null; // Null if system exercise (owned by no one/admin)
    name: string;
    video_url?: string | null;
    muscle_group?: string | null;
    is_public: boolean;
    created_at: string;
}

// 2. TRAINING BLOCKS (Mesociclos)
export interface TrainingBlock {
    id: string;
    coach_id: string;
    athlete_id: string;
    name: string;
    start_date?: string | null;
    end_date?: string | null;
    start_week?: number | null;
    end_week?: number | null;
    is_active: boolean;
    color?: string | null;
    created_at: string;
}

// 3. TRAINING SESSIONS (Days within Weeks)
export interface TrainingSession {
    id: string;
    block_id: string;
    week_number: number; // 1, 2, 3...
    day_number: number; // 1, 2, 3...
    name?: string | null; // "Día 1", "Torso Pesado", etc. (Editable)
    date?: string | null; // Optional specific date
    day_of_week?: string | null; // 'monday', 'tuesday', etc.
    created_at: string;
    // Relations (Optional for UI rendering)
    exercises?: SessionExercise[];
}

// 4. SESSION EXERCISES (Ejercicios en la sesión)
export interface SessionExercise {
    id: string;
    session_id: string;
    exercise_id: string;
    order_index: number;
    notes?: string | null;
    variant_name?: string | null; // For specific variations
    rpe?: string | null; // Moved from Set level
    velocity_avg?: string | null;
    rest_seconds?: number | null; // Moved from Set level
    created_at: string;

    // Joint Relation
    exercise?: ExerciseLibrary; // The details (name, etc.)
    sets?: TrainingSet[];
}

// 5. TRAINING SETS (La tabla crítica)
export interface TrainingSet {
    id: string;
    session_exercise_id: string;

    // Target Fields (Prescribed by Coach)
    target_reps?: string | null; // "5-6", "RIR 2"
    target_load?: number | null; // Optional target weight
    target_rpe?: string | null; // "@8"
    rest_seconds?: number | null;

    // Actual Fields (Filled by Athlete)
    actual_reps?: number | null;
    actual_load?: number | null;
    actual_rpe?: number | null; // Precise RPE (e.g. 8.5)

    // Feedback / Media
    is_video_required: boolean;
    video_url?: string | null;

    order_index: number;
    created_at: string;
}
