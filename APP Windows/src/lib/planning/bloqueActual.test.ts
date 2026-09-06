import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirBloqueActual, semanasDeCadaBloque } from './bloqueActual';

/**
 * El caso real, tal cual lo reportó el atleta el 06/09/2026.
 *
 * Dos bloques activos. El primero corre de la semana 32 a la 37 (3 ago -
 * 13 sept) y hoy, semana 36, todavía le queda una semana. El segundo se
 * creó DESPUÉS y empieza en la 38.
 *
 * La aplicación cogía el activo más recientemente creado, así que le
 * enseñaba el segundo —que no ha empezado— y le decía "semana sin sesiones"
 * mientras su entrenamiento de esa semana estaba, publicado, en el primero.
 */
const HOY = new Date(2026, 8, 6); // domingo 6 de septiembre de 2026, semana ISO 36

const primerBloque = {
    nombre: 'PRIMER BLOQUE HIPERTROFIA',
    is_active: true,
    start_week: 32,
    end_week: 37,
    start_date: '2026-08-03T00:00:00Z',
    created_at: '2026-07-28T10:00:00Z',
};

const segundoBloque = {
    nombre: 'SEGUNDO BLOQUE HIPERTROFIA',
    is_active: true,
    start_week: 38,
    end_week: 43,
    start_date: '2026-09-14T00:00:00Z',
    created_at: '2026-09-04T10:00:00Z',
};

// `getBlocksByAthlete` los devuelve por created_at descendente: el segundo
// primero. Ese orden es justo el que provocaba el fallo.
const comoLleganDeLaBase = [segundoBloque, primerBloque];

test('con el bloque siguiente ya creado, sigue mandando el que está en curso', () => {
    const elegido = elegirBloqueActual(comoLleganDeLaBase, HOY);
    assert.equal(elegido?.nombre, 'PRIMER BLOQUE HIPERTROFIA');
});

test('en la última semana del bloque en curso todavía manda ese', () => {
    // Lunes 7 de septiembre: semana 37, la última del primer bloque.
    const elegido = elegirBloqueActual(comoLleganDeLaBase, new Date(2026, 8, 7));
    assert.equal(elegido?.nombre, 'PRIMER BLOQUE HIPERTROFIA');
});

test('cuando el primero termina, el relevo pasa al segundo', () => {
    // Lunes 14 de septiembre: semana 38, el primero ya terminó.
    const elegido = elegirBloqueActual(comoLleganDeLaBase, new Date(2026, 8, 14));
    assert.equal(elegido?.nombre, 'SEGUNDO BLOQUE HIPERTROFIA');
});

test('en el hueco entre dos bloques se queda el que acaba de terminar', () => {
    const cortado = [
        { ...segundoBloque, start_week: 40, end_week: 45, start_date: '2026-10-05T00:00:00Z' },
        primerBloque,
    ];
    // Semana 38: el primero terminó en la 37 y el segundo no empieza hasta la 40.
    const elegido = elegirBloqueActual(cortado, new Date(2026, 8, 14));
    assert.equal(elegido?.nombre, 'PRIMER BLOQUE HIPERTROFIA');
});

test('si dos bloques se solapan, manda el que empezó más tarde', () => {
    const solapado = {
        nombre: 'BLOQUE NUEVO ENCIMA',
        is_active: true,
        start_week: 35,
        end_week: 40,
        start_date: '2026-08-24T00:00:00Z',
        created_at: '2026-08-20T10:00:00Z',
    };
    const elegido = elegirBloqueActual([primerBloque, solapado], HOY);
    assert.equal(elegido?.nombre, 'BLOQUE NUEVO ENCIMA');
});

test('los bloques inactivos no se eligen nunca', () => {
    const soloInactivos = [
        { ...primerBloque, is_active: false },
        { ...segundoBloque, is_active: false },
    ];
    assert.equal(elegirBloqueActual(soloInactivos, HOY), null);
});

test('un único bloque activo se devuelve aunque no haya empezado', () => {
    // El caso de siempre: el atleta estrena bloque y aún faltan días.
    assert.equal(elegirBloqueActual([segundoBloque], HOY)?.nombre, 'SEGUNDO BLOQUE HIPERTROFIA');
});

test('sin semanas con las que situarlos, se respeta el orden de entrada', () => {
    const sinFechas = [
        { nombre: 'MÁS NUEVO', is_active: true, start_week: null, end_week: null, start_date: null },
        { nombre: 'MÁS VIEJO', is_active: true, start_week: null, end_week: null, start_date: null },
    ];
    // Es el comportamiento anterior, y para este caso sigue siendo lo único
    // que se puede hacer: no hay dato con el que decidir.
    assert.equal(elegirBloqueActual(sinFechas, HOY)?.nombre, 'MÁS NUEVO');
});

test('un bloque que cruza el fin de año se sitúa en el año siguiente', () => {
    const navidad = {
        nombre: 'BLOQUE DE INVIERNO',
        is_active: true,
        start_week: 50,          // 7 dic 2026
        end_week: 3,             // termina en la semana 3 de 2027
        start_date: '2026-12-07T00:00:00Z',
        created_at: '2026-12-01T10:00:00Z',
    };
    const viejo = { ...primerBloque, nombre: 'EL DE ANTES' };
    // 5 de enero de 2027: dentro del bloque de invierno.
    const elegido = elegirBloqueActual([navidad, viejo], new Date(2027, 0, 5));
    assert.equal(elegido?.nombre, 'BLOQUE DE INVIERNO');
});

// =====================================================================
// EL SELECTOR DEL ATLETA: TODOS LOS BLOQUES, CON SUS SEMANAS
// =====================================================================

test('agrupa cada bloque con sus semanas, del más antiguo al más nuevo', () => {
    const grupos = semanasDeCadaBloque(
        [{ id: 'b2', ...segundoBloque }, { id: 'b1', ...primerBloque }],
        HOY
    );

    assert.equal(grupos.length, 2);
    // Entran por created_at descendente (el segundo primero) y salen en
    // orden de calendario: primero el que el atleta vivió antes.
    assert.deepEqual(grupos.map(g => g.bloque.nombre), [
        'PRIMER BLOQUE HIPERTROFIA',
        'SEGUNDO BLOQUE HIPERTROFIA',
    ]);
    assert.deepEqual(grupos[0].semanas, [32, 33, 34, 35, 36, 37]);
    assert.deepEqual(grupos[1].semanas, [38, 39, 40, 41, 42, 43]);
    assert.equal(grupos[0].anio, 2026);
});

test('un bloque sin semanas no aparece: no hay nada que ofrecer de él', () => {
    const grupos = semanasDeCadaBloque(
        [
            { id: 'b1', ...primerBloque },
            { id: 'roto', nombre: 'SIN SEMANAS', is_active: true, start_week: null, end_week: null, start_date: null },
        ],
        HOY
    );
    assert.deepEqual(grupos.map(g => g.bloque.id), ['b1']);
});

test('un bloque de una sola semana sale con esa semana', () => {
    const grupos = semanasDeCadaBloque(
        [{ id: 'x', nombre: 'TEST', is_active: true, start_week: 36, end_week: 36, start_date: '2026-08-31T00:00:00Z' }],
        HOY
    );
    assert.deepEqual(grupos[0].semanas, [36]);
});
