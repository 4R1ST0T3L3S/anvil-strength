/**
 * ANVIL STRENGTH — LA SEMANA ANTERIOR, TAL Y COMO OCURRIÓ
 * =====================================================================
 *
 * LA REGLA QUE ATRAVIESA TODO EL ARCHIVO, Y NO ADMITE MATICES
 *
 * Aquí se lee `actual_reps`, `actual_load`, `actual_rpe` y las métricas de
 * velocidad. **Nunca `target_*` para rellenar un hueco.** Una serie que el
 * atleta no registró es una serie sin datos, no una serie hecha como estaba
 * escrita: dar por ejecutado lo prescrito convierte el registro en
 * propaganda, y el coach programa la semana siguiente sobre una ficción.
 *
 * Lo prescrito viaja aparte, en `planned*`, para poder enseñarlo AL LADO. Esa
 * comparación —lo que pedí frente a lo que pasó— es la única razón por la que
 * merece la pena mirar una semana cerrada.
 *
 *
 * POR QUÉ NO REUTILIZA `weeklyExecution` DE executionLog.ts
 *
 * Aquélla agrega la semana ENTERA en una sola fila: series, tonelaje y RPE
 * de todo lo que se hizo. Contesta "¿cómo va la carga?" y lo hace bien.
 *
 * Lo que hace falta en el panel del programador es otra cosa: el desglose POR
 * BÁSICO Y POR DÍA — "el lunes hizo 4×5 a 200, el jueves 3×3 a 220" —, que es
 * lo que se mira antes de escribir la semana siguiente. Filtrar y reagrupar
 * la salida de `weeklyExecution` no permite llegar ahí, porque esa función ya
 * ha perdido el ejercicio y el día por el camino.
 *
 * Lo que SÍ se reutiliza son los lectores de `executionLog.ts`
 * (`prescribedKg`, `prescribedReps`, `prescribedSetCount`, `prescribedRpe`):
 * la interpretación de un "4x8" o de un RPE "7-8" está decidida allí y no se
 * vuelve a decidir aquí.
 *
 *
 * LA INTENSIDAD RELATIVA SOLO SALE SI HAY 1RM DE VERDAD
 *
 * `intensityPct` se calcula contra el máximo DECLARADO del atleta. Sin él,
 * `null` — y la interfaz enseña un guion. No se estima a partir de las cargas
 * de la propia semana: un porcentaje sobre una referencia derivada de la
 * misma semana que se está juzgando no significa nada.
 */

import type { LoggedSession, LoggedSet, LoggedExercise } from '../../services/trainingService';
import {
    prescribedKg, prescribedReps, prescribedSetCount, prescribedRpe,
} from './executionLog';
import { classifyMainLift, type LiftKey } from '../planning/mainLift';
import { MAIN_LIFTS, MAIN_LIFT_LABEL, type MainLift } from '../planning/liftSummary';
import { weekdayLabel, WEEKDAYS } from '../../types/training';

// =====================================================================

/** Lo que el atleta HIZO de un básico en un día. */
export interface ExecutedDay {
    sessionId: string;
    dayLabel: string;
    order: number;
    /** Cuándo lo cerró. null = no lo dio por terminado. */
    completedAt: string | null;
    /** Series con datos registrados. */
    sets: number;
    /** Series que se le pidieron ese día para ese básico. */
    plannedSets: number;
    /** Repeticiones realmente hechas. */
    reps: number;
    /** Kg movidos: Σ carga × reps de cada serie registrada. */
    tonnage: number;
    /** La carga más alta que llegó a mover. null si no registró peso. */
    topLoad: number | null;
    /** %1RM de esa carga top. null sin 1RM declarado. */
    intensityPct: number | null;
    /** RPE medio de lo ejecutado. null si no registró ninguno. */
    rpe: number | null;
    /** Velocidad media de las series que la tengan. null si ninguna. */
    velocity: number | null;
    /** Resumen legible: "4 × 5 · 200 kg". */
    detail: string;
}

