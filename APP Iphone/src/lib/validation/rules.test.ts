/**
 * PRUEBAS DE LAS REGLAS DE VALIDACIÓN
 * =====================================================================
 * Las que justifican el fichero entero:
 *
 *   · "97,5" es un número válido. En España se teclea con coma, y
 *     `Number("97,5")` es NaN: sin esto, un atleta no puede escribir su peso.
 *   · Un correo con `+` NO se rechaza. Las expresiones regulares "estrictas"
 *     que circulan por ahí dejan fuera direcciones buenas, y eso es peor que
 *     dejar pasar una mala.
 *   · Un validador de formato NO se queja de un campo vacío. De lo vacío se
 *     encarga `requerido`, y si no, un campo opcional en blanco da error.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    combinar,
    requerido,
    email,
    minimoLargo,
    maximoLargo,
    contrasena,
    igualA,
    numeroEnRango,
    entero,
    fecha,
    aceptado,
    alMenosUno,
} from './rules.ts';
import {
    validarCarga,
    validarReps,
    validarRpe,
    validarPorcentaje1RM,
    ventanaDeFechas,
} from './domain.ts';

describe('la coma decimal', () => {
    test('"97,5" es un numero valido: en Espana se teclea asi', () => {
        assert.equal(numeroEnRango(0, 600)('97,5'), null);
    });

    test('"97.5" tambien, por si viene de un teclado con punto', () => {
        assert.equal(numeroEnRango(0, 600)('97.5'), null);
    });

    test('"noventa" no', () => {
        assert.match(String(numeroEnRango(0, 600)('noventa')), /número/);
    });
});

describe('lo vacio es cosa de requerido, no de los demas', () => {
    test('email() calla ante una cadena vacia', () => {
        assert.equal(email()(''), null);
    });

    test('numeroEnRango() calla ante una cadena vacia', () => {
        assert.equal(numeroEnRango(1, 10)(''), null);
    });

    test('fecha() calla ante una cadena vacia', () => {
        assert.equal(fecha()(''), null);
    });

    test('pero requerido() no', () => {
        assert.match(String(requerido('el nombre')('')), /Falta el nombre/);
    });

    test('requerido() tampoco acepta solo espacios', () => {
        assert.notEqual(requerido()('   '), null);
    });
});

describe('email — permisivo a proposito', () => {
    test('acepta una direccion con +, que las expresiones estrictas rechazan', () => {
        assert.equal(email()('marc+anvil@gmail.com'), null);
    });

    test('acepta un dominio largo y nuevo', () => {
        assert.equal(email()('hola@anvilstrength.futbol'), null);
    });

    test('acepta subdominios', () => {
        assert.equal(email()('a@correo.empresa.es'), null);
    });

    test('dice que falta la arroba cuando falta la arroba', () => {
        assert.match(String(email()('marcgmail.com')), /arroba/);
    });

    test('rechaza lo que no tiene dominio', () => {
        assert.notEqual(email()('marc@gmail'), null);
    });

    test('rechaza espacios', () => {
        assert.notEqual(email()('marc @gmail.com'), null);
    });
});

describe('mensajes que dicen cuanto falta, no cuanto hace falta', () => {
    test('la contrasena dice los caracteres que faltan', () => {
        assert.match(String(contrasena()('abc12')), /3 caracteres más/);
    });

    test('y en singular cuando falta uno', () => {
        assert.match(String(contrasena()('abc1234')), /1 carácter más/);
    });

    test('ocho ya vale', () => {
        assert.equal(contrasena()('abc12345'), null);
    });

    test('maximoLargo dice por cuanto se pasa', () => {
        assert.match(String(maximoLargo(5, 'El apodo')('abcdefgh')), /por 3/);
    });

    test('minimoLargo respeta el nombre que se le pasa', () => {
        assert.match(String(minimoLargo(4, 'El nombre')('ab')), /^El nombre/);
    });
});

describe('combinar devuelve el PRIMER error, no todos', () => {
    const v = combinar(requerido<string>('el correo'), email());

    test('vacio da el de requerido', () => {
        assert.match(String(v('')), /Falta el correo/);
    });

    test('con contenido malo da el de formato', () => {
        assert.match(String(v('pepe')), /arroba/);
    });

    test('bueno no da ninguno', () => {
        assert.equal(v('pepe@correo.es'), null);
    });

    test('los huecos (null/false) se saltan sin romper', () => {
        assert.equal(combinar<string>(null, false, undefined, email())('a@b.es'), null);
    });
});

describe('igualA', () => {
    test('coincidir es valido', () => {
        assert.equal(igualA(() => 'abc12345')('abc12345'), null);
    });

    test('no coincidir avisa', () => {
        assert.match(String(igualA(() => 'abc12345')('otra')), /no coinciden/);
    });
});

describe('entero', () => {
    test('5 vale', () => assert.equal(entero()('5'), null));
    test('5,5 no', () => assert.match(String(entero()('5,5')), /entero/));
    test('-3 vale como entero (el rango es otra cosa)', () => assert.equal(entero()('-3'), null));
});

describe('casillas', () => {
    test('aceptado exige true', () => {
        assert.equal(aceptado()(true), null);
        assert.notEqual(aceptado()(false), null);
    });

    test('alMenosUno exige lista no vacia', () => {
        assert.equal(alMenosUno()(['a']), null);
        assert.notEqual(alMenosUno()([]), null);
    });
});

// =====================================================================
// DOMINIO
// =====================================================================

describe('rangos de powerlifting — redes antierratas, no limites del deporte', () => {
    test('140 kg es una carga normal', () => {
        assert.equal(validarCarga('140'), null);
    });

    test('0 kg vale: una serie con la barra vacia es un dato legitimo', () => {
        assert.equal(validarCarga('0'), null);
    });

    test('1400 kg caza el dedo que se resbalo al teclear 140', () => {
        assert.match(String(validarCarga('1400')), /no puede pasar de 600/);
    });

    test('550 kg NO se rechaza: hay gente que levanta eso', () => {
        assert.equal(validarCarga('550'), null);
    });

    test('el RPE llega a 10 y no mas', () => {
        assert.equal(validarRpe('10'), null);
        assert.notEqual(validarRpe('14'), null);
    });

    test('el RPE admite medios puntos: 8,5 es una prescripcion normal', () => {
        assert.equal(validarRpe('8,5'), null);
    });

    test('las repeticiones tienen que ser enteras', () => {
        assert.equal(validarReps('5'), null);
        assert.match(String(validarReps('5,5')), /entero/);
    });

    test('el %1RM llega a 150 A PROPOSITO: las sobrecargas pasan del 100', () => {
        assert.equal(validarPorcentaje1RM('115'), null);
        assert.notEqual(validarPorcentaje1RM('200'), null);
    });
});

describe('fechas — la errata que se caza es el ano', () => {
    const { desde, hasta } = ventanaDeFechas();
    const v = fecha({ desde, hasta });

    test('una fecha de este ano vale', () => {
        const hoy = new Date().toISOString().slice(0, 10);
        assert.equal(v(hoy), null);
    });

    test('el ano 0025 (teclear "25" en vez de "2025") se caza', () => {
        assert.notEqual(v('0025-03-14'), null);
    });

    test('el ano 2099 tambien', () => {
        assert.notEqual(v('2099-03-14'), null);
    });

    test('una cadena que no es fecha se caza', () => {
        assert.notEqual(v('pepe'), null);
    });
});
