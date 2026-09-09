/**
 * PRUEBAS DE LA SEMANA DE UN VISTAZO
 * =====================================================================
 *
 * Lo que se fija aquí:
 *
 *   1. Los SIETE días salen siempre, también los de descanso. Una semana de
 *      tres días no puede parecer tres días seguidos.
 *   2. La frecuencia cuenta DÍAS distintos, no sesiones: dos entrenos el
 *      mismo lunes son un solo día de sentadilla.
 *   3. Las bandas son relativas a ESTA semana y no juzgan: con un solo día
 *      con trabajo no hay banda, porque no hay con qué comparar.
 *   4. Básicos + accesorios = el total, sin huecos ni solapes. La búlgara
 *      cuenta como accesorio, no como sentadilla.
 *   5. Las cifras coinciden con `weeklyLiftSummary`, que es de donde salen.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VolumeSessionInput } from '../volume/engine';
import type { TrainingSet } from '../../types/training';
import { semanaVisual } from './semanaVisual';
import { weeklyLiftSummary } from './liftSummary';

let n = 0;

function serie(targetReps: string, load: number | null = null): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        order_index: n,
        is_video_required: false,
        target_reps: targetReps,
        target_metric: 'kg',
        target_load: load,
    } as TrainingSet;
}

function ejercicio(nombre: string, sets: TrainingSet[]) {
    n += 1;
    return {
        id: `ex${n}`,
        exercise: { name: nombre, muscle_group: null, primary_muscles: null, secondary_muscles: null },
        variant_name: null,
        sets,
    };
}

function sesion(
    id: string,
    day_of_week: string | null,
    exercises: ReturnType<typeof ejercicio>[],
    week = 3
): VolumeSessionInput {
    return { id, week_number: week, day_number: 1, day_of_week, exercises } as VolumeSessionInput;
}

// ---------------------------------------------------------------------

describe('los siete días, siempre', () => {
    test('un solo día entrenado deja seis descansos visibles', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('4x5', 180)])]),
        ], 3);

        assert.equal(v.dias.length, 7);
        assert.equal(v.diasEntrenados, 1);
        assert.equal(v.dias.filter(d => d.esDescanso).length, 6);
    });

    test('el orden empieza en lunes por defecto, y en domingo si se pide', () => {
        const s = [sesion('a', 'monday', [ejercicio('Sentadilla', [serie('4x5', 180)])])];

        assert.equal(semanaVisual(s, 3).dias[0].weekday, 'monday');
        assert.equal(semanaVisual(s, 3, {}, 'sunday').dias[0].weekday, 'sunday');
    });

    test('una sesión sin agendar añade su propia columna, y solo entonces', () => {
        const conAgenda = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('4x5', 180)])]),
        ], 3);
        assert.equal(conAgenda.dias.length, 7, 'sin sesiones sueltas no hay octava columna');

        const sinAgenda = semanaVisual([
            sesion('a', null, [ejercicio('Sentadilla', [serie('4x5', 180)])]),
        ], 3);
        assert.equal(sinAgenda.dias.length, 8);
        assert.equal(sinAgenda.dias[7].etiqueta, 'Sin agendar');
        assert.equal(sinAgenda.dias[7].basicos[0].sets, 4);
    });
});

describe('frecuencia: días, no sesiones', () => {
    test('dos sesiones el MISMO lunes son un solo día de sentadilla', () => {
        const v = semanaVisual([
            sesion('mañana', 'monday', [ejercicio('Sentadilla', [serie('3x5', 180)])]),
            sesion('tarde', 'monday', [ejercicio('Sentadilla', [serie('2x3', 200)])]),
        ], 3);

        const sq = v.frecuencia.find(f => f.lift === 'SQ')!;
        assert.equal(sq.dias, 1, 'un lunes es un día, aunque se entrene dos veces');
        assert.equal(sq.sets, 5, 'pero las series sí se suman');

        const lunes = v.dias.find(d => d.weekday === 'monday')!;
        assert.equal(lunes.basicos.length, 1, 'y se funden en una sola entrada');
        assert.equal(lunes.basicos[0].sets, 5);
    });

    test('tres días distintos son frecuencia 3', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('3x5', 180)])]),
            sesion('b', 'wednesday', [ejercicio('Sentadilla', [serie('3x5', 180)])]),
            sesion('c', 'friday', [ejercicio('Sentadilla', [serie('3x5', 180)])]),
        ], 3);

        assert.equal(v.frecuencia.find(f => f.lift === 'SQ')!.dias, 3);
        assert.equal(v.frecuencia.find(f => f.lift === 'BP')!.dias, 0);
    });
});

describe('accesorios y básicos', () => {
    test('la búlgara es accesorio, no sentadilla', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [
                ejercicio('Sentadilla', [serie('4x5', 180)]),
                ejercicio('Sentadilla búlgara', [serie('3x10', 40)]),
            ]),
        ], 3);

        const lunes = v.dias.find(d => d.weekday === 'monday')!;
        assert.equal(lunes.basicos.find(b => b.lift === 'SQ')!.sets, 4);
        assert.equal(lunes.seriesAccesorias, 3);
        assert.equal(lunes.seriesTotales, 7, 'básicos + accesorios = el total');
    });

    test('un día solo de accesorios no es descanso', () => {
        const v = semanaVisual([
            sesion('a', 'tuesday', [ejercicio('Remo con barra', [serie('4x8', 80)])]),
        ], 3);

        const martes = v.dias.find(d => d.weekday === 'tuesday')!;
        assert.equal(martes.esDescanso, false);
        assert.equal(martes.basicos.length, 0);
        assert.equal(martes.seriesTotales, 4);
    });
});

describe('las bandas describen, no juzgan', () => {
    test('con un solo día con trabajo NO hay banda', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('4x5', 180)])]),
        ], 3);

        assert.equal(v.dias.find(d => d.weekday === 'monday')!.bandaVolumen, null);
    });

    test('con días distintos, el que más series es "alto" y el que menos "bajo"', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('2x5', 180)])]),
            sesion('b', 'wednesday', [ejercicio('Sentadilla', [serie('5x5', 180)])]),
            sesion('c', 'friday', [ejercicio('Sentadilla', [serie('9x5', 180)])]),
        ], 3);

        assert.equal(v.dias.find(d => d.weekday === 'friday')!.bandaVolumen, 'alto');
        assert.equal(v.dias.find(d => d.weekday === 'monday')!.bandaVolumen, 'bajo');
    });

    test('con tres días, el del medio es "medio" y no "bajo"', () => {
        // El fallo que tenia el reparto por terciles: con `floor(n/3)` el corte
        // bajo caia en el valor del medio y, como la comparacion es `<=`, el
        // dia intermedio se marcaba "bajo". Una semana de 9/8/6 series decia
        // alto, bajo y bajo.
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('9x5', 180)])]),
            sesion('b', 'wednesday', [ejercicio('Sentadilla', [serie('8x5', 180)])]),
            sesion('c', 'friday', [ejercicio('Sentadilla', [serie('6x5', 180)])]),
        ], 3);

        assert.equal(v.dias.find(d => d.weekday === 'monday')!.bandaVolumen, 'alto');
        assert.equal(v.dias.find(d => d.weekday === 'wednesday')!.bandaVolumen, 'medio');
        assert.equal(v.dias.find(d => d.weekday === 'friday')!.bandaVolumen, 'bajo');
    });

    test('un día de descanso no tiene banda: cero no es "bajo"', () => {
        const v = semanaVisual([
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('2x5', 180)])]),
            sesion('b', 'friday', [ejercicio('Sentadilla', [serie('9x5', 180)])]),
        ], 3);

        assert.equal(v.dias.find(d => d.weekday === 'tuesday')!.bandaVolumen, null);
    });
});

describe('no inventa cifras: coincide con weeklyLiftSummary', () => {
    test('las series por básico son las mismas en las dos vistas', () => {
        const sesiones = [
            sesion('a', 'monday', [
                ejercicio('Sentadilla', [serie('4x5', 180)]),
                ejercicio('Press banca', [serie('5x5', 120)]),
            ]),
            sesion('b', 'thursday', [
                ejercicio('Peso muerto', [serie('5x3', 220)]),
                ejercicio('Sentadilla', [serie('3x5', 160)]),
            ]),
        ];

        const visual = semanaVisual(sesiones, 3);
        const resumen = weeklyLiftSummary(sesiones, 3);

        for (const r of resumen) {
            const f = visual.frecuencia.find(x => x.lift === r.lift)!;
            assert.equal(f.sets, r.sets, `${r.lift}: ${f.sets} vs ${r.sets}`);
        }
    });

    test('el detalle de cada día viene de liftSummary, no se recompone', () => {
        const sesiones = [
            sesion('a', 'monday', [ejercicio('Sentadilla', [serie('4x5', 180)])]),
        ];
        const visual = semanaVisual(sesiones, 3);
        const resumen = weeklyLiftSummary(sesiones, 3);

        const delDia = visual.dias.find(d => d.weekday === 'monday')!.basicos[0];
        const deLift = resumen.find(r => r.lift === 'SQ')!.days[0];

        assert.equal(delDia.detail, deLift.detail);
        assert.equal(delDia.reps, deLift.reps);
    });
});
