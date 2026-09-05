/**
 * PRUEBAS DE LAS ESTADÍSTICAS DEL ATLETA
 * =====================================================================
 * Se ejecutan con `npm test`.
 *
 * Lo que se comprueba aquí, sobre todo, es que NINGUNA agregación semanal
 * mezcle bloques distintos. El `week_number` se reinicia en cada bloque, así
 * que agrupar por él a secas suma la semana 1 de enero con la semana 1 de
 * junio; era el fallo real, y estas pruebas existen para que no vuelva.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseHistoryRow } from '../../services/trainingService';
import type { TrainingSet } from '../../types/training';
import {
    summarize,
    weeklySeries,
    plannedVsActualWeekly,
    compareExercises,
    adherenceSeries,
    kgOf,
    repsOf,
} from './athleteStats';

// ---------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------

let setCounter = 0;

/** Serie EJECUTADA: el atleta registró carga y repeticiones. */
function done(load: number, reps: number, rpe: number | null = null): TrainingSet {
    setCounter += 1;
    return {
        id: `set-${setCounter}`,
        session_exercise_id: 'se',
        order_index: setCounter,
        target_reps: String(reps),
        target_load: load,
        target_metric: 'kg',
        actual_load: load,
        actual_reps: reps,
        actual_rpe: rpe,
        is_completed: true,
    } as TrainingSet;
}

/** Serie SOLO PAUTADA: programada, todavía sin registrar. */
function planned(load: number, reps: number): TrainingSet {
    setCounter += 1;
    return {
        id: `set-${setCounter}`,
        session_exercise_id: 'se',
        order_index: setCounter,
        target_reps: String(reps),
        target_load: load,
        target_metric: 'kg',
        is_completed: false,
    } as TrainingSet;
}

/** Serie medida en m/s: NO son kilos y no puede sumar tonelaje. */
function velocity(ms: number, reps: number): TrainingSet {
    setCounter += 1;
    return {
        id: `set-${setCounter}`,
        session_exercise_id: 'se',
        order_index: setCounter,
        target_reps: String(reps),
        target_load: ms,
        target_metric: 'ms',
    } as unknown as TrainingSet;
}

interface RowSpec {
    block: number;          // blockSequence
    week: number;
    day?: number;
    exercise?: string;
    sets: TrainingSet[];
}

function row(spec: RowSpec): ExerciseHistoryRow {
    const day = spec.day ?? 1;
    const exercise = spec.exercise ?? 'Sentadilla';
    return {
        sessionExerciseId: `se-${spec.block}-${spec.week}-${day}-${exercise}`,
        exerciseId: `ex-${exercise}`,
        exerciseName: exercise,
        variantName: null,
        blockId: `block-${spec.block}`,
        blockName: `Bloque ${spec.block + 1}`,
        blockSequence: spec.block,
        blockStartDate: null,
        blockCreatedAt: `2026-0${spec.block + 1}-01T00:00:00Z`,
        macroId: null,
        sessionId: `s-${spec.block}-${spec.week}-${day}`,
        weekNumber: spec.week,
        dayNumber: day,
        date: null,
        rpeGlobal: null,
        velocityAvg: null,
        primaryMuscles: null,
        secondaryMuscles: null,
        sets: spec.sets,
    };
}

// ---------------------------------------------------------------------

describe('lectores básicos', () => {
    test('kgOf da null cuando la serie no se mide en kilos', () => {
        // La regla que atraviesa el fichero: `target_load` no son siempre kg.
        assert.equal(kgOf(velocity(0.45, 3)), null);
    });

    test('kgOf prefiere lo registrado sobre lo pautado', () => {
        const s = { ...done(170, 5), actual_load: 172.5 } as TrainingSet;
        assert.equal(kgOf(s), 172.5);
    });

    test('repsOf lee "3x5" como 5 repeticiones, no como 3', () => {
        const s = { ...planned(100, 5), target_reps: '3x5' } as TrainingSet;
        assert.equal(repsOf(s), 5);
    });

    test('repsOf lee el extremo bajo de un rango', () => {
        const s = { ...planned(100, 5), target_reps: '5-6' } as TrainingSet;
        assert.equal(repsOf(s), 5);
    });
});

