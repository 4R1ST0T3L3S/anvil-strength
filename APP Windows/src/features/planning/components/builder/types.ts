import type { TrainingSession, SessionExercise, TrainingSet, ExerciseLibrary, TrainingBlock } from '../../../../types/training';

// ==========================================
// TYPES FOR LOCAL STATE
// ==========================================
// We extend the base types to include relations nested for easier rendering
export interface ExtendedSession extends TrainingSession {
    exercises: ExtendedSessionExercise[];
}

export interface ExtendedSessionExercise extends SessionExercise {
    exercise?: ExerciseLibrary;
    sets: TrainingSet[];
}

export interface FullBlockData extends TrainingBlock {
    sessions: ExtendedSession[];
}

/**
 * Cambios que acepta `updateSessionExercise`.
 *
 * `exercise` se saca de `Partial<SessionExercise>` con `Omit` a propósito. En
 * `SessionExercise` esa clave es la ficha ENTERA de la biblioteca, así que la
 * intersección con `{ exercise?: Partial<ExerciseLibrary> }` daba
 * `ExerciseLibrary & Partial<ExerciseLibrary>` — es decir, seguía exigiendo la
 * ficha entera y hacía imposible mandar solo el campo que cambia. La
 * implementación SÍ fusiona parciales (`{ ...ex.exercise, ...updates.exercise }`);
 * lo que no encajaba era el tipo.
 */
export type ExerciseCardUpdates =
    Omit<Partial<SessionExercise>, 'exercise'> & { exercise?: Partial<ExerciseLibrary> };
