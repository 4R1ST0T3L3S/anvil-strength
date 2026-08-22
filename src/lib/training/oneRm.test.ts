/**
 * PRUEBAS DEL 1RM ESTIMADO
 * =====================================================================
 * Se ejecutan con `npm test`. Ver scripts/ts-resolver.mjs para por qué no
 * hace falta ningún runner instalado.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimate1RM, loadForReps, MAX_REPS_FOR_1RM } from './oneRm';

describe('estimate1RM', () => {
    test('a UNA repetición devuelve la carga tal cual', () => {
        // LA REGRESIÓN QUE JUSTIFICA ESTE FICHERO. La copia de
        // athleteStats.ts devolvía 103,3 aquí: aplicaba Epley sobre un dato
        // que YA era el máximo e inflaba un 3,3% el número más fiable que
        // hay. Ver la cabecera de oneRm.ts.
        assert.equal(estimate1RM(100, 1), 100);
        assert.equal(estimate1RM(212.5, 1), 212.5);
    });

    test('aplica Epley por encima de una repetición', () => {
        // 100 x (1 + 5/30) = 116,666... -> 116,7
        assert.equal(estimate1RM(100, 5), 116.7);
        // 140 x (1 + 3/30) = 154
        assert.equal(estimate1RM(140, 3), 154);
    });

    test('redondea a un decimal', () => {
        assert.equal(estimate1RM(100, 2), 106.7);
        assert.equal(estimate1RM(102.5, 8), 129.8);
    });

    test('crece con la carga y con las repeticiones', () => {
        assert.ok(estimate1RM(110, 5)! > estimate1RM(100, 5)!);
        assert.ok(estimate1RM(100, 6)! > estimate1RM(100, 5)!);
    });

    test('corta en 12 repeticiones: por encima ya no es fuerza máxima', () => {
        assert.notEqual(estimate1RM(60, MAX_REPS_FOR_1RM), null);
        assert.equal(estimate1RM(60, MAX_REPS_FOR_1RM + 1), null);
        assert.equal(estimate1RM(60, 20), null);
    });

    test('devuelve null —nunca cero— ante una entrada que no permite estimar', () => {
        // Un 0 se colaría en las medias como si fuera una serie real; un
        // null lo tiene que descartar quien llama.
        assert.equal(estimate1RM(0, 5), null);
        assert.equal(estimate1RM(-100, 5), null);
        assert.equal(estimate1RM(100, 0), null);
        assert.equal(estimate1RM(100, -3), null);
        assert.equal(estimate1RM(NaN, 5), null);
        assert.equal(estimate1RM(100, NaN), null);
        assert.equal(estimate1RM(Infinity, 5), null);
        assert.equal(estimate1RM(100, Infinity), null);
    });
});

describe('loadForReps', () => {
    test('es la inversa de estimate1RM', () => {
        const oneRm = estimate1RM(100, 5)!;      // 116,7
        assert.equal(loadForReps(oneRm, 5), 100); // 116,7 / 1,1666... = 100,03 -> 100
    });

    test('a una repetición devuelve el propio 1RM', () => {
        // Sin este caso la simetría se rompe: daría 96,8 para un 1RM de 100.
        assert.equal(loadForReps(100, 1), 100);
    });

    test('baja la carga a medida que suben las repeticiones', () => {
        assert.ok(loadForReps(200, 8)! < loadForReps(200, 3)!);
    });

    test('comparte los mismos límites', () => {
        assert.equal(loadForReps(200, MAX_REPS_FOR_1RM + 1), null);
        assert.equal(loadForReps(0, 5), null);
        assert.equal(loadForReps(NaN, 5), null);
    });
});
