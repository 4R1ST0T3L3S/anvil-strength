/**
 * PRUEBAS DE LOS OBJETIVOS DE VOLUMEN SEMANAL
 * =====================================================================
 *
 * Lo que se fija aquí:
 *
 *   1. Gana el objetivo MÁS ESPECÍFICO: semana > bloque > atleta. Es lo
 *      que permite "12 series salvo en la descarga, que son 6".
 *   2. Un objetivo de otro bloque o de otra semana NO se cuela.
 *   3. Pasarse del objetivo no da un restante negativo: da 0 y un exceso.
 *   4. Un movimiento que no aparece esta semana va por cero — que no es lo
 *      mismo que "no se puede medir", que devuelve null.
 *   5. El orden de las filas es FIJO (SQ, BP, DL) y no depende de las
 *      cifras: si se reordenara al cambiar un número, habría que releer el
 *      panel entero cada vez.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { LiftWeekSummary } from '../planning/liftSummary';
import {
    objetivosVigentes,
    progresoDe,
    progresoDeTodos,
    type ObjetivoDeVolumen,
    type MetricaDeVolumen,
} from './objetivos';

// ---------------------------------------------------------------------

let n = 0;

function objetivo(parcial: Partial<ObjetivoDeVolumen> = {}): ObjetivoDeVolumen {
    n += 1;
    return {
        id: `o${n}`,
        coach_id: 'coach',
        athlete_id: 'atleta',
        block_id: null,
        week_number: null,
        scope: 'lift',
        scope_key: 'SQ',
        label: 'Sentadilla',
        metric: 'series' as MetricaDeVolumen,
        target: 12,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...parcial,
    };
}

function resumen(lift: string, sets: number, reps = 0, tonnage = 0): LiftWeekSummary {
    return {
        lift: lift as LiftWeekSummary['lift'],
        label: lift,
        sets,
        reps,
        tonnage,
        frequency: sets > 0 ? 1 : 0,
        days: [],
    };
}

const SIN_EJERCICIOS = new Map<string, { sets: number; reps: number; tonnage: number }>();

// ---------------------------------------------------------------------

describe('resolución: gana el más específico', () => {
    test('el de la semana manda sobre el del bloque y el del atleta', () => {
        const general = objetivo({ target: 12 });
        const deBloque = objetivo({ block_id: 'B1', target: 10 });
        const deSemana = objetivo({ block_id: 'B1', week_number: 3, target: 6 });

        const vigentes = objetivosVigentes([general, deBloque, deSemana], 'B1', 3);

        assert.equal(vigentes.length, 1);
        assert.equal(vigentes[0].target, 6, 'la semana de descarga manda');
    });

    test('sin objetivo de semana, manda el del bloque', () => {
        const general = objetivo({ target: 12 });
        const deBloque = objetivo({ block_id: 'B1', target: 10 });
        const otraSemana = objetivo({ block_id: 'B1', week_number: 3, target: 6 });

        const vigentes = objetivosVigentes([general, deBloque, otraSemana], 'B1', 4);

        assert.equal(vigentes.length, 1);
        assert.equal(vigentes[0].target, 10);
    });

    test('el objetivo de OTRO bloque no se cuela', () => {
        const deOtroBloque = objetivo({ block_id: 'B2', target: 99 });
        const general = objetivo({ target: 12 });

        const vigentes = objetivosVigentes([deOtroBloque, general], 'B1', 1);

        assert.equal(vigentes.length, 1);
        assert.equal(vigentes[0].target, 12);
    });

    test('el orden en que llegan NO decide: gana la especificidad, no el último', () => {
        const deSemana = objetivo({ block_id: 'B1', week_number: 3, target: 6 });
        const general = objetivo({ target: 12 });

        // Los mismos dos, al revés.
        const a = objetivosVigentes([deSemana, general], 'B1', 3);
        const b = objetivosVigentes([general, deSemana], 'B1', 3);

        assert.equal(a[0].target, 6);
        assert.equal(b[0].target, 6);
    });

    test('series y reps del mismo movimiento son objetivos DISTINTOS, no se pisan', () => {
        const series = objetivo({ metric: 'series', target: 12 });
        const reps = objetivo({ metric: 'reps', target: 100 });

        const vigentes = objetivosVigentes([series, reps], null, 1);

        assert.equal(vigentes.length, 2);
    });
});

describe('descuento', () => {
    test('el ejemplo del enunciado: 4x8 sobre 12 series y 100 reps', () => {
        const series = objetivo({ metric: 'series', target: 12 });
        const reps = objetivo({ metric: 'reps', target: 100 });
        const semana = [resumen('SQ', 4, 32)];

        const pSeries = progresoDe(series, semana, SIN_EJERCICIOS)!;
        const pReps = progresoDe(reps, semana, SIN_EJERCICIOS)!;

        assert.equal(pSeries.programado, 4);
        assert.equal(pSeries.restante, 8, 'quedan 8 de 12 series');
        assert.equal(pReps.programado, 32);
        assert.equal(pReps.restante, 68, 'quedan 68 de 100 reps');
    });

    test('y al añadir 3x5 encima', () => {
        const series = objetivo({ metric: 'series', target: 12 });
        const reps = objetivo({ metric: 'reps', target: 100 });
        // 4x8 + 3x5 = 7 series, 47 reps
        const semana = [resumen('SQ', 7, 47)];

        assert.equal(progresoDe(series, semana, SIN_EJERCICIOS)!.restante, 5);
        assert.equal(progresoDe(reps, semana, SIN_EJERCICIOS)!.restante, 53);
    });

    test('pasarse NO da restante negativo: da 0 y un exceso', () => {
        const o = objetivo({ metric: 'series', target: 10 });
        const p = progresoDe(o, [resumen('SQ', 14)], SIN_EJERCICIOS)!;

        assert.equal(p.restante, 0);
        assert.equal(p.exceso, 4);
        assert.equal(p.fraccion, 1, 'la barra se llena, no se desborda');
    });

    test('un movimiento que no aparece va por CERO, no por "no medible"', () => {
        const o = objetivo({ scope_key: 'DL', metric: 'series', target: 8 });
        const p = progresoDe(o, [resumen('SQ', 12)], SIN_EJERCICIOS);

        assert.notEqual(p, null, 'el objetivo existe y no se está cumpliendo');
        assert.equal(p!.programado, 0);
        assert.equal(p!.restante, 8);
    });

    test('una métrica que todavía no se deriva devuelve null, no un cero falso', () => {
        const o = objetivo({ metric: 'distancia_km', target: 20 });
        assert.equal(progresoDe(o, [resumen('SQ', 12)], SIN_EJERCICIOS), null);
    });

    test('un objetivo por EJERCICIO se cuenta contra ese ejercicio, no contra el básico', () => {
        const o = objetivo({
            scope: 'exercise',
            scope_key: 'remo con barra',
            label: 'Remo con barra',
            metric: 'series',
            target: 8,
        });
        const porEjercicio = new Map([['remo con barra', { sets: 5, reps: 40, tonnage: 0 }]]);

        const p = progresoDe(o, [resumen('SQ', 20)], porEjercicio)!;
        assert.equal(p.programado, 5, 'las 20 series de sentadilla no cuentan aquí');
        assert.equal(p.restante, 3);
    });
});

describe('orden de las filas', () => {
    test('SQ, BP, DL — fijo, aunque las cifras digan otra cosa', () => {
        const objetivos = [
            objetivo({ scope_key: 'DL', label: 'Peso muerto', target: 8 }),
            objetivo({ scope_key: 'BP', label: 'Banca', target: 16 }),
            objetivo({ scope_key: 'SQ', label: 'Sentadilla', target: 12 }),
        ];
        const semana = [resumen('SQ', 1), resumen('BP', 20), resumen('DL', 9)];

        const filas = progresoDeTodos(objetivos, semana, SIN_EJERCICIOS);

        assert.deepEqual(filas.map(f => f.objetivo.scope_key), ['SQ', 'BP', 'DL']);
    });

    test('los básicos van antes que los ejercicios sueltos', () => {
        const objetivos = [
            objetivo({ scope: 'exercise', scope_key: 'remo', label: 'Remo', target: 8 }),
            objetivo({ scope_key: 'SQ', label: 'Sentadilla', target: 12 }),
        ];
        const filas = progresoDeTodos(objetivos, [resumen('SQ', 4)], new Map([['remo', { sets: 2, reps: 0, tonnage: 0 }]]));

        assert.deepEqual(filas.map(f => f.objetivo.scope), ['lift', 'exercise']);
    });

    test('dentro de un movimiento, series antes que reps', () => {
        const objetivos = [
            objetivo({ metric: 'reps', target: 100 }),
            objetivo({ metric: 'series', target: 12 }),
        ];
        const filas = progresoDeTodos(objetivos, [resumen('SQ', 4, 32)], SIN_EJERCICIOS);

        assert.deepEqual(filas.map(f => f.objetivo.metric), ['series', 'reps']);
    });

    test('las métricas que no se saben medir no ensucian la lista', () => {
        const objetivos = [
            objetivo({ metric: 'series', target: 12 }),
            objetivo({ metric: 'distancia_km', target: 20 }),
        ];
        const filas = progresoDeTodos(objetivos, [resumen('SQ', 4)], SIN_EJERCICIOS);

        assert.equal(filas.length, 1);
        assert.equal(filas[0].objetivo.metric, 'series');
    });
});
