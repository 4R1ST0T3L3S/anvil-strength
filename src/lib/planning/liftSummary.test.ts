/**
 * PRUEBAS DE LAS SERIES SEMANALES DE BÁSICOS
 * =====================================================================
 *
 * Lo que se fija aquí:
 *
 *   1. Un "4x8" son CUATRO series, no una. Es el error que más veces se ha
 *      colado en esta aplicación y el que hace que un panel diga 6 series
 *      donde hay 24.
 *   2. Las variantes de competición SUMAN al básico; los accesorios que
 *      llevan su nombre dentro (búlgara, militar, rumano) NO.
 *   3. Sin 1RM de referencia no se escribe un porcentaje. Se escribe la carga.
 *   4. Los tres básicos salen SIEMPRE, aunque estén a cero.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VolumeSessionInput } from '../volume/engine';
import type { TrainingSet } from '../../types/training';
import { weeklyLiftSummary, weeklyLiftSets, weeklyExerciseSummary, weeksOf, MAIN_LIFTS } from './liftSummary';

// ---------------------------------------------------------------------

let n = 0;

function set(targetReps: string, load: number | null = null, metric = 'kg'): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        order_index: n,
        target_reps: targetReps,
        target_load: load,
        target_metric: metric,
        is_video_required: false,
        created_at: '',
    } as unknown as TrainingSet;
}

function session(
    week: number,
    day: number,
    dayOfWeek: string | null,
    exercises: { name: string; sets: TrainingSet[] }[]
): VolumeSessionInput {
    n += 1;
    return {
        id: `sess-${week}-${day}`,
        week_number: week,
        day_number: day,
        day_of_week: dayOfWeek,
        exercises: exercises.map((e, i) => ({
            id: `ex-${n}-${i}`,
            exercise: { name: e.name, muscle_group: null, primary_muscles: null, secondary_muscles: null },
            sets: e.sets,
        })),
    } as unknown as VolumeSessionInput;
}

const find = (rows: ReturnType<typeof weeklyLiftSummary>, lift: string) =>
    rows.find(r => r.lift === lift)!;

// =====================================================================

describe('weeklyLiftSummary — el recuento de series', () => {
    test('"4x5" son CUATRO series, no una', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }])],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 4);
        assert.equal(find(rows, 'SQ').reps, 20);
    });

    test('una serie suelta "5" es una serie de 5 repeticiones', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('5', 100)] }])],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 1);
        assert.equal(find(rows, 'SQ').reps, 5);
    });

    test('suma los días de toda la semana', () => {
        const rows = weeklyLiftSummary(
            [
                session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }]),
                session(10, 2, 'wednesday', [{ name: 'Sentadilla', sets: [set('3x4', 110)] }]),
                session(10, 3, 'friday', [{ name: 'Sentadilla', sets: [set('5x3', 120)] }]),
            ],
            10
        );
        const sq = find(rows, 'SQ');
        assert.equal(sq.sets, 12);
        assert.equal(sq.frequency, 3);
        assert.equal(sq.days.length, 3);
    });

    test('ignora las semanas que no son la pedida', () => {
        const rows = weeklyLiftSummary(
            [
                session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }]),
                session(11, 1, 'monday', [{ name: 'Sentadilla', sets: [set('9x9', 100)] }]),
            ],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 4);
    });

    test('los tres básicos salen SIEMPRE, aunque a cero', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('3x5', 100)] }])],
            10
        );
        assert.deepEqual(rows.map(r => r.lift), [...MAIN_LIFTS]);
        assert.equal(find(rows, 'BP').sets, 0);
        assert.equal(find(rows, 'DL').sets, 0);
        assert.equal(find(rows, 'BP').days.length, 0);
    });
});

describe('weeklyLiftSummary — qué cuenta como básico', () => {
    test('las variantes de competición SUMAN al básico', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla', sets: [set('3x5', 100)] },
                { name: 'Sentadilla Pausada', sets: [set('2x3', 90)] },
                { name: 'Sentadilla con Cadenas', sets: [set('2x2', 95)] },
            ])],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 7);
    });

    test('búlgara, militar y rumano NO son el básico', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla Búlgara', sets: [set('4x10', 40)] },
                { name: 'Press Militar', sets: [set('4x8', 50)] },
                { name: 'Peso Muerto Rumano', sets: [set('4x8', 100)] },
            ])],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 0);
        assert.equal(find(rows, 'BP').sets, 0);
        assert.equal(find(rows, 'DL').sets, 0);
    });

    test('"press banca" es banca; "press francés" no', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [
                { name: 'Press Banca', sets: [set('5x5', 80)] },
                { name: 'Press Francés', sets: [set('3x12', 30)] },
            ])],
            10
        );
        assert.equal(find(rows, 'BP').sets, 5);
    });
});

describe('weeklyLiftSummary — el desglose por día', () => {
    test('ordena por día de la semana, no por day_number', () => {
        const rows = weeklyLiftSummary(
            [
                session(10, 1, 'friday', [{ name: 'Sentadilla', sets: [set('5x3', 120)] }]),
                session(10, 2, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }]),
            ],
            10
        );
        assert.deepEqual(find(rows, 'SQ').days.map(d => d.dayLabel), ['Lunes', 'Viernes']);
    });

    test('los días sin agendar van detrás y se llaman "Día N"', () => {
        const rows = weeklyLiftSummary(
            [
                session(10, 3, null, [{ name: 'Sentadilla', sets: [set('2x5', 100)] }]),
                session(10, 1, 'wednesday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }]),
            ],
            10
        );
        assert.deepEqual(find(rows, 'SQ').days.map(d => d.dayLabel), ['Miércoles', 'Día 3']);
    });

    test('con 1RM declarado el detalle lleva el %', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 144)] }])],
            10,
            { Sentadilla: 200 }
        );
        assert.equal(find(rows, 'SQ').days[0].detail, '4 × 5 @ 72%');
        assert.equal(find(rows, 'SQ').days[0].topIntensity, 72);
    });

    test('SIN 1RM y sin referencia derivable, el detalle NO inventa un %', () => {
        // Una sola serie: `buildReferenceMaxes` sí deriva del propio bloque,
        // así que para que no haya referencia se pauta en una métrica que no
        // son kilos — que es el caso real de un bloque escrito en RPE.
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 8, 'rpe')] }])],
            10
        );
        const detail = find(rows, 'SQ').days[0].detail;
        assert.equal(detail, '4 × 5');
        assert.doesNotMatch(detail, /%/);
        assert.equal(find(rows, 'SQ').days[0].topIntensity, null);
    });

    test('agrupa las prescripciones idénticas en vez de repetirlas', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla', sets: [set('3', 100), set('3', 100), set('3', 100)] },
            ])],
            10,
            { Sentadilla: 200 }
        );
        assert.equal(find(rows, 'SQ').days[0].detail, '3 × 3 @ 50%');
        assert.equal(find(rows, 'SQ').sets, 3);
    });

    test('un AMRAP no cuenta repeticiones pero sí la serie', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('1xAMRAP', 100)] }])],
            10
        );
        assert.equal(find(rows, 'SQ').sets, 1);
        assert.equal(find(rows, 'SQ').reps, 0);
        assert.match(find(rows, 'SQ').days[0].detail, /AMRAP/);
    });

    test('la carga top del día es la más pesada, no la última', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla', sets: [set('1x3', 150), set('3x5', 100)] },
            ])],
            10
        );
        assert.equal(find(rows, 'SQ').days[0].topLoad, 150);
    });
});

describe('weeklyLiftSummary — tonelaje', () => {
    test('series × reps × carga', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 100)] }])],
            10
        );
        assert.equal(find(rows, 'SQ').tonnage, 2000);
    });

    test('una prescripción en m/s NO entra en el tonelaje como kilos', () => {
        const rows = weeklyLiftSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 0.45, 'vel')] }])],
            10
        );
        assert.equal(find(rows, 'SQ').tonnage, 0);
        assert.equal(find(rows, 'SQ').sets, 4);
    });
});

describe('weeklyLiftSets', () => {
    test('devuelve solo las cifras', () => {
        const sets = weeklyLiftSets(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla', sets: [set('4x5', 100)] },
                { name: 'Press Banca', sets: [set('5x5', 80)] },
            ])],
            10
        );
        assert.deepEqual(sets, { SQ: 4, BP: 5, DL: 0 });
    });
});

describe('weeksOf', () => {
    test('ordena de menor a mayor en el caso normal', () => {
        const sessions = [session(12, 1, null, []), session(10, 1, null, []), session(11, 1, null, [])];
        assert.deepEqual(weeksOf(sessions), [10, 11, 12]);
    });

    test('respeta el orden de llegada cuando el bloque cruza el año', () => {
        // 51, 52, 1, 2 ordenado numéricamente daría 1, 2, 51, 52: el bloque se
        // leería del revés.
        const sessions = [session(51, 1, null, []), session(52, 1, null, []), session(1, 1, null, []), session(2, 1, null, [])];
        assert.deepEqual(weeksOf(sessions), [51, 52, 1, 2]);
    });

    test('no duplica semanas con varios días', () => {
        const sessions = [session(10, 1, null, []), session(10, 2, null, []), session(11, 1, null, [])];
        assert.deepEqual(weeksOf(sessions), [10, 11]);
    });
});

// =====================================================================

describe('weeklyExerciseSummary — un ejercicio cualquiera, no solo los básicos', () => {
    test('agrupa por exerciseKey, no por nombre exacto', () => {
        const s = weeklyExerciseSummary(
            [
                session(10, 1, 'monday', [{ name: 'Prensa', sets: [set('3x10', 200)] }]),
                session(10, 2, 'thursday', [{ name: '  prensa  ', sets: [set('3x10', 210)] }]),
            ],
            10,
            'Prensa'
        );
        assert.equal(s.sets, 6);
        assert.equal(s.frequency, 2);
    });

    test('funciona igual de bien para un básico que para un accesorio', () => {
        const s = weeklyExerciseSummary(
            [session(10, 1, 'monday', [
                { name: 'Sentadilla', sets: [set('4x5', 150)] },
                { name: 'Extensión de cuádriceps', sets: [set('3x12', 60)] },
            ])],
            10,
            'Extensión de cuádriceps'
        );
        // Solo cuenta el accesorio pedido: la sentadilla del mismo día no se
        // mezcla — 3 series y no 7.
        assert.equal(s.sets, 3);
        assert.equal(s.frequency, 1);
        assert.equal(s.days[0].topLoad, 60);
    });

    test('sin ninguna serie esa semana, todo a cero y sin días', () => {
        const s = weeklyExerciseSummary(
            [session(10, 1, 'monday', [{ name: 'Sentadilla', sets: [set('4x5', 150)] }])],
            10,
            'Press militar'
        );
        assert.equal(s.sets, 0);
        assert.equal(s.frequency, 0);
        assert.deepEqual(s.days, []);
    });
});
