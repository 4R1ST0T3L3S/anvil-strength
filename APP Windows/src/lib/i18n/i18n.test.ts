import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { es } from './es';
import { en } from './en';
import {
    DIAS_ISO,
    DIAS_ISO_CORTOS,
    formatearFecha,
    formatearNumero,
    formatearPeso,
    plural,
    traducir,
} from './index';

describe('los dos diccionarios dicen lo mismo', () => {
    test('tienen exactamente las mismas claves', () => {
        // El tipo ya lo garantiza en compilación. Esta prueba existe para el
        // día en que alguien silencie el tipo con un `as`.
        assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
    });

    test('ninguna traduccion se ha quedado vacia', () => {
        for (const [k, v] of Object.entries(en)) {
            assert.ok(String(v).trim().length > 0, `la clave ${k} esta vacia en ingles`);
        }
    });

    test('los huecos coinciden en las dos lenguas', () => {
        // Es el fallo silencioso clasico: se traduce la frase y se pierde el
        // `{n}`, asi que en ingles sale "characters short" sin el numero.
        const huecos = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
        for (const k of Object.keys(es) as (keyof typeof es)[]) {
            assert.deepEqual(huecos(en[k]), huecos(es[k]), `los huecos de ${k} no cuadran`);
        }
    });

    test('todo plural tiene sus dos formas', () => {
        for (const k of Object.keys(es)) {
            if (k.endsWith('_una')) {
                assert.ok(k.replace('_una', '_varias') in es, `${k} no tiene plural`);
            }
        }
    });
});

describe('los huecos se rellenan', () => {
    test('sustituye por nombre', () => {
        assert.equal(traducir('es', 'periodo.ultimas', { n: 12 }), 'Últimas 12 semanas');
        assert.equal(traducir('en', 'periodo.ultimas', { n: 12 }), 'Last 12 weeks');
    });

    test('varios huecos en la misma frase', () => {
        assert.equal(traducir('es', 'validacion.rango', { min: 1, max: 10 }), 'Tiene que estar entre 1 y 10');
    });

    test('un hueco sin valor se deja A LA VISTA, no se borra', () => {
        // Una cadena vacia pasaria desapercibida y dejaria una frase sin
        // sentido; un `{max}` en pantalla se ve y se arregla.
        const salida = (traducir as unknown as (...a: unknown[]) => string)('es', 'validacion.rango', { min: 1 });
        assert.equal(salida, 'Tiene que estar entre 1 y {max}');
    });
});

describe('plurales por Intl, no por n === 1', () => {
    test('uno va en singular', () => {
        assert.equal(plural('es', 'entreno.serie', 1), '1 serie');
        assert.equal(plural('en', 'entreno.serie', 1), '1 set');
    });

    test('cero va en PLURAL en las dos lenguas', () => {
        // Es lo que un `n === 1` acierta por casualidad y no por saberlo.
        assert.equal(plural('es', 'entreno.serie', 0), '0 series');
        assert.equal(plural('en', 'entreno.serie', 0), '0 sets');
    });

    test('un decimal tambien va en plural', () => {
        assert.equal(plural('es', 'entreno.repeticion', 1.5), '1.5 repeticiones');
    });

    test('el plural admite huecos extra', () => {
        assert.equal(plural('es', 'validacion.minimoLargo', 3), 'Faltan 3 caracteres');
        assert.equal(plural('es', 'validacion.minimoLargo', 1), 'Falta 1 carácter');
    });
});

describe('los datos del usuario no se traducen', () => {
    test('una clave que no existe se devuelve tal cual', () => {
        // Es la red de seguridad: si alguien cuela un nombre de ejercicio por
        // aqui, sale el nombre, no una cadena vacia ni un error.
        const nombre = 'Sentadilla con pausa';
        const salida = (traducir as unknown as (...a: unknown[]) => string)('en', nombre);
        assert.equal(salida, nombre);
    });
});

describe('formatos por Intl', () => {
    test('la fecha se escribe distinto en cada lengua', () => {
        const d = new Date('2026-03-04T12:00:00Z');
        const esp = formatearFecha('es', d);
        const ing = formatearFecha('en', d);
        assert.notEqual(esp, ing);
        // Lo importante es que NINGUNA de las dos sea "03/04", que se lee como
        // 3 de abril aqui y como 4 de marzo en Estados Unidos.
        assert.ok(/mar/i.test(esp), `esperaba el mes escrito en "${esp}"`);
        assert.ok(/Mar/i.test(ing), `esperaba el mes escrito en "${ing}"`);
    });

    test('una fecha invalida devuelve vacio en vez de "Invalid Date"', () => {
        assert.equal(formatearFecha('es', 'esto no es una fecha'), '');
    });

    test('el numero usa coma en español y punto en ingles', () => {
        assert.equal(formatearNumero('es', 97.5), '97,5');
        assert.equal(formatearNumero('en', 97.5), '97.5');
    });

    test('el peso no arrastra decimales que no hacen falta', () => {
        assert.equal(formatearPeso('es', 100), '100 kg');
        assert.equal(formatearPeso('es', 97.5), '97,5 kg');
    });

    test('kg NO se convierte a libras al cambiar de idioma', () => {
        // Es una app de powerlifting: la federacion pesa en kilos y una
        // sentadilla de 180 es 180 en todas partes.
        assert.ok(formatearPeso('en', 180).endsWith('kg'));
    });
});

describe('los dias van por clave, no por indice', () => {
    test('el orden es ISO: el primero es lunes', () => {
        assert.equal(traducir('es', DIAS_ISO[0]), 'Lunes');
        assert.equal(traducir('en', DIAS_ISO[0]), 'Monday');
        assert.equal(traducir('es', DIAS_ISO[6]), 'Domingo');
    });

    test('las iniciales inglesas no se repiten', () => {
        // En español basta una letra porque X y M separan miercoles de martes;
        // en ingles Tuesday/Thursday y Saturday/Sunday chocan.
        const cortos = DIAS_ISO_CORTOS.map((k) => traducir('en', k));
        assert.equal(new Set(cortos).size, 7);
    });
});
