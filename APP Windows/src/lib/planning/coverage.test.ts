/**
 * PRUEBAS DE LA COBERTURA DE PROGRAMACIÓN
 * =====================================================================
 *
 * El foco está en los dos casos que rompen el calendario y que NO se ven
 * mirando la pantalla porque solo aparecen unas semanas al año:
 *
 *   1. Un bloque que cruza el fin de año (semana 50 → semana 3).
 *   2. Un bloque sin `start_date`, que NO se puede situar y no se estima.
 *
 * El resto de pruebas fijan que "programado" y "programado con contenido" son
 * cosas distintas: un bloque de 8 semanas con 3 escritas deja al atleta sin
 * nada en la semana 4, y ese es justo el hueco que hay que ver.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveBlockSpan,
    buildAthleteCoverage,
    macroSpans,
    monthsBetween,
    positionInAxis,
    weeksInISOYear,
    blockYearOf,
    parseYmd,
    ymd,
    daysBetween,
    addDays,
    sessionDate,
    type CoverageBlockInput,
    type CoverageSessionInput,
    type CoverageCompetitionInput,
} from './coverage';

// ---------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------

function block(over: Partial<CoverageBlockInput> = {}): CoverageBlockInput {
    return {
        id: 'b1',
        athlete_id: 'a1',
        name: 'Fuerza',
        start_week: 10,
        end_week: 13,
        start_date: '2026-03-02',
        is_active: true,
        color: '#ef4444',
        macro_id: null,
        ...over,
    };
}

function session(
    blockId: string,
    week: number,
    exerciseCount: number
): CoverageSessionInput {
    return {
        id: `s-${blockId}-${week}-${exerciseCount}`,
        block_id: blockId,
        week_number: week,
        day_number: 1,
        day_of_week: 'monday',
        exerciseCount,
    };
}

// =====================================================================

describe('parseYmd / ymd — hora local, nunca UTC', () => {
    test('no se desplaza un día al parsear', () => {
        const d = parseYmd('2026-03-01')!;
        assert.equal(d.getFullYear(), 2026);
        assert.equal(d.getMonth(), 2);
        assert.equal(d.getDate(), 1);
    });

    test('ida y vuelta estable', () => {
        assert.equal(ymd(parseYmd('2026-12-31')!), '2026-12-31');
    });

    test('devuelve null ante basura en vez de una fecha inválida', () => {
        assert.equal(parseYmd('no-es-fecha'), null);
    });
});

describe('weeksInISOYear', () => {
    test('2026 tiene 53 semanas (1 de enero en jueves)', () => {
        assert.equal(new Date(2026, 0, 1).getDay(), 4);
        assert.equal(weeksInISOYear(2026), 53);
    });

    test('2027 tiene 52', () => {
        assert.equal(weeksInISOYear(2027), 52);
    });
});

describe('blockYearOf', () => {
    test('sale de start_date', () => {
        assert.equal(blockYearOf(block({ start_date: '2025-11-03' })), 2025);
    });

    test('NULL sin start_date — no se adivina el año en curso', () => {
        assert.equal(blockYearOf(block({ start_date: null })), null);
    });
});

// =====================================================================

describe('resolveBlockSpan — caso normal', () => {
    test('4 semanas dan 4 lunes y termina un domingo', () => {
        const r = resolveBlockSpan(block({ start_week: 10, end_week: 13 }));
        assert.ok('span' in r);
        const span = (r as { span: ReturnType<typeof Object> }).span as never as {
            weeks: { week: number; year: number; monday: Date }[];
            from: Date; to: Date;
        };

        assert.equal(span.weeks.length, 4);
        assert.deepEqual(span.weeks.map(w => w.week), [10, 11, 12, 13]);
        // Todas del mismo año y todas lunes.
        assert.ok(span.weeks.every(w => w.year === 2026));
        assert.ok(span.weeks.every(w => w.monday.getDay() === 1));
        // El final es el domingo de la última: 6 días después de su lunes.
        assert.equal(daysBetween(span.weeks[3].monday, span.to), 6);
        assert.equal(span.to.getDay(), 0);
        assert.equal(daysBetween(span.from, span.to), 27); // 4 semanas
    });
});

describe('resolveBlockSpan — EL CRUCE DE AÑO', () => {
    test('semana 50 → 3 son 7 semanas, no un rango negativo', () => {
        // 2026 tiene 53 semanas: 50, 51, 52, 53 + 1, 2, 3 = 7.
        const r = resolveBlockSpan(
            block({ start_week: 50, end_week: 3, start_date: '2026-12-07' })
        );
        assert.ok('span' in r);
        const span = (r as never as { span: { weeks: { week: number; year: number }[]; from: Date; to: Date } }).span;

        assert.equal(span.weeks.length, 7);
        assert.deepEqual(span.weeks.map(w => w.week), [50, 51, 52, 53, 1, 2, 3]);
        assert.deepEqual(
            span.weeks.map(w => w.year),
            [2026, 2026, 2026, 2026, 2027, 2027, 2027]
        );
        // Y el intervalo avanza en el tiempo, que es lo que fallaba.
        assert.ok(span.to.getTime() > span.from.getTime());
        assert.equal(daysBetween(span.from, span.to), 48); // 7 semanas - 1
    });

    test('el año siguiente se respeta al numerar las semanas', () => {
        // 2027 tiene 52: un bloque 51 → 2 de 2027 pasa por 51, 52, 1, 2.
        const r = resolveBlockSpan(
            block({ start_week: 51, end_week: 2, start_date: '2027-12-20' })
        );
        assert.ok('span' in r);
        const span = (r as never as { span: { weeks: { week: number; year: number }[] } }).span;
        assert.deepEqual(span.weeks.map(w => w.week), [51, 52, 1, 2]);
        assert.deepEqual(span.weeks.map(w => w.year), [2027, 2027, 2028, 2028]);
    });
});

describe('resolveBlockSpan — NUNCA INVENTA UNA FECHA', () => {
    test('sin start_date sale por undated con su motivo', () => {
        const r = resolveBlockSpan(block({ start_date: null }));
        assert.ok('undated' in r);
        const u = (r as never as { undated: { reason: string; blockId: string } }).undated;
        assert.equal(u.blockId, 'b1');
        assert.match(u.reason, /fecha de inicio/i);
    });

    test('sin semanas declaradas tampoco se sitúa', () => {
        const r = resolveBlockSpan(block({ start_week: null }));
        assert.ok('undated' in r);
    });

    test('un rango absurdo se recorta en vez de generar miles de casillas', () => {
        const r = resolveBlockSpan(block({ start_week: 1, end_week: 53, start_date: '2026-01-05' }));
        assert.ok('span' in r);
        const span = (r as never as { span: { weeks: unknown[] } }).span;
        assert.ok(span.weeks.length <= 104);
    });
});

describe('resolveBlockSpan — programado NO es lo mismo que con contenido', () => {
    test('las semanas sin ejercicios salen en emptyWeeks', () => {
        const b = block({ start_week: 10, end_week: 13 });
        const sessions = [
            session('b1', 10, 4),
            session('b1', 11, 3),
            session('b1', 12, 0), // día creado y vacío
        ];
        const r = resolveBlockSpan(b, sessions);
        assert.ok('span' in r);
        const span = (r as never as { span: { emptyWeeks: number[]; hasContent: boolean } }).span;

        assert.deepEqual(span.emptyWeeks, [12, 13]);
        assert.equal(span.hasContent, true);
    });

    test('un bloque entero sin ejercicios no tiene contenido', () => {
        const r = resolveBlockSpan(block(), [session('b1', 10, 0)]);
        assert.ok('span' in r);
        const span = (r as never as { span: { hasContent: boolean } }).span;
        assert.equal(span.hasContent, false);
    });

    test('las sesiones de OTRO bloque no cuentan', () => {
        const r = resolveBlockSpan(block(), [session('b2', 10, 5)]);
        assert.ok('span' in r);
        const span = (r as never as { span: { hasContent: boolean } }).span;
        assert.equal(span.hasContent, false);
    });
});

// =====================================================================

describe('buildAthleteCoverage — huecos', () => {
    const horizon = new Date(2026, 11, 31);

    test('detecta el hueco entre dos bloques', () => {
        const blocks = [
            block({ id: 'b1', start_week: 10, end_week: 13, start_date: '2026-03-02' }),
            block({ id: 'b2', start_week: 16, end_week: 19, start_date: '2026-04-13' }),
        ];
        const cov = buildAthleteCoverage('a1', blocks, [], [], horizon);

        // Dos bloques → un hueco intermedio + el hueco abierto del final.
        assert.equal(cov.spans.length, 2);
        const between = cov.gaps.filter(g => g.to !== null);
        assert.equal(between.length, 1);
        assert.equal(between[0].days, 14); // semanas 14 y 15
    });

    test('bloques consecutivos NO generan hueco', () => {
        const blocks = [
            block({ id: 'b1', start_week: 10, end_week: 13, start_date: '2026-03-02' }),
            block({ id: 'b2', start_week: 14, end_week: 17, start_date: '2026-03-30' }),
        ];
        const cov = buildAthleteCoverage('a1', blocks, [], [], horizon);
        assert.equal(cov.gaps.filter(g => g.to !== null).length, 0);
    });

    test('el último bloque deja un hueco ABIERTO hasta el horizonte', () => {
        const cov = buildAthleteCoverage('a1', [block()], [], [], horizon);
        const open = cov.gaps.find(g => g.to === null);
        assert.ok(open, 'debe haber un hueco abierto tras el último bloque');
        assert.equal(open!.days, null);
    });

    test('no hay hueco ANTES del primer bloque', () => {
        const cov = buildAthleteCoverage('a1', [block()], [], [], horizon);
        assert.ok(cov.gaps.every(g => g.from.getTime() >= cov.spans[0].to.getTime()));
    });

    test('coveredUntil es el final del último bloque', () => {
        const cov = buildAthleteCoverage('a1', [block()], [], [], horizon);
        assert.equal(ymd(cov.coveredUntil!), ymd(cov.spans[0].to));
    });

    test('sin ningún bloque fechado, coveredUntil es null y no hay huecos', () => {
        const cov = buildAthleteCoverage('a1', [block({ start_date: null })], [], [], horizon);
        assert.equal(cov.coveredUntil, null);
        assert.equal(cov.gaps.length, 0);
        assert.equal(cov.undated.length, 1);
    });

    test('solo mira los bloques y competiciones de ESE atleta', () => {
        const blocks = [block({ id: 'b1' }), block({ id: 'b2', athlete_id: 'a2' })];
        const comps: CoverageCompetitionInput[] = [
            { id: 'c1', athlete_id: 'a1', name: 'Regional', date: '2026-05-10' },
            { id: 'c2', athlete_id: 'a2', name: 'Nacional', date: '2026-05-10' },
        ];
        const cov = buildAthleteCoverage('a1', blocks, [], comps, horizon);
        assert.equal(cov.spans.length, 1);
        assert.equal(cov.competitions.length, 1);
        assert.equal(cov.competitions[0].id, 'c1');
    });
});

// =====================================================================

describe('macroSpans — derivados de sus bloques, nunca inventados', () => {
    const horizon = new Date(2026, 11, 31);

    test('el macro abarca de su primer bloque al último', () => {
        const blocks = [
            block({ id: 'b1', macro_id: 'm1', start_week: 10, end_week: 13, start_date: '2026-03-02' }),
            block({ id: 'b2', macro_id: 'm1', start_week: 14, end_week: 17, start_date: '2026-03-30' }),
        ];
        const cov = buildAthleteCoverage('a1', blocks, [], [], horizon);
        const macros = macroSpans([{ id: 'm1', name: 'Camino al Nacional' }], cov.spans);

        assert.equal(macros.length, 1);
        assert.equal(macros[0].blockIds.length, 2);
        assert.equal(ymd(macros[0].from), ymd(cov.spans[0].from));
        assert.equal(ymd(macros[0].to), ymd(cov.spans[1].to));
    });

    test('un macro cuyos bloques no se pueden situar NO aparece', () => {
        const blocks = [block({ id: 'b1', macro_id: 'm1', start_date: null })];
        const cov = buildAthleteCoverage('a1', blocks, [], [], horizon);
        assert.equal(macroSpans([{ id: 'm1', name: 'Sin fechar' }], cov.spans).length, 0);
    });
});

// =====================================================================

describe('monthsBetween', () => {
    test('incluye el mes de inicio y el de fin', () => {
        const m = monthsBetween(new Date(2026, 2, 15), new Date(2026, 5, 3));
        assert.equal(m.length, 4); // marzo, abril, mayo, junio
        assert.equal(m[0].month, 2);
        assert.equal(m[3].month, 5);
    });

    test('cruza el año', () => {
        const m = monthsBetween(new Date(2026, 10, 1), new Date(2027, 1, 1));
        assert.deepEqual(m.map(x => `${x.year}-${x.month}`), ['2026-10', '2026-11', '2027-0', '2027-1']);
    });

    test('un solo mes cuando las dos fechas caen dentro', () => {
        assert.equal(monthsBetween(new Date(2026, 4, 2), new Date(2026, 4, 28)).length, 1);
    });

    test('días correctos en febrero bisiesto', () => {
        const feb = monthsBetween(new Date(2028, 1, 1), new Date(2028, 1, 1))[0];
        assert.equal(feb.days, 29);
    });
});

describe('positionInAxis', () => {
    const axisStart = new Date(2026, 0, 1);
    const axisEnd = new Date(2026, 0, 10); // 10 días

    test('un intervalo que ocupa el eje entero mide 100%', () => {
        const p = positionInAxis(axisStart, axisEnd, axisStart, axisEnd)!;
        assert.equal(p.left, 0);
        assert.equal(p.width, 100);
    });

    test('la mitad de atrás empieza al 50%', () => {
        const p = positionInAxis(new Date(2026, 0, 6), axisEnd, axisStart, axisEnd)!;
        assert.equal(p.left, 50);
        assert.equal(p.width, 50);
    });

    test('un intervalo que empieza antes del eje se recorta al borde', () => {
        const p = positionInAxis(new Date(2025, 11, 20), new Date(2026, 0, 5), axisStart, axisEnd)!;
        assert.equal(p.left, 0);
        assert.equal(p.width, 50);
    });

    test('completamente fuera del eje devuelve null', () => {
        assert.equal(positionInAxis(new Date(2025, 0, 1), new Date(2025, 0, 5), axisStart, axisEnd), null);
        assert.equal(positionInAxis(new Date(2027, 0, 1), new Date(2027, 0, 5), axisStart, axisEnd), null);
    });

    test('un hueco abierto (to = null) llega hasta el final del eje', () => {
        const p = positionInAxis(new Date(2026, 0, 6), null, axisStart, axisEnd)!;
        assert.equal(p.left, 50);
        assert.equal(p.width, 50);
    });
});

describe('addDays / daysBetween', () => {
    test('cruzan el cambio de mes', () => {
        assert.equal(ymd(addDays(new Date(2026, 0, 30), 3)), '2026-02-02');
    });

    test('daysBetween es simétrico con signo', () => {
        const a = new Date(2026, 0, 1);
        const b = new Date(2026, 0, 11);
        assert.equal(daysBetween(a, b), 10);
        assert.equal(daysBetween(b, a), -10);
    });
});

describe('sessionDate — la fecha real de una sesión', () => {
    test('lunes de la semana de inicio es el propio start_date', () => {
        const b = block(); // start_week 10, start_date 2026-03-02 (lunes)
        const { span } = resolveBlockSpan(b) as { span: import('./coverage').BlockSpan };
        const d = sessionDate({ week_number: 10, day_of_week: 'monday' }, span);
        assert.equal(d && ymd(d), '2026-03-02');
    });

    test('el viernes de la tercera semana cae seis días después del lunes de esa semana', () => {
        const b = block();
        const { span } = resolveBlockSpan(b) as { span: import('./coverage').BlockSpan };
        const monday3 = span.weeks.find(w => w.week === 12)!.monday;
        const d = sessionDate({ week_number: 12, day_of_week: 'friday' }, span);
        assert.equal(d && daysBetween(monday3, d), 4);
    });

    test('sin day_of_week no se inventa un día', () => {
        const b = block();
        const { span } = resolveBlockSpan(b) as { span: import('./coverage').BlockSpan };
        assert.equal(sessionDate({ week_number: 10, day_of_week: null }, span), null);
    });

    test('una semana fuera del span resuelto no se inventa', () => {
        const b = block();
        const { span } = resolveBlockSpan(b) as { span: import('./coverage').BlockSpan };
        assert.equal(sessionDate({ week_number: 45, day_of_week: 'monday' }, span), null);
    });

    test('domingo, el último día ISO, cae justo antes del lunes siguiente', () => {
        const b = block();
        const { span } = resolveBlockSpan(b) as { span: import('./coverage').BlockSpan };
        const monday10 = span.weeks.find(w => w.week === 10)!.monday;
        const sunday = sessionDate({ week_number: 10, day_of_week: 'sunday' }, span)!;
        assert.equal(daysBetween(monday10, sunday), 6);
    });
});
