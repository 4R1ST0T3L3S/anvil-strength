/**
 * PRUEBAS DEL REGISTRO DE EJES
 * =====================================================================
 * La regla que más importa: una pregunta que no se ha podido clasificar
 * NUNCA cae en un eje ajeno. Cae en `custom` y se pinta sola.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { FormQuestion } from '../../services/formsService';
import {
    resolveAxis,
    withResolvedAxes,
    needsAxisPersisted,
    unitFor,
    domainFor,
    AXIS_DEFINITIONS,
} from './axes';

function q(partial: Partial<FormQuestion> & { id: string }): FormQuestion {
    return { label: '', qtype: 'number', ...partial } as FormQuestion;
}

describe('resolveAxis — orden de clasificación (K9)', () => {
    test('1. el eje declarado manda sobre todo lo demás', () => {
        // Aunque la etiqueta grite "pasos" y el tipo sea escala.
        assert.equal(resolveAxis(q({ id: 'pasos', label: 'Pasos', qtype: 'scale', axis: 'mass' })), 'mass');
    });

    test('2. una escala es scale10 aunque su etiqueta parezca otra cosa', () => {
        assert.equal(resolveAxis(q({ id: 'sleep', label: '¿Cuántas horas has dormido?', qtype: 'scale' })), 'scale10');
    });

    test('3. la heurística reconoce masa, recuento, duración y porcentaje', () => {
        assert.equal(resolveAxis(q({ id: 'bodyweight', label: 'Peso corporal (kg)' })), 'mass');
        assert.equal(resolveAxis(q({ id: 'steps', label: 'Media de pasos diarios esta semana' })), 'count');
        assert.equal(resolveAxis(q({ id: 'sleep_h', label: 'Horas de sueño' })), 'duration');
        assert.equal(resolveAxis(q({ id: 'adh', label: 'Porcentaje de adherencia' })), 'percent');
    });

    test('4. lo que no se reconoce cae en custom, NUNCA en un eje ajeno', () => {
        // Es la regla innegociable: mejor una gráfica de una línea que dos
        // magnitudes distintas compartiendo escala.
        assert.equal(resolveAxis(q({ id: 'vo2', label: 'VO2 máx estimado' })), 'custom');
        assert.equal(resolveAxis(q({ id: 'x', label: '' })), 'custom');
    });

    test('un eje declarado que no existe se ignora y se vuelve a clasificar', () => {
        const bad = { id: 'steps', label: 'Pasos', qtype: 'number', axis: 'inventado' } as unknown as FormQuestion;
        assert.equal(resolveAxis(bad), 'count');
    });
});

describe('withResolvedAxes — persistencia de la heurística', () => {
    test('escribe el eje en las preguntas que no lo llevan', () => {
        const out = withResolvedAxes([
            q({ id: 'sleep', label: '¿Cómo has dormido?', qtype: 'scale' }),
            q({ id: 'steps', label: 'Pasos' }),
        ]);
        assert.equal(out[0].axis, 'scale10');
        assert.equal(out[1].axis, 'count');
    });

    test('no toca la elección del coach', () => {
        const out = withResolvedAxes([q({ id: 'steps', label: 'Pasos', axis: 'custom' })]);
        assert.equal(out[0].axis, 'custom');
    });

    test('devuelve EL MISMO array si no hay nada que escribir', () => {
        // Para que quien llame pueda comparar por identidad y no guardar
        // una plantilla que no ha cambiado.
        const input = [q({ id: 'steps', label: 'Pasos', axis: 'count' })];
        assert.equal(withResolvedAxes(input), input);
    });

    test('needsAxisPersisted solo mira si el eje está escrito', () => {
        assert.equal(needsAxisPersisted(q({ id: 'a', label: 'a' })), true);
        assert.equal(needsAxisPersisted(q({ id: 'a', label: 'a', axis: 'count' })), false);
    });
});

describe('unidad y rango efectivos', () => {
    test('lo que declara la pregunta gana a lo de su familia', () => {
        assert.equal(unitFor(q({ id: 'steps', label: 'Pasos', unit: 'pasos' })), 'pasos');
        assert.deepEqual(domainFor(q({ id: 'x', label: 'x', qtype: 'scale', domain: [0, 5] })), [0, 5]);
    });

    test('si no declara nada, hereda de su familia', () => {
        assert.equal(unitFor(q({ id: 'bodyweight', label: 'Peso corporal (kg)' })), 'kg');
        assert.deepEqual(domainFor(q({ id: 'sleep', label: 'Sueño', qtype: 'scale' })), [0, 10]);
    });

    test('las escalas 1-10 llevan rango FIJO', () => {
        // Si el eje se ajustara al dato, dormir 6, 7 y 6 se dibujaría como
        // una montaña rusa en vez de como la semana plana que es.
        assert.deepEqual(AXIS_DEFINITIONS.scale10.domain, [0, 10]);
    });

    test('el peso corporal NO lleva rango fijo', () => {
        // Un 0-100 escondería una variación de 2 kg, que es justo lo que se
        // está mirando.
        assert.equal(AXIS_DEFINITIONS.mass.domain, null);
    });
});
