/**
 * ANVIL STRENGTH — EVOLUCIÓN DEL 1RM ESTIMADO
 * =====================================================================
 *
 * "Sesión 1 → 210 kg · Sesión 2 → 215 · Sesión 3 → 220". Es la gráfica que
 * contesta la única pregunta que un atleta se hace de verdad: ¿estoy
 * subiendo?
 *
 *
 * LA FÓRMULA NO VIVE AQUÍ, Y ESO ES DELIBERADO
 *
 * Se importa `estimate1RM` de `lib/training/oneRm.ts`, que es la ÚNICA
 * implementación de la aplicación (Epley, tope de 12 repeticiones, y a una
 * repetición devuelve la carga tal cual en vez de inflarla un 3,3%).
 * Escribir aquí una segunda daría al atleta una cifra distinta de la que ve
 * su entrenador en el análisis de bloque, sobre los mismos datos.
 *
 *
 * SOLO CUENTA LO REGISTRADO. NO LO PAUTADO.
 *
 * Es la decisión que más cambia el resultado. `kgOf`/`repsOf` de
 * athleteStats caen a lo PAUTADO cuando no hay registro, y eso está bien
 * para el análisis del coach —que quiere ver el plan completo antes de que
 * nadie lo entrene—, pero aquí sería mentir: un 250 escrito por el coach
 * para dentro de tres semanas aparecería como una marca conseguida.
 *
 * Aquí solo entra lo que el atleta levantó de verdad. Si no ha registrado
 * nada, la gráfica está vacía y lo dice.
 *
 *
 * UN PUNTO POR SESIÓN, Y ES EL MEJOR DE LA SESIÓN
 *
 * De todas las series de ese día se coge la de mayor 1RM estimado, que es
 * lo que significa "cómo de fuerte estuve ese día". Promediarlas mezclaría
 * las series de aproximación con la pesada y aplanaría la curva justo donde
 * hay señal.
 */

import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import { estimate1RM } from '../training/oneRm';
import { exerciseKey } from '../planning/blockAnalytics';
import { classifyMainLift, type LiftKey } from '../planning/mainLift';

export interface PuntoE1RM {
    /** Id de la sesión. Clave estable para React. */
    sessionId: string;
    /** Fecha de la sesión (YYYY-MM-DD), o `null` si no está fijada. */
    date: string | null;
    /** Etiqueta del eje X: la fecha corta, o "B2·S3" si no hay fecha. */
    label: string;
    blockName: string;
    weekNumber: number;
    /** El mejor 1RM estimado de esa sesión, en kg. */
    e1rm: number;
    /** La serie de la que sale: para el tooltip ("útil: 180 × 3"). */
    load: number;
    reps: number;
}

/** Resumen de un movimiento, que es lo que va en la tarjeta. */
export interface ResumenDeMovimiento {
    /** 'SQ' | 'BP' | 'DL' */
    lift: LiftKey;
    label: string;
    puntos: PuntoE1RM[];
    /** El último e1RM registrado. `null` si no hay ninguno. */
    actual: number | null;
    /** Diferencia con el PRIMER punto de la serie. `null` con menos de dos. */
    delta: number | null;
    /** El mejor de toda la serie. `null` si no hay ninguno. */
    mejor: number | null;
}

// ---------------------------------------------------------------------

/** Kilos REGISTRADOS de una serie. Nunca lo pautado — ver la cabecera. */
function kgRegistrados(set: TrainingSet): number | null {
    const v = set.actual_load;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Repeticiones REGISTRADAS de una serie. */
function repsRegistradas(set: TrainingSet): number | null {
    const v = set.actual_reps;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Fecha corta para el eje: "7 sep". */
function etiquetaDeFecha(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${Number(m[3])} ${meses[Number(m[2]) - 1]}`;
}

/**
 * La evolución del 1RM estimado de un movimiento.
 *
 * `filtro` decide qué filas del historial cuentan:
 *   - una clave de básico ('SQ'|'BP'|'DL') usa `classifyMainLift`, que ya
 *     sabe que la búlgara NO es sentadilla y que la sentadilla frontal
 *     tampoco. Es el mismo clasificador del planificador, así que la
 *     gráfica del atleta y el panel del coach hablan del mismo movimiento.
 *   - un nombre de ejercicio usa `exerciseKey`, para poder mirar un
 *     accesorio concreto.
 */
export function progresionE1RM(
    history: readonly ExerciseHistoryRow[],
    filtro: { lift: LiftKey } | { exerciseName: string }
): PuntoE1RM[] {
    const clave = 'exerciseName' in filtro ? exerciseKey(filtro.exerciseName) : null;
    const basico = 'lift' in filtro ? filtro.lift : null;

    /** Un punto por sesión: nos quedamos con el mejor de cada una. */
    const porSesion = new Map<string, PuntoE1RM>();

    for (const fila of history) {
        const nombre = fila.exerciseName ?? '';
        const encaja = clave !== null
            ? exerciseKey(nombre) === clave
            : classifyMainLift(nombre) === basico;
        if (!encaja) continue;

        for (const set of fila.sets) {
            const kg = kgRegistrados(set);
            const reps = repsRegistradas(set);
            if (kg === null || reps === null) continue;

            const e1rm = estimate1RM(kg, reps);
            // `null` cuando la serie está fuera del rango en el que una
            // fórmula predice fuerza máxima (más de 12 repeticiones). No es
            // un dato peor: es otro dato, y meterlo aquí haría bajar la
            // curva cada vez que el atleta hace una serie larga.
            if (e1rm === null) continue;

            const previo = porSesion.get(fila.sessionId);
            if (previo && previo.e1rm >= e1rm) continue;

            porSesion.set(fila.sessionId, {
                sessionId: fila.sessionId,
                date: fila.date ?? null,
                label: fila.date
                    ? etiquetaDeFecha(fila.date)
                    : `B${fila.blockSequence}·S${fila.weekNumber}`,
                blockName: fila.blockName,
                weekNumber: fila.weekNumber,
                e1rm,
                load: kg,
                reps,
            });
        }
    }

    /**
     * Orden CRONOLÓGICO, y por fecha real cuando la hay.
     *
     * Ordenar por (bloque, semana) daría el orden correcto solo si los
     * bloques no se solapan, y sí se solapan: un coach abre el bloque
     * siguiente antes de cerrar el anterior. La fecha de la sesión es el
     * único orden que no depende de eso; las sesiones sin fecha se ordenan
     * detrás por bloque y semana, que es lo mejor que se puede hacer con
     * ellas.
     */
    return [...porSesion.values()].sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return a.weekNumber - b.weekNumber;
    });
}

/** El resumen que va en la tarjeta de un básico. */
export function resumenDeMovimiento(
    history: readonly ExerciseHistoryRow[],
    lift: LiftKey,
    label: string
): ResumenDeMovimiento {
    const puntos = progresionE1RM(history, { lift });

    const actual = puntos.length > 0 ? puntos[puntos.length - 1].e1rm : null;
    const mejor = puntos.length > 0 ? Math.max(...puntos.map(p => p.e1rm)) : null;
    // Contra el PRIMER punto y no contra el mejor: "+12 kg desde que
    // empezaste" es la frase que motiva; "-5 kg respecto a tu mejor día"
    // sería verdad y no serviría para nada.
    const delta = puntos.length >= 2
        ? Math.round((actual! - puntos[0].e1rm) * 10) / 10
        : null;

    return { lift, label, puntos, actual, delta, mejor };
}
