/**
 * ANVIL STRENGTH — DEL CALENTAMIENTO EN TEXTO AL ESTRUCTURADO
 * =====================================================================
 *
 * Convierte lo que el entrenador lleva años escribiendo a mano en una
 * PROPUESTA de ejercicios con sus series. Es una propuesta y no una migración:
 * nada se escribe hasta que él lo confirma, y el texto original no se toca.
 *
 * POR QUÉ NO ES AUTOMÁTICO
 *
 * El texto libre no tiene formato garantizado. "Barra 20kg x10, 60x5, 80x3" y
 * "Movilidad de cadera 5'" conviven en el mismo campo, y el segundo no es un
 * ejercicio con series por mucho que tenga un número. Un analizador que se
 * aplicara solo acabaría creando "Movilidad de cadera" con 5 series de nada, y
 * eso ya sí ensuciaría el bloque. Aquí se propone, el coach mira y decide.
 *
 * QUÉ RECONOCE, Y QUÉ DEJA PASAR
 *
 *   "Rotación externa 2x15"        → 2 series de 15
 *   "Band pull apart 2 x 20"       → 2 series de 20
 *   "Sentadilla 1x5 @40%"          → 1 serie de 5, nota "@40%"
 *   "Barra 20kg x10"               → 1 serie de 10 a 20 kg
 *   "Movilidad de cadera 5'"       → ejercicio sin series (el 5' va en notas)
 *   "Circuito A - 3 rondas"        → cabecera; marca las siguientes líneas
 *
 * Lo que no entiende lo deja como ejercicio SIN series y con la línea entera
 * en las notas. Perder el texto sería peor que no estructurarlo.
 */

export interface ParsedWarmupSet {
    reps: string;
    /** Kilos, cuando la línea los dice. */
    load: number | null;
}

export interface ParsedWarmupExercise {
    name: string;
    sets: ParsedWarmupSet[];
    /** Lo que no cabía en nombre ni series: "@40%", "5'", "cada lado". */
    notes: string | null;
    /** Etiqueta del circuito al que pertenece, si venía anunciado. */
    groupTag: string | null;
    /** Vueltas del circuito anunciadas en la cabecera. */
    rounds: number | null;
    /** Se reconoció una prescripción de verdad, no solo un nombre suelto. */
    recognised: boolean;
}

/** "Circuito A", "Circuito B - 3 rondas", "3 rondas de:" */
const CIRCUIT_RE = /^\s*(?:circuito\s*([a-d])?|bloque\s*([a-d])?)\b/i;
const ROUNDS_RE = /(\d{1,2})\s*(?:rondas|vueltas|series?\s+del?\s+circuito)/i;

/** "3x10", "3 x 10", "2x15-20", "1x5" */
const SETS_REPS_RE = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)/i;
/** "@40%", "al 60%" */
const PERCENT_RE = /(?:@|al\s*)\s*\d{1,3}\s*%/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Nombre del ejercicio: lo que hay antes de la primera cifra que forme parte
 * de una prescripción. Se recorta la puntuación de separación que la gente
 * escribe entre el nombre y las series.
 */
function nameFrom(line: string, cutAt: number): string {
    // `cutAt === 0` NO es "no hay corte": es "la línea EMPIEZA por el número",
    // o sea que no nombra ningún ejercicio. Tratarlo como el caso sin corte
    // devolvía la línea entera como nombre, y con nombre "60x5" el analizador
    // creía que el 60 era el número de series.
    const head = cutAt >= 0 ? line.slice(0, cutAt) : line;
    return clean(head.replace(/[\s:·—–-]+$/, ''));
}

/**
 * Un tramo ("20kg x10", "60x5", "Rotación externa 2x15") → las series que
 * describe, o null si no describe ninguna.
 *
 * LA REGLA QUE DECIDE SI EL PRIMER NÚMERO ES CARGA O NÚMERO DE SERIES:
 * ¿hay un NOMBRE delante?
 *
 *   "Rotación externa 2x15"  → hay nombre → 2 series de 15
 *   "60x5"                   → no hay    → 60 kg por 5 repeticiones
 *
 * Es la diferencia entre una prescripción y un escalón de una escalera de
 * aproximaciones, y sin ella "60x5" se convertía en SESENTA series de cinco
 * —recortadas a doce por el tope— que es exactamente el tipo de basura que
 * habría que borrar a mano ejercicio por ejercicio.
 */