/** Lo que el atleta hizo de un básico en toda la semana. */
export interface ExecutedLiftWeek {
    lift: MainLift;
    label: string;
    days: ExecutedDay[];
    /** Totales de lo EJECUTADO. */
    totalSets: number;
    totalReps: number;
    totalTonnage: number;
    /** Series que se pidieron, para el contraste. */
    plannedSets: number;
    /** Intensidad media relativa, ponderada por series. null sin 1RM. */
    avgIntensity: number | null;
    avgRpe: number | null;
    /** ¿Se registró algo de este básico? */
    hasData: boolean;
}

// =====================================================================

/** ¿Esta serie tiene datos de ejecución? */
function wasLogged(set: LoggedSet): boolean {
    return set.isCompleted || set.actualReps != null || set.actualLoad != null;
}

/**
 * Cuántas series representa una fila YA EJECUTADA.
 *
 * Una serie agrupada ("4x8") que el atleta cerró sin separar cuenta como las
 * cuatro que representaba: es lo que hizo, aunque la aplicación lo guardara
 * en una sola fila. Mismo criterio que `summarizeSession`, para que las dos
 * pantallas no den cifras distintas del mismo día.
 */
function executedSetCount(set: LoggedSet): number {
    return set.isCompleted ? prescribedSetCount(set) : 1;
}

const mean = (xs: number[]): number | null =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

function dayIdentity(session: LoggedSession): { label: string; order: number } {
    const scheduled = weekdayLabel(session.dayOfWeek);
    if (scheduled) {
        const iso = WEEKDAYS.find(d => d.key === session.dayOfWeek)?.index ?? 99;
        return { label: scheduled, order: iso };
    }
    return { label: `Día ${session.dayNumber}`, order: 100 + session.dayNumber };
}

/** "4 × 5 · 200 kg", con lo que haya. */
function describeExecuted(
    entries: { reps: number; load: number | null }[]
): string {
    if (entries.length === 0) return '—';

    const groups: { reps: number; load: number | null; count: number }[] = [];
    for (const e of entries) {
        const hit = groups.find(g => g.reps === e.reps && g.load === e.load);
        if (hit) hit.count += 1;
        else groups.push({ reps: e.reps, load: e.load, count: 1 });
    }

    return groups
        .map(g => (g.load != null ? `${g.count} × ${g.reps} · ${g.load} kg` : `${g.count} × ${g.reps}`))
        .join(' · ');
}

// =====================================================================

/**
 * Lo que el atleta hizo de sentadilla, banca y peso muerto en una semana.
 *
 * `declaredMaxes` viene de `maxesService.getForAthlete()`, indexado por el
 * nombre del ejercicio tal cual. Se busca por `exerciseKey`, así que
 * "Sentadilla Pausada" encuentra el máximo de "Sentadilla" solo si quien
 * llama ya lo ha resuelto con `findMax`; aquí no se hace magia con los
 * nombres para que la referencia sea siempre trazable.
 *
 * Devuelve SIEMPRE los tres básicos. Que uno no se tocara la semana pasada es
 * información, no una fila que esconder.
 */
