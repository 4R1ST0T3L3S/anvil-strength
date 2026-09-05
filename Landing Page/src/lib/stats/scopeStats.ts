/**
 * ANVIL STRENGTH — LAS MISMAS CIFRAS A CUATRO ALTURAS
 * =====================================================================
 *
 * DÍA · SEMANA · BLOQUE · MACRO. Cuatro preguntas distintas sobre los mismos
 * datos:
 *
 *   Día     — ¿qué se hizo hoy y a qué coste?
 *   Semana  — ¿cuánto trabajo lleva y cómo está repartido?
 *   Bloque  — ¿cómo progresa el volumen y la intensidad?
 *   Macro   — ¿qué forma tiene la preparación entera?
 *
 *
 * ESTE MÓDULO NO CALCULA NADA NUEVO. Y es su mayor virtud.
 *
 * Cada cifra que devuelve sale de una función que ya existía y que ya está
 * probada: `computeSetMetrics` y `analyzeBlock` para lo prescrito,
 * `summarizeSession` y `weeklyExecution` para lo ejecutado, `computeVolume`
 * para el reparto muscular, `weeklyLiftSummary` y `accessoryReport` para el
 * desglose por movimiento.
 *
 * Escribir aquí una segunda fórmula de tonelaje —aunque fuese idéntica— sería
 * el principio de la divergencia: dos pantallas darían cifras distintas del
 * mismo bloque y no habría forma de saber cuál miente. Lo único propio de
 * este archivo es el RECORTE del ámbito y el ensamblaje.
 *
 *
 * PROGRAMADO Y REALIZADO VIAJAN JUNTOS PERO SEPARADOS
 *
 * `planned` sale de las sesiones del constructor; `executed` del registro. Se
 * devuelven en dos objetos distintos y nunca se funden. `executed` es `null`
 * cuando no se ha pasado registro, y eso significa "no se sabe", no "cero".
 */

import type { VolumeSessionInput } from '../volume/engine';
import { computeVolume, weeklyAverages } from '../volume/engine';
import type { LoggedSession } from '../../services/trainingService';
import { analyzeBlock, type WeekAnalytics, type IntensityZoneKey } from '../planning/blockAnalytics';
import { weeklyLiftSummary, type LiftWeekSummary } from '../planning/liftSummary';
import { accessoryReport, type AccessoryReport } from '../planning/accessoryStats';
import { weekContrast, type WeekContrast } from './weekExecutionSummary';
import { summarizeSession } from './executionLog';

// =====================================================================

export type Scope = 'day' | 'week' | 'block' | 'macro';

export const SCOPE_LABEL: Record<Scope, string> = {
    day: 'Día',
    week: 'Semana',
    block: 'Bloque',
    macro: 'Macro',
};

/** Qué recorte se pide. Solo se lee el campo que corresponde al ámbito. */
export interface ScopeSelector {
    scope: Scope;
    /** Ámbito `day`. */
    sessionId?: string | null;
    /** Ámbitos `day` y `week`. */
    week?: number | null;
    /**
     * Ámbito `macro`: los bloques que lo componen. `null` en los demás.
     * Se pasan resueltos porque quién pertenece a qué macro lo sabe la
     * consulta, no el cálculo.
     */
    blockIds?: string[] | null;
}

// =====================================================================

/** Lo PRESCRITO en el ámbito. */
export interface PlannedStats {
    sessions: number;
    /** Sesiones con al menos un ejercicio. Las vacías no son entrenamiento. */
    plannedSessions: number;
    sets: number;
    reps: number;
    tonnage: number;
    /** Media de %1RM ponderada por series. null sin referencias de 1RM. */
    avgIntensity: number | null;
    avgRpe: number | null;
    /** Series por zona de intensidad. */
    setsByZone: Record<IntensityZoneKey, number>;
    /** Series de sentadilla, banca y peso muerto. */
    lifts: LiftWeekSummary[];
    /** Reparto del trabajo de apoyo. */
    accessories: AccessoryReport;
    /** Series directas por grupo muscular, de mayor a menor. */
    byMuscle: { muscle: string; direct: number; indirect: number; total: number }[];
    /**
     * Evolución semana a semana. Solo en los ámbitos `block` y `macro`: en un
     * día o una semana sueltos no hay evolución que enseñar.
     */
    weeks: WeekAnalytics[] | null;
    /** Semanas detectadas como descarga. Solo en `block` y `macro`. */
    deloadWeeks: number[] | null;
}

