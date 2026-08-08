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
    /**
     * Parte del día. Ausente en plantillas guardadas antes de
     * database/CALENTAMIENTO_ESTRUCTURADO.sql: equivale a 'main', que es lo
     * que eran todas antes de que existiera la sección de calentamiento.
     *
     * Sin este campo, guardar como plantilla un día con calentamiento
     * estructurado y volver a aplicarla convertía la movilidad en trabajo
     * principal — la contaminación de métricas que la sección vino a evitar.
     */
    section?: ExerciseSection | null;
    round_count?: number | null;
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
    /**
     * Cuándo cerró el atleta este día. NULL = todavía no lo ha dado por
     * terminado. Es una marca de tiempo y no un booleano porque "cuándo"
     * responde a preguntas que "sí/no" no puede: a qué hora entrena, si
     * entrena el día que le toca, cuántos días lleva sin aparecer.
     * Ver database/admin_role_and_session_completion.sql.
     */
    completed_at?: string | null;
    /** Cómo fue el día, en palabras del atleta. Distinto de las notas por serie. */
    athlete_notes?: string | null;
    /**
     * Apéndices del día, en texto libre. NO son ejercicios: no cuentan para el
     * volumen, el tonelaje ni el reparto por patrón. Ausentes en bases sin
     * database/session_warmup_extras.sql aplicado.
     */
    warmup?: string | null;
    /**
     * CONSIDERACIONES DEL ENTRENAMIENTO. En la interfaz se llaman así; la
     * columna sigue llamándose `extras`.
     *
     * El desfase es deliberado. Nacieron como "trabajo opcional al terminar"
     * (core, movilidad, cardio) y se pintaban al FINAL del día. Lo que de
     * verdad se escribía en ellas eran indicaciones para la sesión —"prioriza
     * velocidad", "RPE 7 máximo", "cinturón desde la segunda serie"—, que solo
     * sirven si se leen ANTES de empezar. Así que cambia el nombre y el sitio,
     * no el modelo.
     *
     * Renombrar la columna obligaría a tocar el constructor, el registro, el
     * PDF, la pantalla de inicio y la propia base a cambio de nada: el texto
     * que ya hay dentro es exactamente el mismo texto, esté como esté escrito
     * el nombre de la columna.
     */
    extras?: string | null;
    created_at: string;
    // Relations (Optional for UI rendering)
    exercises?: SessionExercise[];
}

/**
 * Parte del día a la que pertenece un ejercicio.
 *
 * Ver database/CALENTAMIENTO_ESTRUCTURADO.sql. Las filas anteriores a esa
 * migración no traen el campo y valen como 'main': era lo único que había.
 */
export type ExerciseSection = 'warmup' | 'main' | 'accessory';

export const EXERCISE_SECTIONS: { key: ExerciseSection; label: string; hint: string }[] = [
    { key: 'warmup', label: 'Calentamiento', hint: 'No cuenta para el volumen ni el tonelaje' },
    { key: 'main', label: 'Principal', hint: 'El trabajo del día' },
    { key: 'accessory', label: 'Accesorio', hint: 'Complementario, sí cuenta para el volumen' },
];

/**
 * ¿Este ejercicio cuenta para el volumen, el tonelaje y el reparto por patrón?
 *
 * ES LA FUNCIÓN MÁS IMPORTANTE DE ESTE ARCHIVO, y existe como UNA sola función
 * a propósito.
 *
 * El calentamiento pasó a ser texto libre (database/session_warmup_extras.sql)
 * precisamente porque el entrenador lo metía como ejercicios de mentira y eso
 * inflaba el tonelaje y desviaba el reparto muscular de todos los paneles.
 * Volver a admitir calentamiento como `session_exercises` reabre esa puerta, y
 * lo único que la mantiene cerrada es este filtro.
 *
 * Se aplica en el ORIGEN de los datos —`getExerciseHistoryByAthlete`,
 * `getExecutionLog` y `toVolumeInput`— y no en cada pantalla: cinco
 * condiciones repartidas por la aplicación es una que alguien se dejará.
 *
 * Los ACCESORIOS sí cuentan: son entrenamiento de verdad. Lo que no cuenta es
 * la movilidad y las aproximaciones.
 */
export function countsForVolume(section?: string | null): boolean {
    return (section ?? 'main') !== 'warmup';
}