export function previousWeekByLift(
    sessions: LoggedSession[],
    week: number,
    resolveMax: (exerciseName: string) => number | null = () => null
): ExecutedLiftWeek[] {
    const weekSessions = sessions.filter(s => s.weekNumber === week);

    const acc: Record<MainLift, ExecutedLiftWeek> = {
        SQ: emptyLiftWeek('SQ'),
        BP: emptyLiftWeek('BP'),
        DL: emptyLiftWeek('DL'),
    };

    // Para la media ponderada de intensidad y de RPE de toda la semana.
    const weekIntensity: Record<MainLift, { sum: number; weight: number }> = {
        SQ: { sum: 0, weight: 0 }, BP: { sum: 0, weight: 0 }, DL: { sum: 0, weight: 0 },
    };
    const weekRpes: Record<MainLift, number[]> = { SQ: [], BP: [], DL: [] };

    for (const session of weekSessions) {
        const identity = dayIdentity(session);

        const perLift: Record<MainLift, {
            sets: number; plannedSets: number; reps: number; tonnage: number;
            topLoad: number | null; rpes: number[]; velocities: number[];
            entries: { reps: number; load: number | null }[];
        }> = {
            SQ: emptyDayBucket(), BP: emptyDayBucket(), DL: emptyDayBucket(),
        };

        for (const ex of session.exercises) {
            const key: LiftKey = classifyMainLift(ex.name);
            if (key === 'ACC') continue;
            const lift = key as MainLift;
            const bucket = perLift[lift];

            for (const set of ex.sets) {
                // Lo PEDIDO cuenta siempre, se hiciera o no: es el
                // denominador de "¿se ha cumplido?".
                bucket.plannedSets += prescribedSetCount(set);

                if (!wasLogged(set)) continue;

                const count = executedSetCount(set);
                bucket.sets += count;

                const reps = set.actualReps;
                const load = set.actualLoad;

                if (reps != null) {
                    bucket.reps += reps * count;
                    bucket.entries.push({ reps, load: load ?? null });
                }
                if (reps != null && load != null) {
                    bucket.tonnage += load * reps * count;
                }
                if (load != null && (bucket.topLoad == null || load > bucket.topLoad)) {
                    bucket.topLoad = load;
                }
                if (set.actualRpe != null) bucket.rpes.push(set.actualRpe);
                if (set.vbtMeanVelocity != null) bucket.velocities.push(set.vbtMeanVelocity);
            }

            // El 1RM se resuelve por el nombre del EJERCICIO concreto, no por
            // el del básico: una pausada se compara contra el máximo que
            // `findMax` le asigne, que ya sabe caer a la versión sin variante.
            const oneRm = resolveMax(ex.name);
            if (oneRm != null && oneRm > 0 && bucket.topLoad != null) {
                const pct = (bucket.topLoad / oneRm) * 100;
                weekIntensity[lift].sum += pct * Math.max(bucket.sets, 1);
                weekIntensity[lift].weight += Math.max(bucket.sets, 1);
            }
        }

        for (const lift of MAIN_LIFTS) {
            const bucket = perLift[lift];
            if (bucket.sets === 0 && bucket.plannedSets === 0) continue;

            const exerciseNames = session.exercises
                .filter(e => classifyMainLift(e.name) === lift)
                .map(e => e.name);
            const oneRm = firstMax(exerciseNames, resolveMax);

            acc[lift].days.push({
                sessionId: session.id,
                dayLabel: identity.label,
                order: identity.order,
                completedAt: session.completedAt,
                sets: bucket.sets,
                plannedSets: bucket.plannedSets,
                reps: bucket.reps,
                tonnage: Math.round(bucket.tonnage),
                topLoad: bucket.topLoad,
                intensityPct:
                    oneRm != null && oneRm > 0 && bucket.topLoad != null
                        ? Math.round((bucket.topLoad / oneRm) * 1000) / 10
                        : null,
                rpe: mean(bucket.rpes),
                velocity: bucket.velocities.length
                    ? Math.round((bucket.velocities.reduce((a, b) => a + b, 0) / bucket.velocities.length) * 100) / 100
                    : null,
                detail: describeExecuted(bucket.entries),
            });

            acc[lift].totalSets += bucket.sets;
            acc[lift].plannedSets += bucket.plannedSets;
            acc[lift].totalReps += bucket.reps;
            acc[lift].totalTonnage += bucket.tonnage;
            weekRpes[lift].push(...bucket.rpes);
        }
    }

    return MAIN_LIFTS.map(lift => {
        const row = acc[lift];
        row.days.sort((a, b) => a.order - b.order);
        row.totalTonnage = Math.round(row.totalTonnage);
        row.avgRpe = mean(weekRpes[lift]);
        const wi = weekIntensity[lift];
        row.avgIntensity = wi.weight > 0 ? Math.round((wi.sum / wi.weight) * 10) / 10 : null;
        row.hasData = row.totalSets > 0;
        return row;
    });
}

function emptyLiftWeek(lift: MainLift): ExecutedLiftWeek {
    return {
        lift,
        label: MAIN_LIFT_LABEL[lift],
        days: [],
        totalSets: 0,
        totalReps: 0,
        totalTonnage: 0,
        plannedSets: 0,
        avgIntensity: null,
        avgRpe: null,
        hasData: false,
    };
}

function emptyDayBucket() {
    return {
        sets: 0, plannedSets: 0, reps: 0, tonnage: 0,
        topLoad: null as number | null, rpes: [] as number[], velocities: [] as number[],
        entries: [] as { reps: number; load: number | null }[],
    };
}

