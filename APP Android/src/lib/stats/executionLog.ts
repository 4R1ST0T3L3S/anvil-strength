/**
 * ANVIL STRENGTH — LO PRESCRITO FRENTE A LO EJECUTADO
 * =====================================================================
 *
 * Cálculo puro sobre el registro que devuelve `trainingService.getExecutionLog`.
 * Sin React y sin Supabase: se puede comprobar a mano con datos reales, y la
 * misma cuenta no acaba escrita de tres formas en tres pantallas.
 *
 * LA REGLA QUE ATRAVIESA TODO EL ARCHIVO
 *
 * La prescripción NO se toca nunca. Si el coach pautó RPE 8 y el atleta hizo
 * 7-9-9, lo pautado sigue siendo 8 y lo ejecutado es 7-9-9. Aquí se calcula
 * la DIFERENCIA entre ambos, que es el dato con el que se decide la semana
 * siguiente; en ningún caso se reescribe el plan con lo que pasó.
 *
 * SEGUNDA REGLA: `target_load` no siempre son kilos. Desde
 * database/set_target_metric.sql una serie puede prescribirse en RIR, m/s o %
 * de pérdida, y el número vive en la misma columna. `prescribedKg()` es la
 * única puerta por la que se leen cargas prescritas.
 *
 * TERCERA: lo que no se registró NO se cuenta. Una serie sin datos es una
 * serie sin datos, no una serie de cero kilos. Rellenar huecos con la
 * prescripción es exactamente lo que convierte un registro en propaganda.
 */

import type { LoggedExercise, LoggedSession, LoggedSet } from '../../services/trainingService';

// =====================================================================
// LECTORES
// =====================================================================

export function parseNum(v: string | number | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isNaN(n) ? null : n;
}

/** Kilos PRESCRITOS de una serie, o null si no se pautó en kilos. */
export function prescribedKg(set: LoggedSet): number | null {
    if ((set.targetMetric ?? 'kg') !== 'kg') return null;
    return set.targetLoad ?? null;
}

/**
 * Repeticiones prescritas POR SERIE.
 *
 * "3x5" son cinco por serie, no tres; en un rango "5-6" se toma el extremo
 * bajo, igual que en el motor de volumen, para que las dos pantallas no den
 * cifras distintas del mismo día.
 */
export function prescribedReps(set: LoggedSet): number | null {
    if (!set.targetReps) return null;
    const parts = set.targetReps.toLowerCase().split('x');
    const repsPart = parts.length >= 2 ? parts.slice(1).join('x') : parts[0];
    return parseNum(repsPart.split('-')[0]);
}

/**
 * Cuántas series REALES representa un `target_reps`: un "4x8" son cuatro.
 *
 * Trabaja sobre el TEXTO y no sobre una fila para que puedan usarlo tanto el
 * registro (`LoggedSet`, en camelCase) como la pantalla de entrenamiento
 * (`TrainingSet`, en snake_case). Sin esta separación la misma cuenta acabaría
 * escrita dos veces y una de las dos se quedaría atrás.
 */
export function setCountFromTargetReps(raw: string | null | undefined): number {
    if (!raw) return 1;
    const [head, ...rest] = raw.toLowerCase().split('x');
    if (rest.length === 0) return 1;
    const n = Number.parseInt(head.trim(), 10);
    return Number.isFinite(n) && n > 1 ? n : 1;
}

/**
 * RPE prescrito a partir del texto. Un rango "7-8" se lee por su extremo ALTO.
 *
 * El extremo alto y no el bajo: "7-8" significa "hasta 8", y comparar lo
 * ejecutado contra el 7 marcaría como excedido lo que estaba dentro de lo
 * pedido. Es una decisión metodológica, y por eso vive en UN solo sitio: si la
 * pantalla de fin de sesión la resolviera por su cuenta, el atleta y el
 * entrenador podrían ver desviaciones distintas del mismo día.
 */
export function rpeFromTarget(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const parts = raw.replace(/[@\s]/g, '').split('-');
    return parseNum(parts[parts.length - 1]);
}

