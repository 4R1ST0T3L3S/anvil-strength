/**
 * PRUEBAS DE LAS ESTADÍSTICAS DE ACCESORIOS
 * =====================================================================
 *
 * Lo que se fija:
 *
 *   1. VOLUMEN = series × repeticiones. NO tonelaje. Es la decisión que más
 *      fácil sería "corregir" por error, así que va con test.
 *   2. Lo no clasificado NO se reparte: se cuenta aparte y se dice.
 *   3. Básicos y accesorios son COMPLEMENTARIOS: ninguna serie se cuenta dos
 *      veces ni se pierde entre los dos módulos.
 *   4. El RPE se pondera por series, no es una media simple.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VolumeSessionInput } from '../volume/engine';
import type { TrainingSet, AccessoryClass } from '../../types/training';
import { accessoryReport, compareAccessoryWeeks } from './accessoryStats';
import { weeklyLiftSummary } from './liftSummary';

// ---------------------------------------------------------------------

let n = 0;

function set(targetReps: string, load: number | null = null, rpe: string | null = null): TrainingSet {
    n += 1;
    return {
        id: `s${n}`,
        session_exercise_id: 'se',
        order_index: n,
        target_reps: targetReps,
        target_load: load,
        target_metric: 'kg',
        target_rpe: rpe,
        is_video_required: false,
        created_at: '',
    } as unknown as TrainingSet;
}

function session(
    week: number,
    exercises: { name: string; cls?: AccessoryClass | null; sets: TrainingSet[] }[]
): VolumeSessionInput {
    n += 1;
    return {
        id: `sess-${week}-${n}`,
        week_number: week,
        day_number: 1,
        exercises: exercises.map((e, i) => ({
            id: `ex-${n}-${i}`,
            exercise: { name: e.name, muscle_group: null, primary_muscles: null, secondary_muscles: null },
            accessory_class: e.cls ?? null,
            sets: e.sets,
        })),
    } as unknown as VolumeSessionInput;
}

const bucket = (r: ReturnType<typeof accessoryReport>, key: AccessoryClass) =>
    r.buckets.find(b => b.key === key);

// =====================================================================

describe('accessoryReport — VOLUMEN es series × reps, no tonelaje', () => {
    test('4x10 son 40 de volumen, aunque el peso sea 100 kg', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Remo con Barra', cls: 'acc_dl', sets: [set('4x10', 100)] }]),
        ]);
        const b = bucket(r, 'acc_dl')!;
        assert.equal(b.sets, 4);
        assert.equal(b.volume, 40);
        // El tonelaje se calcula, pero NO es el volumen.
        assert.equal(b.tonnage, 4000);
        assert.notEqual(b.volume, b.tonnage);
    });

    test('dos ejercicios con pesos muy distintos y el mismo volumen', () => {
        const r = accessoryReport([
            session(10, [
                { name: 'Face Pull', cls: 'compensatorio', sets: [set('4x12', 15)] },
                { name: 'Remo en Polea', cls: 'acc_dl', sets: [set('4x12', 100)] },
            ]),
        ]);
        assert.equal(bucket(r, 'compensatorio')!.volume, 48);
        assert.equal(bucket(r, 'acc_dl')!.volume, 48);
    });

    test('un AMRAP suma la serie pero no el volumen, porque no se sabe', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Dominadas', cls: 'acc_bp', sets: [set('3xAMRAP')] }]),
        ]);
        const b = bucket(r, 'acc_bp')!;
        assert.equal(b.sets, 3);
        assert.equal(b.volume, 0);
    });
});

describe('accessoryReport — lo no clasificado se dice, no se reparte', () => {
    test('un accesorio sin categoría va a unclassified', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Curl de Bíceps', cls: null, sets: [set('3x12', 20)] }]),
        ]);
        assert.equal(r.buckets.length, 0);
        assert.equal(r.unclassified.sets, 3);
        assert.equal(r.unclassified.volume, 36);
        assert.deepEqual(r.unclassified.exercises, ['Curl de Bíceps']);
    });

    test('las series sin clasificar SÍ cuentan en el total', () => {
        const r = accessoryReport([
            session(10, [
                { name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80)] },
                { name: 'Curl', cls: null, sets: [set('3x12', 20)] },
            ]),
        ]);
        assert.equal(r.totalSets, 7);
        assert.equal(bucket(r, 'acc_dl')!.sets, 4);
        assert.equal(r.unclassified.sets, 3);
    });

    test('no repite el nombre de un ejercicio que aparece varias veces', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Curl', cls: null, sets: [set('3x12'), set('2x10')] }]),
        ]);
        assert.deepEqual(r.unclassified.exercises, ['Curl']);
    });
});

describe('accessoryReport — básicos y accesorios son complementarios', () => {
    const sessions = [
        session(10, [
            { name: 'Sentadilla', sets: [set('4x5', 150)] },
            { name: 'Press Banca', sets: [set('5x5', 100)] },
            { name: 'Sentadilla Búlgara', cls: 'acc_sq', sets: [set('3x10', 40)] },
            { name: 'Extensión de Tríceps', cls: 'acc_bp', sets: [set('4x12', 25)] },
        ]),
    ];

    test('los tres básicos NO entran en el reparto de accesorios', () => {
        const r = accessoryReport(sessions);
        assert.equal(r.totalSets, 7); // 3 búlgara + 4 tríceps
        assert.equal(bucket(r, 'acc_sq')!.sets, 3);
        assert.equal(bucket(r, 'acc_bp')!.sets, 4);
    });

    test('ninguna serie se pierde ni se cuenta dos veces', () => {
        const lifts = weeklyLiftSummary(sessions, 10);
        const mainSets = lifts.reduce((sum, l) => sum + l.sets, 0);
        const accSets = accessoryReport(sessions, [10]).totalSets;
        assert.equal(mainSets, 9);  // 4 sentadilla + 5 banca
        assert.equal(accSets, 7);
        assert.equal(mainSets + accSets, 16); // el total programado
    });

    test('el criterio del coach gana al nombre', () => {
        // "Sentadilla Pin" es una variante de competición y por nombre sería
        // SQ. Si el coach la marca como acc_sq, para él es trabajo de apoyo.
        const r = accessoryReport([
            session(10, [{ name: 'Sentadilla Pin', cls: 'acc_sq', sets: [set('3x3', 140)] }]),
        ]);
        assert.equal(bucket(r, 'acc_sq')!.sets, 3);
    });
});

describe('accessoryReport — el RPE se pondera por series', () => {
    test('4 series a RPE 8 y 1 a RPE 6 dan 7,6, no 7', () => {
        const r = accessoryReport([
            session(10, [
                { name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80, '8'), set('1x10', 60, '6')] },
            ]),
        ]);
        // (8*4 + 6*1) / 5 = 7,6
        assert.equal(bucket(r, 'acc_dl')!.rpe, 7.6);
    });

    test('sin RPE prescrito, null — no se inventa', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80)] }]),
        ]);
        assert.equal(bucket(r, 'acc_dl')!.rpe, null);
    });

    test('un rango "7-8" se lee por el extremo alto', () => {
        const r = accessoryReport([
            session(10, [{ name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80, '7-8')] }]),
        ]);
        assert.equal(bucket(r, 'acc_dl')!.rpe, 8);
    });
});

describe('accessoryReport — ámbito', () => {
    test('acota a las semanas pedidas', () => {
        const sessions = [
            session(10, [{ name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80)] }]),
            session(11, [{ name: 'Remo', cls: 'acc_dl', sets: [set('6x10', 80)] }]),
        ];
        assert.equal(accessoryReport(sessions, [10]).totalSets, 4);
        assert.equal(accessoryReport(sessions, [11]).totalSets, 6);
        assert.equal(accessoryReport(sessions, [10, 11]).totalSets, 10);
        assert.equal(accessoryReport(sessions).totalSets, 10); // sin filtro = todo
    });

    test('el orden de las categorías es fijo, no por volumen', () => {
        const r = accessoryReport([
            session(10, [
                { name: 'Curl', cls: 'compensatorio', sets: [set('10x10', 20)] },
                { name: 'Remo', cls: 'acc_sq', sets: [set('1x10', 80)] },
            ]),
        ]);
        // acc_sq va antes que compensatorio aunque tenga muchísimo menos.
        assert.deepEqual(r.buckets.map(b => b.key), ['acc_sq', 'compensatorio']);
    });
});

describe('compareAccessoryWeeks', () => {
    const sessions = [
        session(11, [{ name: 'Remo', cls: 'acc_dl', sets: [set('8x12', 80, '7')] }]),
        session(12, [{ name: 'Remo', cls: 'acc_dl', sets: [set('6x12', 85, '8')] }]),
    ];

    test('enseña actual, anterior, volumen anterior y RPE pautado', () => {
        const rows = compareAccessoryWeeks(sessions, 12, 11);
        const dl = rows.find(r => r.key === 'acc_dl')!;
        assert.equal(dl.currentSets, 6);
        assert.equal(dl.previousSets, 8);
        assert.equal(dl.previousVolume, 96); // 8 × 12
        assert.equal(dl.rpe, 8);             // el de ESTA semana
        assert.equal(dl.delta, -2);
    });

    test('una categoría que DESAPARECE esta semana sigue apareciendo', () => {
        const s = [
            session(11, [{ name: 'Face Pull', cls: 'compensatorio', sets: [set('4x15', 15)] }]),
            session(12, [{ name: 'Remo', cls: 'acc_dl', sets: [set('4x10', 80)] }]),
        ];
        const rows = compareAccessoryWeeks(s, 12, 11);
        const comp = rows.find(r => r.key === 'compensatorio')!;
        assert.equal(comp.currentSets, 0);
        assert.equal(comp.previousSets, 4);
        assert.equal(comp.delta, -4);
    });

    test('una categoría nueva tiene delta positivo igual a sus series', () => {
        const s = [session(12, [{ name: 'Remo', cls: 'acc_dl', sets: [set('5x10', 80)] }])];
        const rows = compareAccessoryWeeks(s, 12, 11);
        assert.equal(rows.find(r => r.key === 'acc_dl')!.delta, 5);
    });
});
