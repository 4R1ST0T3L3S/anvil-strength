/**
 * PRUEBAS DE LAS ESTADÍSTICAS POR ÁMBITO
 * =====================================================================
 *
 * Este módulo no calcula: recorta y ensambla. Así que lo que se comprueba es
 * justo eso:
 *
 *   1. Que el RECORTE es correcto (un día no arrastra la semana entera).
 *   2. Que las cifras COINCIDEN con las de los módulos de origen — si el
 *      ensamblaje se desviara, tendríamos dos verdades del mismo bloque.
 *   3. Que `executed` es null cuando no hay registro, y no cero.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VolumeSessionInput } from '../volume/engine';
import type { TrainingSet, AccessoryClass } from '../../types/training';
import type { LoggedSession, LoggedSet } from '../../services/trainingService';
import { statsForScope, scopeSessions, scopeLogged, SCOPE_LABEL } from './scopeStats';
import { weeklyLiftSummary } from '../planning/liftSummary';

// ---------------------------------------------------------------------

let n = 0;

function set(targetReps: string, load: number | null = null, rpe: string | null = null): TrainingSet {
    n += 1;
    return {
        id: `s${n}`, session_exercise_id: 'se', order_index: n,
        target_reps: targetReps, target_load: load, target_metric: 'kg', target_rpe: rpe,
        is_video_required: false, created_at: '',
    } as unknown as TrainingSet;
}

function session(
    id: string,
    week: number,
    exercises: { name: string; cls?: AccessoryClass | null; sets: TrainingSet[] }[]
): VolumeSessionInput {
    n += 1;
    return {
        id, week_number: week, day_number: 1,
        exercises: exercises.map((e, i) => ({
            id: `ex-${id}-${i}`,
            exercise: { name: e.name, muscle_group: null, primary_muscles: null, secondary_muscles: null },
            accessory_class: e.cls ?? null,
            sets: e.sets,
        })),
    } as unknown as VolumeSessionInput;
}

function logged(id: string, week: number, blockId: string, sets: Partial<LoggedSet>[]): LoggedSession {
    n += 1;
    return {
        id, blockId, blockName: 'B', weekNumber: week, dayNumber: 1,
        name: null, dayOfWeek: 'monday', date: null,
        completedAt: '2026-03-02T18:00:00Z',
        athleteNotes: null, warmup: null, extras: null,
        exercises: [{
            id: `ex-${id}`, exerciseId: 'lib', name: 'Sentadilla',
            variantName: null, coachNotes: null, restSeconds: null, orderIndex: 0,
            sets: sets.map((s, i) => ({
                id: `ls-${id}-${i}`, orderIndex: i,
                targetReps: '1x5', targetLoad: 100, targetMetric: 'kg', targetRpe: null,
                restSeconds: null, setType: null, setDetail: null, groupTag: null,
                actualReps: null, actualLoad: null, actualRpe: null, isCompleted: false,
                notes: null, videoUrl: null, vbtFileUrl: null,
                vbtMeanVelocity: null, vbtPeakVelocity: null, vbtVelocityLoss: null, vbtEst1RM: null,
                ...s,
            })),
        }],
    };
}

const SESSIONS = [
    session('d1', 10, [
        { name: 'Sentadilla', sets: [set('4x5', 150)] },
        { name: 'Remo con Barra', cls: 'acc_dl', sets: [set('4x10', 80, '8')] },
    ]),
    session('d2', 10, [
        { name: 'Press Banca', sets: [set('5x5', 100)] },
    ]),
    session('d3', 11, [
        { name: 'Sentadilla', sets: [set('3x3', 180)] },
    ]),
];

// =====================================================================

describe('scopeSessions — el recorte', () => {
    test('day se queda con UNA sesión', () => {
        assert.deepEqual(scopeSessions(SESSIONS, { scope: 'day', sessionId: 'd1' }).map(s => s.id), ['d1']);
    });

    test('week se queda con las de esa semana', () => {
        assert.deepEqual(scopeSessions(SESSIONS, { scope: 'week', week: 10 }).map(s => s.id), ['d1', 'd2']);
    });

    test('block y macro no recortan: ya viene recortado de la consulta', () => {
        assert.equal(scopeSessions(SESSIONS, { scope: 'block' }).length, 3);
        assert.equal(scopeSessions(SESSIONS, { scope: 'macro' }).length, 3);
    });

    test('un sessionId inexistente da vacío, no todo', () => {
        assert.equal(scopeSessions(SESSIONS, { scope: 'day', sessionId: 'nope' }).length, 0);
    });
});

describe('scopeLogged', () => {
    const sessions = [
        logged('l1', 10, 'b1', []),
        logged('l2', 11, 'b1', []),
        logged('l3', 12, 'b2', []),
    ];

    test('macro filtra por los bloques que lo componen', () => {
        const r = scopeLogged(sessions, { scope: 'macro', blockIds: ['b1'] });
        assert.deepEqual(r.map(s => s.id), ['l1', 'l2']);
    });

    test('macro sin blockIds no filtra', () => {
        assert.equal(scopeLogged(sessions, { scope: 'macro', blockIds: [] }).length, 3);
    });

    test('week filtra por weekNumber', () => {
        assert.deepEqual(scopeLogged(sessions, { scope: 'week', week: 11 }).map(s => s.id), ['l2']);
    });
});

// =====================================================================

describe('statsForScope — ámbito día', () => {
    const stats = statsForScope({ scope: 'day', sessionId: 'd1' }, SESSIONS);

    test('solo cuenta ese día', () => {
        assert.equal(stats.planned.sets, 8); // 4 sentadilla + 4 remo
        assert.equal(stats.planned.sessions, 1);
    });

    test('el desglose por básico coincide con liftSummary', () => {
        const direct = weeklyLiftSummary([SESSIONS[0]], 10);
        const sq = stats.planned.lifts.find(l => l.lift === 'SQ')!;
        assert.equal(sq.sets, direct.find(l => l.lift === 'SQ')!.sets);
        assert.equal(sq.sets, 4);
    });

    test('los accesorios salen clasificados', () => {
        assert.equal(stats.planned.accessories.buckets.find(b => b.key === 'acc_dl')!.sets, 4);
        assert.equal(stats.planned.accessories.buckets.find(b => b.key === 'acc_dl')!.volume, 40);
    });

    test('NO enseña evolución: un día no evoluciona', () => {
        assert.equal(stats.planned.weeks, null);
        assert.equal(stats.planned.deloadWeeks, null);
    });

    test('sin registro, executed es null (no cero)', () => {
        assert.equal(stats.executed, null);
    });
});

describe('statsForScope — ámbito semana', () => {
    const stats = statsForScope({ scope: 'week', week: 10 }, SESSIONS);

    test('suma los días de la semana y no los de la siguiente', () => {
        assert.equal(stats.planned.sets, 13); // 4 + 4 + 5
        assert.equal(stats.planned.sessions, 2);
    });

    test('reparte entre básicos y accesorios sin perder series', () => {
        const main = stats.planned.lifts.reduce((s, l) => s + l.sets, 0);
        const acc = stats.planned.accessories.totalSets;
        assert.equal(main, 9);
        assert.equal(acc, 4);
        assert.equal(main + acc, stats.planned.sets);
    });

    test('la etiqueta usa el nombre de la semana si lo hay', () => {
        const named = statsForScope({ scope: 'week', week: 10 }, SESSIONS, { weekNames: { 10: 'Choque' } });
        assert.equal(named.label, 'Semana 10 · Choque');
        assert.equal(stats.label, 'Semana 10');
    });
});

describe('statsForScope — ámbito bloque', () => {
    const stats = statsForScope({ scope: 'block' }, SESSIONS);

    test('cuenta todo el bloque', () => {
        assert.equal(stats.planned.sets, 16); // 13 + 3
        assert.equal(stats.planned.sessions, 3);
    });

    test('SÍ enseña la evolución semana a semana', () => {
        assert.ok(stats.planned.weeks);
        assert.equal(stats.planned.weeks!.length, 2);
        assert.deepEqual(stats.planned.weeks!.map(w => w.week), [10, 11]);
        assert.ok(Array.isArray(stats.planned.deloadWeeks));
    });

    test('acumula el desglose por básico de todas las semanas', () => {
        const sq = stats.planned.lifts.find(l => l.lift === 'SQ')!;
        assert.equal(sq.sets, 7);      // 4 en la 10 + 3 en la 11
        assert.equal(sq.days.length, 2);
    });

    test('el tonelaje total es la suma de los días', () => {
        // 4×5×150 = 3000 · 5×5×100 = 2500 · 3×3×180 = 1620 · remo 4×10×80 = 3200
        assert.equal(stats.planned.tonnage, 3000 + 2500 + 1620 + 3200);
    });
});

describe('statsForScope — lo ejecutado', () => {
    const loggedSessions = [
        logged('d1', 10, 'b1', [
            { actualReps: 5, actualLoad: 150, actualRpe: 8, isCompleted: true, vbtMeanVelocity: 0.4 },
            { actualReps: 5, actualLoad: 150, isCompleted: true, vbtMeanVelocity: 0.36 },
        ]),
    ];

    test('aparece cuando se pasa registro', () => {
        const stats = statsForScope({ scope: 'week', week: 10 }, SESSIONS, { logged: loggedSessions });
        assert.ok(stats.executed);
        assert.equal(stats.executed!.contrast.loggedSets, 2);
    });

    test('la velocidad media sale de las series que la tienen', () => {
        const stats = statsForScope({ scope: 'week', week: 10 }, SESSIONS, { logged: loggedSessions });
        assert.equal(stats.executed!.avgVelocity, 0.38);
    });

    test('sin ninguna velocidad registrada, null', () => {
        const sinVel = [logged('d1', 10, 'b1', [{ actualReps: 5, actualLoad: 150, isCompleted: true }])];
        const stats = statsForScope({ scope: 'week', week: 10 }, SESSIONS, { logged: sinVel });
        assert.equal(stats.executed!.avgVelocity, null);
    });

    test('une el contraste de varias semanas sin perder series', () => {
        const multi = [
            logged('d1', 10, 'b1', [{ actualReps: 5, actualLoad: 150, isCompleted: true }]),
            logged('d3', 11, 'b1', [{ actualReps: 3, actualLoad: 180, isCompleted: true }]),
        ];
        const stats = statsForScope({ scope: 'block' }, SESSIONS, { logged: multi });
        assert.equal(stats.executed!.contrast.loggedSets, 2);
        assert.equal(stats.executed!.contrast.totalSessions, 2);
    });
});

describe('statsForScope — casos límite', () => {
    test('sin sesiones no revienta y da ceros', () => {
        const stats = statsForScope({ scope: 'week', week: 99 }, SESSIONS);
        assert.equal(stats.planned.sets, 0);
        assert.equal(stats.planned.tonnage, 0);
        assert.equal(stats.planned.lifts.length, 3); // los tres siguen saliendo
        assert.equal(stats.planned.accessories.totalSets, 0);
    });

    test('las cuatro etiquetas existen', () => {
        assert.deepEqual(Object.keys(SCOPE_LABEL), ['day', 'week', 'block', 'macro']);
    });
});
