/**
 * ANVIL STRENGTH — OBJETIVOS DE VOLUMEN SEMANAL
 * =====================================================================
 *
 * QUÉ CONTESTA
 *
 * "Quedan 4 de las 12 series de sentadilla de esta semana". El entrenador
 * fija un presupuesto por movimiento y el constructor lo va descontando
 * mientras programa.
 *
 *
 * NO CUENTA NADA POR SU CUENTA, Y ESO ES LO IMPORTANTE
 *
 * Lo PROGRAMADO ya lo cuenta `lib/planning/liftSummary.ts`, que a su vez se
 * apoya en el clasificador SQ/BP/DL de la aplicación (`mainLift.ts`, con su
 * lista de exclusiones: búlgara, frontal, militar, francés, rumano…). Un
 * segundo contador aquí daría dos cifras distintas de la misma semana —el
 * panel diría 12 series y el objetivo 16— y la equivocada sería la nueva,
 * porque esa lista de exclusiones costó descubrirla caso a caso.
 *
 * Así que este módulo solo hace dos cosas: RESOLVER qué objetivo aplica y
 * RESTAR. La cuenta viene de fuera.
 *
 *
 * POR QUÉ HAY TRES ÁMBITOS Y CÓMO SE RESUELVEN
 *
 * Un objetivo puede atarse a una semana concreta, a un bloque entero, o a
 * nada (el objetivo de fondo del atleta). Gana el MÁS ESPECÍFICO:
 *
 *     semana 3 del bloque X  >  bloque X  >  el atleta
 *
 * Es lo que permite decir "este atleta hace 12 series de sentadilla a la
 * semana, salvo en la semana de descarga, que hace 6" sin tener que
 * escribir el objetivo trece veces.
 *
 * La resolución vive en el cliente y no en la consulta SQL a propósito: el
 * constructor ya tiene todos los objetivos del atleta en memoria, y
 * resolver aquí evita una consulta por cada semana que el coach abre.
 */

import type { LiftWeekSummary } from '../planning/liftSummary';

// =====================================================================
// EL DATO
// =====================================================================

/**
 * En qué se mide un objetivo.
 *
 * Es texto y no una columna por métrica, igual que en `metric_definitions`:
 * añadir una métrica nueva es una fila, nunca un ALTER TABLE. Ver la
 * cabecera de database/VOLUMEN_Y_NOTAS_2026-09-07.sql.
 *
 * `series` y `reps` son la prioridad de la primera entrega. El resto se
 * admite desde ya para no tener que volver a tocar el esquema.
 */
export const METRICAS_DE_VOLUMEN = [
    'series',
    'reps',
    'tonelaje_kg',
    'volumen_relativo',
    'distancia_km',
    'duracion_seg',
] as const;
export type MetricaDeVolumen = (typeof METRICAS_DE_VOLUMEN)[number];

export const METRICA_INFO: Record<MetricaDeVolumen, { nombre: string; unidad: string; corto: string }> = {
    series: { nombre: 'Series', unidad: '', corto: 'series' },
    reps: { nombre: 'Repeticiones', unidad: '', corto: 'reps' },
    tonelaje_kg: { nombre: 'Tonelaje', unidad: 'kg', corto: 'kg' },
    volumen_relativo: { nombre: 'Volumen relativo', unidad: '', corto: 'vol' },
    distancia_km: { nombre: 'Distancia', unidad: 'km', corto: 'km' },
    duracion_seg: { nombre: 'Duración', unidad: 's', corto: 's' },
};

/** A qué se le pone el objetivo: a un básico entero, o a un ejercicio suelto. */
export type AmbitoDeObjetivo = 'lift' | 'exercise';

export interface ObjetivoDeVolumen {
    id: string;
    coach_id: string;
    athlete_id: string;
    /** `null` = vale para todos los bloques del atleta. */
    block_id: string | null;
    /** `null` = vale para todas las semanas del ámbito. */
    week_number: number | null;
    scope: AmbitoDeObjetivo;
    /** 'SQ' | 'BP' | 'DL' si `scope` es 'lift'; `exerciseKey(nombre)` si no. */
    scope_key: string;
    label: string;
    metric: MetricaDeVolumen;
    target: number;
    created_at: string;
    updated_at: string;
}

// =====================================================================
// RESOLUCIÓN
// =====================================================================

/**
 * Cuánto de específico es un objetivo. Mayor gana.
 *
 * No se usa la fecha de creación para desempatar: un objetivo de semana
 * escrito hace un mes sigue mandando sobre uno de bloque escrito hoy,
 * porque lo que decide no es cuál es más reciente sino cuál habla de este
 * caso concreto.
 */
function especificidad(o: ObjetivoDeVolumen): number {
    return (o.block_id ? 2 : 0) + (o.week_number != null ? 1 : 0);
}

/** Clave de agrupación: un objetivo por movimiento y métrica. */
function claveDe(o: Pick<ObjetivoDeVolumen, 'scope' | 'scope_key' | 'metric'>): string {
    return `${o.scope}:${o.scope_key}:${o.metric}`;
}

/**
 * De todos los objetivos de un atleta, los que aplican a ESTA semana de
 * ESTE bloque, ya resueltos: como mucho uno por (movimiento, métrica).
 *
 * Descarta los que hablan de otro bloque o de otra semana. De los que
 * quedan, se queda con el más específico.
 */