describe('weeklySeries — no mezcla bloques', () => {
    test('la semana 1 de dos bloques distintos son DOS puntos', () => {
        // EL FALLO ORIGINAL. Agrupando por `week_number` esto daba UN punto
        // de 2.000 kg; son dos semanas distintas del calendario.
        const history = [
            row({ block: 0, week: 1, sets: [done(100, 10)] }),   // 1.000 kg
            row({ block: 1, week: 1, sets: [done(100, 10)] }),   // 1.000 kg
        ];

        const series = weeklySeries(history);

        assert.equal(series.length, 2);
        assert.equal(series[0].tonnage, 1000);
        assert.equal(series[1].tonnage, 1000);
        assert.equal(series[0].blockId, 'block-0');
        assert.equal(series[1].blockId, 'block-1');
    });

    test('dentro del mismo bloque, la misma semana SÍ se suma', () => {
        const history = [
            row({ block: 0, week: 1, day: 1, sets: [done(100, 10)] }),
            row({ block: 0, week: 1, day: 2, sets: [done(100, 10)] }),
        ];

        const series = weeklySeries(history);

        assert.equal(series.length, 1);
        assert.equal(series[0].tonnage, 2000);
    });

    test('el orden es cronológico: bloque primero, semana después', () => {
        // Entran desordenadas a propósito.
        const history = [
            row({ block: 1, week: 1, sets: [done(100, 5)] }),
            row({ block: 0, week: 2, sets: [done(100, 5)] }),
            row({ block: 1, week: 2, sets: [done(100, 5)] }),
            row({ block: 0, week: 1, sets: [done(100, 5)] }),
        ];

        const series = weeklySeries(history);

        assert.deepEqual(
            series.map(p => [p.blockSequence, p.week]),
            [[0, 1], [0, 2], [1, 1], [1, 2]]
        );
    });

    test('con un solo bloque la etiqueta es corta', () => {
        const series = weeklySeries([row({ block: 0, week: 3, sets: [done(100, 5)] })]);
        assert.equal(series[0].label, 'S3');
    });

    test('con varios bloques la etiqueta distingue el bloque', () => {
        // Un eje que dijera "S1 S2 S1 S2" no se puede leer.
        const series = weeklySeries([
            row({ block: 0, week: 1, sets: [done(100, 5)] }),
            row({ block: 1, week: 1, sets: [done(100, 5)] }),
        ]);
        assert.deepEqual(series.map(p => p.label), ['B1·S1', 'B2·S1']);
    });

    test('el RPE medio se promedia sobre las series que lo tienen', () => {
        const series = weeklySeries([
            row({ block: 0, week: 1, sets: [done(100, 5, 8), done(100, 5, 9), done(100, 5)] }),
        ]);
        assert.equal(series[0].avgRpe, 8.5);
    });

    test('una serie en m/s no suma tonelaje pero sí cuenta como serie', () => {
        const series = weeklySeries([row({ block: 0, week: 1, sets: [velocity(0.45, 3)] })]);
        assert.equal(series[0].tonnage, 0);
        assert.equal(series[0].sets, 1);
    });
});

describe('plannedVsActualWeekly — no mezcla bloques', () => {
    test('la semana 1 de dos bloques son dos puntos', () => {
        const history = [
            row({ block: 0, week: 1, sets: [planned(100, 5)] }),
            row({ block: 1, week: 1, sets: [planned(120, 5)] }),
        ];

        const points = plannedVsActualWeekly(history);

        assert.equal(points.length, 2);
        assert.equal(points[0].plannedTonnage, 500);
        assert.equal(points[1].plannedTonnage, 600);
    });

    test('el plan aparece aunque no se haya ejecutado nada', () => {
        // La razón de que esta función exista: el coach programa la semana 6
        // y quiere verla dibujada antes de que nadie la entrene.
        const points = plannedVsActualWeekly([
            row({ block: 0, week: 6, sets: [planned(100, 5)] }),
        ]);
        assert.equal(points[0].plannedTonnage, 500);
        assert.equal(points[0].actualTonnage, null);
    });

    test('lo ejecutado y lo pautado son dos trazos independientes', () => {
        const history = [row({ block: 0, week: 1, sets: [done(110, 5), planned(100, 5)] })];
        const points = plannedVsActualWeekly(history);
        // `done` lleva prescripción Y registro, así que suma en los dos.
        assert.equal(points[0].plannedTonnage, 550 + 500);
        assert.equal(points[0].actualTonnage, 550);
    });
});