/** Cuántas series REALES representa una fila: un "4x8" son cuatro. */
export function prescribedSetCount(set: LoggedSet): number {
    return setCountFromTargetReps(set.targetReps);
}

/** RPE prescrito. Un rango "7-8" se lee por su extremo ALTO. */
export function prescribedRpe(set: LoggedSet): number | null {
    return rpeFromTarget(set.targetRpe);
}

// =====================================================================
// DESVIACIONES DE UNA SERIE
// =====================================================================

export type DeviationKind =
    | 'load-down'      // menos kilos de los pautados
    | 'load-up'        // más kilos
    | 'reps-down'      // menos repeticiones
    | 'reps-up'        // más (típico de un AMRAP)
    | 'rpe-over'       // costó más de lo previsto
    | 'rpe-under'      // costó menos
    | 'skipped';       // pautada y no registrada

export interface SetDeviation {
    kind: DeviationKind;
    /** Diferencia con signo, en la unidad que corresponda. */
    delta: number;
    /** Diferencia relativa en %, solo para carga y repeticiones. */
    pct: number | null;
}

/**
 * Cuánto se ha desviado UNA serie de lo que se pidió.
 *
 * Los umbrales no son cero a propósito:
 *
 *   · Carga — 2%. Por debajo de eso es la diferencia entre discos, no una
 *     decisión: 300 pautados y 297,5 movidos es la misma serie.
 *   · RPE — 1 punto entero. El RPE tiene una resolución real de medio punto
 *     largo; marcar 0,5 llenaría la pantalla de avisos que no significan nada.
 *   · Repeticiones — cualquier diferencia cuenta. Una repetición menos en una
 *     serie de cinco es un 20% del trabajo.
 */
export function deviationsOf(set: LoggedSet): SetDeviation[] {
    const out: SetDeviation[] = [];

    if (!set.isCompleted && set.actualReps == null && set.actualLoad == null) {
        return [{ kind: 'skipped', delta: 0, pct: null }];
    }

    const kgTarget = prescribedKg(set);
    if (kgTarget != null && kgTarget > 0 && set.actualLoad != null) {
        const delta = set.actualLoad - kgTarget;
        const pct = (delta / kgTarget) * 100;
        if (Math.abs(pct) >= 2) {
            out.push({
                kind: delta < 0 ? 'load-down' : 'load-up',
                delta: Math.round(delta * 10) / 10,
                pct: Math.round(pct * 10) / 10,
            });
        }
    }

    const repsTarget = prescribedReps(set);
    if (repsTarget != null && repsTarget > 0 && set.actualReps != null) {
        const delta = set.actualReps - repsTarget;
        if (delta !== 0) {
            out.push({
                kind: delta < 0 ? 'reps-down' : 'reps-up',
                delta,
                pct: Math.round((delta / repsTarget) * 1000) / 10,
            });
        }
    }

    const rpeTarget = prescribedRpe(set);
    if (rpeTarget != null && set.actualRpe != null) {
        const delta = set.actualRpe - rpeTarget;
        if (Math.abs(delta) >= 1) {
            out.push({
                kind: delta > 0 ? 'rpe-over' : 'rpe-under',
                delta: Math.round(delta * 10) / 10,
                pct: null,
            });
        }
    }

    return out;
}

// =====================================================================
// RESUMEN DE UNA SESIÓN
// =====================================================================

export interface SessionSummary {
    sessionId: string;
    /** Series que se pidieron, contando los grupos ("4x8" son cuatro). */
    plannedSets: number;
    /** Series con algo registrado. */
    loggedSets: number;
    completionPct: number;
    /** Tonelaje pautado, solo de las series prescritas en kilos. */
    plannedTonnage: number;
    /** Tonelaje realmente movido. */
    actualTonnage: number;
    /** RPE medio pautado y ejecutado, sobre las series que tienen ambos. */
    plannedRpe: number | null;
    actualRpe: number | null;
    /** Series con alguna desviación relevante. */
    deviations: number;
    /** Ejercicios que no se llegaron a tocar. */
    untouchedExercises: string[];
    completed: boolean;
}

