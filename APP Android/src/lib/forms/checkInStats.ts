/**
 * CUESTIONARIOS — DE RESPUESTAS A GRÁFICAS
 * =====================================================================
 *
 * LOS DOS FALLOS QUE ARREGLA (decisión K9)
 *
 * 1. DIARIOS Y SEMANALES IBAN EN LA MISMA GRÁFICA.
 *
 *    Se pedían las respuestas SIN filtrar por tipo, así que llegaban las de
 *    los dos cuestionarios, y se ordenaban comparando `period_key` como
 *    texto. Pero un diario es '2026-08-02' y un semanal es '2026-W31': como
 *    '0' va antes que 'W', salían PRIMERO todos los días del año y DESPUÉS
 *    todas las semanas, seguidos. El eje X no significaba nada.
 *
 *    Ahora cada tipo tiene su gráfica y su selector. La granularidad la
 *    elige quien mira.
 *
 *    (Había un segundo efecto, más silencioso: la consulta traía 60
 *    respuestas EN TOTAL. Un atleta que rellena el diario cada día se comía
 *    las 60 con dos meses de diarios, y sus cuestionarios SEMANALES no
 *    llegaban nunca a la gráfica. Ahora se piden por separado.)
 *
 * 2. UN SOLO EJE Y PARA TODO.
 *
 *    "Media de pasos" vale 9.000 y "¿Cómo has dormido?" vale 7. Con un eje
 *    común la escala se estira hasta 9.000 y el sueño, el dolor y el estrés
 *    quedan pegados al suelo. Ahora va UNA GRÁFICA POR FAMILIA DE ESCALA,
 *    resuelta por `src/lib/forms/axes.ts`.
 *
 *    Nunca un segundo eje Y: hace que dos series parezcan comparables cuando
 *    no lo son. La única excepción pactada es carga contra RPE, donde la
 *    correlación ES el mensaje, y esa vive en las gráficas de entrenamiento.
 */

import type { FormResponse, FormQuestion } from '../../services/formsService';
import { shortPeriodLabel, periodLabel, type FormType } from './period';
import { resolveAxis, unitFor, domainFor, AXIS_DEFINITIONS, type FormAxis } from './axes';
import { colorForKey } from '../charts/palette';
import { parseNum } from '../stats/athleteStats';

// =====================================================================
// TIPOS
// =====================================================================

export interface CheckInPoint {
    periodKey: string;
    /** Corta, para el eje X: '02/08' o 'S31'. */
    label: string;
    /** Completa, para el tooltip. */
    fullLabel: string;
    [question: string]: number | string | null;
}

export interface CheckInSeries {
    id: string;
    label: string;
    /** Estable por identificador, no por posición. Ver `colorForKey`. */
    color: string;
    unit: string | null;
    /** "Más alto es peor". Colorea el punto; NO invierte el eje. */
    invertPolarity: boolean;
}

/** Una gráfica. Todas las series de dentro comparten escala legítimamente. */
export interface CheckInAxisGroup {
    /** Clave única. En `custom` incluye el id de la pregunta: va sola. */
    key: string;
    axis: FormAxis;
    label: string;
    description: string;
    unit: string | null;
    /** Rango fijo del eje Y, o null para que lo decida el dato. */
    domain: [number, number] | null;
    series: CheckInSeries[];
}

export interface CheckInSummary {
    type: FormType;
    points: CheckInPoint[];
    groups: CheckInAxisGroup[];
    comments: { periodKey: string; label: string; text: string }[];
    responseCount: number;
}

// =====================================================================

/**
 * Convierte las respuestas de UN cuestionario en algo graficable.
 *
 * Solo se representan las preguntas de tipo `scale` y `number`: el texto
 * libre no va a una gráfica, pero tampoco se tira — se lista aparte, porque
 * suele ser donde el atleta cuenta lo que de verdad pasó esa semana.
 */
export function summarizeCheckIns(responses: FormResponse[], type: FormType): CheckInSummary {
    // Filtrar aquí es la red de seguridad del fallo 1: aunque quien llame se
    // despiste y mande los dos tipos, esta función nunca los mezcla.
    const own = responses.filter(r => r.type === type);

    const seen = new Map<string, FormQuestion>();
    const comments: { periodKey: string; label: string; text: string }[] = [];

    const points = [...own]
        // Dentro de UN tipo, el orden alfabético del `period_key` ya es el
        // cronológico: '2026-08-02' y '2026-W09' llevan los dos relleno de
        // ceros. Lo que no se puede es comparar ENTRE tipos, y por eso están
        // separados.
        .sort((a, b) => a.period_key.localeCompare(b.period_key))
        .map((r) => {
            const point: CheckInPoint = {
                periodKey: r.period_key,
                label: shortPeriodLabel(type, r.period_key),
                fullLabel: periodLabel(type, r.period_key),
            };

            for (const answer of r.answers ?? []) {
                if (answer.qtype === 'text') {
                    const text = String(answer.value ?? '').trim();
                    if (text) {
                        comments.push({
                            periodKey: r.period_key,
                            label: periodLabel(type, r.period_key),
                            text,
                        });
                    }
                    continue;
                }

                const value = parseNum(answer.value);
                if (value === null) continue;

                if (!seen.has(answer.id)) seen.set(answer.id, answer);
                point[answer.id] = value;
            }

            return point;
        });

    return {
        type,
        points,
        groups: buildGroups([...seen.values()]),
        comments: comments.reverse().slice(0, 8),
        responseCount: own.length,
    };
}

/**
 * Reparte las preguntas en gráficas.
 *
 * Las familias con escala conocida agrupan a todas sus preguntas. `custom`
 * NO agrupa: cada pregunta sin clasificar se lleva su propia gráfica, porque
 * meter dos magnitudes desconocidas en el mismo eje es exactamente el fallo
 * que esto viene a arreglar (K9).
 */
function buildGroups(questions: FormQuestion[]): CheckInAxisGroup[] {
    const groups = new Map<string, CheckInAxisGroup>();

    for (const q of questions) {
        const axis = resolveAxis(q);
        const def = AXIS_DEFINITIONS[axis];
        const key = axis === 'custom' ? `custom:${q.id}` : axis;

        const series: CheckInSeries = {
            id: q.id,
            label: q.label,
            color: colorForKey(q.id),
            unit: unitFor(q),
            invertPolarity: q.invertPolarity === true,
        };

        const existing = groups.get(key);
        if (existing) {
            existing.series.push(series);
            continue;
        }

        groups.set(key, {
            key,
            axis,
            // Una gráfica de una sola pregunta se titula con la pregunta:
            // "Otras" no le dice nada a nadie.
            label: axis === 'custom' ? q.label : def.label,
            description: def.description,
            unit: unitFor(q),
            domain: domainFor(q),
            series: [series],
        });
    }

    return [...groups.values()].sort((a, b) => {
        const byAxis = AXIS_DEFINITIONS[a.axis].sortOrder - AXIS_DEFINITIONS[b.axis].sortOrder;
        return byAxis !== 0 ? byAxis : a.label.localeCompare(b.label, 'es');
    });
}
