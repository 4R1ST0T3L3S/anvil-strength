/**
 * ANVIL STRENGTH — PROGRESIONES GUARDADAS
 * =====================================================================
 *
 * Una progresión describe cómo evoluciona un movimiento a lo largo de las
 * semanas de un bloque: "S1 4x6 al 70%, S2 4x6 al 75%, S3 4x6 al 80%,
 * S4 descarga 3x5 al 60%". Se define una vez y se aplica de golpe a todas
 * las semanas, en vez de escribir la misma prescripción ocho veces
 * cambiando un número.
 *
 * V2 (30 ago 2026) — REESCRITA para admitir MÁS DE UN DÍA por semana y para
 * conservar el porcentaje aplicado. Sigue leyendo las plantillas de la v1
 * sin ningún cambio: un escalón sin `day` vale como día 1, así que una
 * progresión guardada antes de hoy se aplica exactamente igual.
 *
 *
 * POR QUÉ EL PORCENTAJE ES UNA MÉTRICA APARTE
 *
 * En la base de datos no existe como columna: se resuelve a kilos al
 * aplicarla, usando el 1RM del atleta. Guardar la plantilla en porcentaje y
 * el bloque en kilos es deliberado — así la misma progresión sirve para dos
 * atletas con máximos distintos.
 *
 * Decisión B1, cerrada: el % USADO se guarda junto al resultado —en la
 * bolsa de métricas de la serie, `applied_percent`, ver
 * database/PROGRESIONES_2026-08-30.sql— y se ENSEÑA junto a los kilos
 * ("225 kg · 90%"). Lo que NO hace es recalcularse solo si el 1RM cambia
 * después: eso exigiría decidir qué semanas tocar y cuáles no, y esa
 * decisión no está tomada. Volver a aplicar la progresión sigue siendo el
 * camino para eso.
 *
 *
 * UN DÍA PUEDE TENER VARIOS ESCALONES
 *
 * "S2, Viernes: 1×1 @90% + 3×3 @7" son DOS escalones con el mismo
 * `week`/`day`: se materializan como dos prescripciones seguidas del mismo
 * ejercicio ese día — ni más ni menos que lo que ya es un día normal con
 * varias series de cargas distintas.
 */

import type { TargetMetric } from '../../types/training';
import { parseLoadInput, roundToIncrement } from './loadMath';

/** Unidad de un escalón. `percent` es la única que no existe en la BD. */
export type ProgressionMetric = TargetMetric | 'percent';

export interface ProgressionStep {
    /** Semana dentro del bloque, empezando en 1. */
    week: number;
    /**
     * Día dentro de la semana, empezando en 1, hasta `frequency`. El día de
     * la SEMANA (lunes, jueves...) no vive aquí — se elige al aplicar, B7.
     * Ausente en plantillas de la v1: se trata como 1.
     */
    day?: number;
    /** Nº de series. */
    sets: number;
    /** Repeticiones, en texto: "6", "5-6", "AMRAP". */
    reps: string;
    metric: ProgressionMetric;
    /** Valor de la métrica. null = sin carga prescrita esa semana. */
    value: number | null;
}

export interface Progression {
    id: string;
    coach_id: string;
    name: string;
    steps: ProgressionStep[];
    /** Movimiento por defecto al aplicar. Propuesta, no obligación — B6. */
    movement_name?: string | null;
    /** Cuántos días por semana propone. Los días concretos se eligen al aplicar — B7. */
    frequency?: number;
    created_at: string;
}

/** Lo que hay que escribir en una serie para materializar un escalón. */
export interface ResolvedPrescription {
    target_reps: string;
    target_load: number | null;
    target_metric: TargetMetric;
    target_rpe: string | null;
    /** Series a crear. */
    setCount: number;
    /** true si el escalón pedía un % y no había 1RM con el que resolverlo. */
    unresolved: boolean;
    /**
     * El % USADO, si el escalón era de porcentaje y se pudo resolver — B1.
     * Se guarda en `vbt_metrics.applied_percent` de la serie creada, para
     * que "225 kg · 90%" se pueda seguir enseñando después de aplicar.
     */
    appliedPercent: number | null;
}

/**
 * Convierte un escalón en la prescripción concreta de una serie.
 *
 * El formato de `target_reps` es "series x reps", el mismo texto libre que ya
 * usan el builder y el motor de volumen, para que las tres lecturas coincidan.
 */
