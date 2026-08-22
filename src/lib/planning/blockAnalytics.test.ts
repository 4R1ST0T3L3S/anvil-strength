/**
 * PRUEBAS DEL ANÁLISIS DE BLOQUE
 * =====================================================================
 * El foco está en la PROCEDENCIA del 1RM de referencia (`MaxSource`).
 *
 * Un %1RM sobre un máximo DECLARADO se puede comparar entre bloques; uno
 * sobre un máximo derivado de las cargas del propio bloque, no. Son dos
 * cifras distintas con el mismo símbolo detrás, así que la distinción tiene
 * que llegar intacta hasta la interfaz.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VolumeSessionInput } from '../volume/engine';
import type { TrainingSet } from '../../types/training';
import { buildReferenceMaxes, exerciseKey, analyzeBlock, isOpenEnded } from './blockAnalytics';

// ---------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------

let n = 0;

function set(targetReps: string, load: number | null, metric: string = 'kg'): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        order_index: n,
        target_reps: targetReps,
        target_load: load,
        target_metric: metric,
    } as unknown as TrainingSet;
}

function session(week: number, exercises: { name: string; sets: TrainingSet[] }[]): VolumeSessionInput {
    n += 1;
    return {
        id: `sess-${week}-${n}`,
        week_number: week,
        day_number: 1,
        exercises: exercises.map((e, i) => ({
            id: `ex-${n}-${i}`,
            exercise: { name: e.name, muscle_group: null, primary_muscles: null, secondary_muscles: null },
            sets: e.sets,
        })),
    } as unknown as VolumeSessionInput;
}

// ---------------------------------------------------------------------

describe('exerciseKey', () => {
    test('ignora acentos, mayúsculas y espacios de sobra', () => {
        assert.equal(exerciseKey('  Sentadilla Búlgara '), exerciseKey('sentadilla bulgara'));
    });

    test('NO ignora la variante entre paréntesis', () => {
        // La variante se quita en `findMax`, no aquí.
        assert.notEqual(exerciseKey('Sentadilla (pausada)'), exerciseKey('Sentadilla'));
    });
});

describe('isOpenEnded', () => {
    test('reconoce las prescripciones sin tope de repeticiones', () => {
        for (const s of ['AMRAP', 'max reps', 'al fallo', 'RIR 0']) {
            assert.equal(isOpenEnded(s), true, s);
        }
    });

    test('una prescripción normal no es abierta', () => {
        assert.equal(isOpenEnded('3x5'), false);
        assert.equal(isOpenEnded(null), false);
    });
});

describe('buildReferenceMaxes — procedencia', () => {
    test('un 1RM declarado se marca como declarado', () => {
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 100)] }])],
            { Sentadilla: 200 }
        );

        const m = maxes.get(exerciseKey('Sentadilla'))!;
        assert.equal(m.source, 'declared');
        assert.equal(m.oneRm, 200);
    });

    test('sin declarar, se deriva del bloque y se marca como derivado', () => {
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 100)] }])]
        );

        const m = maxes.get(exerciseKey('Sentadilla'))!;
        assert.equal(m.source, 'block');
        assert.equal(m.oneRm, 116.7);   // Epley sobre 100x5
    });

    test('el declarado GANA aunque el bloque tenga una carga más alta', () => {
        // Si no ganara, un atleta que hace una serie por encima de su 1RM
        // registrado dejaría de tener referencia declarada sin avisar.
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 300)] }])],
            { Sentadilla: 200 }
        );

        const m = maxes.get(exerciseKey('Sentadilla'))!;
        assert.equal(m.source, 'declared');
        assert.equal(m.oneRm, 200);
    });

    test('la procedencia es POR EJERCICIO, no por bloque', () => {
        // El caso que rompía el aviso de la interfaz: un solo ejercicio sin
        // 1RM ponía en duda los porcentajes de todos los demás.
        const maxes = buildReferenceMaxes(
            [session(1, [
                { name: 'Sentadilla', sets: [set('5', 100)] },
                { name: 'Press banca', sets: [set('5', 80)] },
            ])],
            { Sentadilla: 200 }
        );

        assert.equal(maxes.get(exerciseKey('Sentadilla'))!.source, 'declared');
        assert.equal(maxes.get(exerciseKey('Press banca'))!.source, 'block');
    });

    test('una serie en m/s NO puede producir una referencia', () => {
        // Una serie a 0,45 m/s daría un 1RM de 0,5 kg y arrastraría todos
        // los porcentajes del bloque.
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('3', 0.45, 'ms')] }])]
        );
        assert.equal(maxes.get(exerciseKey('Sentadilla')), undefined);
    });

    test('una serie AMRAP no produce referencia: las repeticiones son desconocidas', () => {
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('AMRAP', 100)] }])]
        );
        assert.equal(maxes.get(exerciseKey('Sentadilla')), undefined);
    });

    test('se queda con el e1RM más alto del bloque', () => {
        const maxes = buildReferenceMaxes(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 100), set('3', 120)] }])]
        );
        // 120x3 = 132 gana a 100x5 = 116,7
        assert.equal(maxes.get(exerciseKey('Sentadilla'))!.oneRm, 132);
    });
});

describe('analyzeBlock — la procedencia llega a la salida', () => {
    test('referenceMaxes distingue declarados de derivados', () => {
        const analysis = analyzeBlock(
            [session(1, [
                { name: 'Sentadilla', sets: [set('5', 100)] },
                { name: 'Press banca', sets: [set('5', 80)] },
            ])],
            { declaredMaxes: { Sentadilla: 200 } }
        );

        const inferred = analysis.referenceMaxes.filter(m => m.source === 'block').map(m => m.exercise);
        assert.deepEqual(inferred, ['Press banca']);
    });

    test('con todos los 1RM declarados no queda ninguno derivado', () => {
        // El panel no debe avisar de nada en este caso; antes avisaba
        // siempre, porque el planificador no le pasaba los máximos.
        const analysis = analyzeBlock(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 100)] }])],
            { declaredMaxes: { Sentadilla: 200 } }
        );

        assert.equal(analysis.referenceMaxes.every(m => m.source === 'declared'), true);
    });

    test('sin pasar máximos declarados, todo queda derivado', () => {
        const analysis = analyzeBlock(
            [session(1, [{ name: 'Sentadilla', sets: [set('5', 100)] }])]
        );
        assert.equal(analysis.referenceMaxes.every(m => m.source === 'block'), true);
    });
});