export function summarizeSession(session: LoggedSession): SessionSummary {
    let plannedSets = 0;
    let loggedSets = 0;
    let plannedTonnage = 0;
    let actualTonnage = 0;
    let deviations = 0;

    const plannedRpes: number[] = [];
    const actualRpes: number[] = [];
    const untouchedExercises: string[] = [];

    for (const ex of session.exercises) {
        let touched = false;

        for (const set of ex.sets) {
            const count = prescribedSetCount(set);
            plannedSets += count;

            const kg = prescribedKg(set);
            const reps = prescribedReps(set);
            if (kg != null && reps != null) plannedTonnage += kg * reps * count;

            const rpeTarget = prescribedRpe(set);
            if (rpeTarget != null) plannedRpes.push(rpeTarget);

            const hasData = set.isCompleted || set.actualReps != null || set.actualLoad != null;
            if (!hasData) continue;

            touched = true;
            // Una serie agrupada que el atleta cerró sin separar cuenta como
            // las series que representaba: es lo que hizo, aunque la app lo
            // guardase en una sola fila.
            loggedSets += set.isCompleted ? count : 1;

            if (set.actualLoad != null && set.actualReps != null) {
                actualTonnage += set.actualLoad * set.actualReps;
            }
            if (set.actualRpe != null) actualRpes.push(set.actualRpe);

            if (deviationsOf(set).some(d => d.kind !== 'skipped')) deviations += 1;
        }

        if (!touched && ex.sets.length > 0) untouchedExercises.push(ex.name);
    }

    const mean = (xs: number[]) =>
        xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

    return {
        sessionId: session.id,
        plannedSets,
        loggedSets,
        completionPct: plannedSets > 0 ? Math.round((loggedSets / plannedSets) * 100) : 0,
        plannedTonnage: Math.round(plannedTonnage),
        actualTonnage: Math.round(actualTonnage),
        plannedRpe: mean(plannedRpes),
        actualRpe: mean(actualRpes),
        deviations,
        untouchedExercises,
        completed: Boolean(session.completedAt),
    };
}

// =====================================================================
// AGREGADO POR EJERCICIO
// =====================================================================

/**
 * Todos los ejercicios que aparecen en el registro, en orden alfabético.
 *
 * Por NOMBRE y no por `exerciseId`: el mismo movimiento puede venir de filas
 * distintas de la biblioteca según quién lo diera de alta, y al coach le
 * interesa "sentadilla", no tres sentadillas separadas por un identificador
 * que nunca ve.
 */
