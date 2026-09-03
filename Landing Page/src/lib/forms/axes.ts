/**
 * ANVIL STRENGTH — EL REGISTRO DE EJES DE LOS CUESTIONARIOS
 * =====================================================================
 *
 * EL PROBLEMA, EN UNA FRASE
 *
 * "Media de pasos diarios" vale 9.000 y "¿Cómo has dormido?" vale 7. Con un
 * solo eje Y para las dos, la escala se estira hasta 9.000 y el sueño, el
 * dolor y el estrés quedan aplastados contra el suelo, indistinguibles de
 * una línea recta. La gráfica de cuestionarios enseñaba exactamente eso.
 *
 * La solución no es un segundo eje Y —eso hace que dos series parezcan
 * comparables cuando no lo son— sino UNA GRÁFICA POR FAMILIA DE ESCALA.
 * Las escalas 1-10 juntas, el peso corporal aparte, los pasos aparte.
 *
 *
 * POR QUÉ UN REGISTRO Y NO UN `switch`
 *
 * Mismo patrón que `src/lib/vbt/metricRegistry.ts`, que ya funciona: la
 * pantalla no conoce las preguntas, conoce el registro. Un coach puede
 * inventarse mañana una pregunta que no existe hoy, y se pinta bien sin
 * tocar la interfaz.
 *
 *
 * CÓMO SE CLASIFICA UNA PREGUNTA, EN ESTE ORDEN (decisión K9)
 *
 *   1. `axis` declarado en la pregunta          — manda siempre
 *   2. `qtype === 'scale'`                      — es una escala 1-10 por definición
 *   3. Heurística sobre el `id` y la etiqueta   — "pasos", "peso", "horas"...
 *   4. `custom`, con GRÁFICA PROPIA
 *
 * El paso 4 es el importante y es innegociable: una variable que no se ha
 * podido clasificar **nunca** se mete en un eje ajeno. Es preferible una
 * gráfica de una sola línea que una gráfica en la que dos magnitudes
 * distintas comparten escala y una de las dos miente.
 */

import type { FormQuestion } from '../../services/formsService';

// =====================================================================
// TIPOS
// =====================================================================

export type FormAxis = 'scale10' | 'count' | 'mass' | 'duration' | 'percent' | 'custom';

export interface AxisDefinition {
    key: FormAxis;
    /** Título de la gráfica de esta familia. */
    label: string;
    /** Se escribe detrás del número. `null` en las magnitudes sin unidad. */
    unit: string | null;
    /**
     * Rango FIJO del eje Y, o `null` para que lo decida el dato.
     *
     * Las escalas 1-10 lo llevan fijo a propósito: si el eje se ajustara al
     * dato, una semana en la que el atleta durmió 6, 7 y 6 se dibujaría como
     * una montaña rusa entre 6 y 7. Con el eje a 0-10 se ve lo que es: una
     * semana plana.
     */
    domain: [number, number] | null;
    /** Orden en que se apilan las gráficas. */
    sortOrder: number;
    description: string;
}

export const AXIS_DEFINITIONS: Record<FormAxis, AxisDefinition> = {
    scale10: {
        key: 'scale10',
        label: 'Sensaciones',
        unit: null,
        domain: [0, 10],
        sortOrder: 1,
        description: 'Escalas de 1 a 10: sueño, dolor, estrés, cumplimiento…',
    },
    mass: {
        key: 'mass',
        label: 'Peso corporal',
        unit: 'kg',
        domain: null,
        sortOrder: 2,
        description: 'Masa. El eje se ajusta al dato: un rango 0-100 escondería una variación de 2 kg.',
    },
    duration: {
        key: 'duration',
        label: 'Duración',
        unit: 'h',
        domain: null,
        sortOrder: 3,
        description: 'Horas. Sueño medido en horas, no en escala.',
    },
    count: {
        key: 'count',
        label: 'Recuentos',
        unit: null,
        domain: null,
        sortOrder: 4,
        description: 'Cantidades sin unidad física: pasos, sesiones, comidas…',
    },
    percent: {
        key: 'percent',
        label: 'Porcentajes',
        unit: '%',
        domain: [0, 100],
        sortOrder: 5,
        description: 'Proporciones sobre 100.',
    },
    custom: {
        key: 'custom',
        label: 'Otras',
        unit: null,
        domain: null,
        sortOrder: 6,
        description: 'Sin clasificar. Cada una va en su propia gráfica para no compartir escala con nada.',
    },
};

