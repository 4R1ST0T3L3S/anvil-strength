/**
 * PRUEBAS DEL PERIODO TEMPORAL
 * =====================================================================
 * Las que justifican el fichero entero:
 *
 *   · Un bloque SIN fecha de inicio cae en modo ordinal y lo DICE. Nunca se
 *     inventa un lunes (decisión K10).
 *   · Un bloque que cruza el fin de año sitúa sus últimas semanas en el año
 *     siguiente. Con el año en curso se irían once meses atrás.
 *   · Una URL manipulada a mano NUNCA rompe la pantalla: cae en el periodo
 *     por defecto.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolverPeriodo, dentroDelPeriodo, semanaDentroDelPeriodo } from './resolve.ts';
import { textoAPeriodo, periodoATexto, conPeriodo, PERIODO_POR_DEFECTO } from './url.ts';
import { admite, ajustarAlAmbito, reglaDe } from './applicability.ts';

// Un martes cualquiera, para no depender del reloj: 12 de agosto de 2026.
const MARTES = new Date(2026, 7, 12);

describe('K10 — sin fecha de inicio, modo ordinal y se dice', () => {
    const sinFecha = { id: 'b1', name: 'Fuerza I', start_week: 30, end_week: 33, start_date: null };

    test('la resolucion es ordinal', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [sinFecha], hoy: MARTES });
        assert.equal(r.resolucion, 'ordinal');
    });

    test('NO se inventa un rango de fechas', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [sinFecha], hoy: MARTES });
        assert.equal(r.desde, null);
        assert.equal(r.hasta, null);
    });

    test('pero las semanas SI se pueden usar', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [sinFecha], hoy: MARTES });
        assert.deepEqual(r.semanas, [30, 31, 32, 33]);
    });

    test('y se explica por que, para poder ensenarlo', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [sinFecha], hoy: MARTES });
        assert.match(String(r.motivoOrdinal), /fecha de inicio/);
    });

    test('con fecha, la resolucion es de calendario', () => {
        const conFecha = { ...sinFecha, start_date: '2026-07-20' };
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [conFecha], hoy: MARTES });
        assert.equal(r.resolucion, 'calendar');
        assert.equal(r.motivoOrdinal, null);
        assert.ok(r.desde instanceof Date);
    });

    test('una fecha corrupta tambien cae en ordinal, no revienta', () => {
        const rota = { ...sinFecha, start_date: 'pepe' };
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b1' }, { bloques: [rota], hoy: MARTES });
        assert.equal(r.resolucion, 'ordinal');
        assert.match(String(r.motivoOrdinal), /no es válida/);
    });

    test('un bloque que ya no esta no rompe: cae en ordinal y lo dice', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'no-existe' }, { bloques: [sinFecha], hoy: MARTES });
        assert.equal(r.resolucion, 'ordinal');
        assert.match(String(r.motivoOrdinal), /ya no está/);
    });
});

describe('el ano sale de start_date, no del ano en curso', () => {
    // Empieza la semana 50 de 2025 y dura seis: 50, 51, 52, 1, 2, 3.
    // Las tres ultimas son de 2026.
    const aCaballo = {
        id: 'b2', name: 'Navidad',
        start_week: 50, end_week: 3,
        start_date: '2025-12-08',
    };

    test('el rango empieza en diciembre de 2025', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b2' }, { bloques: [aCaballo], hoy: MARTES });
        assert.equal(r.desde?.getFullYear(), 2025);
        assert.equal(r.desde?.getMonth(), 11); // diciembre
    });

    test('y termina en enero de 2026, no once meses antes', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b2' }, { bloques: [aCaballo], hoy: MARTES });
        assert.equal(r.hasta?.getFullYear(), 2026);
        assert.equal(r.hasta?.getMonth(), 0); // enero
    });

    test('el rango va hacia delante, no hacia atras', () => {
        const r = resolverPeriodo({ tipo: 'bloque', blockId: 'b2' }, { bloques: [aCaballo], hoy: MARTES });
        assert.ok(r.hasta!.getTime() > r.desde!.getTime());
    });
});

describe('periodos de calendario', () => {
    test('"esta semana" empieza en lunes y termina en domingo', () => {
        const r = resolverPeriodo({ tipo: 'semana' }, { hoy: MARTES });
        assert.equal(r.desde?.getDay(), 1, 'debe empezar en lunes');
        assert.equal(r.hasta?.getDay(), 0, 'debe terminar en domingo');
    });

    test('"este mes" cubre el mes entero', () => {
        const r = resolverPeriodo({ tipo: 'mes' }, { hoy: MARTES });
        assert.equal(r.desde?.getDate(), 1);
        assert.equal(r.hasta?.getMonth(), 7); // agosto
        assert.equal(r.hasta?.getDate(), 31);
    });

    test('"ultimas 4 semanas" incluye la actual: son 4, no 5', () => {
        const r = resolverPeriodo({ tipo: 'ultimas', semanas: 4 }, { hoy: MARTES });
        assert.equal(r.semanas?.length, 4);
    });

    test('"ultimas 1 semana" es la semana en curso', () => {
        const unaSemana = resolverPeriodo({ tipo: 'ultimas', semanas: 1 }, { hoy: MARTES });
        const estaSemana = resolverPeriodo({ tipo: 'semana' }, { hoy: MARTES });
        assert.deepEqual(unaSemana.semanas, estaSemana.semanas);
    });

    test('"desde siempre" no limita por ningun lado', () => {
        const r = resolverPeriodo({ tipo: 'todo' }, { hoy: MARTES });
        assert.equal(r.desde, null);
        assert.equal(r.hasta, null);
        assert.equal(r.semanas, null);
    });
});

describe('filtrar por el periodo', () => {
    const esteMes = resolverPeriodo({ tipo: 'mes' }, { hoy: MARTES });

    test('una fecha de dentro entra', () => {
        assert.equal(dentroDelPeriodo('2026-08-20T10:00:00Z', esteMes), true);
    });

    test('una de otro mes no', () => {
        assert.equal(dentroDelPeriodo('2026-06-20T10:00:00Z', esteMes), false);
    });

    test('sin fecha, fuera', () => {
        assert.equal(dentroDelPeriodo(null, esteMes), false);
    });

    test('EN MODO ORDINAL NO SE FILTRA POR FECHA: esconderia datos reales', () => {
        const ordinal = resolverPeriodo(
            { tipo: 'bloque', blockId: 'b1' },
            { bloques: [{ id: 'b1', start_week: 1, end_week: 4, start_date: null }], hoy: MARTES }
        );
        assert.equal(dentroDelPeriodo('1999-01-01T00:00:00Z', ordinal), true);
    });

    test('en modo ordinal SI se filtra por semana', () => {
        const ordinal = resolverPeriodo(
            { tipo: 'bloque', blockId: 'b1' },
            { bloques: [{ id: 'b1', start_week: 10, end_week: 12, start_date: null }], hoy: MARTES }
        );
        assert.equal(semanaDentroDelPeriodo(11, ordinal), true);
        assert.equal(semanaDentroDelPeriodo(40, ordinal), false);
    });

    test('"desde siempre" acepta cualquier semana', () => {
        const todo = resolverPeriodo({ tipo: 'todo' }, { hoy: MARTES });
        assert.equal(semanaDentroDelPeriodo(1, todo), true);
        assert.equal(semanaDentroDelPeriodo(53, todo), true);
    });
});

describe('la URL nunca rompe la pantalla', () => {
    test('ida y vuelta de cada tipo', () => {
        for (const p of [
            { tipo: 'semana' as const },
            { tipo: 'mes' as const },
            { tipo: 'todo' as const },
            { tipo: 'ultimas' as const, semanas: 12 },
        ]) {
            assert.deepEqual(textoAPeriodo(periodoATexto(p)), p);
        }
    });

    test('un bloque conserva su identificador tal cual, sin pasarlo a minusculas', () => {
        const id = 'A1B2C3D4-1111-2222-3333-444455556666';
        const vuelta = textoAPeriodo(periodoATexto({ tipo: 'bloque', blockId: id }));
        assert.equal(vuelta.blockId, id);
    });

    test('basura -> periodo por defecto', () => {
        for (const basura of ['', 'pepe', '0s', '999s', '-4s', 'bloque:', 'bloque:<script>', null, undefined]) {
            assert.deepEqual(textoAPeriodo(basura), PERIODO_POR_DEFECTO);
        }
    });

    test('el periodo por defecto NO ensucia la direccion', () => {
        const params = conPeriodo(new URLSearchParams('vista=stats'), PERIODO_POR_DEFECTO);
        assert.equal(params.get('periodo'), null);
        assert.equal(params.get('vista'), 'stats', 'el resto de parametros se conserva');
    });

    test('otro periodo si se escribe', () => {
        const params = conPeriodo(new URLSearchParams(), { tipo: 'mes' });
        assert.equal(params.get('periodo'), 'mes');
    });

    test('no se mutan los parametros que se reciben', () => {
        const originales = new URLSearchParams('a=1');
        conPeriodo(originales, { tipo: 'mes' });
        assert.equal(originales.get('periodo'), null);
    });
});

describe('matriz de aplicabilidad', () => {
    test('competiciones solo admite "desde siempre"', () => {
        assert.equal(admite('competiciones', { tipo: 'todo' }), true);
        assert.equal(admite('competiciones', { tipo: 'semana' }), false);
    });

    test('los cuestionarios NO se filtran por bloque: se rellenan a diario', () => {
        assert.equal(admite('cuestionarios', { tipo: 'bloque' }), false);
    });

    test('el volumen NO admite "desde siempre": 200 semanas no se leen', () => {
        assert.equal(admite('volumen', { tipo: 'todo' }), false);
    });

    test('un periodo que no encaja se ajusta al de la pantalla, no da vacio', () => {
        const ajustado = ajustarAlAmbito('competiciones', { tipo: 'semana' });
        assert.deepEqual(ajustado, reglaDe('competiciones').porDefecto);
    });

    test('uno que si encaja se respeta', () => {
        const p = { tipo: 'mes' as const };
        assert.deepEqual(ajustarAlAmbito('constancia', p), p);
    });

    test('cada ambito propone un periodo que el mismo admite', () => {
        for (const ambito of ['volumen', 'cargas', 'constancia', 'cuestionarios', 'vbt', 'competiciones'] as const) {
            const regla = reglaDe(ambito);
            assert.equal(
                regla.admite.includes(regla.porDefecto.tipo),
                true,
                `${ambito} propone por defecto algo que no admite`
            );
        }
    });
});
