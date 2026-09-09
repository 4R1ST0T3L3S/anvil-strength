/**
 * PRUEBAS DE LAS FASES DE TEMPORADA
 * =====================================================================
 *
 * Lo que se fija aquí:
 *
 *   1. "Semana 3 de 4" sale de la FECHA, no de un contador guardado.
 *   2. Una fase sin fecha propia se encadena al final de la anterior; una
 *      CON fecha propia manda sobre ese encadenado.
 *   3. Un `end_date` escrito a mano más largo que `weeks*7` no puede dar
 *      "semana 6 de 4".
 *   4. Las fechas se leen en LOCAL. `new Date('2026-09-07')` es UTC y al
 *      oeste de Greenwich devuelve el día 6: una fase que empieza el lunes
 *      aparecería empezando el domingo.
 *   5. Pedir la fase de un movimiento sin fases propias cae a las
 *      generales — sin ese respaldo, el selector por movimiento estaría
 *      vacío hasta que el coach escribiera tres temporadas paralelas.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolverFases, faseActual, fechaLocal, type FaseDeTemporada } from './fases';

let n = 0;
function fase(p: Partial<FaseDeTemporada> = {}): FaseDeTemporada {
    n += 1;
    return {
        id: `f${n}`,
        coach_id: 'coach',
        athlete_id: 'atleta',
        macro_id: null,
        movement: null,
        name: 'Hipertrofia',
        weeks: 4,
        order_index: n,
        start_date: null,
        end_date: null,
        color: null,
        icon: null,
        notes: null,
        ...p,
    };
}

/** 7 de septiembre de 2026, lunes. */
const HOY = new Date(2026, 8, 7);

describe('la semana actual sale de la fecha', () => {
    test('el primer día es la semana 1', () => {
        const [r] = resolverFases([fase({ start_date: '2026-09-07', weeks: 4 })], HOY);
        assert.equal(r.estado, 'actual');
        assert.equal(r.semanaActual, 1);
    });

    test('a los 15 días es la semana 3', () => {
        const [r] = resolverFases([fase({ start_date: '2026-08-24', weeks: 4 })], HOY);
        assert.equal(r.semanaActual, 3, '24 ago + 14 días = 7 sep, tercera semana');
    });

    test('el último día sigue siendo la última semana, no la siguiente', () => {
        // 4 semanas desde el 10 de agosto terminan el 6 de septiembre.
        const [r] = resolverFases([fase({ start_date: '2026-08-11', weeks: 4 })], HOY);
        assert.equal(r.estado, 'actual');
        assert.equal(r.semanaActual, 4);
    });

    test('un día después ya es pasada', () => {
        const [r] = resolverFases([fase({ start_date: '2026-08-10', weeks: 4 })], HOY);
        assert.equal(r.estado, 'pasada');
        assert.equal(r.semanaActual, null);
    });

    test('antes de empezar es futura y no dice semana', () => {
        const [r] = resolverFases([fase({ start_date: '2026-10-01', weeks: 4 })], HOY);
        assert.equal(r.estado, 'futura');
        assert.equal(r.semanaActual, null);
    });

    test('un end_date largo NO puede dar "semana 6 de 4"', () => {
        const [r] = resolverFases(
            [fase({ start_date: '2026-07-27', end_date: '2026-09-30', weeks: 4 })],
            HOY
        );
        assert.equal(r.estado, 'actual');
        assert.ok(r.semanaActual !== null && r.semanaActual <= 4, `semana ${r.semanaActual} de 4`);
    });
});

