/**
 * ANVIL STRENGTH — TAXONOMÍA MUSCULAR Y CLASIFICACIÓN DE EJERCICIOS
 *
 * Decide, para un nombre de ejercicio, qué músculos trabaja como motor
 * PRIMARIO (volumen directo) y cuáles como SINERGISTA (volumen indirecto).
 *
 * ¿Por qué reglas por patrón y no una tabla nombre → músculos?
 * Porque `trainingService.findOrCreateExercise()` crea ejercicios a partir
 * de texto libre que escribe el coach. Una tabla exacta fallaría con
 * "Sentadilla búlgara con mancuernas" o "Banca agarre cerrado pausada".
 * Las reglas se evalúan de la MÁS específica a la MÁS genérica y la primera
 * que casa gana, así que "Peso muerto rumano" no cae en "peso muerto".
 *
 * La clasificación se puede sobrescribir por ejercicio desde la base de
 * datos (columnas `primary_muscles` / `secondary_muscles` de
 * exercise_library, ver database/exercise_muscle_mapping.sql). Estas reglas
 * son el valor por defecto y la red de seguridad.
 */

export const MUSCLE_GROUPS = [
    'Cuádriceps',
    'Isquiosurales',
    'Glúteo',
    'Aductores',
    'Gemelo',
    'Erectores',
    'Dorsal',
    'Espalda alta',
    'Trapecio',
    'Pecho',
    'Hombro anterior',
    'Hombro lateral',
    'Hombro posterior',
    'Tríceps',
    'Bíceps',
    'Antebrazo',
    'Core',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Orden de presentación: de tren inferior a superior, y core al final. */
export const MUSCLE_DISPLAY_ORDER: MuscleGroup[] = [...MUSCLE_GROUPS];

/**
 * Patrón de movimiento. Sirve para agrupar la progresión de cargas y para
 * colorear la interfaz sin depender del nombre exacto del ejercicio.
 */
export type MovementPattern =
    | 'squat'
    | 'bench'
    | 'deadlift'
    | 'press'
    | 'pull'
    | 'hinge'
    | 'accessory'
    | 'core';

export interface ExerciseClassification {
    /** Músculos motores. Cada serie cuenta 1.0 para estos. */
    primary: MuscleGroup[];
    /** Sinergistas. Cada serie cuenta una fracción (ver INDIRECT_FACTOR). */
    secondary: MuscleGroup[];
    pattern: MovementPattern;
    /** true si la regla que casó fue el comodín final. */
    inferred?: boolean;
}

/**
 * Peso con el que una serie sinergista cuenta como volumen.
 *
 * Era 0.5, la convención de conteo fraccionado de Israetel y otros: una serie
 * de press banca aporta media serie de tríceps.
 *
 * Se sube a 1.0 por decisión del club (2026-07-30): un músculo que participa
 * en un multiarticular recibe estímulo real, y contarlo a mitad infravaloraba
 * sistemáticamente el trabajo de tríceps, deltoides y espalda alta en un
 * programa de powerlifting, donde casi todo el volumen es multiarticular.
 *
 * La comparación con los rangos de referencia NO se rompe porque `direct` y
 * `total` se siguen guardando por separado: los rangos se comparan contra
 * `direct`, que sigue significando exactamente lo mismo que antes.
 */
export const INDIRECT_FACTOR = 1.0;

/**
 * ¿Es un ejercicio analítico?
 *
 * Regla: trabaja un solo grupo muscular como motor y no arrastra sinergistas
 * relevantes. Unas elevaciones laterales o un curl entran aquí; un press
 * banca no.
 *
 * Importa porque en un analítico la serie es DIRECTA sin discusión, mientras
 * que en un multiarticular el reparto es lo que se acaba de redefinir arriba.
 */
export function isAnalytical(cls: {
    primary: MuscleGroup[];
    secondary: MuscleGroup[];
}): boolean {
    return cls.primary.length === 1 && cls.secondary.length === 0;
}

interface Rule {
    /** Se evalúa contra el nombre normalizado (minúsculas, sin acentos). */
    match: RegExp;
    primary: MuscleGroup[];
    secondary: MuscleGroup[];
    pattern: MovementPattern;
}

/**
 * De más específica a más genérica. El orden ES la lógica: mover una regla
 * hacia abajo cambia resultados.
 */
const RULES: Rule[] = [
    // ---------------- BISAGRA DE CADERA (antes que "peso muerto") --------
    {
        match: /rumano|piernas rigidas|stiff|rdl/,
        primary: ['Isquiosurales', 'Glúteo'],
        secondary: ['Erectores', 'Dorsal', 'Antebrazo'],
        pattern: 'hinge',
    },
    {
        match: /buenos dias|good morning/,
        primary: ['Isquiosurales', 'Erectores'],
        secondary: ['Glúteo', 'Core'],
        pattern: 'hinge',
    },
    {
        match: /hip thrust|empuje de cadera|puente de gluteo/,
        primary: ['Glúteo'],
        secondary: ['Isquiosurales', 'Cuádriceps'],
        pattern: 'hinge',
    },
    {
        match: /rack pull|desde bloques|deficit/,
        primary: ['Erectores', 'Dorsal', 'Glúteo'],
        secondary: ['Isquiosurales', 'Trapecio', 'Antebrazo'],
        pattern: 'deadlift',
    },

    // ---------------- PESO MUERTO ---------------------------------------
    {
        // El sumo desplaza carga hacia cuádriceps y aductores respecto al
        // convencional; contarlos igual falsearía el volumen de pierna.
        match: /peso muerto sumo|sumo/,
        primary: ['Glúteo', 'Cuádriceps', 'Aductores'],
        secondary: ['Erectores', 'Dorsal', 'Trapecio', 'Antebrazo'],
        pattern: 'deadlift',
    },
    {
        match: /peso muerto|deadlift/,
        primary: ['Erectores', 'Glúteo', 'Isquiosurales'],
        secondary: ['Dorsal', 'Trapecio', 'Cuádriceps', 'Antebrazo'],
        pattern: 'deadlift',
    },

    // ---------------- SENTADILLA ----------------------------------------
    {
        match: /sentadilla frontal|front squat/,
        primary: ['Cuádriceps'],
        secondary: ['Glúteo', 'Erectores', 'Core', 'Aductores'],
        pattern: 'squat',
    },
    {
        match: /sentadilla bulgara|zancada|lunge|split squat/,
        primary: ['Cuádriceps', 'Glúteo'],
        secondary: ['Isquiosurales', 'Aductores', 'Core'],
        pattern: 'accessory',
    },
    {
        match: /belt squat|sentadilla cinturon/,
        primary: ['Cuádriceps', 'Glúteo'],
        secondary: ['Aductores'],
        pattern: 'squat',
    },
    {
        match: /sentadilla|squat/,
        primary: ['Cuádriceps', 'Glúteo'],
        secondary: ['Erectores', 'Aductores', 'Isquiosurales', 'Core'],
        pattern: 'squat',
    },
    {
        match: /prensa|leg press|hack/,
        primary: ['Cuádriceps'],
        secondary: ['Glúteo', 'Aductores'],
        pattern: 'accessory',
    },
    {
        match: /extension de cuadriceps|leg extension/,
        primary: ['Cuádriceps'],
        secondary: [],
        pattern: 'accessory',
    },
    {
        match: /curl femoral|leg curl/,
        primary: ['Isquiosurales'],
        secondary: ['Gemelo'],
        pattern: 'accessory',
    },
    {
        match: /gemelo|soleo|calf/,
        primary: ['Gemelo'],
        secondary: [],
        pattern: 'accessory',
    },

    // ---------------- EMPUJE HORIZONTAL ---------------------------------
    {
        match: /agarre cerrado|close grip|jm press|press frances|extension de triceps|fondos en banco|press de triceps/,
        primary: ['Tríceps'],
        secondary: ['Pecho', 'Hombro anterior'],
        pattern: 'accessory',
    },
    {
        match: /press inclinado|incline/,
        primary: ['Pecho', 'Hombro anterior'],
        secondary: ['Tríceps'],
        pattern: 'press',
    },
    {
        match: /fondos|dips/,
        primary: ['Pecho', 'Tríceps'],
        secondary: ['Hombro anterior'],
        pattern: 'press',
    },
    {
        match: /apertura|fly|pec deck|cruce de poleas/,
        primary: ['Pecho'],
        secondary: ['Hombro anterior'],
        pattern: 'accessory',
    },
    {
        match: /banca|bench|press de pecho/,
        primary: ['Pecho'],
        secondary: ['Tríceps', 'Hombro anterior'],
        pattern: 'bench',
    },

    // ---------------- EMPUJE VERTICAL -----------------------------------
    {
        match: /press militar|overhead press|press de hombro|push press/,
        primary: ['Hombro anterior'],
        secondary: ['Tríceps', 'Hombro lateral', 'Core'],
        pattern: 'press',
    },
    {
        match: /elevacion lateral|lateral raise/,
        primary: ['Hombro lateral'],
        secondary: [],
        pattern: 'accessory',
    },
    {
        match: /face pull|pajaro|reverse fly|posterior/,
        primary: ['Hombro posterior'],
        secondary: ['Espalda alta', 'Trapecio'],
        pattern: 'accessory',
    },

    // ---------------- TRACCIÓN ------------------------------------------
    {
        match: /dominada|pull up|chin up|jalon|pulldown/,
        primary: ['Dorsal'],
        secondary: ['Bíceps', 'Espalda alta', 'Antebrazo'],
        pattern: 'pull',
    },
    {
        match: /remo|row/,
        primary: ['Espalda alta', 'Dorsal'],
        secondary: ['Bíceps', 'Hombro posterior', 'Antebrazo', 'Erectores'],
        pattern: 'pull',
    },
    {
        match: /encogimiento|shrug|trapecio/,
        primary: ['Trapecio'],
        secondary: ['Antebrazo'],
        pattern: 'accessory',
    },
    {
        match: /curl de biceps|curl martillo|curl predicador|biceps/,
        primary: ['Bíceps'],
        secondary: ['Antebrazo'],
        pattern: 'accessory',
    },

    // ---------------- CORE Y AGARRE -------------------------------------
    {
        match: /farmer|paseo del granjero|agarre|grip/,
        primary: ['Antebrazo'],
        secondary: ['Trapecio', 'Core'],
        pattern: 'accessory',
    },
    {
        match: /plancha|rueda abdominal|ab wheel|pallof|abdominal|crunch|hollow|dead bug/,
        primary: ['Core'],
        secondary: [],
        pattern: 'core',
    },
    {
        match: /hiperextension|lumbar|back extension/,
        primary: ['Erectores'],
        secondary: ['Glúteo', 'Isquiosurales'],
        pattern: 'accessory',
    },
];

/** Minúsculas y sin acentos: el coach escribe "Sentadilla" o "sentadilla". */
function normalize(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim();
}

/**
 * Variante en singular del nombre, palabra a palabra.
 *
 * POR QUÉ HACE FALTA
 * Las reglas casan por subcadena, así que los plurales de una sola palabra ya
 * funcionaban: "dominada" está dentro de "dominadas". Pero en un patrón de
 * varias palabras el plural se cuela EN MEDIO y lo rompe: "elevacion lateral"
 * no está dentro de "elevaciones laterales". Resultado, unas elevaciones
 * laterales escritas en plural —que es como las escribe todo el mundo— caían
 * en "sin clasificar" y aportaban cero volumen.
 *
 * Cada regla se prueba contra el nombre original Y contra esta variante, así
 * que una singularización incorrecta ("press" -> "pres") no puede perder una
 * coincidencia: como mucho, no aporta ninguna nueva.
 *
 * El umbral de 5 letras evita destrozar palabras cortas.
 */
function singularize(name: string): string {
    return name
        .split(/\s+/)
        .map((w) => {
            // Invariables que ya terminan en -s en singular: biceps, triceps,
            // cuadriceps, press. Cortarlas producía "cuadricep" y dejaba unas
            // "extensiones de cuadriceps" sin clasificar.
            if (/(ps|ss)$/.test(w)) return w;
            if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
            if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
            return w;
        })
        .join(' ');
}

const cache = new Map<string, ExerciseClassification>();

/**
 * Clasifica un ejercicio por su nombre.
 *
 * Cuando ninguna regla casa devuelve `inferred: true` y sin músculos. La
 * interfaz debe mostrar esos ejercicios aparte en lugar de repartirlos a
 * ojo: un volumen inventado es peor que un volumen ausente, porque el coach
 * tomaría decisiones sobre una cifra falsa.
 */
export function classifyExercise(name: string | null | undefined): ExerciseClassification {
    if (!name) return { primary: [], secondary: [], pattern: 'accessory', inferred: true };

    const key = normalize(name);
    const hit = cache.get(key);
    if (hit) return hit;

    const singular = singularize(key);
    const rule = RULES.find((r) => r.match.test(key) || r.match.test(singular));
    const result: ExerciseClassification = rule
        ? { primary: rule.primary, secondary: rule.secondary, pattern: rule.pattern }
        : { primary: [], secondary: [], pattern: 'accessory', inferred: true };

    cache.set(key, result);
    return result;
}

/**
 * Referencias semanales de series DIRECTAS por grupo muscular.
 *
 * Son rangos orientativos de la literatura de hipertrofia, no objetivos.
 * En un bloque de fuerza cercano a competición es normal y correcto estar
 * por debajo del rango: la interfaz los muestra como contexto, nunca como
 * un aprobado o suspenso.
 *
 *   min — por debajo, difícil que haya estímulo suficiente
 *   max — por encima, la recuperación suele ser el factor limitante
 */
export const WEEKLY_SET_REFERENCE: Record<MuscleGroup, { min: number; max: number }> = {
    'Cuádriceps': { min: 8, max: 20 },
    'Isquiosurales': { min: 6, max: 16 },
    'Glúteo': { min: 6, max: 16 },
    'Aductores': { min: 4, max: 12 },
    'Gemelo': { min: 6, max: 16 },
    'Erectores': { min: 6, max: 14 },
    'Dorsal': { min: 8, max: 20 },
    'Espalda alta': { min: 8, max: 20 },
    'Trapecio': { min: 4, max: 12 },
    'Pecho': { min: 8, max: 20 },
    'Hombro anterior': { min: 4, max: 12 },
    'Hombro lateral': { min: 6, max: 20 },
    'Hombro posterior': { min: 4, max: 14 },
    'Tríceps': { min: 6, max: 16 },
    'Bíceps': { min: 6, max: 16 },
    'Antebrazo': { min: 2, max: 10 },
    'Core': { min: 4, max: 14 },
};

export type VolumeVerdict = 'below' | 'in-range' | 'above' | 'none';

/** Compara series semanales directas con el rango de referencia. */
export function assessWeeklyVolume(muscle: MuscleGroup, directSets: number): VolumeVerdict {
    if (directSets <= 0) return 'none';
    const ref = WEEKLY_SET_REFERENCE[muscle];
    if (directSets < ref.min) return 'below';
    if (directSets > ref.max) return 'above';
    return 'in-range';
}