export function objetivosVigentes(
    todos: readonly ObjetivoDeVolumen[],
    blockId: string | null,
    weekNumber: number
): ObjetivoDeVolumen[] {
    const porClave = new Map<string, ObjetivoDeVolumen>();

    for (const o of todos) {
        // Habla de otro bloque.
        if (o.block_id != null && o.block_id !== blockId) continue;
        // Habla de otra semana.
        if (o.week_number != null && o.week_number !== weekNumber) continue;

        const clave = claveDe(o);
        const actual = porClave.get(clave);
        if (!actual || especificidad(o) > especificidad(actual)) {
            porClave.set(clave, o);
        }
    }

    return [...porClave.values()];
}

// =====================================================================
// EL DESCUENTO
// =====================================================================

export interface ProgresoDeObjetivo {
    objetivo: ObjetivoDeVolumen;
    /** Lo que ya hay programado esta semana, en la unidad del objetivo. */
    programado: number;
    /** Lo que falta. Nunca negativo: si se ha pasado, es 0 y `exceso` lo dice. */
    restante: number;
    /** Cuánto se ha pasado del objetivo. 0 si no se ha pasado. */
    exceso: number;
    /** 0 a 1, topado en 1 para la barra. `exceso` lleva lo que sobra. */
    fraccion: number;
}

/**
 * Cuánto lleva programado un objetivo esta semana.
 *
 * `resumenPorBasico` es la salida de `weeklyLiftSummary()` y
 * `porEjercicio` la de `weeklyExerciseSummary()` — las dos ya calculadas
 * por quien llama, que las necesita igualmente para pintar el panel.
 *
 * Devuelve `null` cuando el objetivo habla de algo que no se sabe contar
 * (un objetivo en kilómetros sobre un básico, por ejemplo). `null` y no 0:
 * "no se puede medir" no es "va por cero", y pintar una barra vacía en el
 * segundo caso sería mentir.
 */
export function progresoDe(
    objetivo: ObjetivoDeVolumen,
    resumenPorBasico: readonly LiftWeekSummary[],
    porEjercicio: ReadonlyMap<string, { sets: number; reps: number; tonnage: number }>
): ProgresoDeObjetivo | null {
    let fuente: { sets: number; reps: number; tonnage: number } | undefined;

    if (objetivo.scope === 'lift') {
        fuente = resumenPorBasico.find(l => l.lift === objetivo.scope_key);
    } else {
        fuente = porEjercicio.get(objetivo.scope_key);
    }

    // El movimiento no aparece esta semana. Eso SÍ es cero programado, no
    // "no se puede medir": el objetivo existe y no se está cumpliendo.
    const datos = fuente ?? { sets: 0, reps: 0, tonnage: 0 };

    let programado: number;
    switch (objetivo.metric) {
        case 'series':
            programado = datos.sets;
            break;
        case 'reps':
            programado = datos.reps;
            break;
        case 'tonelaje_kg':
            programado = datos.tonnage;
            break;
        default:
            // volumen_relativo, distancia_km y duracion_seg todavía no se
            // derivan de la prescripción. El objetivo se guarda y se puede
            // editar; simplemente no hay contra qué compararlo aún.
            return null;
    }

    const restante = Math.max(0, objetivo.target - programado);
    const exceso = Math.max(0, programado - objetivo.target);

    return {
        objetivo,
        programado,
        restante,
        exceso,
        fraccion: objetivo.target > 0 ? Math.min(1, programado / objetivo.target) : 0,
    };
}

/**
 * El progreso de todos los objetivos vigentes, en el orden en que se
 * pintan: primero los básicos en el orden SQ, BP, DL, y después los
 * ejercicios sueltos por orden alfabético.
 *
 * Ese orden es fijo y no depende de los datos a propósito: un panel que
 * reordena sus filas cada vez que cambia una cifra obliga a releerlo
 * entero para encontrar la que se estaba mirando.
 */
const ORDEN_BASICOS = ['SQ', 'BP', 'DL'];

export function progresoDeTodos(
    objetivos: readonly ObjetivoDeVolumen[],
    resumenPorBasico: readonly LiftWeekSummary[],
    porEjercicio: ReadonlyMap<string, { sets: number; reps: number; tonnage: number }>
): ProgresoDeObjetivo[] {
    return objetivos
        .slice()
        .sort((a, b) => {
            if (a.scope !== b.scope) return a.scope === 'lift' ? -1 : 1;
            if (a.scope === 'lift') {
                const ia = ORDEN_BASICOS.indexOf(a.scope_key);
                const ib = ORDEN_BASICOS.indexOf(b.scope_key);
                if (ia !== ib) return ia - ib;
            } else if (a.label !== b.label) {
                return a.label.localeCompare(b.label, 'es');
            }
            // Dentro del mismo movimiento: series primero, luego reps, luego
            // el resto en el orden en que están declaradas.
            return METRICAS_DE_VOLUMEN.indexOf(a.metric) - METRICAS_DE_VOLUMEN.indexOf(b.metric);
        })
        .map(o => progresoDe(o, resumenPorBasico, porEjercicio))
        .filter((p): p is ProgresoDeObjetivo => p !== null);
}