// 4. SESSION EXERCISES (Ejercicios en la sesión)
export interface SessionExercise {
    id: string;
    session_id: string;
    exercise_id: string;
    order_index: number;
    /**
     * Parte del día. Ausente en filas anteriores a la migración: equivale a
     * 'main'. No se lee nunca a pelo para decidir si cuenta para las métricas
     * — para eso está `countsForVolume()`.
     */
    section?: ExerciseSection | null;
    /**
     * Vueltas del circuito que forman los ejercicios con el mismo `group_tag`.
     * NULL = no es un circuito.
     *
     * Va en el ejercicio y no en la serie porque son las mismas rondas para
     * todo el grupo: por serie se podría escribir un circuito de 3 rondas cuyo
     * segundo ejercicio dijera 4, que no significa nada.
     */
    round_count?: number | null;
    notes?: string | null;
    variant_name?: string | null; // For specific variations
    rpe?: string | null; // Moved from Set level
    velocity_avg?: string | null;
    rest_seconds?: number | null; // Moved from Set level
    vbt_file_url?: string | null; // New field for VBT files
    modifiers?: string[]; // Extras / Tags for the exercise
    /**
     * Anulación de la clasificación muscular PARA ESTA PRESCRIPCIÓN.
     *
     * Va aquí y no solo en `exercise_library` porque la de la biblioteca es
     * global: cambiarla afecta a todos los atletas y a todos los bloques. Un
     * mismo remo puede ser dorsal directo en un bloque de espalda y accesorio
     * de espalda alta en uno de press. El coach decide caso a caso.
     *
     * NULL = "no opino, hereda". Un array VACÍO = "no aporta volumen a
     * nadie", que es lo que hay que poder decir de una movilidad metida como
     * ejercicio. Ver database/MEJORAS_ANALISIS_VBT.sql.
     */
    primary_muscles?: string[] | null;
    secondary_muscles?: string[] | null;
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

/**
 * Técnica de intensidad aplicada a una serie.
 *
 * NO incluye superserie ni triserie: esas no son un tipo de serie sino una
 * relación entre ejercicios distintos, y viven en `group_tag`. Meterlas aquí
 * obligaría a que una serie declarase con quién se encadena sin tener dónde
 * decirlo.
 */
export type SetType = 'dropset' | 'rest_pause' | 'cluster' | 'myo_reps' | 'amrap';

/**
 * Cómo se presenta cada técnica y qué se le pide al coach.
 *
 * `detailHint` es el ejemplo que aparece como marcador de posición: sin él,
 * "detalle" es una casilla en blanco y cada coach inventa su notación, que es
 * exactamente lo que hace que el atleta no entienda lo que le han puesto.
 */
export const SET_TYPES: {
    key: SetType;
    label: string;
    short: string;
    detailHint: string;
    hint: string;
}[] = [
        {
            key: 'dropset',
            label: 'Dropset',
            short: 'DROP',
            detailHint: '-20% x2',
            hint: 'Al fallo, bajas el peso y sigues sin descansar',
        },
        {
            key: 'rest_pause',
            label: 'Rest-pause',
            short: 'R-P',
            detailHint: '15s x3',
            hint: 'Al fallo, pausa corta y más repeticiones con el mismo peso',
        },
        {
            key: 'cluster',
            label: 'Cluster',
            short: 'CLU',
            detailHint: '3+3+3 / 20s',
            hint: 'La serie se parte en microseries con pausas dentro',
        },
        {
            key: 'myo_reps',
            label: 'Myo-reps',
            short: 'MYO',
            detailHint: '12 + 4x4',
            hint: 'Serie de activación y luego miniseries seguidas',
        },
        {
            key: 'amrap',
            label: 'AMRAP',
            short: 'AMRAP',
            detailHint: 'mínimo 8',
            hint: 'Todas las repeticiones que salgan con buena técnica',
        },
    ];

export const setTypeLabel = (type?: SetType | null): string | null =>
    SET_TYPES.find(t => t.key === type)?.label ?? null;

export const setTypeShort = (type?: SetType | null): string | null =>
    SET_TYPES.find(t => t.key === type)?.short ?? null;

/**
 * Etiquetas de encadenado disponibles.
 *
 * Letras y no números: "Superserie A" no se confunde con "Día 2" ni con
 * "Semana 3", y en la pantalla del atleta un chip con una letra cabe donde
 * "Superserie 1" no.
 */
export const GROUP_TAGS = ['A', 'B', 'C', 'D'] as const;

/**
 * Cómo se llama un encadenado según cuántos ejercicios lo forman.
 *
 * Lo decide el número real de ejercicios que comparten la etiqueta, no el
 * coach: si marca tres y luego borra uno, el chip tiene que dejar de decir
 * "triserie" solo. Un encadenado de uno no es nada y se dice así, porque el
 * caso normal de verlo es haber marcado el primero y no el segundo todavía.
 */
export function groupLabel(exerciseCount: number): string {
    if (exerciseCount >= 4) return `Serie encadenada ×${exerciseCount}`;
    if (exerciseCount === 3) return 'Triserie';
    if (exerciseCount === 2) return 'Superserie';
    return 'Sin encadenar';
}

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
    /**
     * La serie está hecha. La columna existe en la base de datos desde el
     * esquema original pero el registro no la usaba: deducía "hecha" de
     * `actual_reps && actual_load`, lo que hacía imposible cerrar una serie
     * corporal —sin kilos— y daba por hecha una en la que solo se había
     * tocado el peso.
     */
    is_completed?: boolean | null;

