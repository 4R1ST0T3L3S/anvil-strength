/**
 * PRUEBAS DE LA COMPARACIÓN SEMANA ANTERIOR vs SIGUIENTE
 * =====================================================================
 * Lo que se fija: el % es contra CERO da null (no Infinity ni un número
 * inventado), y la distancia al objetivo tiene el signo correcto.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareWeeks, distanceToTargetLoad } from './weekComparison';
import type { ExerciseWeekSummary } from './liftSummary';

function summary(over: Partial<ExerciseWeekSummary> = {}): ExerciseWeekSummary {
    return {
        exerciseName: 'Sentadilla',
        sets: 10,
        reps: 40,
        tonnage: 8200,
        frequency: 2,
        days: [],
        ...over,
    };
}

describe('compareWeeks', () => {
    test('el ejemplo del encargo: series +20%, reps -10%, tonelaje +7,3%', () => {
        const prev = summary({ sets: 10, reps: 40, tonnage: 8200 });
        const next = summary({ sets: 12, reps: 36, tonnage: 8800 });
        const rows = compareWeeks(prev, next);

        assert.equal(rows.find(r => r.label === 'Series')!.deltaPct, 20);
        assert.equal(rows.find(r => r.label === 'Repeticiones')!.deltaPct, -10);
        assert.equal(rows.find(r => r.label === 'Tonelaje')!.deltaPct, 7.3);
    });

    test('anterior en cero da null, no Infinity', () => {
        const prev = summary({ sets: 0 });
        const next = summary({ sets: 5 });
        const rows = compareWeeks(prev, next);
        assert.equal(rows.find(r => r.label === 'Series')!.deltaPct, null);
    });

    test('sin ningún dato de intensidad en ninguna semana, no aparecen esas filas', () => {
        const prev = summary({ days: [] });
        const next = summary({ days: [] });
        const rows = compareWeeks(prev, next);
        assert.equal(rows.some(r => r.label.startsWith('Intensidad')), false);
    });

    test('intensidad top set: el máximo de la semana, no una media', () => {
        const prev = summary({
            days: [
                { sessionId: 'a', dayLabel: 'Lunes', order: 1, sets: 3, reps: 15, detail: '', topLoad: 200, topIntensity: 80 },
                { sessionId: 'b', dayLabel: 'Jueves', order: 4, sets: 3, reps: 9, detail: '', topLoad: 220, topIntensity: 88 },
            ],
        });
        const next = summary({ days: [] });
        const rows = compareWeeks(prev, next);
        assert.equal(rows.find(r => r.label === 'Intensidad (top set)')!.previous, 88);
        assert.equal(rows.find(r => r.label === 'Intensidad (media)')!.previous, 84);
    });
});

describe('distanceToTargetLoad', () => {
    test('el ejemplo del encargo: 255 contra un objetivo de 270 es -5,6%', () => {
        const s = summary({
            days: [{ sessionId: 'a', dayLabel: 'Lunes', order: 1, sets: 5, reps: 25, detail: '', topLoad: 255, topIntensity: null }],
        });
        assert.equal(distanceToTargetLoad(s, 270), -5.6);
    });

    test('por encima del objetivo da positivo', () => {
        const s = summary({
            days: [{ sessionId: 'a', dayLabel: 'Lunes', order: 1, sets: 5, reps: 25, detail: '', topLoad: 280, topIntensity: null }],
        });
        assert.equal(distanceToTargetLoad(s, 270) as number > 0, true);
    });

    test('sin ninguna carga programada esa semana, null y no un cero engañoso', () => {
        const s = summary({ days: [] });
        assert.equal(distanceToTargetLoad(s, 270), null);
    });
});
