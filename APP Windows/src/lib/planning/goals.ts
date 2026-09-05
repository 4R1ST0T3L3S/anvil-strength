/**
 * ANVIL STRENGTH — OBJETIVOS DE PROGRAMACIÓN
 * =====================================================================
 *
 * Compara un objetivo ("Sentadilla, 5×5×270 kg") contra tres columnas:
 * lo PROGRAMADO, lo REALIZADO y la MEJOR MARCA registrada. Decisión cerrada
 * del 30 de agosto de 2026: las tres, con lo programado como prioritaria, y
 * las tres cifras —series, repeticiones, valor— comparadas POR SEPARADO. Un
 * único porcentaje que las mezclara escondería justo lo que hay que ver: un
 * "4×5×270" (mismo peso, menos series) no es lo mismo que un "5×5×255"
 * (mismo volumen, menos peso), y las dos violaciones se ven distinto.
 *
 * REUTILIZA, NO RECALCULA
 * "Programado" y "realizado" salen del mismo `LoggedSession[]` que ya
 * carga `PreviousWeekSummary` (`trainingService.getExecutionLog`): esa
 * lista lleva `target_*` Y `actual_*` en la misma fila. "Marca" sale de
 * `findRepMax`, el índice que ya construye la pestaña Histórico. Este
 * archivo no dispara ninguna consulta nueva.
 *
 * QUÉ SERIE SE ELIGE CUANDO HAY VARIAS
 * Un ejercicio puede aparecer en varios días dentro del ámbito del
 * objetivo (todo el bloque, o todo el macro). De todas las veces que
 * aparece, se elige la que tenga las repeticiones más CERCANAS a las del
 * objetivo —desempatando por el peso más alto—, porque es la comparación
 * que responde a la pregunta real: "de lo que hay parecido a mi objetivo,
 * ¿cómo de cerca está lo más parecido".
 */

import type { LoggedSession, LoggedExercise, LoggedSet } from '../../services/trainingService';
import { prescribedKg, prescribedReps, prescribedRpe } from '../stats/executionLog';
import { exerciseKey } from './blockAnalytics';
import { findRepMax, type RepMaxIndex } from '../stats/repMaxes';

export type GoalMetric = 'kg' | 'rpe' | 'rir' | 'vel' | 'vel_loss';

export interface TrainingGoal {
    id: string;
    coach_id: string;
    athlete_id: string;
    block_id: string | null;
    macro_id: string | null;
    exercise_key: string;
    exercise_name: string;
    sets: number;
    reps: number;
    metric: GoalMetric;
    value: number;
    achieved_at: string | null;
    notes: string | null;
    created_at: string;
}

/**
 * MENOR ES MEJOR PARA ESTAS DOS. El resto (kg, vel) es "mayor es mejor".
 *
 * Un objetivo en RPE/RIR se lee en powerlifting como un TECHO de esfuerzo
 * ("4×4 @8" = complétalas sin pasar de RPE 8), no como un mínimo a superar
 * — al revés que un objetivo en kilos. `vel_loss` es la misma idea: menos
 * pérdida de velocidad es la serie mejor ejecutada. Es una elección
 * explícita y no un cálculo arbitrario: con RPE/RIR "más alto" no es
 * "mejor", así que invertir el sentido aquí es lo único que hace que
 * "por debajo del objetivo" y "por encima" signifiquen lo correcto para
 * cada métrica.
 */
const MENOR_ES_MEJOR: ReadonlySet<GoalMetric> = new Set(['rpe', 'rir', 'vel_loss']);

interface GrupoDeSeries {
    sets: number;
    reps: number | null;
    valor: number | null;
}

/** El valor de UNA serie, en la métrica pedida. `null` si no se pautó/registró en esa métrica. */
function valorPautado(set: LoggedSet, metric: GoalMetric): number | null {
    if (metric === 'kg') return prescribedKg(set);
    if (metric === 'rpe' || metric === 'rir') return prescribedRpe(set);
    // vel / vel_loss no se pautan hoy en target_* (son campo de ejecución,
    // no de prescripción) — sin dato pautado, no sin fórmula inventada.
    return null;
}

function valorRealizado(set: LoggedSet, metric: GoalMetric): number | null {
    if (metric === 'kg') return set.actualLoad;
    if (metric === 'rpe' || metric === 'rir') return set.actualRpe;
    return null;
}

/** Resume las series de UNA prescripción de ejercicio (un día concreto). */
function resumirInstancia(
    ex: LoggedExercise,
    metric: GoalMetric,
    kind: 'programado' | 'realizado'
): GrupoDeSeries | null {
    const sets = kind === 'realizado'
        ? ex.sets.filter(s => s.isCompleted || s.actualReps != null)
        : ex.sets;
    if (sets.length === 0) return null;

    const reps = kind === 'programado'
        ? sets.map(prescribedReps).find((r): r is number => r != null) ?? null
        : sets[0].actualReps;

    const valores = sets
        .map(s => (kind === 'programado' ? valorPautado(s, metric) : valorRealizado(s, metric)))
        .filter((v): v is number => v != null);
    if (valores.length === 0) return { sets: sets.length, reps, valor: null };

    // "Mejor serie" de la instancia: la más pesada si kg/vel, la más baja
    // (menos exigente) si rpe/rir/vel_loss. Es el "top set" del día, que es
    // la cifra que un coach mira al comparar contra un objetivo.
    const valor = MENOR_ES_MEJOR.has(metric) ? Math.min(...valores) : Math.max(...valores);
    return { sets: sets.length, reps, valor };
}