export function resolveStep(
    step: ProgressionStep,
    referenceMax: number | null
): ResolvedPrescription {
    const reps = step.reps.trim() || '1';
    const target_reps = step.sets > 1 ? `${step.sets}x${reps}` : reps;

    // El RPE viaja en su columna de texto, como en el resto de la app.
    if (step.metric === 'rpe') {
        return {
            target_reps,
            target_load: null,
            target_metric: 'rpe',
            target_rpe: step.value != null ? `@${step.value}` : null,
            setCount: 1,
            unresolved: false,
            appliedPercent: null,
        };
    }

    if (step.metric === 'percent') {
        if (step.value == null) {
            return { target_reps, target_load: null, target_metric: 'kg', target_rpe: null, setCount: 1, unresolved: false, appliedPercent: null };
        }
        if (!referenceMax || referenceMax <= 0) {
            // Se escribe la prescripción SIN carga en vez de inventar un cero:
            // el coach ve que faltan los kilos y sabe que tiene que fijar el 1RM.
            return { target_reps, target_load: null, target_metric: 'kg', target_rpe: null, setCount: 1, unresolved: true, appliedPercent: null };
        }
        return {
            target_reps,
            target_load: roundToIncrement((referenceMax * step.value) / 100),
            target_metric: 'kg',
            target_rpe: null,
            setCount: 1,
            unresolved: false,
            appliedPercent: step.value,
        };
    }

    return {
        target_reps,
        target_load: step.value,
        target_metric: step.metric,
        target_rpe: null,
        setCount: 1,
        unresolved: false,
        appliedPercent: null,
    };
}

/**
 * Progresión por defecto para un bloque de `weekCount` semanas y `frequency`
 * días por semana.
 *
 * Arranca en 70% y sube 5 puntos por semana en el PRIMER día; los días
 * siguientes de cada semana arrancan en blanco (sets=3, reps='6', sin
 * valor) — no hay forma honesta de adivinar qué se pauta un jueves sin
 * saber nada del bloque. La última semana NO se convierte en descarga
 * automáticamente: eso es una decisión del coach.
 */
export function defaultProgression(weekCount: number, frequency: number = 1): ProgressionStep[] {
    const weeks = Math.max(1, weekCount);
    const days = Math.max(1, Math.min(7, frequency));
    const steps: ProgressionStep[] = [];

    for (let w = 1; w <= weeks; w++) {
        for (let d = 1; d <= days; d++) {
            steps.push(
                d === 1
                    ? { week: w, day: d, sets: 4, reps: '6', metric: 'percent', value: 70 + (w - 1) * 5 }
                    : { week: w, day: d, sets: 3, reps: '6', metric: 'percent', value: null }
            );
        }
    }
    return steps;
}

/**
 * Rellena los escalones que falten hasta cubrir todas las semanas del bloque,
 * para cada día de 1 a `frequency`.
 *
 * Se repite el ÚLTIMO escalón definido de CADA día en vez de dejar las
 * semanas sobrantes vacías: una progresión de 4 semanas aplicada a un bloque
 * de 6 significa casi siempre "y las dos últimas como la cuarta".
 */
export function fitToWeeks(steps: ProgressionStep[], weekCount: number, frequency: number = 1): ProgressionStep[] {
    if (steps.length === 0) return defaultProgression(weekCount, frequency);

    const days = Math.max(1, Math.min(7, frequency));
    const out: ProgressionStep[] = [];

    for (let d = 1; d <= days; d++) {
        const ofDay = steps.filter(s => (s.day ?? 1) === d).sort((a, b) => a.week - b.week);
        if (ofDay.length === 0) continue;

        for (let w = 1; w <= weekCount; w++) {
            const exact = ofDay.find(s => s.week === w);
            const last = ofDay[ofDay.length - 1];
            out.push({ ...(exact ?? last), week: w, day: d });
        }
    }

    return out;
}

/**
 * Lee una progresión escrita a mano en texto.
 *
 * DOS FORMATOS, EL SEGUNDO ES ADITIVO:
 *
 *   Simple (v1, un día por semana, una línea por semana):
 *     4x6 70%
 *     4x6 75%
 *     3x5 60%
 *
 *   Multi-día (v2, cuando `frequency` > 1 o el texto ya trae marcas "S/D"):
 *     S1 D1: 4x6 70%
 *     S1 D2: 3x3 @8
 *     S2 D1: 4x6 75%
 *     S2 D2: 1x1 @90% + 3x3 @7
 *
 * Dentro de una línea, varias prescripciones se separan con "+": son varios
 * escalones del MISMO día — una serie de aproximación y el trabajo
 * principal, por ejemplo.
 *
 * Se detecta el formato mirando si ALGUNA línea trae "S<n>": si ninguna la
 * trae, se interpreta en modo simple (posición = semana, día = 1), que es
 * exactamente como leía esto la v1 — ninguna plantilla guardada antes de
 * hoy cambia de significado.
 *
 * Lo que no se entienda se devuelve en `errors` con su número de línea, en
 * vez de descartarse en silencio.
 */
export function parseProgressionText(text: string): {
    steps: ProgressionStep[];
    errors: { line: number; text: string }[];
} {
    const rawLines = text.split('\n');
    const isMultiDay = rawLines.some(l => /^\s*s\s*\d+/i.test(l.trim()));

    return isMultiDay ? parseMultiDay(rawLines) : parseSimple(rawLines);
}

function parseSimple(rawLines: string[]): { steps: ProgressionStep[]; errors: { line: number; text: string }[] } {
    const steps: ProgressionStep[] = [];
    const errors: { line: number; text: string }[] = [];

    rawLines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;

        const parsed = parseOnePrescription(line);
        if (!parsed) { errors.push({ line: i + 1, text: raw }); return; }

        steps.push({ week: steps.length + 1, day: 1, ...parsed });
    });

    return { steps, errors };
}

