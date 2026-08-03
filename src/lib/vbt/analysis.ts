/**
 * ANVIL STRENGTH — ANALÍTICA VBT
 * =====================================================================
 * Cálculo puro sobre mediciones de velocidad. Sin React y sin Supabase, para
 * poder comprobarlo con datos reales y para que la misma cuenta no acabe
 * escrita de tres formas en tres pantallas.
 *
 * UNIDADES, una vez y para siempre: velocidad en m/s, carga en kg, potencia
 * en W, recorrido en m, pérdidas en %.
 *
 * QUÉ NO HACE
 * No inventa. Cuando no hay puntos suficientes para ajustar una recta,
 * devuelve `null` en vez de una estimación con dos puntos que saldría con un
 * R² de 1 y no significaría nada.
 */

import type { VbtMeasurement } from '../../types/training';

// =====================================================================
// UMBRALES
// =====================================================================

/**
 * Velocidad mínima a la que se completa un máximo (MVT).
 *
 * Es específica del ejercicio y bastante estable entre sujetos: el press
 * banca se termina mucho más lento que una sentadilla porque el brazo de
 * palanca en el punto de estancamiento es peor. Usar un valor único para
 * todo —el 0,30 de la sentadilla— sobreestima el 1RM de banca en un 10-15%.
 *
 * Valores de la literatura (González-Badillo, Sánchez-Medina).
 */
export const MVT_BY_PATTERN: Record<string, number> = {
    squat: 0.30,
    bench: 0.17,
    deadlift: 0.15,
    press: 0.19,
    pull: 0.25,
    hinge: 0.20,
    default: 0.25,
};

/** Reconoce el patrón por el nombre para elegir el MVT correcto. */
export function mvtForExercise(name: string | null | undefined): number {
    if (!name) return MVT_BY_PATTERN.default;
    const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    if (/banca|bench|press de pecho/.test(n)) return MVT_BY_PATTERN.bench;
    if (/peso muerto|deadlift/.test(n)) return MVT_BY_PATTERN.deadlift;
    if (/sentadilla|squat/.test(n)) return MVT_BY_PATTERN.squat;
    if (/militar|overhead|press/.test(n)) return MVT_BY_PATTERN.press;
    if (/dominada|remo|jalon|row|pull/.test(n)) return MVT_BY_PATTERN.pull;
    if (/rumano|hip thrust|buenos dias|rdl/.test(n)) return MVT_BY_PATTERN.hinge;

    return MVT_BY_PATTERN.default;
}

/**
 * Zonas de velocidad y a qué cualidad corresponden.
 *
 * Sirven para leer un número suelto: 0,80 m/s en sentadilla no dice nada por
 * sí solo, "zona de fuerza-velocidad, ~60% del máximo" sí. Los bordes son
 * orientativos y dependen del ejercicio; se enseñan como contexto, nunca
 * como una clasificación cerrada.
 */
export const VELOCITY_ZONES = [
    { max: 0.35, label: 'Fuerza máxima', hint: '≥90% 1RM', color: 'var(--effort-high)' },
    { max: 0.55, label: 'Fuerza-fuerza', hint: '80-90% 1RM', color: 'var(--brand)' },
    { max: 0.75, label: 'Fuerza-velocidad', hint: '65-80% 1RM', color: 'var(--warning)' },
    { max: 1.00, label: 'Velocidad-fuerza', hint: '50-65% 1RM', color: 'var(--info)' },
    { max: Infinity, label: 'Velocidad', hint: '<50% 1RM', color: 'var(--success)' },
] as const;

export function velocityZone(velocity: number) {
    return VELOCITY_ZONES.find(z => velocity < z.max) ?? VELOCITY_ZONES[VELOCITY_ZONES.length - 1];
}

// =====================================================================
// REGRESIÓN CARGA-VELOCIDAD
// =====================================================================

export interface LoadVelocityPoint {
    kg: number;
    velocity: number;
    date: string;
    reps: number | null;
    source: string;
    /** Id de la medición, para poder señalarla al pasar por encima. */
    id: string;
}