/** Lo EJECUTADO en el ámbito. `null` cuando no hay registro que mirar. */
export interface ExecutedStats {
    contrast: WeekContrast;
    /** Velocidad media de las series que la tienen. null si ninguna. */
    avgVelocity: number | null;
    /** Series con alguna desviación respecto de lo pautado. */
    deviations: number;
}

export interface ScopeStats {
    scope: Scope;
    label: string;
    planned: PlannedStats;
    executed: ExecutedStats | null;
}

// =====================================================================
// RECORTE
// =====================================================================

/**
 * Las sesiones que entran en el ámbito.
 *
 * En `block` y `macro` entran todas las que se le han pasado: quien llama ya
 * ha pedido las de ese bloque o las de esos bloques. El recorte por
 * `blockIds` no se puede hacer aquí porque `VolumeSessionInput` no lleva el
 * bloque — y añadírselo obligaría a tocar el motor de volumen, que es
 * exactamente lo que este módulo existe para no hacer.
 */
export function scopeSessions(
    sessions: VolumeSessionInput[],
    selector: ScopeSelector
): VolumeSessionInput[] {
    switch (selector.scope) {
        case 'day':
            return sessions.filter(s => s.id === selector.sessionId);
        case 'week':
            return sessions.filter(s => s.week_number === selector.week);
        case 'block':
        case 'macro':
        default:
            return sessions;
    }
}

/** Lo mismo para el registro de ejecución. */
export function scopeLogged(
    sessions: LoggedSession[],
    selector: ScopeSelector
): LoggedSession[] {
    switch (selector.scope) {
        case 'day':
            return sessions.filter(s => s.id === selector.sessionId);
        case 'week':
            return sessions.filter(s => s.weekNumber === selector.week);
        case 'macro':
            return selector.blockIds?.length
                ? sessions.filter(s => selector.blockIds!.includes(s.blockId))
                : sessions;
        case 'block':
        default:
            return sessions;
    }
}

// =====================================================================

const mean = (xs: number[]): number | null =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

/**
 * Las cifras del ámbito pedido.
 *
 * `logged` es opcional: sin él sale solo lo programado, que es lo que se ve
 * mientras se escribe un bloque futuro. Con él sale también lo ejecutado, que
 * es lo que se mira al revisar.
 */
export function statsForScope(
    selector: ScopeSelector,
    sessions: VolumeSessionInput[],
    options: {
        logged?: LoggedSession[] | null;
        declaredMaxes?: Record<string, number>;
        weekNames?: Record<number, string>;
    } = {}
): ScopeStats {
    const scoped = scopeSessions(sessions, selector);
    const declaredMaxes = options.declaredMaxes ?? {};

    // El análisis se hace sobre el ámbito recortado. En `day` y `week` eso
    // significa que los %1RM derivados salen del propio recorte, y el propio
    // `analyzeBlock` ya marca esa procedencia — no se esconde.
    const analysis = analyzeBlock(scoped, { declaredMaxes });
    const volume = computeVolume(scoped);

    // Las semanas presentes, para el desglose por básico. En `day` y `week`
    // hay una sola; en `block` y `macro` se acumulan todas.
    const weeks = [...new Set(scoped.map(s => s.week_number))];

    const lifts = accumulateLifts(scoped, weeks, declaredMaxes);

    const showEvolution = selector.scope === 'block' || selector.scope === 'macro';

    const planned: PlannedStats = {
        sessions: analysis.totals.sessions,
        plannedSessions: analysis.weeks.reduce((n, w) => n + w.plannedSessionCount, 0),
        sets: analysis.totals.sets,
        reps: analysis.totals.reps,
        tonnage: analysis.totals.tonnage,
        avgIntensity: mean(
            analysis.weeks.map(w => w.avgIntensity).filter((x): x is number => x != null)
        ),
        avgRpe: mean(analysis.weeks.map(w => w.avgRpe).filter((x): x is number => x != null)),
        setsByZone: analysis.setsByZone,
        lifts,
        accessories: accessoryReport(scoped),
        byMuscle: weeklyAverages(volume)
            .sort((a, b) => b.total - a.total)
            .map(r => ({ muscle: r.muscle as string, direct: r.direct, indirect: r.indirect, total: r.total })),
        weeks: showEvolution ? analysis.weeks : null,
        deloadWeeks: showEvolution ? analysis.deloadWeeks : null,
    };

    const executed = options.logged ? buildExecuted(scopeLogged(options.logged, selector), selector) : null;

    return {
        scope: selector.scope,
        label: labelFor(selector, options.weekNames),
        planned,
        executed,
    };
}

