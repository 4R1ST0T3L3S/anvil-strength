/**
 * PRUEBAS DE LA SEMANA ANTERIOR (LO REALIZADO)
 * =====================================================================
 *
 * Lo que se fija, y en este orden de importancia:
 *
 *   1. UNA SERIE SIN REGISTRAR NO SE CUENTA. Ni como hecha, ni como cero, ni
 *      rellenada con lo que ponía en el plan. Es la regla que separa un
 *      registro de una ficción, y la que más fácil sería romper "por
 *      comodidad".
 *   2. Sin 1RM declarado no hay porcentaje. Nunca se estima.
 *   3. La semana anterior a la 1 es la 52 del año pasado, no la 0.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { LoggedSession, LoggedSet } from '../../services/trainingService';
import { previousWeekByLift, weekContrast, previousWeekOf } from './weekExecutionSummary';

// ---------------------------------------------------------------------

let n = 0;

function set(over: Partial<LoggedSet> = {}): LoggedSet {
    n += 1;
    return {
        id: `s${n}`,
        orderIndex: n,
        targetReps: '1x5',
        targetLoad: null,
        targetMetric: 'kg',
        targetRpe: null,
        restSeconds: null,
        setType: null,
        setDetail: null,
        groupTag: null,
        actualReps: null,
        actualLoad: null,
        actualRpe: null,
        isCompleted: false,
        notes: null,
        videoUrl: null,
        vbtFileUrl: null,
        vbtMeanVelocity: null,
        vbtPeakVelocity: null,
        vbtVelocityLoss: null,
        vbtEst1RM: null,
        ...over,
    };
}

function session(
    week: number,
    dayOfWeek: string | null,
    exercises: { name: string; sets: LoggedSet[] }[],
    over: Partial<LoggedSession> = {}
): LoggedSession {
    n += 1;
    return {
        id: `sess-${week}-${n}`,
        blockId: 'b1',
        blockName: 'Fuerza',
        weekNumber: week,
        dayNumber: 1,
        name: null,
        dayOfWeek,
        date: null,
        completedAt: '2026-03-02T18:00:00Z',
        athleteNotes: null,
        warmup: null,
        extras: null,
        exercises: exercises.map((e, i) => ({
            id: `ex-${n}-${i}`,
            exerciseId: `lib-${i}`,
            name: e.name,
            variantName: null,
            coachNotes: null,
            restSeconds: null,
            orderIndex: i,
            sets: e.sets,
        })),
        ...over,
    };
}

const find = (rows: ReturnType<typeof previousWeekByLift>, lift: string) =>
    rows.find(r => r.lift === lift)!;

// =====================================================================

describe('previousWeekByLift — LO NO REGISTRADO NO SE CUENTA', () => {
    test('una serie pautada y NO registrada no suma nada ejecutado', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ targetReps: '4x5', targetLoad: 200 })], // sin actual_*
            }])],
            10
        );
        const sq = find(rows, 'SQ');
        assert.equal(sq.totalSets, 0);
        assert.equal(sq.totalReps, 0);
        assert.equal(sq.totalTonnage, 0);
        assert.equal(sq.hasData, false);
        // Pero SÍ cuenta como pedida: es el denominador del cumplimiento.
        assert.equal(sq.plannedSets, 4);
    });

    test('NO rellena la carga ejecutada con la prescrita', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                // Registró las reps pero no el peso: el tonelaje no se puede
                // saber, y NO se completa con los 200 que ponía en el plan.
                sets: [set({ targetLoad: 200, actualReps: 5, isCompleted: true })],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').totalTonnage, 0);
        assert.equal(find(rows, 'SQ').totalReps, 5);
    });

    test('cuenta lo ejecutado aunque difiera de lo pautado', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ targetReps: '1x5', targetLoad: 200, actualReps: 3, actualLoad: 180, isCompleted: true })],
            }])],
            10
        );
        const sq = find(rows, 'SQ');
        assert.equal(sq.totalReps, 3);
        assert.equal(sq.totalTonnage, 540); // 180 × 3
        assert.equal(sq.days[0].topLoad, 180);
    });

    test('una serie agrupada cerrada cuenta como las series que representaba', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ targetReps: '4x5', actualReps: 5, actualLoad: 100, isCompleted: true })],
            }])],
            10
        );
        const sq = find(rows, 'SQ');
        assert.equal(sq.totalSets, 4);
        assert.equal(sq.totalReps, 20);
        assert.equal(sq.totalTonnage, 2000);
    });

    test('una serie con datos pero SIN cerrar cuenta como una sola', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ targetReps: '4x5', actualReps: 5, actualLoad: 100, isCompleted: false })],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').totalSets, 1);
    });
});

describe('previousWeekByLift — intensidad relativa', () => {
    test('con 1RM declarado sale el %', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ actualReps: 5, actualLoad: 150, isCompleted: true })],
            }])],
            10,
            () => 200
        );
        assert.equal(find(rows, 'SQ').days[0].intensityPct, 75);
    });

    test('SIN 1RM el porcentaje es null — nunca se estima', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ actualReps: 5, actualLoad: 150, isCompleted: true })],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].intensityPct, null);
        assert.equal(find(rows, 'SQ').avgIntensity, null);
    });

    test('un 1RM a cero no produce una división absurda', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ actualReps: 5, actualLoad: 150, isCompleted: true })],
            }])],
            10,
            () => 0
        );
        assert.equal(find(rows, 'SQ').days[0].intensityPct, null);
    });
});

describe('previousWeekByLift — RPE y velocidad cuando existen', () => {
    test('RPE medio de lo ejecutado', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [
                    set({ actualReps: 5, actualLoad: 100, actualRpe: 7, isCompleted: true }),
                    set({ actualReps: 5, actualLoad: 100, actualRpe: 9, isCompleted: true }),
                ],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').avgRpe, 8);
    });

    test('velocidad media de las series que la tienen', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [
                    set({ actualReps: 3, actualLoad: 200, vbtMeanVelocity: 0.3, isCompleted: true }),
                    set({ actualReps: 3, actualLoad: 200, vbtMeanVelocity: 0.24, isCompleted: true }),
                    set({ actualReps: 3, actualLoad: 200, isCompleted: true }), // sin velocidad
                ],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].velocity, 0.27);
    });

    test('sin RPE ni velocidad, los dos son null', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [set({ actualReps: 5, actualLoad: 100, isCompleted: true })],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].rpe, null);
        assert.equal(find(rows, 'SQ').days[0].velocity, null);
    });
});

describe('previousWeekByLift — estructura', () => {
    test('los tres básicos salen siempre', () => {
        const rows = previousWeekByLift([], 10);
        assert.deepEqual(rows.map(r => r.lift), ['SQ', 'BP', 'DL']);
        assert.ok(rows.every(r => r.hasData === false));
    });

    test('ordena los días por día de la semana', () => {
        const rows = previousWeekByLift(
            [
                session(10, 'thursday', [{ name: 'Sentadilla', sets: [set({ actualReps: 3, actualLoad: 220, isCompleted: true })] }]),
                session(10, 'monday', [{ name: 'Sentadilla', sets: [set({ actualReps: 5, actualLoad: 200, isCompleted: true })] }]),
            ],
            10
        );
        assert.deepEqual(find(rows, 'SQ').days.map(d => d.dayLabel), ['Lunes', 'Jueves']);
    });

    test('los accesorios no entran en el desglose de básicos', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [
                { name: 'Sentadilla Búlgara', sets: [set({ actualReps: 10, actualLoad: 40, isCompleted: true })] },
            ])],
            10
        );
        assert.equal(find(rows, 'SQ').totalSets, 0);
    });

    test('ignora las semanas que no son la pedida', () => {
        const rows = previousWeekByLift(
            [
                session(10, 'monday', [{ name: 'Sentadilla', sets: [set({ actualReps: 5, actualLoad: 100, isCompleted: true })] }]),
                session(11, 'monday', [{ name: 'Sentadilla', sets: [set({ actualReps: 5, actualLoad: 999, isCompleted: true })] }]),
            ],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].topLoad, 100);
    });

    test('el detalle agrupa las series iguales', () => {
        const rows = previousWeekByLift(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [
                    set({ actualReps: 5, actualLoad: 200, isCompleted: false }),
                    set({ actualReps: 5, actualLoad: 200, isCompleted: false }),
                ],
            }])],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].detail, '2 × 5 · 200 kg');
    });
});

// =====================================================================

describe('weekContrast', () => {
    test('cumplimiento sobre las series pedidas', () => {
        const c = weekContrast(
            [session(10, 'monday', [{
                name: 'Sentadilla',
                sets: [
                    set({ targetReps: '1x5', targetLoad: 100, actualReps: 5, actualLoad: 100, isCompleted: true }),
                    set({ targetReps: '1x5', targetLoad: 100 }), // no registrada
                ],
            }])],
            10
        );
        assert.equal(c.plannedSets, 2);
        assert.equal(c.loggedSets, 1);
        assert.equal(c.completionPct, 50);
        assert.equal(c.plannedTonnage, 1000); // 2 × 5 × 100
        assert.equal(c.actualTonnage, 500);
    });

    test('cuenta accesorios y básicos juntos', () => {
        const c = weekContrast(
            [session(10, 'monday', [
                { name: 'Sentadilla', sets: [set({ targetReps: '3x5', actualReps: 5, actualLoad: 100, isCompleted: true })] },
                { name: 'Curl de Bíceps', sets: [set({ targetReps: '3x12', actualReps: 12, actualLoad: 20, isCompleted: true })] },
            ])],
            10
        );
        assert.equal(c.plannedSets, 6);
        assert.equal(c.loggedSets, 6);
    });

    test('una semana sin nada da 0% y no revienta', () => {
        const c = weekContrast([], 10);
        assert.equal(c.completionPct, 0);
        assert.equal(c.totalSessions, 0);
    });

    test('cuenta los días cerrados', () => {
        const c = weekContrast(
            [
                session(10, 'monday', [], { completedAt: '2026-03-02T18:00:00Z' }),
                session(10, 'wednesday', [], { completedAt: null }),
            ],
            10
        );
        assert.equal(c.completedSessions, 1);
        assert.equal(c.totalSessions, 2);
    });
});

describe('previousWeekOf', () => {
    test('la semana anterior presente en el registro', () => {
        const sessions = [session(8, null, []), session(9, null, []), session(10, null, [])];
        assert.equal(previousWeekOf(sessions, 10), 9);
    });

    test('salta los huecos: si no hay semana 9, devuelve la 8', () => {
        const sessions = [session(8, null, []), session(10, null, [])];
        assert.equal(previousWeekOf(sessions, 10), 8);
    });

    test('EL SALTO DE AÑO: antes de la semana 1 está la 52', () => {
        const sessions = [session(51, null, []), session(52, null, []), session(1, null, [])];
        assert.equal(previousWeekOf(sessions, 1), 52);
    });

    test('sin ninguna semana anterior devuelve null', () => {
        assert.equal(previousWeekOf([session(10, null, [])], 10), null);
        assert.equal(previousWeekOf([], 10), null);
    });
});