export function exerciseNames(sessions: LoggedSession[]): string[] {
    const names = new Set<string>();
    for (const session of sessions) {
        for (const ex of session.exercises) names.add(ex.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Deja EN LAS SESIONES solo un ejercicio.
 *
 * Es lo que hace que "Sentadilla" signifique sentadilla en toda la pantalla y
 * no solo en la tabla por ejercicio: filtrando aquí, arriba del todo, el
 * tonelaje semanal, la carga interna, las desviaciones, los avisos y las
 * tarjetas de sesión salen ya acotados sin tener que reescribir ninguna de
 * esas cuentas. Mezclar press banca con peso muerto en una gráfica de
 * tonelaje no dice nada de ninguno de los dos.
 *
 * Las sesiones que se quedan sin ejercicios se descartan: contarlas como
 * "programadas" inflaría el denominador de cumplimiento con días en los que
 * ese movimiento ni siquiera tocaba.
 */
export function scopeToExercise(sessions: LoggedSession[], name: string): LoggedSession[] {
    return sessions
        .map(session => ({
            ...session,
            exercises: session.exercises.filter(ex => ex.name === name),
        }))
        .filter(session => session.exercises.length > 0);
}

export interface ExerciseAdherence {
    name: string;
    plannedSets: number;
    loggedSets: number;
    completionPct: number;
    /** Media de la desviación de carga, en %. Negativa = bajó peso. */
    loadDeltaPct: number | null;
    /** Media de la desviación de RPE. Positiva = costó más de lo previsto. */
    rpeDelta: number | null;
    /** Carga máxima movida. */
    topLoad: number | null;
    sessions: number;
}

/**
 * Cómo se cumple cada ejercicio.
 *
 * Es la tabla que responde "¿dónde está bajando el peso?" sin tener que abrir
 * día por día. Un ejercicio con -8% de carga media y +1,5 de RPE está
 * diciendo algo muy concreto: la progresión de ESE movimiento va por delante
 * de lo que el atleta puede sostener.
 */
export function adherenceByExercise(sessions: LoggedSession[]): ExerciseAdherence[] {
    const acc = new Map<string, {
        planned: number; logged: number;
        loadDeltas: number[]; rpeDeltas: number[];
        loads: number[]; sessions: Set<string>;
    }>();

    for (const session of sessions) {
        for (const ex of session.exercises) {
            const entry = acc.get(ex.name) ?? {
                planned: 0, logged: 0, loadDeltas: [], rpeDeltas: [], loads: [], sessions: new Set<string>(),
            };
            entry.sessions.add(session.id);

            for (const set of ex.sets) {
                entry.planned += prescribedSetCount(set);

                const hasData = set.isCompleted || set.actualReps != null || set.actualLoad != null;
                if (!hasData) continue;
                entry.logged += set.isCompleted ? prescribedSetCount(set) : 1;

                const kgTarget = prescribedKg(set);
                if (kgTarget != null && kgTarget > 0 && set.actualLoad != null) {
                    entry.loadDeltas.push(((set.actualLoad - kgTarget) / kgTarget) * 100);
                }
                if (set.actualLoad != null) entry.loads.push(set.actualLoad);

                const rpeTarget = prescribedRpe(set);
                if (rpeTarget != null && set.actualRpe != null) {
                    entry.rpeDeltas.push(set.actualRpe - rpeTarget);
                }
            }

            acc.set(ex.name, entry);
        }
    }

    const mean = (xs: number[], decimals = 1) =>
        xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** decimals) / 10 ** decimals : null;

    return [...acc.entries()]
        .map(([name, e]) => ({
            name,
            plannedSets: e.planned,
            loggedSets: e.logged,
            completionPct: e.planned > 0 ? Math.round((e.logged / e.planned) * 100) : 0,
            loadDeltaPct: mean(e.loadDeltas),
            rpeDelta: mean(e.rpeDeltas),
            topLoad: e.loads.length ? Math.max(...e.loads) : null,
            sessions: e.sessions.size,
        }))
        .sort((a, b) => b.plannedSets - a.plannedSets);
}

// =====================================================================
// AGREGADO POR SEMANA
// =====================================================================

export interface WeeklyExecutionPoint {
    week: number;
    label: string;
    plannedSets: number;
    loggedSets: number;
    completionPct: number;
    plannedTonnage: number;
    actualTonnage: number;
    plannedRpe: number | null;
    actualRpe: number | null;
    /**
     * Carga interna: series × RPE ejecutado.
     *
     * Es el equivalente por series del sRPE de Foster (duración × RPE). Se
     * usa series y no minutos porque la aplicación no cronometra la sesión, y
     * el número de series es un sustituto razonable del volumen de trabajo en
     * fuerza. Sirve para comparar semanas ENTRE SÍ, no como valor absoluto.
     */
    internalLoad: number;
}

export function weeklyExecution(sessions: LoggedSession[]): WeeklyExecutionPoint[] {
    const byWeek = new Map<number, {
        planned: number; logged: number;
        plannedT: number; actualT: number;
        plannedRpes: number[]; actualRpes: number[];
    }>();

    for (const session of sessions) {
        const s = summarizeSession(session);
        const bucket = byWeek.get(session.weekNumber) ?? {
            planned: 0, logged: 0, plannedT: 0, actualT: 0, plannedRpes: [], actualRpes: [],
        };

        bucket.planned += s.plannedSets;
        bucket.logged += s.loggedSets;
        bucket.plannedT += s.plannedTonnage;
        bucket.actualT += s.actualTonnage;
        if (s.plannedRpe != null) bucket.plannedRpes.push(s.plannedRpe);
        if (s.actualRpe != null) bucket.actualRpes.push(s.actualRpe);

        byWeek.set(session.weekNumber, bucket);
    }

    const mean = (xs: number[]) =>
        xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

    return [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, b]) => {
            const actualRpe = mean(b.actualRpes);
            return {
                week,
                label: `S${week}`,
                plannedSets: b.planned,
                loggedSets: b.logged,
                completionPct: b.planned > 0 ? Math.round((b.logged / b.planned) * 100) : 0,
                plannedTonnage: b.plannedT,
                actualTonnage: b.actualT,
                plannedRpe: mean(b.plannedRpes),
                actualRpe,
                internalLoad: actualRpe != null ? Math.round(b.logged * actualRpe) : 0,
            };
        });
}