/**
 * Suma el desglose por básico de varias semanas.
 *
 * `weeklyLiftSummary` trabaja sobre UNA semana porque es lo que necesita el
 * panel del programador. Para el bloque y el macro se acumulan sus salidas en
 * vez de reescribir la función con un parámetro de lista: así el desglose por
 * día se conserva y las dos vistas no pueden discrepar.
 */
function accumulateLifts(
    sessions: VolumeSessionInput[],
    weeks: number[],
    declaredMaxes: Record<string, number>
): LiftWeekSummary[] {
    if (weeks.length === 0) return weeklyLiftSummary(sessions, -1, declaredMaxes);
    if (weeks.length === 1) return weeklyLiftSummary(sessions, weeks[0], declaredMaxes);

    const base = weeklyLiftSummary(sessions, weeks[0], declaredMaxes);
    for (const week of weeks.slice(1)) {
        const next = weeklyLiftSummary(sessions, week, declaredMaxes);
        for (let i = 0; i < base.length; i++) {
            base[i].sets += next[i].sets;
            base[i].reps += next[i].reps;
            base[i].tonnage += next[i].tonnage;
            base[i].days.push(...next[i].days);
        }
    }
    // La frecuencia deja de ser "días por semana" al acumular varias: pasa a
    // ser el número total de días en los que aparece el movimiento, que es lo
    // que significa en un ámbito de bloque.
    for (const row of base) row.frequency = row.days.length;
    return base;
}

function buildExecuted(logged: LoggedSession[], selector: ScopeSelector): ExecutedStats {
    // `weekContrast` filtra por semana internamente. Aquí el recorte ya está
    // hecho, así que se le pasa un número que englobe todo lo que queda.
    const weeksPresent = [...new Set(logged.map(s => s.weekNumber))];
    const contrast = weeksPresent.length === 1
        ? weekContrast(logged, weeksPresent[0])
        : mergeContrasts(weeksPresent.map(w => weekContrast(logged, w)));

    const velocities: number[] = [];
    let deviations = 0;
    for (const session of logged) {
        deviations += summarizeSession(session).deviations;
        for (const ex of session.exercises) {
            for (const set of ex.sets) {
                if (set.vbtMeanVelocity != null) velocities.push(set.vbtMeanVelocity);
            }
        }
    }

    void selector;

    return {
        contrast,
        avgVelocity: velocities.length
            ? Math.round((velocities.reduce((a, b) => a + b, 0) / velocities.length) * 100) / 100
            : null,
        deviations,
    };
}

/** Une los contrastes de varias semanas en uno solo. */
function mergeContrasts(parts: WeekContrast[]): WeekContrast {
    const acc: WeekContrast = {
        plannedSets: 0, loggedSets: 0, completionPct: 0,
        plannedTonnage: 0, actualTonnage: 0,
        plannedRpe: null, actualRpe: null,
        completedSessions: 0, totalSessions: 0,
    };
    const plannedRpes: number[] = [];
    const actualRpes: number[] = [];

    for (const p of parts) {
        acc.plannedSets += p.plannedSets;
        acc.loggedSets += p.loggedSets;
        acc.plannedTonnage += p.plannedTonnage;
        acc.actualTonnage += p.actualTonnage;
        acc.completedSessions += p.completedSessions;
        acc.totalSessions += p.totalSessions;
        if (p.plannedRpe != null) plannedRpes.push(p.plannedRpe);
        if (p.actualRpe != null) actualRpes.push(p.actualRpe);
    }

    acc.completionPct = acc.plannedSets > 0
        ? Math.round((acc.loggedSets / acc.plannedSets) * 100)
        : 0;
    acc.plannedRpe = mean(plannedRpes);
    acc.actualRpe = mean(actualRpes);
    return acc;
}

/** Cómo se llama el ámbito en pantalla. */
function labelFor(selector: ScopeSelector, weekNames?: Record<number, string>): string {
    switch (selector.scope) {
        case 'day':
            return 'Día';
        case 'week': {
            const name = selector.week != null ? weekNames?.[selector.week] : undefined;
            return name ? `Semana ${selector.week} · ${name}` : `Semana ${selector.week ?? ''}`.trim();
        }
        case 'block':
            return 'Bloque completo';
        case 'macro':
            return 'Macrociclo';
    }
}
