/**
 * PRUEBAS DE PROGRESIONES GUARDADAS (v2)
 * =====================================================================
 * Lo que se fija:
 *   1. El formato SIMPLE (v1) se sigue leyendo exactamente igual — ninguna
 *      progresión guardada antes de hoy cambia de significado.
 *   2. El formato MULTI-DÍA agrupa por semana Y día, y "+" separa varios
 *      escalones del mismo día.
 *   3. resolveStep guarda el % USADO (B1) y nunca lo recalcula solo.
 *   4. Sin 1RM, un escalón en % se escribe SIN carga y marcado `unresolved`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveStep, defaultProgression, fitToWeeks, parseProgressionText,
    formatStep, stepsToText, weeksOfProgression, daysOfProgression,
    type ProgressionStep,
} from './progression';

describe('parseProgressionText — formato simple (v1), sin marcas S/D', () => {
    test('una línea por semana, día 1 implícito', () => {
        const { steps, errors } = parseProgressionText('4x6 70%\n4x6 75%\n3x5 60%');
        assert.equal(errors.length, 0);
        assert.equal(steps.length, 3);
        assert.deepEqual(steps.map(s => s.week), [1, 2, 3]);
        assert.ok(steps.every(s => s.day === 1));
        assert.equal(steps[0].metric, 'percent');
        assert.equal(steps[0].value, 70);
    });

    test('RPE con @ y kilos sueltos', () => {
        const { steps, errors } = parseProgressionText('3x5 @8\n5x5 100kg');
        assert.equal(errors.length, 0);
        assert.equal(steps[0].metric, 'rpe');
        assert.equal(steps[0].value, 8);
        assert.equal(steps[1].metric, 'kg');
        assert.equal(steps[1].value, 100);
    });

    test('líneas en blanco se ignoran, no cuentan como semana', () => {
        const { steps } = parseProgressionText('4x6 70%\n\n4x6 75%');
        assert.equal(steps.length, 2);
        assert.deepEqual(steps.map(s => s.week), [1, 2]);
    });

    test('una línea ilegible se reporta con su número, sin tumbar el resto', () => {
        const { steps, errors } = parseProgressionText('4x6 70%\n???\n4x6 80%');
        assert.equal(steps.length, 2);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].line, 2);
    });
});

describe('parseProgressionText — multi-día (v2)', () => {
    test('el ejemplo del encargo: S2 con dos escalones el mismo día', () => {
        const text = 'S1 D1: 3x5 @7\nS2 D1: 1x1 90% + 3x3 @7\nS3 D1: 3x6 @7';
        const { steps, errors } = parseProgressionText(text);
        assert.equal(errors.length, 0);
        assert.equal(steps.length, 4); // S1(1) + S2(2) + S3(1)

        const week2 = steps.filter(s => s.week === 2);
        assert.equal(week2.length, 2);
        assert.equal(week2[0].metric, 'percent');
        assert.equal(week2[0].value, 90);
        assert.equal(week2[1].metric, 'rpe');
        assert.equal(week2[1].value, 7);
    });

    test('dos días por semana, cada uno con su propia progresión', () => {
        const text = 'S1 D1: 4x5 70%\nS1 D2: 3x3 @8\nS2 D1: 4x4 75%\nS2 D2: 1x1 90% + 3x3 @7';
        const { steps } = parseProgressionText(text);
        assert.deepEqual(daysOfProgression(steps), [1, 2]);
        assert.deepEqual(weeksOfProgression(steps), [1, 2]);

        const s2d2 = steps.filter(s => s.week === 2 && s.day === 2);
        assert.equal(s2d2.length, 2);
    });

    test('"D" es opcional: sin ella, se asume día 1', () => {
        const { steps } = parseProgressionText('S1: 4x5 70%\nS2: 4x5 75%');
        assert.ok(steps.every(s => s.day === 1));
    });

    test('una semana sin nada detrás de los dos puntos no es un error — descanso de ese día', () => {
        const { steps, errors } = parseProgressionText('S1 D1: 4x5 70%\nS2 D1:\nS3 D1: 4x5 80%');
        assert.equal(errors.length, 0);
        assert.deepEqual(weeksOfProgression(steps), [1, 3]);
    });
});

describe('resolveStep — el % se guarda, nunca se recalcula solo', () => {
    test('con 1RM, resuelve a kilos Y guarda el % usado (B1)', () => {
        const step: ProgressionStep = { week: 1, day: 1, sets: 3, reps: '5', metric: 'percent', value: 90 };
        const r = resolveStep(step, 250);
        assert.equal(r.target_load, 225); // 250*0.9, redondeado a 2.5kg
        assert.equal(r.target_metric, 'kg');
        assert.equal(r.appliedPercent, 90);
        assert.equal(r.unresolved, false);
    });

    test('sin 1RM, no inventa un cero — se marca unresolved y sin appliedPercent', () => {
        const step: ProgressionStep = { week: 1, day: 1, sets: 3, reps: '5', metric: 'percent', value: 90 };
        const r = resolveStep(step, null);
        assert.equal(r.target_load, null);
        assert.equal(r.unresolved, true);
        assert.equal(r.appliedPercent, null);
    });

    test('un escalón en kg no lleva appliedPercent', () => {
        const step: ProgressionStep = { week: 1, day: 1, sets: 5, reps: '5', metric: 'kg', value: 140 };
        const r = resolveStep(step, 250);
        assert.equal(r.target_load, 140);
        assert.equal(r.appliedPercent, null);
    });
});

describe('defaultProgression / fitToWeeks — con frecuencia > 1', () => {
    test('defaultProgression genera frequency escalones por semana', () => {
        const steps = defaultProgression(4, 2);
        assert.equal(steps.length, 8); // 4 semanas x 2 días
        assert.deepEqual(daysOfProgression(steps), [1, 2]);
    });

    test('fitToWeeks repite el ÚLTIMO escalón de CADA día por separado', () => {
        const steps: ProgressionStep[] = [
            { week: 1, day: 1, sets: 4, reps: '5', metric: 'kg', value: 100 },
            { week: 2, day: 1, sets: 4, reps: '5', metric: 'kg', value: 110 },
            { week: 1, day: 2, sets: 3, reps: '3', metric: 'kg', value: 80 },
        ];
        const fitted = fitToWeeks(steps, 4, 2);
        const d1 = fitted.filter(s => s.day === 1);
        const d2 = fitted.filter(s => s.day === 2);
        assert.equal(d1.length, 4);
        assert.equal(d1[3].value, 110); // repite el último de D1
        assert.equal(d2.length, 4);
        assert.equal(d2[3].value, 80); // repite el único de D2, no el de D1
    });
});

describe('stepsToText — el sentido inverso, para reabrir una progresión', () => {
    test('frequency 1 da el formato simple, sin marcas S/D', () => {
        const steps: ProgressionStep[] = [
            { week: 1, day: 1, sets: 4, reps: '6', metric: 'percent', value: 70 },
            { week: 2, day: 1, sets: 4, reps: '6', metric: 'percent', value: 75 },
        ];
        const text = stepsToText(steps, 1);
        assert.equal(text, '4x6 · 70%\n4x6 · 75%');
    });

    test('frequency > 1 da el formato con marcas, agrupando "+" por día', () => {
        const steps: ProgressionStep[] = [
            { week: 1, day: 1, sets: 1, reps: '1', metric: 'percent', value: 90 },
            { week: 1, day: 1, sets: 3, reps: '3', metric: 'rpe', value: 7 },
            { week: 1, day: 2, sets: 3, reps: '3', metric: 'rpe', value: 8 },
        ];
        const text = stepsToText(steps, 2);
        assert.equal(text, 'S1 D1: 1 · 90% + 3x3 · @7\nS1 D2: 3x3 · @8');
    });

    test('round-trip: parsear lo que stepsToText escribió da los mismos escalones', () => {
        const original = defaultProgression(3, 2);
        const text = stepsToText(original, 2);
        const { steps: reparsed, errors } = parseProgressionText(text);
        assert.equal(errors.length, 0);
        assert.equal(reparsed.length, original.length);
    });
});

describe('formatStep', () => {
    test('sin valor, solo la prescripción', () => {
        assert.equal(formatStep({ week: 1, sets: 3, reps: '5', metric: 'kg', value: null }), '3x5');
    });

    test('una sola serie no antepone "1x"', () => {
        assert.equal(formatStep({ week: 1, sets: 1, reps: '1', metric: 'percent', value: 90 }), '1 · 90%');
    });
});