export interface LoadVelocityProfile {
    points: LoadVelocityPoint[];
    /** v = slope·kg + intercept */
    slope: number;
    intercept: number;
    r2: number;
    /** Carga extrapolada al MVT del ejercicio. */
    estimated1RM: number | null;
    /** MVT usado, para poder enseñarlo: la estimación depende de él. */
    mvt: number;
    /**
     * Velocidad a la que se movería una carga dada, según la recta.
     * Es lo que convierte el perfil en una herramienta de prescripción.
     */
    velocityAt: (kg: number) => number;
    /** Carga que corresponde a una velocidad objetivo. */
    loadAt: (velocity: number) => number | null;
}

/**
 * Ajusta la recta carga-velocidad de un ejercicio.
 *
 * La relación es prácticamente lineal dentro del rango de trabajo (45-95%),
 * así que una recta basta y además es interpretable: la pendiente ES la
 * caída de velocidad por kilo añadido.
 *
 * Hacen falta TRES puntos. Con dos la recta pasa exacta por ambos y el R²
 * sale 1: parecería un ajuste perfecto cuando no hay ajuste ninguno.
 */
export function buildLoadVelocityProfile(
    measurements: VbtMeasurement[],
    exerciseName: string
): LoadVelocityProfile | null {
    const points: LoadVelocityPoint[] = measurements
        .filter(m =>
            m.exercise_name.trim().toLowerCase() === exerciseName.trim().toLowerCase() &&
            m.load_kg != null && m.load_kg > 0 &&
            m.mean_velocity != null && m.mean_velocity > 0
        )
        .map(m => ({
            id: m.id,
            kg: Number(m.load_kg),
            velocity: Number(m.mean_velocity),
            date: m.performed_at,
            reps: m.reps ?? null,
            source: m.source,
        }))
        .sort((a, b) => a.kg - b.kg);

    if (points.length < 3) return null;

    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.kg, 0);
    const sumY = points.reduce((a, p) => a + p.velocity, 0);
    const sumXY = points.reduce((a, p) => a + p.kg * p.velocity, 0);
    const sumXX = points.reduce((a, p) => a + p.kg * p.kg, 0);

    const denom = n * sumXX - sumX * sumX;
    // Todas las mediciones a la misma carga: no hay recta que ajustar.
    if (Math.abs(denom) < 1e-9) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    const ssTot = points.reduce((a, p) => a + (p.velocity - meanY) ** 2, 0);
    const ssRes = points.reduce((a, p) => a + (p.velocity - (slope * p.kg + intercept)) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    const mvt = mvtForExercise(exerciseName);

    // La pendiente TIENE que ser negativa: más carga, menos velocidad. Si sale
    // positiva los datos no describen un perfil y extrapolar sería inventar.
    const raw1RM = slope < 0 ? (mvt - intercept) / slope : null;

    return {
        points,
        slope,
        intercept,
        r2: Math.round(r2 * 1000) / 1000,
        estimated1RM: raw1RM !== null && raw1RM > 0 ? Math.round(raw1RM * 10) / 10 : null,
        mvt,
        velocityAt: (kg: number) => slope * kg + intercept,
        loadAt: (velocity: number) => (slope < 0 ? (velocity - intercept) / slope : null),
    };
}

// =====================================================================
// FATIGA DENTRO DE LA SERIE
// =====================================================================

/**
 * Pérdida de velocidad de una serie, en %.
 *
 * De la MEJOR repetición a la última y no de la primera a la última: la
 * primera repetición de una serie suele ser algo más lenta —el atleta está
 * colocándose— y tomarla como referencia infravalora la pérdida real, que es
 * justo la cifra con la que se decide cortar la serie.
 */
export function velocityLoss(repVelocities: number[] | null | undefined): number | null {
    if (!repVelocities || repVelocities.length < 2) return null;

    const best = Math.max(...repVelocities);
    const last = repVelocities[repVelocities.length - 1];
    if (best <= 0) return null;

    return Math.round(((best - last) / best) * 1000) / 10;
}

/**
 * Cuántas repeticiones quedaban en recámara, estimadas por la pérdida.
 *
 * Relación aproximada y dependiente del ejercicio, así que se devuelve un
 * RANGO y no un número: dar "2,3 RIR" sugeriría una precisión que este
 * método no tiene.
 */
