/**
 * ANVIL STRENGTH — RESUMEN DEL DÍA QUE SE ACABA DE ENTRENAR
 * =====================================================================
 * Lo que el atleta ve al cerrar la sesión: cuánto ha hecho, cuánto ha movido
 * y cuánto le ha costado comparado con lo que le pidieron.
 *
 * POR QUÉ UN MÓDULO APARTE Y NO UNAS CUENTAS DENTRO DEL COMPONENTE
 *
 * La misma comparación —RPE pautado frente a RPE real— la pinta el panel del
 * entrenador desde `executionLog.ts`. Si aquí se resolviera a mano, el atleta
 * podría ver "+0,7" y su entrenador "+0,5" del mismo día, y no habría forma de
 * saber cuál de las dos pantallas miente. Así que las reglas que tienen
 * criterio detrás —un rango "7-8" se lee por el extremo alto, un "4x8" son
 * cuatro series, `target_load` no siempre son kilos— se importan de donde ya
 * viven y NO se reescriben.
 *
 * Trabaja sobre `TrainingSet` en crudo, que es lo que tiene la pantalla de
 * entrenamiento, sin pasar por `getExecutionLog`: pedir al servidor un
 * registro que el navegador ya tiene delante añadiría una espera justo en el
 * momento en que el atleta quiere cerrar y guardar el móvil.
 */

import type { TrainingSet } from '../../types/training';
import { kgOf, repsOf } from './athleteStats';
import { rpeFromTarget, setCountFromTargetReps } from './executionLog';

/** Lo mínimo que necesita el resumen de cada ejercicio del día. */
export interface SummarizableExercise {
    sets: TrainingSet[];
}

export interface SessionSummary {
    /** Series marcadas, contando un "4x8" como cuatro. */
    setsDone: number;
    setsTotal: number;
    /** Kilos totales movidos HOY. Solo series en kilos y solo lo registrado. */
    tonnage: number;
    /** Ejercicios con al menos una serie cerrada. */
    exercisesDone: number;
    exercisesTotal: number;
    /**
     * RPE medio, sobre las series que tienen AMBOS valores.
     *
     * Solo las que tienen los dos: promediar el pautado sobre todas las series
     * y el real sobre las que el atleta anotó compararía dos conjuntos
     * distintos, y la diferencia diría más de qué series se anotan que de cómo
     * fue el día.
     */
    plannedRpe: number | null;
    actualRpe: number | null;
    /** Real menos pautado. Positivo = costó más de lo previsto. */
    rpeDelta: number | null;
    /** Series comparables. Sin esto el delta es un número sin respaldo. */
    rpePairs: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const mean = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * Resume el día a partir de los ejercicios que la pantalla ya tiene cargados.
 *
 * Una serie sin registrar NO cuenta para nada salvo para el total: es la misma
 * regla que en el resto del análisis. Contar lo prescrito como si se hubiera
 * hecho convertiría el resumen en un parte de intenciones.
 */
export function summarizeSessionLive(exercises: SummarizableExercise[]): SessionSummary {
    let setsDone = 0;
    let setsTotal = 0;
    let tonnage = 0;
    let exercisesDone = 0;

    const plannedRpes: number[] = [];
    const actualRpes: number[] = [];

    for (const exercise of exercises) {
        let anyDone = false;

        for (const set of exercise.sets) {
            // Un "4x8" es UNA fila y CUATRO series. Contarlo como una haría
            // que el resumen dijera "3 series" de un día de doce.
            const count = setCountFromTargetReps(set.target_reps);
            setsTotal += count;

            if (!set.is_completed) continue;

            setsDone += count;
            anyDone = true;

            // `kgOf` es la única puerta legítima: devuelve null cuando la serie
            // no se mide en kilos (RIR, m/s, % de pérdida), y sumarla como si
            // lo fueran daría un tonelaje inventado.
            const kg = kgOf(set);
            const reps = repsOf(set);
            if (kg !== null && reps !== null) tonnage += kg * reps * count;

            const target = rpeFromTarget(set.target_rpe);
            if (target !== null && set.actual_rpe !== null && set.actual_rpe !== undefined) {
                plannedRpes.push(target);
                actualRpes.push(set.actual_rpe);
            }
        }

        if (anyDone) exercisesDone += 1;
    }

    const planned = mean(plannedRpes);
    const actual = mean(actualRpes);

    return {
        setsDone,
        setsTotal,
        tonnage: Math.round(tonnage),
        exercisesDone,
        exercisesTotal: exercises.length,
        plannedRpe: planned === null ? null : round1(planned),
        actualRpe: actual === null ? null : round1(actual),
        rpeDelta:
            planned === null || actual === null ? null : round1(actual - planned),
        rpePairs: plannedRpes.length,
    };
}