describe('encadenado de fechas', () => {
    test('la segunda fase empieza al día siguiente de terminar la primera', () => {
        const rs = resolverFases([
            fase({ name: 'Hipertrofia', weeks: 4, order_index: 1, start_date: '2026-08-03' }),
            fase({ name: 'Fuerza', weeks: 3, order_index: 2 }),
        ], HOY);

        // 3 ago + 27 días = 30 ago (fin de la primera). La segunda: 31 ago.
        assert.equal(rs[1].inicio?.getDate(), 31);
        assert.equal(rs[1].inicio?.getMonth(), 7, 'agosto');
        assert.equal(rs[1].estado, 'actual', 'el 7 de septiembre caemos en Fuerza');
    });

    test('una fecha propia MANDA sobre el encadenado', () => {
        const rs = resolverFases([
            fase({ name: 'Hipertrofia', weeks: 4, order_index: 1, start_date: '2026-08-03' }),
            fase({ name: 'Fuerza', weeks: 3, order_index: 2, start_date: '2026-09-14' }),
        ], HOY);

        assert.equal(rs[1].inicio?.getDate(), 14, 'no el 31 de agosto que dictaba el encadenado');
        assert.equal(rs[1].estado, 'futura');
    });

    test('sin ninguna fecha, todo queda en "desconocido" y nada revienta', () => {
        const rs = resolverFases([
            fase({ name: 'Hipertrofia', order_index: 1 }),
            fase({ name: 'Fuerza', order_index: 2 }),
        ], HOY);

        assert.deepEqual(rs.map(r => r.estado), ['desconocido', 'desconocido']);
        assert.deepEqual(rs.map(r => r.semanaActual), [null, null]);
    });

    test('el orden lo decide order_index, no el orden de llegada', () => {
        const rs = resolverFases([
            fase({ name: 'Peaking', order_index: 3 }),
            fase({ name: 'Hipertrofia', order_index: 1 }),
            fase({ name: 'Fuerza', order_index: 2 }),
        ], HOY);
        assert.deepEqual(rs.map(r => r.fase.name), ['Hipertrofia', 'Fuerza', 'Peaking']);
    });
});

describe('fechas en local, no en UTC', () => {
    test('"2026-09-07" es el 7, no el 6', () => {
        const d = fechaLocal('2026-09-07')!;
        assert.equal(d.getDate(), 7);
        assert.equal(d.getMonth(), 8);
        assert.equal(d.getFullYear(), 2026);
    });

    test('una fecha inválida devuelve null en vez de un Invalid Date', () => {
        assert.equal(fechaLocal('lo que sea'), null);
        assert.equal(fechaLocal(null), null);
    });
});

describe('por movimiento, con respaldo a las generales', () => {
    test('si hay fase propia de la sentadilla, gana esa', () => {
        const r = faseActual([
            fase({ movement: null, name: 'Volumen', weeks: 4, start_date: '2026-09-01' }),
            fase({ movement: 'SQ', name: 'Peaking', weeks: 4, start_date: '2026-09-01' }),
        ], 'SQ', HOY);
        assert.equal(r?.fase.name, 'Peaking');
    });

    test('sin fase propia, cae a la general', () => {
        const r = faseActual([
            fase({ movement: null, name: 'Volumen', weeks: 4, start_date: '2026-09-01' }),
            fase({ movement: 'BP', name: 'Peaking', weeks: 4, start_date: '2026-09-01' }),
        ], 'SQ', HOY);
        assert.equal(r?.fase.name, 'Volumen', 'la de la banca no se cuela en la sentadilla');
    });

    test('sin ninguna fase, null y no explota', () => {
        assert.equal(faseActual([], 'SQ', HOY), null);
    });

    test('las fases de un movimiento no arrastran las fechas de otro', () => {
        // La de SQ no tiene fecha; si se encadenara con la general (que sí la
        // tiene) daría una fecha inventada.
        const r = faseActual([
            fase({ movement: null, name: 'General', weeks: 4, start_date: '2026-08-01', order_index: 1 }),
            fase({ movement: 'SQ', name: 'Sin fecha', weeks: 4, order_index: 2 }),
        ], 'SQ', HOY);
        assert.equal(r, null, 'sin fecha no hay fase "actual"');
    });
});