function parseMultiDay(rawLines: string[]): { steps: ProgressionStep[]; errors: { line: number; text: string }[] } {
    const steps: ProgressionStep[] = [];
    const errors: { line: number; text: string }[] = [];

    rawLines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;

        // "S1 D2: 4x6 70% + 3x3 @8" — la cabecera "S<n> [D<m>]:" y el resto.
        const header = line.match(/^s\s*(\d+)\s*(?:d\s*(\d+))?\s*:?\s*(.*)$/i);
        if (!header) { errors.push({ line: i + 1, text: raw }); return; }

        const week = parseInt(header[1], 10);
        const day = header[2] ? parseInt(header[2], 10) : 1;
        const rest = header[3].trim();

        if (!Number.isFinite(week) || week < 1) { errors.push({ line: i + 1, text: raw }); return; }
        if (!rest) return; // "S3 D2:" sin nada detrás — semana de descanso de ese día, no un error.

        for (const piece of rest.split('+')) {
            const parsed = parseOnePrescription(piece.trim());
            if (!parsed) { errors.push({ line: i + 1, text: raw }); return; }
            steps.push({ week, day, ...parsed });
        }
    });

    return { steps, errors };
}

/** "4x6 70%", "3x5 @8", "AMRAP 100kg"… → un escalón, sin semana ni día. */
function parseOnePrescription(line: string): Pick<ProgressionStep, 'sets' | 'reps' | 'metric' | 'value'> | null {
    const m = line.match(/^(?:(\d+)\s*x\s*)?([\w-]+)\s*(.*)$/i);
    if (!m) return null;

    const [, setsRaw, reps, loadRaw] = m;
    const load = (loadRaw ?? '').trim();

    let metric: ProgressionMetric = 'kg';
    let value: number | null = null;

    if (!load) {
        value = null;
    } else if (load.startsWith('@')) {
        metric = 'rpe';
        value = parseFloat(load.slice(1).replace(',', '.'));
    } else if (load.endsWith('%')) {
        metric = 'percent';
        value = parseLoadInput(load, 100).percent;
    } else {
        metric = 'kg';
        value = parseFloat(load.replace(/kg/i, '').replace(',', '.'));
    }

    if (value != null && !Number.isFinite(value)) return null;

    return { sets: setsRaw ? parseInt(setsRaw, 10) : 1, reps, metric, value };
}

/** Texto legible de un escalón, para la lista y la vista previa. */
export function formatStep(step: ProgressionStep): string {
    const prescription = step.sets > 1 ? `${step.sets}x${step.reps}` : step.reps;
    if (step.value == null) return prescription;
    if (step.metric === 'percent') return `${prescription} · ${step.value}%`;
    if (step.metric === 'rpe') return `${prescription} · @${step.value}`;
    if (step.metric === 'kg') return `${prescription} · ${step.value} kg`;
    if (step.metric === 'vel') return `${prescription} · ${step.value} m/s`;
    if (step.metric === 'vel_loss') return `${prescription} · ${step.value}% pérdida`;
    return `${prescription} · ${step.value}`;
}

/**
 * La progresión ENTERA, como texto — el sentido inverso de `parseProgressionText`.
 *
 * Formato simple si `frequency` es 1 y no hace falta más; multi-día si no.
 * Es lo que rellena el editor al reabrir una progresión guardada.
 */
export function stepsToText(steps: ProgressionStep[], frequency: number = 1): string {
    if (frequency <= 1) {
        return [...steps]
            .filter(s => (s.day ?? 1) === 1)
            .sort((a, b) => a.week - b.week)
            .map(formatStep)
            .join('\n');
    }

    const byWeekDay = new Map<string, ProgressionStep[]>();
    for (const step of steps) {
        const key = `${step.week}|${step.day ?? 1}`;
        const list = byWeekDay.get(key);
        if (list) list.push(step); else byWeekDay.set(key, [step]);
    }

    const keys = [...byWeekDay.keys()].sort((a, b) => {
        const [aw, ad] = a.split('|').map(Number);
        const [bw, bd] = b.split('|').map(Number);
        return aw - bw || ad - bd;
    });

    return keys
        .map(key => {
            const [week, day] = key.split('|');
            const line = byWeekDay.get(key)!.map(formatStep).join(' + ');
            return `S${week} D${day}: ${line}`;
        })
        .join('\n');
}

/** Los números de semana presentes, en orden. */
export function weeksOfProgression(steps: ProgressionStep[]): number[] {
    return [...new Set(steps.map(s => s.week))].sort((a, b) => a - b);
}

/** Los números de día presentes, en orden. Determina la "frecuencia" real de un conjunto de escalones. */
export function daysOfProgression(steps: ProgressionStep[]): number[] {
    return [...new Set(steps.map(s => s.day ?? 1))].sort((a, b) => a - b);
}