/** El primer 1RM que se resuelva de una lista de nombres. */
function firstMax(names: string[], resolve: (n: string) => number | null): number | null {
    for (const name of names) {
        const max = resolve(name);
        if (max != null && max > 0) return max;
    }
    return null;
}

// =====================================================================
// LO PROGRAMADO FRENTE A LO EJECUTADO, EN UNA LÍNEA
// =====================================================================

export interface WeekContrast {
    plannedSets: number;
    loggedSets: number;
    completionPct: number;
    plannedTonnage: number;
    actualTonnage: number;
    plannedRpe: number | null;
    actualRpe: number | null;
    /** Días de la semana que el atleta cerró. */
    completedSessions: number;
    totalSessions: number;
}

/**
 * El contraste de una semana entera, básicos y accesorios juntos.
 *
 * Es la cabecera del resumen: antes de mirar movimiento a movimiento, saber
 * si la semana se cumplió al 95% o al 40% cambia cómo se lee todo lo demás.
 */
export function weekContrast(sessions: LoggedSession[], week: number): WeekContrast {
    const weekSessions = sessions.filter(s => s.weekNumber === week);

    let plannedSets = 0, loggedSets = 0, plannedTonnage = 0, actualTonnage = 0;
    const plannedRpes: number[] = [];
    const actualRpes: number[] = [];
    let completedSessions = 0;

    for (const session of weekSessions) {
        if (session.completedAt) completedSessions += 1;

        for (const ex of session.exercises) {
            for (const set of ex.sets) {
                const count = prescribedSetCount(set);
                plannedSets += count;

                const kg = prescribedKg(set);
                const reps = prescribedReps(set);
                if (kg != null && reps != null) plannedTonnage += kg * reps * count;

                const targetRpe = prescribedRpe(set);
                if (targetRpe != null) plannedRpes.push(targetRpe);

                if (!wasLogged(set)) continue;
                loggedSets += executedSetCount(set);

                if (set.actualLoad != null && set.actualReps != null) {
                    actualTonnage += set.actualLoad * set.actualReps * executedSetCount(set);
                }
                if (set.actualRpe != null) actualRpes.push(set.actualRpe);
            }
        }
    }

    return {
        plannedSets,
        loggedSets,
        completionPct: plannedSets > 0 ? Math.round((loggedSets / plannedSets) * 100) : 0,
        plannedTonnage: Math.round(plannedTonnage),
        actualTonnage: Math.round(actualTonnage),
        plannedRpe: mean(plannedRpes),
        actualRpe: mean(actualRpes),
        completedSessions,
        totalSessions: weekSessions.length,
    };
}

/**
 * La semana anterior a una dada, DENTRO del registro que se tiene.
 *
 * No es `week - 1` a secas: `week_number` es la semana ISO del año, así que
 * la anterior a la 1 es la 52 o la 53 del año pasado, y además puede que esa
 * semana no exista en el registro (el bloque empezó ahí). Se busca la mayor
 * semana presente que sea anterior, con el salto de año contemplado.
 *
 * Devuelve `null` cuando no hay ninguna semana anterior registrada, que es lo
 * que debe pasar la primera semana de un atleta nuevo.
 */
export function previousWeekOf(sessions: LoggedSession[], week: number): number | null {
    const weeks = [...new Set(sessions.map(s => s.weekNumber))].sort((a, b) => a - b);
    if (weeks.length === 0) return null;

    const earlier = weeks.filter(w => w < week);
    if (earlier.length > 0) return earlier[earlier.length - 1];

    // Salto de año: no hay ninguna semana menor, pero sí semanas altas (52,
    // 53) que en el tiempo son ANTERIORES a la semana 1 o 2 en curso.
    if (week <= 4) {
        const high = weeks.filter(w => w >= 48);
        if (high.length > 0) return high[high.length - 1];
    }

    return null;
}

/** Los ejercicios de un básico dentro de una sesión. Para el detalle. */
export function liftExercisesOf(session: LoggedSession, lift: MainLift): LoggedExercise[] {
    return session.exercises.filter(ex => classifyMainLift(ex.name) === lift);
}
