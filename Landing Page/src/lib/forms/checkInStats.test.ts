/**
 * PRUEBAS DE LOS CUESTIONARIOS
 * =====================================================================
 * Las dos que justifican el fichero entero:
 *
 *   · un diario y un semanal NUNCA acaban en la misma serie;
 *   · "pasos" y "sueño" NUNCA comparten eje Y.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
// Solo TIPOS de `formsService`: un import de valor arrastraria el cliente
// de Supabase y el banco no arrancaria fuera del empaquetador.
import type { FormResponse, FormAnswer } from '../../services/formsService';
import { summarizeCheckIns } from './checkInStats';

let n = 0;

function answer(id: string, value: number | string, extra: Partial<FormAnswer> = {}): FormAnswer {
    return { id, label: id, qtype: 'number', value, ...extra } as FormAnswer;
}

function response(type: 'daily' | 'weekly', periodKey: string, answers: FormAnswer[]): FormResponse {
    n += 1;
    return {
        id: `r${n}`,
        athlete_id: 'a1',
        type,
        period_key: periodKey,
        answers,
        created_at: '2026-08-01T00:00:00Z',
    };
}

describe('summarizeCheckIns — diarios y semanales, separados', () => {
    test('pedir los diarios NO devuelve ni un punto de los semanales', () => {
        // EL FALLO ORIGINAL. Con los dos tipos mezclados y ordenados por
        // period_key como texto, '2026-08-02' iba antes que '2026-W31'
        // (porque '0' < 'W'), asi que salian todos los dias del año y
        // despues todas las semanas, seguidos. El eje X no significaba nada.
        const mixed = [
            response('daily', '2026-08-02', [answer('sleep', 7, { qtype: 'scale' })]),
            response('weekly', '2026-W31', [answer('steps', 9000)]),
            response('daily', '2026-08-03', [answer('sleep', 8, { qtype: 'scale' })]),
        ];

        const daily = summarizeCheckIns(mixed, 'daily');
        const weekly = summarizeCheckIns(mixed, 'weekly');

        assert.equal(daily.points.length, 2);
        assert.equal(daily.responseCount, 2);
        assert.equal(weekly.points.length, 1);
        assert.deepEqual(daily.points.map(p => p.periodKey), ['2026-08-02', '2026-08-03']);
    });

    test('los diarios salen en orden cronologico', () => {
        const out = summarizeCheckIns([
            response('daily', '2026-08-10', [answer('sleep', 5, { qtype: 'scale' })]),
            response('daily', '2026-07-02', [answer('sleep', 6, { qtype: 'scale' })]),
            response('daily', '2026-08-02', [answer('sleep', 7, { qtype: 'scale' })]),
        ], 'daily');

        assert.deepEqual(out.points.map(p => p.periodKey), ['2026-07-02', '2026-08-02', '2026-08-10']);
    });

    test('las semanas con relleno de ceros ordenan bien', () => {
        // 'W09' antes que 'W31' exige el padStart que pone getPeriodKey.
        const out = summarizeCheckIns([
            response('weekly', '2026-W31', [answer('steps', 1)]),
            response('weekly', '2026-W09', [answer('steps', 2)]),
        ], 'weekly');

        assert.deepEqual(out.points.map(p => p.periodKey), ['2026-W09', '2026-W31']);
    });

    test('las etiquetas del eje son cortas y las del tooltip completas', () => {
        const daily = summarizeCheckIns([
            response('daily', '2026-08-02', [answer('sleep', 7, { qtype: 'scale' })]),
        ], 'daily');
        const weekly = summarizeCheckIns([
            response('weekly', '2026-W31', [answer('steps', 9000)]),
        ], 'weekly');

        assert.equal(daily.points[0].label, '02/08');
        assert.equal(weekly.points[0].label, 'S31');
        assert.ok(String(daily.points[0].fullLabel).includes('agosto'));
    });
});

describe('summarizeCheckIns — una grafica por familia de escala', () => {
    test('pasos y sueño NO comparten eje', () => {
        // El segundo fallo: con un eje comun, 9.000 estira la escala y el
        // 7 del sueño queda pegado al suelo.
        const out = summarizeCheckIns([
            response('weekly', '2026-W31', [
                answer('sleep', 7, { qtype: 'scale' }),
                answer('steps', 9000),
            ]),
            response('weekly', '2026-W32', [
                answer('sleep', 8, { qtype: 'scale' }),
                answer('steps', 9500),
            ]),
        ], 'weekly');

        assert.equal(out.groups.length, 2);
        const axes = out.groups.map(g => g.axis);
        assert.ok(axes.includes('scale10'));
        assert.ok(axes.includes('count'));
    });

    test('las escalas 1-10 SI comparten grafica entre ellas', () => {
        const out = summarizeCheckIns([
            response('daily', '2026-08-02', [
                answer('sleep', 7, { qtype: 'scale' }),
                answer('stress', 4, { qtype: 'scale' }),
                answer('soreness', 3, { qtype: 'scale' }),
            ]),
        ], 'daily');

        assert.equal(out.groups.length, 1);
        assert.equal(out.groups[0].axis, 'scale10');
        assert.equal(out.groups[0].series.length, 3);
        assert.deepEqual(out.groups[0].domain, [0, 10]);
    });

    test('cada pregunta sin clasificar se lleva su PROPIA grafica', () => {
        // Nunca se juntan dos magnitudes desconocidas en el mismo eje.
        const out = summarizeCheckIns([
            response('weekly', '2026-W31', [
                answer('vo2', 52),
                answer('hrv', 68),
            ]),
        ], 'weekly');

        assert.equal(out.groups.length, 2);
        assert.ok(out.groups.every(g => g.axis === 'custom'));
        assert.ok(out.groups.every(g => g.series.length === 1));
    });

    test('una grafica de una sola pregunta se titula con la pregunta', () => {
        const out = summarizeCheckIns([
            response('weekly', '2026-W31', [answer('vo2', 52, { label: 'VO2 max' })]),
        ], 'weekly');

        assert.equal(out.groups[0].label, 'VO2 max');
    });

    test('el color de una serie depende solo de su id', () => {
        // Añadir una pregunta no le cambia el color a las demas.
        const one = summarizeCheckIns([
            response('daily', '2026-08-02', [answer('sleep', 7, { qtype: 'scale' })]),
        ], 'daily');
        const two = summarizeCheckIns([
            response('daily', '2026-08-02', [
                answer('nueva', 1, { qtype: 'scale' }),
                answer('sleep', 7, { qtype: 'scale' }),
            ]),
        ], 'daily');

        const colorOf = (s: ReturnType<typeof summarizeCheckIns>, id: string) =>
            s.groups.flatMap(g => g.series).find(x => x.id === id)!.color;

        assert.equal(colorOf(one, 'sleep'), colorOf(two, 'sleep'));
    });
});

describe('summarizeCheckIns — texto libre', () => {
    test('los comentarios se listan aparte, del mas reciente al mas antiguo', () => {
        const out = summarizeCheckIns([
            response('daily', '2026-08-02', [answer('comment', 'mal dia', { qtype: 'text' })]),
            response('daily', '2026-08-03', [answer('comment', 'mejor', { qtype: 'text' })]),
        ], 'daily');

        assert.deepEqual(out.comments.map(c => c.text), ['mejor', 'mal dia']);
    });

    test('el texto libre no genera ninguna serie', () => {
        const out = summarizeCheckIns([
            response('daily', '2026-08-02', [answer('comment', 'algo', { qtype: 'text' })]),
        ], 'daily');

        assert.equal(out.groups.length, 0);
    });

    test('un comentario vacio no se lista', () => {
        const out = summarizeCheckIns([
            response('daily', '2026-08-02', [answer('comment', '   ', { qtype: 'text' })]),
        ], 'daily');

        assert.equal(out.comments.length, 0);
    });

    test('sin respuestas no revienta', () => {
        const out = summarizeCheckIns([], 'daily');
        assert.deepEqual(out.points, []);
        assert.deepEqual(out.groups, []);
        assert.equal(out.responseCount, 0);
    });
});