    /**
     * Técnica de intensidad de ESTA serie. NULL —el 95% de las filas— es una
     * serie normal. Ver database/MIGRACION_PENDIENTE.sql.
     */
    set_type?: SetType | null;
    /**
     * Parámetros de la técnica, en texto corto y tal cual los escribe el
     * coach: "-20% x2" en un dropset, "15s x3" en un cluster.
     *
     * Texto libre y no campos numéricos porque cada técnica se parametriza
     * distinto —un dropset por porcentaje, un rest-pause por segundos, un
     * cluster por ambos— y una rejilla que valga para todas acabaría con la
     * mitad de las casillas vacías en cada caso.
     */
    set_detail?: string | null;
    /**
     * Etiqueta de encadenado. Las series de EJERCICIOS DISTINTOS que
     * comparten etiqueta dentro de un día se ejecutan alternando: dos
     * ejercicios son una superserie, tres una triserie.
     *
     * Va aquí y no en `set_type` porque "superserie" no es una propiedad de
     * una serie suelta: es una relación entre varias, y sin la etiqueta no se
     * podría decir CON QUÉ se encadena — que es justo lo que el atleta
     * necesita saber.
     */
    group_tag?: string | null;

    // Feedback / Media
    is_video_required: boolean;
    video_url?: string | null;
    vbt_file_url?: string | null; // Archivo de encoder asociado a ESTA serie

    /**
     * MÉTRICAS VBT DE ESTA SERIE.
     *
     * El CSV del encoder es materia prima; esto es el resumen consultable.
     * Sin estas columnas, pintar el perfil carga-velocidad de un bloque
     * obligaba a descargar y volver a parsear treinta ficheros.
     *
     * Ver database/MEJORAS_ANALISIS_VBT.sql.
     */
    /** Velocidad media concéntrica, m/s. La métrica de referencia en VBT. */
    vbt_mean_velocity?: number | null;
    vbt_peak_velocity?: number | null;
    /** Caída de velocidad DENTRO de la serie, en %. */
    vbt_velocity_loss?: number | null;
    vbt_mean_power?: number | null;
    vbt_peak_power?: number | null;
    /** Recorrido, en metros. */
    vbt_rom?: number | null;
    vbt_est_1rm?: number | null;
    /** De dónde salen los números. */
    vbt_source?: VbtSource | null;

    order_index: number;
    created_at: string;
    notes?: string | null;
}

/**
 * De dónde sale una medición de velocidad.
 *
 * Importa al leerla: un `encoder` mide de verdad, `video` lo estima con
 * visión artificial sobre un vídeo de móvil y `manual` es lo que alguien
 * copió de otra pantalla. Mezclarlas sin decir cuál es cuál convertiría un
 * perfil de cargas en una nube de puntos de fiabilidad desconocida.
 */
export type VbtSource = 'encoder' | 'video' | 'manual';

export const VBT_SOURCES: { key: VbtSource; label: string; hint: string }[] = [
    { key: 'encoder', label: 'Encoder', hint: 'Medido por un dispositivo (CSV)' },
    { key: 'video', label: 'Vídeo', hint: 'Estimado con PWR Análisis' },
    { key: 'manual', label: 'Manual', hint: 'Introducido a mano' },
];

/**
 * Métricas VBT de una serie, agrupadas.
 *
 * Existe como tipo propio porque las mismas siete cifras viajan entre
 * `training_sets`, `vbt_measurements` y el analizador de vídeo, y tenerlas
 * sueltas en tres sitios garantizaba que antes o después dejaran de
 * coincidir.
 */
export interface VbtMetrics {
    meanVelocity?: number | null;
    peakVelocity?: number | null;
    velocityLoss?: number | null;
    meanPower?: number | null;
    peakPower?: number | null;
    rom?: number | null;
    est1RM?: number | null;
}

/**
 * Medición VBT que NO cuelga de una serie programada.
 *
 * El caso que la justifica: un perfil de cargas hecho una tarde suelta, sin
 * bloque abierto. Obligar a que toda medición colgase del plan haría
 * imposible medir antes de programar, que es el orden natural.
 */
export interface VbtMeasurement {
    id: string;
    athlete_id: string;
    created_by?: string | null;
    exercise_id?: string | null;
    exercise_name: string;
    /** Enlace opcional con el plan, cuando la medición sí es de una serie. */
    training_set_id?: string | null;
    session_exercise_id?: string | null;
    performed_at: string;
    set_number?: number | null;
    reps?: number | null;
    load_kg?: number | null;
    mean_velocity?: number | null;
    peak_velocity?: number | null;
    velocity_loss?: number | null;
    mean_power?: number | null;
    peak_power?: number | null;
    rom?: number | null;
    est_1rm?: number | null;
    /** Velocidad de cada repetición, en orden. Dibuja la caída de la serie. */
    rep_velocities?: number[] | null;
    file_url?: string | null;
    source: VbtSource;
    notes?: string | null;
    created_at: string;
}