function setsFromSegment(segment: string, hasName: boolean): ParsedWarmupSet[] | null {
    const text = clean(segment);
    if (!text) return null;

    // "20kg x10": la unidad lo dice explícitamente y no hay nada que deducir.
    const explicit = text.match(/(\d{1,3}(?:[.,]\d)?)\s*kg\s*(?:[x×]\s*(\d{1,3}))?/i);
    if (explicit) {
        return [{
            reps: explicit[2] ?? '1',
            load: Number(explicit[1].replace(',', '.')),
        }];
    }

    const pair = text.match(SETS_REPS_RE);
    if (!pair) return null;

    const first = Number.parseInt(pair[1], 10);
    const second = clean(pair[2]).replace(/\s*-\s*/, '-');

    if (!hasName) {
        // Escalón de escalera: el primer número son kilos.
        return [{ reps: second, load: first }];
    }

    // Una fila por serie y no un "3x10" en `target_reps`: así el atleta puede
    // marcarlas de una en una sin pasar por `expand_grouped_set`.
    const count = Math.min(Math.max(first, 1), 12);
    return Array.from({ length: count }, () => ({ reps: second, load: null }));
}

/**
 * Una línea → un ejercicio propuesto.
 *
 * La línea se parte por COMAS antes de nada. "Barra 20kg x10, 60x5, 80x3" es
 * un ejercicio con tres escalones, y leer solo el primero —que es lo que hacía
 * antes— perdía silenciosamente dos tercios de la escalera.
 *
 * Devuelve null para las líneas que no son un ejercicio.
 */
function parseLine(line: string): ParsedWarmupExercise | null {
    const text = clean(line);
    if (!text) return null;
    // Viñetas y numeración: "- Rotación externa", "1) Band pull apart".
    const body = text.replace(/^[-•*·]\s*/, '').replace(/^\d+[.)]\s*/, '');
    if (!body) return null;

    const percent = body.match(PERCENT_RE)?.[0] ?? null;
    const segments = body.split(',').map(clean).filter(Boolean);
    const head = segments[0] ?? body;

    // ¿Dónde empieza la parte numérica del primer tramo? Lo de delante es el
    // nombre; si no hay nada delante, la línea no nombra ningún ejercicio.
    const firstPair = head.match(/(\d{1,3}(?:[.,]\d)?)\s*(?:kg)?\s*[x×]/i)
        ?? head.match(/(\d{1,3}(?:[.,]\d)?)\s*kg\b/i);
    const name = nameFrom(head, firstPair?.index ?? -1);

    const sets: ParsedWarmupSet[] = [];
    for (const [i, segment] of segments.entries()) {
        // Solo el primer tramo puede llevar nombre; los siguientes son
        // continuación de la escalera y por definición no lo llevan.
        const parsed = setsFromSegment(segment, i === 0 && Boolean(name));
        if (parsed) sets.push(...parsed);
    }

    if (sets.length > 0 && name) {
        return { name, sets, notes: percent, groupTag: null, rounds: null, recognised: true };
    }

    // Ni series con nombre ni nada reconocible: es un apunte ("Movilidad de
    // cadera 5'", "Bici 10'") o un escalón suelto sin ejercicio al que
    // colgarse. Se conserva ENTERO como ejercicio sin series: inventarle
    // repeticiones sería peor que dejarlo como está.
    return {
        name: body.length <= 60 ? body : `${body.slice(0, 57)}…`,
        sets: [],
        notes: body.length <= 60 ? null : body,
        groupTag: null,
        rounds: null,
        recognised: false,
    };
}

/**
 * Texto libre → propuesta de calentamiento estructurado.
 *
 * Las cabeceras de circuito marcan a las líneas siguientes: todo lo que venga
 * detrás de "Circuito A · 3 rondas" comparte etiqueta y rondas hasta la
 * siguiente cabecera o una línea en blanco.
 */
export function parseWarmupText(text: string): ParsedWarmupExercise[] {
    const out: ParsedWarmupExercise[] = [];

    let currentTag: string | null = null;
    let currentRounds: number | null = null;
    // Etiquetas para circuitos anunciados sin letra ("3 rondas de:").
    const autoTags = ['A', 'B', 'C', 'D'];
    let autoIndex = 0;

    for (const rawLine of text.split('\n')) {
        const line = clean(rawLine);

        // Una línea en blanco cierra el circuito abierto: es como se separan
        // los bloques cuando se escriben a mano.
        if (!line) {
            currentTag = null;
            currentRounds = null;
            continue;
        }

        const circuit = line.match(CIRCUIT_RE);
        const rounds = line.match(ROUNDS_RE);

        // Es cabecera si nombra un circuito, o si solo anuncia rondas y no
        // trae ninguna prescripción propia.
        const isHeader = Boolean(circuit) || (Boolean(rounds) && !SETS_REPS_RE.test(line));

        if (isHeader) {
            const letter = (circuit?.[1] ?? circuit?.[2] ?? '').toUpperCase();
            currentTag = letter || autoTags[autoIndex % autoTags.length];
            if (!letter) autoIndex += 1;
            currentRounds = rounds ? Number.parseInt(rounds[1], 10) : null;
            continue;
        }

        const parsed = parseLine(line);
        if (!parsed) continue;
        if (!parsed.name) continue;

        out.push({ ...parsed, groupTag: currentTag, rounds: currentRounds });
    }

    return out;
}