/** De varias instancias del mismo ejercicio, la más cercana al objetivo en repeticiones. */
function masCercana(grupos: GrupoDeSeries[], repsObjetivo: number, metric: GoalMetric): GrupoDeSeries | null {
    let mejor: GrupoDeSeries | null = null;
    let mejorDistancia = Infinity;

    for (const g of grupos) {
        if (g.reps == null) continue;
        const distancia = Math.abs(g.reps - repsObjetivo);
        const mejorValor = mejor?.valor ?? null;
        const esMejorEnEmpate = g.valor != null && (
            mejorValor == null ||
            (MENOR_ES_MEJOR.has(metric) ? g.valor < mejorValor : g.valor > mejorValor)
        );
        if (distancia < mejorDistancia || (distancia === mejorDistancia && esMejorEnEmpate)) {
            mejor = g;
            mejorDistancia = distancia;
        }
    }
    return mejor;
}

/** Una de las tres columnas de la comparación. */
export interface GoalSide {
    sets: number;
    reps: number | null;
    valor: number | null;
    /** `valor` menos el del objetivo. Con signo: negativo = por debajo. */
    deltaValor: number | null;
    /** % de `deltaValor` sobre el objetivo. Solo con `valor` numérico y objetivo > 0. */
    deltaValorPct: number | null;
    deltaSets: number;
    deltaReps: number | null;
}

export interface GoalComparison {
    programado: GoalSide | null;
    realizado: GoalSide | null;
    marca: GoalSide | null;
}

function aLado(grupo: GrupoDeSeries | null, goal: TrainingGoal): GoalSide | null {
    if (!grupo) return null;
    const deltaValor = grupo.valor != null ? grupo.valor - goal.value : null;
    const deltaValorPct = deltaValor != null && goal.value > 0
        ? Math.round((deltaValor / goal.value) * 1000) / 10
        : null;
    return {
        sets: grupo.sets,
        reps: grupo.reps,
        valor: grupo.valor,
        deltaValor,
        deltaValorPct,
        deltaSets: grupo.sets - goal.sets,
        deltaReps: grupo.reps != null ? grupo.reps - goal.reps : null,
    };
}

/**
 * La comparación completa de un objetivo contra lo que hay.
 *
 * `sessions` ya viene RECORTADO al ámbito del objetivo (las sesiones del
 * bloque, o las de todos los bloques del macro, o todas las del atleta si
 * el objetivo no tiene ámbito) — lo decide quien llama, no esta función.
 */
export function resolveGoalComparison(
    goal: TrainingGoal,
    sessions: LoggedSession[],
    repMaxIndex: RepMaxIndex | null | undefined
): GoalComparison {
    const instancias: LoggedExercise[] = [];
    for (const session of sessions) {
        for (const ex of session.exercises) {
            if (exerciseKey(ex.name) === goal.exercise_key) instancias.push(ex);
        }
    }

    const programados = instancias
        .map(ex => resumirInstancia(ex, goal.metric, 'programado'))
        .filter((g): g is GrupoDeSeries => g != null);
    const realizados = instancias
        .map(ex => resumirInstancia(ex, goal.metric, 'realizado'))
        .filter((g): g is GrupoDeSeries => g != null);

    const mejorProgramado = masCercana(programados, goal.reps, goal.metric);
    const mejorRealizado = masCercana(realizados, goal.reps, goal.metric);

    const marca = goal.metric === 'kg' ? findRepMax(repMaxIndex, goal.exercise_name, goal.reps) : null;
    const ladoMarca: GoalSide | null = marca
        ? aLado({ sets: 1, reps: marca.reps, valor: marca.load_kg }, goal)
        : null;

    return {
        programado: aLado(mejorProgramado, goal),
        realizado: aLado(mejorRealizado, goal),
        marca: ladoMarca,
    };
}

/**
 * ¿SE CUMPLIÓ? — decisión F5: lo marca el sistema, nunca a mano.
 *
 * Cumplido = lo REALIZADO iguala o mejora el objetivo en las tres cifras a
 * la vez: series ≥ objetivo, repeticiones ≥ objetivo, y el valor en el
 * sentido que corresponda a la métrica (más alto para kg/vel, más bajo
 * para rpe/rir/vel_loss — ver `MENOR_ES_MEJOR`). Las tres, no basta una:
 * un 1×5×270 no cumple un objetivo de 5×5×270 aunque el peso ya esté.
 */
export function goalIsAchieved(goal: TrainingGoal, comparison: GoalComparison): boolean {
    const r = comparison.realizado;
    if (!r || r.valor == null) return false;

    const cumpleValor = MENOR_ES_MEJOR.has(goal.metric) ? r.valor <= goal.value : r.valor >= goal.value;
    return r.sets >= goal.sets && (r.reps ?? 0) >= goal.reps && cumpleValor;
}
