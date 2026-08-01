/**
 * ANVIL STRENGTH — PROGRESIONES DE BLOQUE
 *
 * Una progresión describe cómo evoluciona UN ejercicio a lo largo de las
 * semanas de un bloque: "S1 4x6 al 70%, S2 4x6 al 75%, S3 4x6 al 80%,
 * S4 descarga 3x5 al 60%".
 *
 * Se define una vez y se aplica de golpe a todas las semanas, en vez de
 * escribir la misma prescripción ocho veces cambiando un número.
 *
 * POR QUÉ EL PORCENTAJE ES UNA MÉTRICA APARTE
 * En la base de datos no existe: se resuelve a kilos al aplicarla, usando el
 * 1RM del atleta. Guardar la plantilla en porcentaje y el bloque en kilos es
 * deliberado — así la misma progresión sirve para dos atletas con máximos
 * distintos, y si el 1RM de uno cambia, se vuelve a aplicar y ya está.
 */

import type { TargetMetric } from '../../types/training';
import { parseLoadInput, roundToIncrement } from './loadMath';

/** Unidad de un escalón. `percent` es la única que no existe en la BD. */
export type ProgressionMetric = TargetMetric | 'percent';

export interface ProgressionStep {
    /** Semana dentro del bloque, empezando en 1. */
    week: number;
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
        };
    }

    if (step.metric === 'percent') {
        if (step.value == null) {
            return { target_reps, target_load: null, target_metric: 'kg', target_rpe: null, setCount: 1, unresolved: false };
        }
        if (!referenceMax || referenceMax <= 0) {
            // Se escribe la prescripción SIN carga en vez de inventar un cero:
            // el coach ve que faltan los kilos y sabe que tiene que fijar el 1RM.
            return { target_reps, target_load: null, target_metric: 'kg', target_rpe: null, setCount: 1, unresolved: true };
        }
        return {
            target_reps,
            target_load: roundToIncrement((referenceMax * step.value) / 100),
            target_metric: 'kg',
            target_rpe: null,
            setCount: 1,
            unresolved: false,
        };
    }

    return {
        target_reps,
        target_load: step.value,
        target_metric: step.metric,
        target_rpe: null,
        setCount: 1,
        unresolved: false,
    };
}

/**
 * Progresión por defecto para un bloque de `weekCount` semanas.
 *
 * Arranca en 70% y sube 5 puntos por semana, que es la progresión lineal más
 * común y un punto de partida razonable para editar. La última semana NO se
 * convierte en descarga automáticamente: eso es una decisión del coach y
 * asumirla escondería una elección importante detrás de un valor por defecto.
 */
export function defaultProgression(weekCount: number): ProgressionStep[] {
    return Array.from({ length: Math.max(1, weekCount) }, (_, i) => ({
        week: i + 1,
        sets: 4,
        reps: '6',
        metric: 'percent' as ProgressionMetric,
        value: 70 + i * 5,
    }));
}

/**
 * Rellena los escalones que falten hasta cubrir todas las semanas del bloque.
 *
 * Se repite el ÚLTIMO escalón definido en vez de dejar las semanas sobrantes
 * vacías: una progresión de 4 semanas aplicada a un bloque de 6 significa casi
 * siempre "y las dos últimas como la cuarta", no "y las dos últimas sin nada".
 */
export function fitToWeeks(steps: ProgressionStep[], weekCount: number): ProgressionStep[] {
    if (steps.length === 0) return defaultProgression(weekCount);

    const ordered = [...steps].sort((a, b) => a.week - b.week);
    const out: ProgressionStep[] = [];

    for (let w = 1; w <= weekCount; w++) {
        const exact = ordered.find((s) => s.week === w);
        const last = ordered[ordered.length - 1];
        out.push({ ...(exact ?? last), week: w });
    }

    return out;
}

/**
 * Lee una progresión escrita a mano en texto, una línea por semana.
 *
 * Formato: "4x6 70%", "4x6 100kg", "3x5 @8", "5x5" (sin carga).
 * Existe porque teclear una progresión completa es mucho más rápido que
 * rellenar cuatro campos por semana en un formulario.
 *
 * Lo que no se entienda se devuelve en `errors` con su número de línea, en
 * vez de descartarse en silencio.
 */
export function parseProgressionText(text: string): {
    steps: ProgressionStep[];
    errors: { line: number; text: string }[];
} {
    const steps: ProgressionStep[] = [];
    const errors: { line: number; text: string }[] = [];

    text.split('\n').forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;

        // "4x6" o "6" al principio; el resto es la carga.
        const m = line.match(/^(?:(\d+)\s*x\s*)?([\w-]+)\s*(.*)$/i);
        if (!m) {
            errors.push({ line: i + 1, text: raw });
            return;
        }

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

        if (value != null && !Number.isFinite(value)) {
            errors.push({ line: i + 1, text: raw });
            return;
        }

        steps.push({
            week: steps.length + 1,
            sets: setsRaw ? parseInt(setsRaw, 10) : 1,
            reps,
            metric,
            value,
        });
    });

    return { steps, errors };
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
