/**
 * PRUEBAS DEL CLASIFICADOR DE BÁSICOS
 * =====================================================================
 *
 * POR QUÉ EXISTE ESTE ARCHIVO, Y NO ES POR EL CÓDIGO NUEVO.
 *
 * Esta lógica llevaba meses funcionando dentro de `getLiftTheme()`, en
 * `builder/DayCard.tsx`, y el 30/08/2026 se sacó a un módulo puro para poder
 * usarla en los cálculos de series semanales y de accesorios.
 *
 * Un movimiento de código no cambia el comportamiento… salvo cuando lo
 * cambia. Y aquí cambiarlo tendría consecuencias visibles: la lista de
 * exclusiones (`NOT_THE_MAIN_LIFT`) se construyó caso a caso, y si una
 * "sentadilla búlgara" volviera a contar como sentadilla de competición, el
 * volumen del básico saldría inflado en el panel, en la tarjeta del día y en
 * las estadísticas del bloque a la vez.
 *
 * Así que estas pruebas fijan el comportamiento QUE YA HABÍA, caso por caso,
 * para que el traslado sea comprobable y no un acto de fe.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMainLift, isMainLift } from './mainLift';

describe('classifyMainLift — los tres de competición', () => {
    test('sentadilla, en sus dos idiomas', () => {
        assert.equal(classifyMainLift('Sentadilla'), 'SQ');
        assert.equal(classifyMainLift('Squat'), 'SQ');
        assert.equal(classifyMainLift('SENTADILLA'), 'SQ');
    });

    test('banca, en sus dos idiomas', () => {
        assert.equal(classifyMainLift('Press Banca'), 'BP');
        assert.equal(classifyMainLift('Bench Press'), 'BP');
    });

    test('peso muerto, en sus dos idiomas', () => {
        assert.equal(classifyMainLift('Peso Muerto'), 'DL');
        assert.equal(classifyMainLift('Deadlift'), 'DL');
    });
});

describe('classifyMainLift — las variantes de COMPETICIÓN sí cuentan', () => {
    // Son el mismo patrón a distinta dificultad: sus series suman al básico.
    const variantes: [string, string][] = [
        ['Sentadilla Pausada', 'SQ'],
        ['Sentadilla Tempo', 'SQ'],
        ['Sentadilla con Cadenas', 'SQ'],
        ['Sentadilla con Gomas', 'SQ'],
        ['Sentadilla a Cajón', 'SQ'],
        ['Sentadilla Competición', 'SQ'],
        ['Media Sentadilla', 'SQ'],
        ['Banca Pausada', 'BP'],
        ['Banca Agarre Cerrado', 'BP'],
        ['Banca Larsen', 'BP'],
        ['Banca Spoto', 'BP'],
        ['Press Banca Competición', 'BP'],
        ['Peso Muerto Sumo', 'DL'],
        ['Peso Muerto Déficit', 'DL'],
        ['Peso Muerto desde Bloques', 'DL'],
        ['Peso Muerto Pausado', 'DL'],
    ];

    for (const [name, expected] of variantes) {
        test(`"${name}" → ${expected}`, () => {
            assert.equal(classifyMainLift(name), expected);
        });
    }
});

describe('classifyMainLift — LO QUE NO ES EL BÁSICO', () => {
    /**
     * La lista que costó descubrir. Cada uno de estos lleva el nombre de un
     * básico dentro y NO es ese básico: contarlos infla el volumen del
     * movimiento de competición, que es la cifra sobre la que se programa.
     */
    const accesorios = [
        'Sentadilla Búlgara',
        'Sentadilla Bulgara',      // sin tilde, como se teclea de verdad
        'Sentadilla Frontal',
        'Sentadilla Hack',
        'Sentadilla Goblet',
        'Sentadilla Sissy',
        'Sentadilla Zercher',
        'Sentadilla Split',
        'Prensa',
        'Zancadas',
        'Press Militar',
        'Press Francés',
        'Press Frances',
        'Press Inclinado',
        'Press Inclinado Mancuernas',
        'Peso Muerto Rumano',
        'Peso Muerto Piernas Rígidas',
        'Peso Muerto Piernas Rigidas',
        'Remo en Polea',
        'Extensión de Cuádriceps',
        'Curl de Bíceps',
        'Face Pull',
        'Dominadas',
    ];

    for (const name of accesorios) {
        test(`"${name}" NO es un básico`, () => {
            assert.equal(classifyMainLift(name), 'ACC');
        });
    }
});

describe('classifyMainLift — UN HUECO CONOCIDO DE LA LISTA DE EXCLUSIONES', () => {
    /**
     * ESTO NO ES EL COMPORTAMIENTO DESEABLE. Es el que hay, y se fija aquí a
     * propósito para que conste.
     *
     * `NOT_THE_MAIN_LIFT` contiene "declinado" en masculino, pero la
     * biblioteca del proyecto da de alta el ejercicio como "Banca Declinada",
     * en femenino (ver database/block_metadata_and_exercise_library.sql). El
     * regex no dispara, cae en `includes('banca')` y el declinado cuenta como
     * press de banca de competición.
     *
     * Lo mismo pasaría con "Banca Inclinada".
     *
     * Se descubrió al escribir estas pruebas, el 30/08/2026, y NO se corrige
     * aquí: arreglarlo cambia las cifras de volumen de banca de todos los
     * bloques ya programados que usen ese ejercicio, y eso es una decisión de
     * producto —hay que revisar qué bloques afecta— y no un cambio de paso.
     *
     * El arreglo, cuando se decida: añadir `declinad|inclinad` (sin la vocal
     * final) al regex de `mainLift.ts`, que cubre las cuatro formas.
     */
    test('«Banca Declinada» cuenta HOY como banca de competición', () => {
        assert.equal(classifyMainLift('Banca Declinada'), 'BP');
    });

    test('«Press Declinado», en masculino, sí se excluye', () => {
        assert.equal(classifyMainLift('Press Declinado'), 'ACC');
    });
});

describe('classifyMainLift — entradas vacías', () => {
    test('null, undefined y cadena vacía son accesorio, no un error', () => {
        assert.equal(classifyMainLift(null), 'ACC');
        assert.equal(classifyMainLift(undefined), 'ACC');
        assert.equal(classifyMainLift(''), 'ACC');
        assert.equal(classifyMainLift('   '), 'ACC');
    });

    test('un ejercicio desconocido es accesorio', () => {
        assert.equal(classifyMainLift('Paseo del granjero'), 'ACC');
    });
});

describe('isMainLift', () => {
    test('es el complemento exacto de ACC', () => {
        assert.equal(isMainLift('Sentadilla'), true);
        assert.equal(isMainLift('Sentadilla Búlgara'), false);
        assert.equal(isMainLift(null), false);
    });
});