describe('compareExercises — no mezcla bloques', () => {
    test('compara el 1RM estimado de cada ejercicio por semana real', () => {
        const history = [
            row({ block: 0, week: 1, exercise: 'Sentadilla', sets: [done(100, 1)] }),
            row({ block: 0, week: 1, exercise: 'Press banca', sets: [done(80, 1)] }),
            row({ block: 1, week: 1, exercise: 'Sentadilla', sets: [done(110, 1)] }),
        ];

        const points = compareExercises(history, ['Sentadilla', 'Press banca']);

        assert.equal(points.length, 2);
        // A una repetición el 1RM es la carga, sin inflar. Ver oneRm.ts.
        assert.equal(points[0]['Sentadilla'], 100);
        assert.equal(points[0]['Press banca'], 80);
        assert.equal(points[1]['Sentadilla'], 110);
    });

    test('sin ejercicios que comparar devuelve vacío', () => {
        assert.deepEqual(compareExercises([row({ block: 0, week: 1, sets: [done(100, 5)] })], []), []);
    });
});

describe('adherenceSeries', () => {
    test('ordena por bloque antes que por semana', () => {
        const history = [
            row({ block: 1, week: 1, sets: [done(100, 5)] }),
            row({ block: 0, week: 5, sets: [done(100, 5)] }),
        ];

        const points = adherenceSeries(history);

        assert.deepEqual(points.map(p => p.blockSequence), [0, 1]);
    });

    test('solo entran las sesiones empezadas', () => {
        // Las semanas futuras están pautadas y sin tocar: arrastrarían la
        // media a cero por trabajo que todavía no tocaba hacer.
        const points = adherenceSeries([
            row({ block: 0, week: 1, sets: [planned(100, 5)] }),
        ]);
        assert.equal(points.length, 0);
    });

    test('mide cuánto del tonelaje prescrito se movió', () => {
        const half = { ...done(100, 5), actual_load: 50 } as TrainingSet;
        const points = adherenceSeries([row({ block: 0, week: 1, sets: [half] })]);
        assert.equal(points[0].loadPct, 50);
        assert.equal(points[0].completionPct, 100);
    });
});

describe('summarize', () => {
    test('cuenta semanas REALES, no el máximo del número de semana', () => {
        // Antes daba "Semanas 1–2" para esto, que son CUATRO semanas de
        // calendario repartidas en dos bloques.
        const history = [
            row({ block: 0, week: 1, sets: [done(100, 5)] }),
            row({ block: 0, week: 2, sets: [done(100, 5)] }),
            row({ block: 1, week: 1, sets: [done(100, 5)] }),
            row({ block: 1, week: 2, sets: [done(100, 5)] }),
        ];

        const s = summarize(history);

        assert.equal(s.weeksTracked, 4);
        assert.equal(s.blocksTracked, 2);
    });

    test('el tonelaje solo cuenta series en kilos', () => {
        const s = summarize([row({ block: 0, week: 1, sets: [done(100, 5), velocity(0.45, 3)] })]);
        assert.equal(s.tonnage, 500);
        assert.equal(s.totalSets, 2);
    });

    test('cuenta como duras las series a RPE 8 o más', () => {
        const s = summarize([
            row({ block: 0, week: 1, sets: [done(100, 5, 7), done(100, 5, 8), done(100, 5, 9.5)] }),
        ]);
        assert.equal(s.hardSets, 2);
    });

    test('un historial vacío no revienta ni inventa ceros', () => {
        const s = summarize([]);
        assert.equal(s.totalSessions, 0);
        assert.equal(s.weeksTracked, 0);
        assert.equal(s.blocksTracked, 0);
        assert.equal(s.avgRpe, null);
        assert.equal(s.avgIntensityPct, null);
    });
});