export function rirFromVelocityLoss(lossPct: number | null): string | null {
    if (lossPct === null) return null;
    if (lossPct < 10) return '4+';
    if (lossPct < 20) return '3-4';
    if (lossPct < 30) return '2-3';
    if (lossPct < 40) return '1-2';
    return '0-1';
}

// =====================================================================
// AGREGADOS PARA LAS PANTALLAS
// =====================================================================

export interface ExerciseVbtSummary {
    exerciseName: string;
    measurements: number;
    /** Carga más alta medida. */
    bestLoad: number | null;
    /** Velocidad más alta registrada, sea a la carga que sea. */
    bestVelocity: number | null;
    /** 1RM estimado por el perfil, si hay puntos suficientes. */
    estimated1RM: number | null;
    r2: number | null;
    lastDate: string | null;
}

/** Una fila por ejercicio medido, ordenadas por número de mediciones. */
export function summarizeByExercise(measurements: VbtMeasurement[]): ExerciseVbtSummary[] {
    const groups = new Map<string, VbtMeasurement[]>();

    for (const m of measurements) {
        const key = m.exercise_name.trim();
        const list = groups.get(key);
        if (list) list.push(m);
        else groups.set(key, [m]);
    }

    return [...groups.entries()]
        .map(([exerciseName, list]) => {
            const profile = buildLoadVelocityProfile(list, exerciseName);
            const loads = list.map(m => m.load_kg).filter((v): v is number => v != null);
            const vels = list.map(m => m.mean_velocity).filter((v): v is number => v != null);
            const dates = list.map(m => m.performed_at).sort();

            return {
                exerciseName,
                measurements: list.length,
                bestLoad: loads.length ? Math.max(...loads) : null,
                bestVelocity: vels.length ? Math.max(...vels) : null,
                estimated1RM: profile?.estimated1RM ?? null,
                r2: profile?.r2 ?? null,
                lastDate: dates.length ? dates[dates.length - 1] : null,
            };
        })
        .sort((a, b) => b.measurements - a.measurements);
}

export interface VelocityTrendPoint {
    date: string;
    label: string;
    /** Velocidad media del día para ese ejercicio. */
    velocity: number;
    /** Carga media del día. */
    load: number;
    /**
     * Velocidad NORMALIZADA por carga: la que predice el perfil para esa
     * carga menos la real. Positivo = más rápido de lo esperado.
     *
     * Es la única forma honesta de decir "hoy ha ido rápido": la velocidad
     * bruta baja siempre que sube el peso, así que compararla entre días de
     * cargas distintas no dice nada.
     */
    residual: number | null;
}

/**
 * Evolución de un ejercicio en el tiempo, corregida por la carga.
 *
 * Sin la corrección, la gráfica solo mostraría el calendario de intensidades
 * del bloque: baja en semanas pesadas, sube en descarga, y de la forma del
 * atleta no se deduce nada.
 */
export function velocityTrend(
    measurements: VbtMeasurement[],
    exerciseName: string
): VelocityTrendPoint[] {
    const profile = buildLoadVelocityProfile(measurements, exerciseName);

    const byDate = new Map<string, { vel: number[]; load: number[] }>();

    for (const m of measurements) {
        if (m.exercise_name.trim().toLowerCase() !== exerciseName.trim().toLowerCase()) continue;
        if (m.mean_velocity == null || m.load_kg == null) continue;

        const bucket = byDate.get(m.performed_at) ?? { vel: [], load: [] };
        bucket.vel.push(Number(m.mean_velocity));
        bucket.load.push(Number(m.load_kg));
        byDate.set(m.performed_at, bucket);
    }

    return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, b]) => {
            const velocity = b.vel.reduce((x, y) => x + y, 0) / b.vel.length;
            const load = b.load.reduce((x, y) => x + y, 0) / b.load.length;
            return {
                date,
                label: date.slice(5).split('-').reverse().join('/'),
                velocity: Math.round(velocity * 1000) / 1000,
                load: Math.round(load * 10) / 10,
                residual: profile
                    ? Math.round((velocity - profile.velocityAt(load)) * 1000) / 1000
                    : null,
            };
        });
}
