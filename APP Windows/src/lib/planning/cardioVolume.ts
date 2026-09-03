/**
 * ANVIL STRENGTH — VOLUMEN DE CARDIO
 * =====================================================================
 *
 * El equivalente del motor de volumen de fuerza, pero para cardio (G1: SU
 * PROPIO recuento, nunca sumado al tonelaje de fuerza). Dos cifras, no una
 * mezcla: minutos totales (el "volumen") y kilómetros totales (el
 * "tonelaje"), cada una PROGRAMADA y REALIZADA por separado.
 *
 * POR QUÉ NO ES `lib/volume/engine.ts` AMPLIADO
 * Ese motor reparte series por GRUPO MUSCULAR — no hay un "grupo muscular"
 * de una carrera. Forzar el cardio dentro de esa forma habría significado
 * un `MuscleGroup` de mentira o una rama especial dentro de cada función
 * del motor. Es más simple —y más honesto— un módulo propio con la forma
 * que el dato realmente tiene: duración y distancia, no series.
 *
 * DE DÓNDE SALE CADA NÚMERO
 *   Programado — `target_load` cuando `target_metric` es 'duracion_seg' o
 *                 'distancia_km'. Mismas columnas que ya usa todo lo demás,
 *                 sin bolsa de por medio.
 *   Realizado  — la bolsa `vbt_metrics` (`duration_actual_seconds`,
 *                `distance_km`). NUNCA `actual_load`: esa columna son
 *                kilos en TODO el resto de la aplicación (ver
 *                `lib/volume/engine.ts`), y leerla aquí como segundos
 *                rompería cualquier cálculo que ya la lee como peso.
 */

import type { TrainingSet } from '../../types/training';

type CardioSetLike = Pick<TrainingSet, 'target_load' | 'target_metric' | 'is_completed' | 'vbt_metrics'>;

interface CardioExerciseLike {
    section?: string | null;
    sets: CardioSetLike[];
}

export interface CardioSessionLike {
    id: string;
    week_number: number;
    exercises: CardioExerciseLike[];
}

export interface CardioTotals {
    seconds: number;
    km: number;
}

export interface CardioVolumeSummary {
    programado: CardioTotals;
    realizado: CardioTotals;
}

const vacio = (): CardioTotals => ({ seconds: 0, km: 0 });

function sumarPautado(sets: CardioSetLike[]): CardioTotals {
    const totales = vacio();
    for (const set of sets) {
        if (set.target_load == null) continue;
        if (set.target_metric === 'duracion_seg') totales.seconds += set.target_load;
        else if (set.target_metric === 'distancia_km') totales.km += set.target_load;
    }
    return totales;
}

function sumarRealizado(sets: CardioSetLike[]): CardioTotals {
    const totales = vacio();
    for (const set of sets) {
        // Solo series que el atleta dio por hechas — mismo criterio que el
        // resto del proyecto (nunca `target_*` disfrazado de ejecución).
        if (!set.is_completed) continue;
        const bag = set.vbt_metrics;
        if (!bag) continue;
        if (typeof bag.duration_actual_seconds === 'number') totales.seconds += bag.duration_actual_seconds;
        if (typeof bag.distance_km === 'number') totales.km += bag.distance_km;
    }
    return totales;
}

/** El volumen de cardio de un conjunto de sesiones (un día, una semana, un bloque). */
export function summarizeCardioVolume(sessions: CardioSessionLike[]): CardioVolumeSummary {
    const programado = vacio();
    const realizado = vacio();

    for (const session of sessions) {
        for (const ex of session.exercises) {
            if (ex.section !== 'cardio') continue;
            const p = sumarPautado(ex.sets);
            const r = sumarRealizado(ex.sets);
            programado.seconds += p.seconds;
            programado.km += p.km;
            realizado.seconds += r.seconds;
            realizado.km += r.km;
        }
    }

    return { programado, realizado };
}

/** "45 min" o "1 h 15 min". Nunca decimales de minuto: no se leen bien. */
export function formatCardioDuration(seconds: number): string {
    if (seconds <= 0) return '0 min';
    const totalMin = Math.round(seconds / 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (h === 0) return `${min} min`;
    if (min === 0) return `${h} h`;
    return `${h} h ${min} min`;
}

/** "5,3 km". Coma decimal, como el resto de la interfaz en español. */
export function formatCardioDistance(km: number): string {
    if (km <= 0) return '0 km';
    return `${km.toFixed(1).replace('.', ',')} km`;
}