/** Los ejes que un coach puede elegir a mano, en orden de presentación. */
export const SELECTABLE_AXES: FormAxis[] = ['scale10', 'mass', 'duration', 'count', 'percent', 'custom'];

// =====================================================================
// CLASIFICACIÓN
// =====================================================================

/**
 * Heurística sobre el identificador y la etiqueta.
 *
 * Solo se aplica a preguntas NUMÉRICAS que no declaran eje: una escala ya
 * quedó clasificada antes de llegar aquí.
 *
 * El orden importa. "Peso corporal (kg)" contiene "kg" y también podría
 * leerse como recuento si se buscara "corporal" antes; la masa se comprueba
 * primero porque es la más específica y la que más se usa.
 */
const HEURISTICS: { axis: FormAxis; pattern: RegExp }[] = [
    { axis: 'mass', pattern: /(\bpeso\b|\bkg\b|\bkilos?\b|bodyweight|\bweight\b|\bmasa\b)/i },
    { axis: 'duration', pattern: /(\bhoras?\b|\bhours?\b|duracion|duración|\bsue(n|ñ)o\b.*\bh\b)/i },
    { axis: 'count', pattern: /(\bpasos\b|\bsteps\b|\bveces\b|\bsesiones\b|\bcomidas\b|\bcount\b)/i },
    { axis: 'percent', pattern: /(%|\bporcentaje\b|\bpercent\b|\bpct\b)/i },
];

/**
 * A qué familia de escala pertenece una pregunta.
 *
 * Nunca devuelve un eje "parecido": si no lo sabe, devuelve `custom` y esa
 * pregunta se pinta sola. Ver la cabecera del fichero.
 */
export function resolveAxis(question: Pick<FormQuestion, 'id' | 'label' | 'qtype' | 'axis'>): FormAxis {
    // 1. Lo declarado manda.
    if (question.axis && question.axis in AXIS_DEFINITIONS) return question.axis;

    // 2. Una escala es una escala.
    if (question.qtype === 'scale') return 'scale10';

    // 3. Heurística sobre el id y la etiqueta. El id va primero porque lo
    //    escribe quien programa y es más estable que una etiqueta redactada
    //    para leerse.
    const haystack = `${question.id ?? ''} ${question.label ?? ''}`;
    for (const { axis, pattern } of HEURISTICS) {
        if (pattern.test(haystack)) return axis;
    }

    // 4. Sin clasificar: gráfica propia.
    return 'custom';
}

/**
 * ¿A esta pregunta le falta el eje escrito?
 *
 * Lo usa el editor de plantilla para PERSISTIR el resultado de la heurística
 * la primera vez que el coach la abre (decisión K9). Una vez escrito en
 * `axis`, la heurística deja de intervenir y el coach puede corregirla sin
 * que se la vuelvan a pisar en el siguiente guardado.
 */
export function needsAxisPersisted(question: Pick<FormQuestion, 'id' | 'label' | 'qtype' | 'axis'>): boolean {
    return !question.axis;
}

/**
 * Escribe el eje resuelto en las preguntas que aún no lo llevan.
 *
 * Devuelve EL MISMO array si no había nada que escribir, para que quien
 * llame pueda comparar por identidad y no guardar sin motivo.
 */
export function withResolvedAxes(questions: FormQuestion[]): FormQuestion[] {
    if (!questions.some(needsAxisPersisted)) return questions;
    return questions.map(q => (q.axis ? q : { ...q, axis: resolveAxis(q) }));
}

// =====================================================================
// PRESENTACIÓN
// =====================================================================

/** Unidad efectiva: la que declare la pregunta, y si no la de su familia. */
export function unitFor(
    question: Pick<FormQuestion, 'id' | 'label' | 'qtype' | 'axis' | 'unit'>
): string | null {
    if (question.unit) return question.unit;
    return AXIS_DEFINITIONS[resolveAxis(question)].unit;
}

/** Rango efectivo del eje Y: el que declare la pregunta, y si no el de su familia. */
export function domainFor(
    question: Pick<FormQuestion, 'id' | 'label' | 'qtype' | 'axis' | 'domain'>
): [number, number] | null {
    if (question.domain && question.domain.length === 2) return question.domain;
    return AXIS_DEFINITIONS[resolveAxis(question)].domain;
}
