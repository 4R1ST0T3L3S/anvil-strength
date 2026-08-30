/**
 * PRUEBAS DE LAS MEJORES MARCAS
 * =====================================================================
 *
 * La prueba que da sentido a todo el módulo es la primera: **220×1 NO supera
 * a 200×5**. Es el error que cometería cualquier implementación que ordenase
 * por peso, y el que convertiría la sección en ruido — un atleta que hace un
 * single pesado borraría todas sus marcas de repeticiones altas.
 *
 * Después, el desempate: RPE, luego velocidad, luego fecha; y un dato que
 * falta nunca gana.
 *
 * Y por último la detección: solo lo REALIZADO, nunca lo prescrito.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import {
    isBetterMark, bestOf, buildRepMaxIndex, findRepMax, marksForExercise,
    exercisesWithMarks, detectRepMaxes, formatMark, markLabel, repsForLookup,
    type RepMax,
} from './repMaxes';

// ---------------------------------------------------------------------

let n = 0;

function mark(over: Partial<RepMax> = {}): RepMax {
    n += 1;
    return {
        id: `m${n}`,
        athlete_id: 'a1',
        exercise_key: 'sentadilla',
        exercise_name: 'Sentadilla',
        reps: 3,
        load_kg: 200,
        rpe: null,
        mean_velocity: null,
        achieved_on: '2026-06-12',
        source: 'manual',
        ...over,
    };
}

function set(over: Partial<TrainingSet> = {}): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        order_index: n,
        is_video_required: false,
        created_at: '',
        ...over,
    } as unknown as TrainingSet;
}

function row(
    exerciseName: string,
    date: string | null,
    sets: TrainingSet[]
): ExerciseHistoryRow {
    n += 1;
    return {
        sessionExerciseId: `se${n}`,
        exerciseId: `lib${n}`,
        exerciseName,
        variantName: null,
        blockId: 'b1',
        blockName: 'Fuerza',
        blockSequence: 0,
        blockStartDate: '2026-03-02',
        blockCreatedAt: '2026-03-01T00:00:00Z',
        macroId: null,
        sessionId: `sess${n}`,
        weekNumber: 10,
        dayNumber: 1,
        date,
        rpeGlobal: null,
        velocityAvg: null,
        primaryMuscles: null,
        secondaryMuscles: null,
        sets,
    };
}

// =====================================================================

describe('isBetterMark — LA REGLA CENTRAL', () => {
    test('220×1 NO supera a 200×5: son marcas distintas', () => {
        const single = { reps: 1, load_kg: 220 };
        const fiveRm = { reps: 5, load_kg: 200 };
        assert.equal(isBetterMark(single, fiveRm), false);
        assert.equal(isBetterMark(fiveRm, single), false);
    });

    test('con las MISMAS repeticiones, manda el peso', () => {
        assert.equal(isBetterMark({ reps: 3, load_kg: 205 }, { reps: 3, load_kg: 200 }), true);
        assert.equal(isBetterMark({ reps: 3, load_kg: 195 }, { reps: 3, load_kg: 200 }), false);
    });

    test('sin marca vigente, cualquiera es mejor', () => {
        assert.equal(isBetterMark({ reps: 3, load_kg: 100 }, null), true);
    });
});

describe('isBetterMark — el desempate', () => {
    test('1º a igual peso gana el RPE MÁS BAJO', () => {
        const facil = { reps: 3, load_kg: 200, rpe: 8 };
        const duro = { reps: 3, load_kg: 200, rpe: 10 };
        assert.equal(isBetterMark(facil, duro), true);
        assert.equal(isBetterMark(duro, facil), false);
    });

    test('2º a igual peso y RPE gana la VELOCIDAD MÁS ALTA', () => {
        const rapida = { reps: 3, load_kg: 200, rpe: 9, mean_velocity: 0.28 };
        const lenta = { reps: 3, load_kg: 200, rpe: 9, mean_velocity: 0.23 };
        assert.equal(isBetterMark(rapida, lenta), true);
        assert.equal(isBetterMark(lenta, rapida), false);
    });

    test('3º a igualdad de todo gana la MÁS RECIENTE', () => {
        const nueva = { reps: 3, load_kg: 200, achieved_on: '2026-08-01' };
        const vieja = { reps: 3, load_kg: 200, achieved_on: '2026-06-12' };
        assert.equal(isBetterMark(nueva, vieja), true);
        assert.equal(isBetterMark(vieja, nueva), false);
    });

    test('UN DATO QUE FALTA NO GANA UN DESEMPATE', () => {
        // La serie sin RPE no es mejor que una con RPE 9 solo por no tenerlo.
        const sinRpe = { reps: 3, load_kg: 200, achieved_on: '2026-06-01' };
        const conRpe = { reps: 3, load_kg: 200, rpe: 9, achieved_on: '2026-06-12' };
        // Se pasa al siguiente criterio que SÍ tengan los dos: la fecha.
        assert.equal(isBetterMark(sinRpe, conRpe), false);
        assert.equal(isBetterMark(conRpe, sinRpe), true);
    });

    test('la velocidad no decide si solo una la tiene', () => {
        const conVel = { reps: 3, load_kg: 200, rpe: 9, mean_velocity: 0.3, achieved_on: '2026-06-01' };
        const sinVel = { reps: 3, load_kg: 200, rpe: 9, achieved_on: '2026-07-01' };
        // Empatan en peso y RPE, la velocidad no aplica → decide la fecha.
        assert.equal(isBetterMark(sinVel, conVel), true);
    });

    test('idénticas en todo: no es mejor', () => {
        const a = { reps: 3, load_kg: 200, rpe: 9, achieved_on: '2026-06-12' };
        assert.equal(isBetterMark({ ...a }, a), false);
    });
});

describe('bestOf', () => {
    test('elige la mejor de una lista', () => {
        const best = bestOf([
            { reps: 3, load_kg: 200, rpe: 9 },
            { reps: 3, load_kg: 205, rpe: 10 },
            { reps: 3, load_kg: 205, rpe: 8 },
        ]);
        assert.equal(best!.load_kg, 205);
        assert.equal(best!.rpe, 8);
    });

    test('lista vacía → null', () => {
        assert.equal(bestOf([]), null);
    });
});

describe('findRepMax', () => {
    const index = buildRepMaxIndex([
        mark({ reps: 1, load_kg: 230 }),
        mark({ reps: 3, load_kg: 205, rpe: 9 }),
        mark({ reps: 5, load_kg: 180 }),
        mark({ exercise_key: 'press banca', exercise_name: 'Press Banca', reps: 3, load_kg: 130 }),
    ]);

    test('encuentra la marca exacta', () => {
        assert.equal(findRepMax(index, 'Sentadilla', 3)!.load_kg, 205);
        assert.equal(findRepMax(index, 'Sentadilla', 1)!.load_kg, 230);
    });

    test('no confunde ejercicios', () => {
        assert.equal(findRepMax(index, 'Press Banca', 3)!.load_kg, 130);
    });

    test('una variante cae al movimiento base', () => {
        assert.equal(findRepMax(index, 'Sentadilla (pausada)', 3)!.load_kg, 205);
    });

    test('sin marca para esas repeticiones, null', () => {
        assert.equal(findRepMax(index, 'Sentadilla', 8), null);
    });

    test('tolera entradas vacías sin reventar', () => {
        assert.equal(findRepMax(index, null, 3), null);
        assert.equal(findRepMax(index, 'Sentadilla', null), null);
        assert.equal(findRepMax(null, 'Sentadilla', 3), null);
    });

    test('el índice se queda con la MEJOR cuando hay duplicados', () => {
        const dup = buildRepMaxIndex([
            mark({ reps: 3, load_kg: 200 }),
            mark({ reps: 3, load_kg: 210 }),
        ]);
        assert.equal(findRepMax(dup, 'Sentadilla', 3)!.load_kg, 210);
    });
});

describe('marksForExercise / exercisesWithMarks', () => {
    const marks = [
        mark({ reps: 5, load_kg: 180 }),
        mark({ reps: 1, load_kg: 230 }),
        mark({ reps: 3, load_kg: 205 }),
        mark({ exercise_key: 'press banca', exercise_name: 'Press Banca', reps: 1, load_kg: 140 }),
    ];

    test('las marcas de un ejercicio van de menos a más repeticiones', () => {
        assert.deepEqual(marksForExercise(marks, 'Sentadilla').map(m => m.reps), [1, 3, 5]);
    });

    test('lista de ejercicios sin duplicados y en orden alfabético', () => {
        assert.deepEqual(exercisesWithMarks(marks).map(e => e.name), ['Press Banca', 'Sentadilla']);
    });
});

// =====================================================================

describe('detectRepMaxes — SOLO LO REALIZADO', () => {
    test('propone una marca a partir de una serie ejecutada', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-06-12', [
                set({ actual_reps: 3, actual_load: 205, actual_rpe: 9 }),
            ]),
        ]);
        assert.equal(c.length, 1);
        assert.equal(c[0].load_kg, 205);
        assert.equal(c[0].reps, 3);
        assert.equal(c[0].rpe, 9);
        assert.equal(c[0].achieved_on, '2026-06-12');
        assert.equal(c[0].supersedes, null);
    });

    test('IGNORA lo prescrito: target_load no produce marcas', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-06-12', [
                set({ target_reps: '1x3', target_load: 300 }), // pautado, no hecho
            ]),
        ]);
        assert.equal(c.length, 0);
    });

    test('una serie con reps pero sin peso no es una marca', () => {
        const c = detectRepMaxes([
            row('Dominadas', '2026-06-12', [set({ actual_reps: 12 })]),
        ]);
        assert.equal(c.length, 0);
    });

    test('descarta cargas de cero o negativas', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-06-12', [
                set({ actual_reps: 3, actual_load: 0 }),
                set({ actual_reps: 3, actual_load: -5 }),
            ]),
        ]);
        assert.equal(c.length, 0);
    });

    test('descarta series de más de 12 repeticiones', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-06-12', [set({ actual_reps: 20, actual_load: 100 })]),
        ]);
        assert.equal(c.length, 0);
    });
});

describe('detectRepMaxes — frente a las marcas vigentes', () => {
    const existing = [mark({ reps: 3, load_kg: 205, rpe: 9, achieved_on: '2026-06-12' })];

    test('no propone lo que NO supera a la vigente', () => {
        const c = detectRepMaxes(
            [row('Sentadilla', '2026-08-01', [set({ actual_reps: 3, actual_load: 200 })])],
            existing
        );
        assert.equal(c.length, 0);
    });

    test('propone lo que sí la supera, y dice a quién', () => {
        const c = detectRepMaxes(
            [row('Sentadilla', '2026-08-01', [set({ actual_reps: 3, actual_load: 210 })])],
            existing
        );
        assert.equal(c.length, 1);
        assert.equal(c[0].load_kg, 210);
        assert.equal(c[0].supersedes!.load_kg, 205);
    });

    test('un single pesado NO borra el triple vigente', () => {
        const c = detectRepMaxes(
            [row('Sentadilla', '2026-08-01', [set({ actual_reps: 1, actual_load: 240 })])],
            existing
        );
        assert.equal(c.length, 1);
        assert.equal(c[0].reps, 1);
        assert.equal(c[0].supersedes, null); // no había single, no pisa el triple
    });

    test('UNA sola candidata por (ejercicio, repeticiones): la mejor', () => {
        const c = detectRepMaxes(
            [row('Sentadilla', '2026-08-01', [
                set({ actual_reps: 3, actual_load: 207 }),
                set({ actual_reps: 3, actual_load: 215 }),
                set({ actual_reps: 3, actual_load: 210 }),
            ])],
            existing
        );
        assert.equal(c.length, 1);
        assert.equal(c[0].load_kg, 215);
    });

    test('separa por ejercicio y por repeticiones', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-08-01', [
                set({ actual_reps: 3, actual_load: 210 }),
                set({ actual_reps: 5, actual_load: 180 }),
            ]),
            row('Press Banca', '2026-08-01', [set({ actual_reps: 3, actual_load: 130 })]),
        ]);
        assert.equal(c.length, 3);
        // Ordenadas por nombre y luego repeticiones.
        assert.deepEqual(
            c.map(x => `${x.exercise_name}/${x.reps}`),
            ['Press Banca/3', 'Sentadilla/3', 'Sentadilla/5']
        );
    });

    test('lleva la velocidad cuando la serie la tiene', () => {
        const c = detectRepMaxes([
            row('Sentadilla', '2026-08-01', [
                set({ actual_reps: 3, actual_load: 210, vbt_mean_velocity: 0.23 }),
            ]),
        ]);
        assert.equal(c[0].mean_velocity, 0.23);
    });

    test('una sesión sin fecha da una marca sin fecha, no una inventada', () => {
        const c = detectRepMaxes([
            row('Sentadilla', null, [set({ actual_reps: 3, actual_load: 210 })]),
        ]);
        assert.equal(c[0].achieved_on, null);
    });
});

// =====================================================================

describe('repsForLookup', () => {
    test('"4x3" busca el mejor TRIPLE, no el 4RM', () => {
        assert.equal(repsForLookup('4x3'), 3);
    });

    test('"5" es una serie de 5 repeticiones', () => {
        assert.equal(repsForLookup('5'), 5);
    });

    test('un rango "3-5" se busca por el extremo bajo', () => {
        assert.equal(repsForLookup('3-5'), 3);
        assert.equal(repsForLookup('4x3-5'), 3);
    });

    test('AMRAP no tiene marca que buscar', () => {
        assert.equal(repsForLookup('1xAMRAP'), null);
        assert.equal(repsForLookup(null), null);
        assert.equal(repsForLookup(''), null);
    });

    test('más de 12 repeticiones no se sigue', () => {
        assert.equal(repsForLookup('3x20'), null);
    });
});

describe('formatMark / markLabel', () => {
    test('escribe solo lo que hay', () => {
        assert.equal(
            formatMark({ reps: 3, load_kg: 205, rpe: 9, mean_velocity: 0.23, achieved_on: '2026-06-12' }),
            '205 × 3 · @9 · 0.23 m/s · 12/06/2026'
        );
        assert.equal(formatMark({ reps: 3, load_kg: 205 }), '205 × 3');
    });

    test('nombra las marcas como se llaman', () => {
        assert.equal(markLabel(1), 'Mejor single');
        assert.equal(markLabel(2), 'Mejor doble');
        assert.equal(markLabel(3), 'Mejor triple');
        assert.equal(markLabel(5), 'Mejor 5RM');
    });
});
