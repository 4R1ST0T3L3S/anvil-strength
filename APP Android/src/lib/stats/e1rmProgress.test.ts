/**
 * PRUEBAS DE LA EVOLUCIÓN DEL 1RM ESTIMADO
 * =====================================================================
 *
 * Lo que se fija aquí, y por qué importa cada una:
 *
 *   1. SOLO cuenta lo REGISTRADO. Un 250 que el coach dejó pautado para
 *      dentro de tres semanas NO puede aparecer como una marca conseguida
 *      en la gráfica de progreso del atleta.
 *   2. Un punto por sesión, y es el MEJOR de la sesión. Promediar
 *      mezclaría las aproximaciones con la serie pesada.
 *   3. A UNA repetición el e1RM es la carga tal cual: no se infla un 3,3%.
 *      Es la regla de oneRm.ts y aquí no puede romperse.
 *   4. Una serie de más de 12 repeticiones NO entra. Si entrara, hacer un
 *      día de series largas haría BAJAR la curva.
 *   5. Las variantes que no son el movimiento de competición (búlgara,
 *      frontal, militar) no suman al básico.
 *   6. El orden es cronológico por FECHA, no por (bloque, semana): los
 *      bloques se solapan cuando el coach abre el siguiente antes de
 *      cerrar el anterior.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import { progresionE1RM, resumenDeMovimiento } from './e1rmProgress';

let n = 0;

function serie(p: Partial<TrainingSet>): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        is_video_required: false,
        ...p,
    } as TrainingSet;
}

function fila(p: Partial<ExerciseHistoryRow> & { sets: TrainingSet[] }): ExerciseHistoryRow {
    n += 1;
    return {
        sessionExerciseId: `se${n}`,
        exerciseId: `e${n}`,
        exerciseName: 'Sentadilla',
        variantName: null,
        blockId: 'b1',
        blockName: 'Bloque 1',
        blockSequence: 1,
        blockStartDate: null,
        blockCreatedAt: '2026-01-01',
        macroId: null,
        sessionId: `ses${n}`,
        weekNumber: 1,
        dayNumber: 1,
        date: null,
        rpeGlobal: null,
        velocityAvg: null,
        primaryMuscles: null,
        secondaryMuscles: null,
        ...p,
    };
}

describe('solo lo registrado', () => {
    test('una serie SOLO pautada no produce ningún punto', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01',
            sets: [serie({ target_load: 250, target_reps: '1x1', target_metric: 'kg' })],
        })];
        assert.deepEqual(progresionE1RM(h, { lift: 'SQ' }), []);
    });

    test('lo registrado sí, y el pautado del mismo día no lo pisa', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01',
            sets: [
                serie({ target_load: 250, target_reps: '1x1', actual_load: 200, actual_reps: 1 }),
            ],
        })];
        const p = progresionE1RM(h, { lift: 'SQ' });
        assert.equal(p.length, 1);
        assert.equal(p[0].e1rm, 200, 'los 250 pautados no cuentan');
    });
});

describe('un punto por sesión, el mejor', () => {
    test('de tres series del mismo día se queda la de mayor e1RM', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01',
            sets: [
                serie({ actual_load: 140, actual_reps: 5 }),   // 163,3
                serie({ actual_load: 180, actual_reps: 3 }),   // 198
                serie({ actual_load: 170, actual_reps: 3 }),   // 187
            ],
        })];
        const p = progresionE1RM(h, { lift: 'SQ' });
        assert.equal(p.length, 1, 'un punto, no tres');
        assert.equal(p[0].e1rm, 198);
        assert.equal(p[0].load, 180, 'y dice de qué serie sale');
        assert.equal(p[0].reps, 3);
    });

    test('dos sesiones distintas dan dos puntos', () => {
        const h = [
            fila({ sessionId: 'A', date: '2026-09-01', sets: [serie({ actual_load: 180, actual_reps: 3 })] }),
            fila({ sessionId: 'B', date: '2026-09-08', sets: [serie({ actual_load: 185, actual_reps: 3 })] }),
        ];
        assert.equal(progresionE1RM(h, { lift: 'SQ' }).length, 2);
    });
});

describe('la fórmula es la de oneRm.ts, sin copias', () => {
    test('a UNA repetición el e1RM es la carga, no un 3,3% más', () => {
        const h = [fila({ sessionId: 'A', date: '2026-09-01', sets: [serie({ actual_load: 200, actual_reps: 1 })] })];
        assert.equal(progresionE1RM(h, { lift: 'SQ' })[0].e1rm, 200);
    });

    test('una serie de 15 repeticiones NO entra', () => {
        const h = [fila({ sessionId: 'A', date: '2026-09-01', sets: [serie({ actual_load: 100, actual_reps: 15 })] })];
        assert.deepEqual(progresionE1RM(h, { lift: 'SQ' }), [], 'por encima de 12 no se predice fuerza máxima');
    });

    test('una serie de 15 no arrastra hacia abajo a la buena del mismo día', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01',
            sets: [
                serie({ actual_load: 180, actual_reps: 3 }),
                serie({ actual_load: 100, actual_reps: 15 }),
            ],
        })];
        assert.equal(progresionE1RM(h, { lift: 'SQ' })[0].e1rm, 198);
    });
});

describe('qué cuenta como el básico', () => {
    test('la búlgara NO es sentadilla', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01', exerciseName: 'Sentadilla búlgara',
            sets: [serie({ actual_load: 60, actual_reps: 8 })],
        })];
        assert.deepEqual(progresionE1RM(h, { lift: 'SQ' }), []);
    });

    test('un ejercicio suelto se puede pedir por nombre', () => {
        const h = [fila({
            sessionId: 'A', date: '2026-09-01', exerciseName: 'Remo con barra',
            sets: [serie({ actual_load: 100, actual_reps: 5 })],
        })];
        const p = progresionE1RM(h, { exerciseName: 'remo con barra' });
        assert.equal(p.length, 1, 'y el nombre se normaliza');
    });
});

describe('orden y resumen', () => {
    test('el orden es por fecha, aunque los bloques se solapen', () => {
        const h = [
            fila({ sessionId: 'C', date: '2026-09-15', blockName: 'B1', blockSequence: 1, weekNumber: 3, sets: [serie({ actual_load: 190, actual_reps: 3 })] }),
            fila({ sessionId: 'A', date: '2026-09-01', blockName: 'B2', blockSequence: 2, weekNumber: 1, sets: [serie({ actual_load: 180, actual_reps: 3 })] }),
            fila({ sessionId: 'B', date: '2026-09-08', blockName: 'B1', blockSequence: 1, weekNumber: 2, sets: [serie({ actual_load: 185, actual_reps: 3 })] }),
        ];
        assert.deepEqual(progresionE1RM(h, { lift: 'SQ' }).map(p => p.sessionId), ['A', 'B', 'C']);
    });

    test('el resumen mide contra el PRIMER punto, no contra el mejor', () => {
        const h = [
            fila({ sessionId: 'A', date: '2026-09-01', sets: [serie({ actual_load: 200, actual_reps: 1 })] }),
            fila({ sessionId: 'B', date: '2026-09-08', sets: [serie({ actual_load: 230, actual_reps: 1 })] }),
            fila({ sessionId: 'C', date: '2026-09-15', sets: [serie({ actual_load: 215, actual_reps: 1 })] }),
        ];
        const r = resumenDeMovimiento(h, 'SQ', 'Sentadilla');
        assert.equal(r.actual, 215, 'el último');
        assert.equal(r.mejor, 230, 'el mejor de la serie');
        assert.equal(r.delta, 15, '215 - 200: cuánto has subido desde que empezaste');
    });

    test('sin registro, el resumen es todo null y no da NaN', () => {
        const r = resumenDeMovimiento([], 'DL', 'Peso muerto');
        assert.equal(r.actual, null);
        assert.equal(r.delta, null);
        assert.equal(r.mejor, null);
        assert.deepEqual(r.puntos, []);
    });

    test('con UN solo punto no hay delta: no hay contra qué comparar', () => {
        const h = [fila({ sessionId: 'A', date: '2026-09-01', sets: [serie({ actual_load: 200, actual_reps: 1 })] })];
        const r = resumenDeMovimiento(h, 'SQ', 'Sentadilla');
        assert.equal(r.actual, 200);
        assert.equal(r.delta, null);
    });
});
