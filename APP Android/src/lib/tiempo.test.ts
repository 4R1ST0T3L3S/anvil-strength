import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diasEntre, fechaRelativa, marcaCorta, haceCuanto, claveDeFecha, fechaDeClave, separadorDeDia } from './tiempo.ts';

const ahora = new Date(2026, 8, 11, 17, 30); // viernes 11 de septiembre de 2026

describe('días entre fechas', () => {
    it('ignora la hora', () => {
        assert.equal(diasEntre(new Date(2026, 8, 10, 23, 59), new Date(2026, 8, 11, 0, 1)), 1);
    });
    it('hoy es cero', () => {
        assert.equal(diasEntre(new Date(2026, 8, 11, 8), ahora), 0);
    });
});

describe('fecha relativa', () => {
    it('hoy y ayer', () => {
        assert.equal(fechaRelativa(new Date(2026, 8, 11, 9), ahora), 'Hoy');
        assert.equal(fechaRelativa(new Date(2026, 8, 10, 9), ahora), 'Ayer');
    });
    it('esta semana, el día', () => {
        assert.equal(fechaRelativa(new Date(2026, 8, 8, 9), ahora), 'Martes');
    });
    it('más lejos, la fecha corta', () => {
        assert.match(fechaRelativa(new Date(2026, 7, 20), ahora), /^20 ago/);
    });
    it('otro año, con año', () => {
        assert.match(fechaRelativa(new Date(2025, 11, 20), ahora), /2025/);
    });
});

describe('marca corta de una lista', () => {
    it('de hoy, la hora', () => {
        assert.equal(marcaCorta(new Date(2026, 8, 11, 9, 5), ahora), '09:05');
    });
    it('de ayer, "Ayer"', () => {
        assert.equal(marcaCorta(new Date(2026, 8, 10, 9), ahora), 'Ayer');
    });
});

describe('hace cuánto', () => {
    it('minutos y horas', () => {
        assert.equal(haceCuanto(new Date(ahora.getTime() - 5 * 60_000), ahora), 'hace 5 min');
        assert.equal(haceCuanto(new Date(ahora.getTime() - 3 * 3_600_000), ahora), 'hace 3 h');
    });
    it('menos de un minuto es ahora', () => {
        assert.equal(haceCuanto(new Date(ahora.getTime() - 20_000), ahora), 'ahora');
    });
});

describe('claves de fecha', () => {
    it('ida y vuelta en hora local', () => {
        assert.equal(claveDeFecha(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
        assert.equal(fechaDeClave('2026-01-05').getDate(), 5);
    });
    it('separador de hilo', () => {
        assert.equal(separadorDeDia(new Date(2026, 8, 11), ahora), 'Hoy');
        assert.match(separadorDeDia(new Date(2026, 8, 7), ahora), /^Lunes 7 de septiembre$/);
    });
});