/**
 * RATIO CARGA AGUDA / CRÓNICA (ACWR).
 *
 * Carga de la última semana dividida por la media de las cuatro anteriores.
 * La lectura habitual sitúa la zona "razonable" entre 0,8 y 1,3: por debajo
 * se está descargando y por encima el salto de carga es mayor que lo que el
 * atleta viene tolerando.
 *
 * SE DEVUELVE CON SUS AVISOS, no como un semáforo. El ACWR tiene crítica
 * metodológica seria —sensible a la ventana elegida, y la asociación con
 * lesión no es causal— así que aquí es un DESCRIPTOR de cómo salta la carga
 * entre semanas, no una predicción. Con menos de tres semanas no se calcula:
 * una media crónica de una semana no es crónica de nada.
 */
export function acuteChronicRatio(points: WeeklyExecutionPoint[]): {
    ratio: number;
    acute: number;
    chronic: number;
    weeksUsed: number;
} | null {
    const usable = points.filter(p => p.internalLoad > 0);
    if (usable.length < 3) return null;

    const acute = usable[usable.length - 1].internalLoad;
    const previous = usable.slice(Math.max(0, usable.length - 5), usable.length - 1);
    if (previous.length === 0) return null;

    const chronic = previous.reduce((a, p) => a + p.internalLoad, 0) / previous.length;
    if (chronic === 0) return null;

    return {
        ratio: Math.round((acute / chronic) * 100) / 100,
        acute,
        chronic: Math.round(chronic),
        weeksUsed: previous.length,
    };
}

// =====================================================================
// LO QUE HAY QUE MIRAR
// =====================================================================

export interface Flag {
    severity: 'alta' | 'media' | 'baja';
    title: string;
    detail: string;
    sessionId?: string;
}

/**
 * Lista corta de cosas que merecen una mirada.
 *
 * POR QUÉ UNA LISTA Y NO MÁS GRÁFICAS
 *
 * Un entrenador con quince atletas no abre quince paneles a buscar patrones.
 * Lo que necesita es que le digan dónde mirar. Cada aviso lleva el porqué en
 * cifras, así que se puede desechar en dos segundos si no aplica — que es la
 * mitad de las veces y está bien que lo sea.
 *
 * Deliberadamente NO hay avisos por "no ha entrenado hoy": eso ya lo dice la
 * adherencia, y un aviso que salta todos los martes deja de leerse.
 */
