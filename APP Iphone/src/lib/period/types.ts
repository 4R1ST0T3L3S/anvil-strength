/**
 * ANVIL STRENGTH — EL PERIODO TEMPORAL
 * =====================================================================
 *
 * EL PROBLEMA QUE RESUELVE, EN UNA FRASE
 *
 * Todas las estadísticas de la aplicación contestan a una pregunta que nadie
 * ha hecho: "¿cuánto ha entrenado este atleta… desde siempre?". No hay forma
 * de preguntar por esta semana, por este mes o por este bloque, que son las
 * tres preguntas que un entrenador se hace de verdad.
 *
 *
 * LAS DOS RESOLUCIONES, Y POR QUÉ NO SON LO MISMO (decisión K10)
 *
 * Una sesión de entrenamiento no guarda una fecha: guarda `week_number`, que
 * es la semana ISO DEL AÑO. Para saber a qué lunes corresponde la semana 34
 * de un bloque hace falta `training_blocks.start_date`.
 *
 *   · **calendar** — el bloque tiene fecha de inicio. Cada semana se puede
 *     situar en el calendario, así que "este mes" o "las últimas 4 semanas"
 *     significan algo exacto.
 *
 *   · **ordinal** — el bloque NO tiene fecha. Solo se puede agregar por
 *     número de semana, y "este mes" no se puede contestar. La interfaz tiene
 *     que DECIRLO, no fingir que sí puede.
 *
 * Y la regla dura: **nunca inventar una fecha**. Un bloque fechado a ojo
 * contamina todas las estadísticas de calendario, y lo hace en silencio.
 */

/** Qué se puede preguntar. */
export type TipoPeriodo =
    /** La semana ISO en curso. */
    | 'semana'
    /** El mes natural en curso. */
    | 'mes'
    /** Las últimas N semanas cerradas, incluida la actual. */
    | 'ultimas'
    /** Un bloque de entrenamiento concreto, de su primera a su última semana. */
    | 'bloque'
    /** Todo lo que haya. Es el comportamiento que tenía la app antes. */
    | 'todo';

/**
 * Con qué precisión se puede contestar.
 *
 * Lo decide el DATO, no la pantalla: si el bloque no tiene fecha de inicio,
 * ninguna pregunta de calendario tiene respuesta.
 */
export type Resolucion = 'calendar' | 'ordinal';

export interface Periodo {
    tipo: TipoPeriodo;
    /** Solo para `ultimas`. Cuántas semanas hacia atrás. */
    semanas?: number;
    /** Solo para `bloque`. Cuál. */
    blockId?: string;
}

/**
 * Un periodo ya resuelto contra el calendario.
 *
 * `desde`/`hasta` son inclusivos y en hora LOCAL a medianoche. `null` en
 * cualquiera de los dos significa "sin límite por ese lado".
 *
 * Cuando `resolucion` es `'ordinal'`, las fechas son `null` y lo que vale es
 * `semanas`: la lista de `week_number` que entran en el periodo.
 */
export interface PeriodoResuelto {
    periodo: Periodo;
    resolucion: Resolucion;
    desde: Date | null;
    hasta: Date | null;
    /** Semanas ISO incluidas. Es lo único utilizable en modo ordinal. */
    semanas: number[] | null;
    /** Texto para la interfaz: "Esta semana", "Bloque 3 · Fuerza"… */
    etiqueta: string;
    /**
     * Por qué no se ha podido resolver contra el calendario. `null` cuando la
     * resolución es `calendar`. La interfaz lo enseña tal cual: es la única
     * forma de que alguien entienda por qué no puede filtrar por mes.
     */
    motivoOrdinal: string | null;
}

/** Los periodos que ofrece el selector, en orden. */
export const PERIODOS_POR_DEFECTO: Periodo[] = [
    { tipo: 'semana' },
    { tipo: 'ultimas', semanas: 4 },
    { tipo: 'mes' },
    { tipo: 'ultimas', semanas: 12 },
    { tipo: 'todo' },
];
