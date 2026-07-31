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
    /**
     * Anulación de la clasificación por defecto del motor de volumen.
     * Si vienen informadas, mandan sobre las reglas de lib/volume/muscles.ts.
     * Ver database/exercise_muscle_mapping.sql.
     */
    primary_muscles?: string[] | null;
    secondary_muscles?: string[] | null;
    is_public: boolean;
    created_at: string;
}

export interface TrainingWeek {
    id: string;
    block_id: string;
    week_number: number;
    name: string;
    /**
     * Interruptor del coach. Si es FALSE el atleta no ve la semana aunque su
     * fecha ya haya llegado. La mayoría de semanas NO tienen fila en
     * training_weeks: la ausencia equivale a visible.
     * Ver database/week_visibility_and_scheduling.sql.
     */
    is_visible: boolean;
    created_at: string;
}

/** Metadatos de una semana tal y como los consume el constructor. */
export interface WeekMeta {
    name: string | null;
    isVisible: boolean;
}

/**
 * Día de la semana al que el coach agenda una sesión. Es OPCIONAL: sin él, el
 * día se identifica por su `day_number` ("Día 1", "Día 2"...), que es como
 * funcionaba la app antes de poder agendarlos.
 */
export type Weekday =
    | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
    | 'friday' | 'saturday' | 'sunday';

/** Orden y etiquetas de los días. El índice es el ISO: lunes = 1. */
export const WEEKDAYS: { key: Weekday; label: string; short: string; index: number }[] = [
    { key: 'monday', label: 'Lunes', short: 'Lun', index: 1 },
    { key: 'tuesday', label: 'Martes', short: 'Mar', index: 2 },
    { key: 'wednesday', label: 'Miércoles', short: 'Mié', index: 3 },
    { key: 'thursday', label: 'Jueves', short: 'Jue', index: 4 },
    { key: 'friday', label: 'Viernes', short: 'Vie', index: 5 },
    { key: 'saturday', label: 'Sábado', short: 'Sáb', index: 6 },
    { key: 'sunday', label: 'Domingo', short: 'Dom', index: 7 },
];

export const weekdayLabel = (day?: string | null): string | null =>
    WEEKDAYS.find(d => d.key === day)?.label ?? null;

export const weekdayIndex = (day?: string | null): number | null =>
    WEEKDAYS.find(d => d.key === day)?.index ?? null;

// 1a. DAY TEMPLATES (días reutilizables entre atletas)
export interface DayTemplateSet {
    target_reps?: string | null;
    target_rpe?: string | null;
    target_load?: number | null;
    rest_seconds?: number | null;
}

export interface DayTemplateExercise {
    name: string;
    variant_name?: string | null;
    notes?: string | null;
    rpe?: string | null;
    velocity_avg?: string | null;
    rest_seconds?: number | null;
    sets: DayTemplateSet[];
}

export interface DayTemplate {
    id: string;
    coach_id: string;
    name: string;
    payload: DayTemplateExercise[];
    created_at: string;
}

// 1b. MACROCYCLES (agrupan bloques, opcionalmente ligados a una competición)
export interface Macrocycle {
    id: string;
    coach_id: string;
    athlete_id: string;
    name: string;
    competition_name?: string | null;
    competition_date?: string | null;
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
    description?: string | null; // Objetivos/explicación del bloque, visible para el atleta
    objectives?: string | null;
    macro_id?: string | null; // Macrociclo al que pertenece
    /**
     * Días ANTES del lunes en que cada semana se le abre al atleta.
     * 1 (por defecto) = el domingo anterior. 0 = el mismo lunes.
     * Ausente en bloques anteriores a la migración: equivale a 1.
     */
    release_offset_days?: number | null;
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
    /** Día de la semana agendado. NULL = el día se identifica por day_number. */
    day_of_week?: Weekday | null;
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
    vbt_file_url?: string | null; // New field for VBT files
    modifiers?: string[]; // Extras / Tags for the exercise
    created_at: string;

    // Joint Relation
    exercise?: ExerciseLibrary; // The details (name, etc.)
    sets?: TrainingSet[];
}

/**
 * Unidad en la que se prescribe una serie. Ver database/set_target_metric.sql.
 *
 * El valor vive en `target_rpe` cuando la métrica es 'rpe' —es la única que se
 * pauta en rango ("7-8") y ya tenía datos escritos ahí— y en `target_load` en
 * todos los demás casos.
 */
export type TargetMetric = 'kg' | 'rir' | 'rpe' | 'vel' | 'vel_loss';

/** Etiqueta y sufijo de cada métrica, para no repetirlos por la interfaz. */
export const TARGET_METRICS: {
    key: TargetMetric;
    label: string;
    unit: string;
    hint: string;
}[] = [
        { key: 'kg', label: 'Kg', unit: 'kg', hint: 'Carga absoluta' },
        { key: 'rpe', label: 'RPE', unit: '', hint: 'Esfuerzo percibido, admite rango (7-8)' },
        { key: 'rir', label: 'RIR', unit: '', hint: 'Repeticiones en recámara' },
        { key: 'vel', label: 'Vel', unit: 'm/s', hint: 'Velocidad media objetivo' },
        { key: 'vel_loss', label: 'Pérdida', unit: '%', hint: 'Pérdida de velocidad permitida' },
    ];

// 5. TRAINING SETS (La tabla crítica)
export interface TrainingSet {
    id: string;
    session_exercise_id: string;

    // Target Fields (Prescribed by Coach)
    target_reps?: string | null; // "5-6", "RIR 2"
    /**
     * Valor numérico de la prescripción. Su UNIDAD la dice `target_metric`:
     * son kilos por defecto, pero también pueden ser RIR, m/s o % de pérdida.
     * No asumir kilos sin comprobar la métrica — el tonelaje saldría inventado.
     */
    target_load?: number | null;
    /** Unidad de `target_load`. Ausente en filas antiguas: equivale a 'kg'. */
    target_metric?: TargetMetric | null;
    target_rpe?: string | null; // "@8"
    rest_seconds?: number | null;

    // Actual Fields (Filled by Athlete)
    actual_reps?: number | null;
    actual_load?: number | null;
    actual_rpe?: number | null; // Precise RPE (e.g. 8.5)

    // Feedback / Media
    is_video_required: boolean;
    video_url?: string | null;
    vbt_file_url?: string | null; // Archivo de encoder asociado a ESTA serie

    order_index: number;
    created_at: string;
    notes?: string | null;
}
