/**
 * ANVIL STRENGTH — SEMANA ANTERIOR FRENTE A SEMANA SIGUIENTE
 * =====================================================================
 *
 * Decisión E3, cerrada: el % de cambio se calcula contra lo PAUTADO de la
 * semana anterior, no contra lo realizado — las dos son PROGRAMACIÓN, y
 * comparar intención con intención es lo que responde "¿he programado más
 * o menos que la semana pasada?". Lo realizado ya tiene su sitio, aparte,
 * en `PreviousWeekSummary`/`weekExecutionSummary.ts`.
 *
 * Ambas semanas llegan ya resueltas por `weeklyExerciseSummary()` —este
 * módulo no vuelve a tocar `VolumeSessionInput[]`, solo compara dos
 * resúmenes—.
 */

import type { ExerciseWeekSummary } from './liftSummary';

export interface WeekMetricDelta {
    label: string;
    previous: number;
    next: number;
    /** null cuando `previous` es 0: un % de cambio sobre cero no significa nada. */
    deltaPct: number | null;
    unit?: string;
}

/** % de cambio de `a` a `b`. `null` si `a` es 0 — evita una división por cero disfrazada de "+∞%". */
function pctChange(a: number, b: number): number | null {
    if (a === 0) return null;
    return Math.round(((b - a) / a) * 1000) / 10;
}

/** Intensidad media de la semana: la media de los "top set" de cada día que tenga %1RM. Ninguna, si ningún día lo tiene. */
function averageIntensity(summary: ExerciseWeekSummary): number | null {
    const values = summary.days.map(d => d.topIntensity).filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** El %1RM más alto de cualquier serie de la semana — el "top set" real, no una media. */
function peakIntensity(summary: ExerciseWeekSummary): number | null {
    const values = summary.days.map(d => d.topIntensity).filter((v): v is number => v != null);
    return values.length ? Math.max(...values) : null;
}

/**
 * Las cifras que se comparan — E5: las dos lecturas de intensidad, top set Y
 * media, no una sola.
 */
export function compareWeeks(previous: ExerciseWeekSummary, next: ExerciseWeekSummary): WeekMetricDelta[] {
    const rows: WeekMetricDelta[] = [
        { label: 'Series', previous: previous.sets, next: next.sets, deltaPct: pctChange(previous.sets, next.sets) },
        { label: 'Repeticiones', previous: previous.reps, next: next.reps, deltaPct: pctChange(previous.reps, next.reps) },
        { label: 'Tonelaje', previous: previous.tonnage, next: next.tonnage, deltaPct: pctChange(previous.tonnage, next.tonnage), unit: 'kg' },
        { label: 'Frecuencia', previous: previous.frequency, next: next.frequency, deltaPct: pctChange(previous.frequency, next.frequency), unit: 'd/sem' },
    ];

    const prevPeak = peakIntensity(previous);
    const nextPeak = peakIntensity(next);
    if (prevPeak != null || nextPeak != null) {
        rows.push({ label: 'Intensidad (top set)', previous: prevPeak ?? 0, next: nextPeak ?? 0, deltaPct: prevPeak != null && nextPeak != null ? pctChange(prevPeak, nextPeak) : null, unit: '%' });
    }

    const prevAvg = averageIntensity(previous);
    const nextAvg = averageIntensity(next);
    if (prevAvg != null || nextAvg != null) {
        rows.push({ label: 'Intensidad (media)', previous: prevAvg ?? 0, next: nextAvg ?? 0, deltaPct: prevAvg != null && nextAvg != null ? pctChange(prevAvg, nextAvg) : null, unit: '%' });
    }

    return rows;
}

/**
 * DISTANCIA A UN OBJETIVO DE PESO — apartado 6, "distancia al objetivo".
 *
 * Compara el TOP LOAD programado esta semana contra un objetivo en kg.
 * Fórmula única y explícita, sin inventar variantes: (programado − objetivo)
 * / objetivo. Negativo = por debajo. Reutiliza `topLoad` del día más pesado
 * de la semana, la misma cifra que ya enseña la tarjeta de cada día.
 */
export function distanceToTargetLoad(summary: ExerciseWeekSummary, targetKg: number): number | null {
    if (targetKg <= 0) return null;
    const loads = summary.days.map(d => d.topLoad).filter((v): v is number => v != null);
    if (loads.length === 0) return null;
    const best = Math.max(...loads);
    return Math.round(((best - targetKg) / targetKg) * 1000) / 10;
}