export function buildFlags(
    sessions: LoggedSession[],
    byExercise: ExerciseAdherence[],
    weekly: WeeklyExecutionPoint[]
): Flag[] {
    const flags: Flag[] = [];

    // 1. Ejercicios donde se está bajando el peso de forma sistemática.
    for (const ex of byExercise) {
        if (ex.loadDeltaPct != null && ex.loadDeltaPct <= -5 && ex.loggedSets >= 3) {
            flags.push({
                severity: ex.loadDeltaPct <= -10 ? 'alta' : 'media',
                title: `${ex.name}: ${Math.abs(ex.loadDeltaPct)}% por debajo de lo pautado`,
                detail:
                    `En ${ex.loggedSets} series registradas la carga media ha quedado ` +
                    `${Math.abs(ex.loadDeltaPct)}% por debajo` +
                    (ex.rpeDelta != null && ex.rpeDelta > 0
                        ? `, y aun así el RPE ha salido ${ex.rpeDelta} puntos por encima. La progresión de este movimiento va por delante de lo que sostiene.`
                        : '. Puede ser una decisión del atleta o una prescripción alta.'),
            });
        }
    }

    // 2. Ejercicios que cuestan mucho más de lo previsto aun cumpliendo carga.
    for (const ex of byExercise) {
        if (ex.rpeDelta != null && ex.rpeDelta >= 1.5 && (ex.loadDeltaPct ?? 0) > -5) {
            flags.push({
                severity: ex.rpeDelta >= 2 ? 'alta' : 'media',
                title: `${ex.name}: cuesta ${ex.rpeDelta} puntos de RPE más de lo previsto`,
                detail:
                    'Se está moviendo la carga pautada, pero con un esfuerzo mayor. ' +
                    'Suele preceder a un estancamiento si se mantiene dos semanas.',
            });
        }
    }

    // 3. Ejercicios que se saltan.
    for (const ex of byExercise) {
        if (ex.plannedSets >= 4 && ex.completionPct < 60) {
            flags.push({
                severity: ex.completionPct < 30 ? 'alta' : 'baja',
                title: `${ex.name}: solo se ha registrado el ${ex.completionPct}%`,
                detail:
                    `${ex.loggedSets} de ${ex.plannedSets} series. O no se está haciendo, ` +
                    'o se hace y no se registra: las dos cosas conviene saberlas.',
            });
        }
    }

    // 4. Saltos de carga entre semanas.
    const acwr = acuteChronicRatio(weekly);
    if (acwr && acwr.ratio > 1.5) {
        flags.push({
            severity: 'media',
            title: `Salto de carga: la última semana es ${acwr.ratio}× la media de las ${acwr.weeksUsed} anteriores`,
            detail:
                'Descriptivo, no predictivo: solo dice que el salto es grande comparado ' +
                'con lo que el atleta venía haciendo. Si es una semana de choque buscada, ignóralo.',
        });
    }

    // 5. Sesiones con notas del atleta. Es texto libre, así que no se
    //    interpreta: se señala para que se lea.
    const withNotes = sessions.filter(s => s.athleteNotes?.trim());
    if (withNotes.length > 0) {
        const last = withNotes[withNotes.length - 1];
        flags.push({
            severity: 'baja',
            title: `${withNotes.length} ${withNotes.length === 1 ? 'sesión' : 'sesiones'} con notas del atleta`,
            detail: `Última: “${last.athleteNotes!.trim().slice(0, 160)}”`,
            sessionId: last.id,
        });
    }

    const order = { alta: 0, media: 1, baja: 2 } as const;
    return flags.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
}

/** Todas las series con desviación, ordenadas de la más reciente a la más antigua. */
export interface DeviationRow {
    sessionId: string;
    weekNumber: number;
    dayNumber: number;
    sessionLabel: string;
    exercise: LoggedExercise;
    set: LoggedSet;
    setNumber: number;
    deviations: SetDeviation[];
}

export function collectDeviations(sessions: LoggedSession[]): DeviationRow[] {
    const rows: DeviationRow[] = [];

    for (const session of sessions) {
        for (const ex of session.exercises) {
            ex.sets.forEach((set, i) => {
                const devs = deviationsOf(set).filter(d => d.kind !== 'skipped');
                if (devs.length === 0) return;
                rows.push({
                    sessionId: session.id,
                    weekNumber: session.weekNumber,
                    dayNumber: session.dayNumber,
                    sessionLabel: session.name || `Día ${session.dayNumber}`,
                    exercise: ex,
                    set,
                    setNumber: i + 1,
                    deviations: devs,
                });
            });
        }
    }

    return rows.reverse();
}
