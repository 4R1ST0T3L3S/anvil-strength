/**
 * ANVIL STRENGTH — PREFERENCIAS, COMO DATOS
 * =====================================================================
 *
 * El mismo patrón que src/lib/export/pdfTheme.ts: el contrato y los valores
 * por defecto viven en código porque son decisiones de diseño, no datos de
 * nadie. Lo que cada entrenador ha elegido vive en `profiles.coach_prefs`
 * (JSONB) y en `profiles.athlete_prefs` para el atleta.
 *
 * REGLA AL AMPLIAR: todo campo nuevo lleva valor por defecto y
 * `resolveCoachPrefs`/`resolveAthletePrefs` lo rellenan. Un `coach_prefs`
 * guardado hace seis meses tiene que seguir abriendo aunque el contrato
 * haya crecido — es lo que permite añadir un ajuste sin migración ni
 * despliegue especial.
 *
 * ALCANCE (decidido el 12/08/2026, no reabrir sin que el usuario lo pida):
 *   - Colores, opacidad por intensidad y ajustes de programación son
 *     SIEMPRE del entrenador. Vale para todos sus atletas.
 *   - El atleta solo puede pisar DOS cosas: la unidad de peso y el primer
 *     día de la semana. Es lo único que varía por persona y no por el
 *     gusto de quien programa.
 */

export type WeightUnit = 'kg' | 'lb';
export type FirstWeekday = 'monday' | 'sunday';
export type IntensityMetric = 'rpe' | 'percent_1rm' | 'relative_to_block_max';
export type IntensityCurve = 'linear' | 'contrast';

export interface SectionColor {
    /** Matiz en grados OKLCH/HSL-ish (0-360), consistente con tokens.css. */
    hue: number;
    /** Saturación 0-100. */
    saturation: number;
}

export interface CoachPrefs {
    brand: {
        /** Ya existe en profiles.brand_color; se refleja aquí para no tener
            dos formularios distintos editando el mismo concepto. */
        athleteAccentFollowsBrand: boolean;
    };
    sectionColors: {
        warmup: SectionColor;
        main: SectionColor;
        accessory: SectionColor;
    };
    intensity: {
        enabled: boolean;
        metric: IntensityMetric;
        curve: IntensityCurve;
        /** Opacidad mínima y máxima que puede tomar un bloque de intensidad. */
        minAlpha: number;
        maxAlpha: number;
    };
    programming: {
        defaultWeeksPerBlock: number;
        defaultDaysPerWeek: number;
        /** Días de antelación con que se abre cada semana al atleta. */
        defaultReleaseOffsetDays: number;
        /** true = "Torso pesado"; false = "Día 1". */
        dayLabelsByName: boolean;
        defaultRestSeconds: number;
        /** Kilos. El redondeo de disco disponible más pequeño. */
        loadRoundingKg: number;
        showRpeToAthlete: boolean;
        showVelocityToAthlete: boolean;
    };
    /** Unidad y primer día por defecto para atletas SIN override propio. */
    defaultUnit: WeightUnit;
    defaultFirstWeekday: FirstWeekday;
}

export interface AthletePrefs {
    unit?: WeightUnit;
    firstWeekday?: FirstWeekday;
}

/**
 * Valores por defecto. Reproducen EXACTAMENTE el comportamiento de hoy: el
 * accesorio verde esmeralda, sentadilla roja, banca azul y muerto morado que
 * ya pinta `getLiftTheme`; el sistema en kg; lunes como primer día (WEEKDAYS
 * en types/training.ts es lunes = 1).
 */
export const DEFAULT_COACH_PREFS: CoachPrefs = {
    brand: {
        athleteAccentFollowsBrand: true,
    },
    sectionColors: {
        // Ámbar — calentamiento, deliberadamente distinto del trabajo principal.
        warmup: { hue: 38, saturation: 92 },
        // Rojo de marca — el mismo tono que --brand en tokens.css.
        main: { hue: 25, saturation: 85 },
        // Esmeralda — el accent-emerald que ya usaba getLiftTheme.
        accessory: { hue: 152, saturation: 60 },
    },
    intensity: {
        enabled: false,
        metric: 'rpe',
        curve: 'linear',
        minAlpha: 0.15,
        maxAlpha: 0.9,
    },
    programming: {
        defaultWeeksPerBlock: 4,
        defaultDaysPerWeek: 4,
        defaultReleaseOffsetDays: 1,
        dayLabelsByName: true,
        defaultRestSeconds: 120,
        loadRoundingKg: 2.5,
        showRpeToAthlete: true,
        showVelocityToAthlete: true,
    },
    defaultUnit: 'kg',
    defaultFirstWeekday: 'monday',
};

export const DEFAULT_ATHLETE_PREFS: Required<AthletePrefs> = {
    unit: 'kg',
    firstWeekday: 'monday',
};

/** Fusión profunda y tolerante: lo guardado puede ser de un contrato más viejo. */
export function resolveCoachPrefs(raw: unknown): CoachPrefs {
    const saved = (raw ?? {}) as Partial<CoachPrefs>;
    return {
        brand: { ...DEFAULT_COACH_PREFS.brand, ...saved.brand },
        sectionColors: {
            warmup: { ...DEFAULT_COACH_PREFS.sectionColors.warmup, ...saved.sectionColors?.warmup },
            main: { ...DEFAULT_COACH_PREFS.sectionColors.main, ...saved.sectionColors?.main },
            accessory: { ...DEFAULT_COACH_PREFS.sectionColors.accessory, ...saved.sectionColors?.accessory },
        },
        intensity: { ...DEFAULT_COACH_PREFS.intensity, ...saved.intensity },
        programming: { ...DEFAULT_COACH_PREFS.programming, ...saved.programming },
        defaultUnit: saved.defaultUnit ?? DEFAULT_COACH_PREFS.defaultUnit,
        defaultFirstWeekday: saved.defaultFirstWeekday ?? DEFAULT_COACH_PREFS.defaultFirstWeekday,
    };
}

/**
 * Preferencias EFECTIVAS del atleta: su propio override sobre lo que su
 * entrenador tenga fijado como valor por defecto. Sin entrenador (o sin
 * prefs suyas), caen en DEFAULT_COACH_PREFS.
 */
export function resolveAthletePrefs(
    athleteRaw: unknown,
    coachPrefs: CoachPrefs | null
): Required<AthletePrefs> {
    const saved = (athleteRaw ?? {}) as Partial<AthletePrefs>;
    return {
        unit: saved.unit ?? coachPrefs?.defaultUnit ?? DEFAULT_ATHLETE_PREFS.unit,
        firstWeekday: saved.firstWeekday ?? coachPrefs?.defaultFirstWeekday ?? DEFAULT_ATHLETE_PREFS.firstWeekday,
    };
}
