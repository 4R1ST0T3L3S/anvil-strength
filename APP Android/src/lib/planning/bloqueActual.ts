import { getDateRangeFromWeek } from '../../utils/dateUtils';

/**
 * ¿CUÁL DE LOS BLOQUES ACTIVOS LE TOCA HOY AL ATLETA?
 * =====================================================================
 *
 * EL FALLO QUE ESTO ARREGLA
 *
 * Los tres sitios que necesitaban esta respuesta hacían lo mismo:
 *
 *     const blocks = await getBlocksByAthlete(athleteId);   // created_at DESC
 *     const active = blocks.find(b => b.is_active);
 *
 * O sea: el bloque activo MÁS RECIENTEMENTE CREADO. Y eso no es "el que
 * toca", es "el último que el entrenador escribió".
 *
 * En cuanto un coach prepara el bloque siguiente antes de que termine el
 * que está corriendo —que es lo normal, se programa con antelación— el
 * atleta se queda mirando el bloque nuevo, que todavía no ha empezado y por
 * tanto no tiene nada publicado para esta semana. Su entrenamiento de esta
 * semana sigue existiendo, en el bloque anterior, pero la aplicación ya no
 * lo mira. Por fuera: "SEMANA SIN SESIONES" con el nombre del bloque nuevo
 * en la cabecera, que es exactamente lo que reportó el atleta.
 *
 *
 * EL CRITERIO, EN ORDEN
 *
 *   1. El que esté EN CURSO hoy. Si hay varios solapados, el que empezó más
 *      tarde: si el coach abre un bloque nuevo encima de otro que aún corre,
 *      lo que quiere es que mande el nuevo.
 *   2. Si ninguno está en curso, el que terminó más recientemente. Es donde
 *      el atleta estaba trabajando y donde va a querer mirar lo que hizo.
 *   3. Si tampoco hay ninguno terminado, el que antes vaya a empezar.
 *   4. Y si no hay fechas con las que decidir —bloques viejos sin
 *      `start_week`/`end_week`— se respeta el orden que traía la lista, que
 *      es `created_at` descendente. Es el comportamiento de antes, que para
 *      ese caso sigue siendo lo único que se puede hacer.
 *
 * Se decide con FECHAS y no preguntando qué bloque tiene sesiones esta
 * semana, que sería la otra opción. Preguntarlo cuesta un viaje más al
 * servidor y además da la respuesta equivocada justo cuando más importa: un
 * bloque en curso al que el coach todavía no le ha publicado la semana no
 * tiene sesiones visibles, y saldría descartado a favor de otro bloque
 * cualquiera. El calendario no miente y no cuesta nada.
 */

/** Lo mínimo que hace falta de un bloque para poder ordenarlos. */
export interface BloqueOrdenable {
    is_active: boolean;
    start_week?: number | null;
    end_week?: number | null;
    start_date?: string | null;
}

/** El mismo día, a medianoche UTC — comparable con `getDateRangeFromWeek`. */
function diaUTC(d: Date): number {
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Primer lunes y último domingo del bloque, en milisegundos.
 *
 * `null` si al bloque le faltan las semanas: sin ellas no se puede situar en
 * el calendario y queda fuera de la ordenación por fechas.
 */
function rangoDelBloque(b: BloqueOrdenable, hoy: Date): { inicio: number; fin: number } | null {
    if (b.start_week == null || b.end_week == null) return null;

    const anio = b.start_date ? new Date(b.start_date).getFullYear() : hoy.getFullYear();

    // `end_week` por debajo de `start_week` solo puede significar una cosa:
    // el bloque cruza el fin de año y termina en el siguiente.
    const anioFin = b.end_week < b.start_week ? anio + 1 : anio;

    const inicio = getDateRangeFromWeek(b.start_week, anio).start.getTime();
    const fin = getDateRangeFromWeek(b.end_week, anioFin).end.getTime();

    if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
    return { inicio, fin };
}

/**
 * El bloque que le toca hoy, o `null` si no tiene ninguno activo.
 *
 * `bloques` se espera tal cual lo devuelve `getBlocksByAthlete()`: ordenado
 * por `created_at` descendente. Ese orden solo se usa como último desempate.
 */
export function elegirBloqueActual<T extends BloqueOrdenable>(
    bloques: T[],
    hoy: Date = new Date()
): T | null {
    const activos = bloques.filter(b => b.is_active);
    if (activos.length === 0) return null;
    if (activos.length === 1) return activos[0];

    const ahora = diaUTC(hoy);
    const conRango = activos
        .map(b => ({ bloque: b, rango: rangoDelBloque(b, hoy) }))
        .filter((x): x is { bloque: T; rango: { inicio: number; fin: number } } => x.rango !== null);

    // 1. En curso — el que empezó más tarde.
    const enCurso = conRango.filter(x => x.rango.inicio <= ahora && ahora <= x.rango.fin);
    if (enCurso.length > 0) {
        return enCurso.reduce((a, b) => (b.rango.inicio > a.rango.inicio ? b : a)).bloque;
    }

    // 2. Terminados — el que terminó más tarde.
    const terminados = conRango.filter(x => x.rango.fin < ahora);
    if (terminados.length > 0) {
        return terminados.reduce((a, b) => (b.rango.fin > a.rango.fin ? b : a)).bloque;
    }

    // 3. Por empezar — el que empieza antes.
    const futuros = conRango.filter(x => x.rango.inicio > ahora);
    if (futuros.length > 0) {
        return futuros.reduce((a, b) => (b.rango.inicio < a.rango.inicio ? b : a)).bloque;
    }

    // 4. Ninguno se puede situar en el calendario: el orden de entrada.
    return activos[0];
}

/**
 * Un bloque con sus semanas, listo para pintar en el selector del atleta.
 */
export interface GrupoDeSemanas<T> {
    bloque: T;
    /** Año al que pertenecen esas semanas ISO. Sale de `start_date`. */
    anio: number;
    /** De `start_week` a `end_week`, ambas incluidas. */
    semanas: number[];
}

/**
 * TODO lo que el atleta puede abrir, agrupado por bloque y en orden de
 * calendario — del más antiguo al más nuevo, que es como lo vivió.
 *
 * Las semanas salen del bloque (`start_week`..`end_week`) y NO de las
 * sesiones cargadas: así están todas en la lista desde el primer momento
 * aunque solo se haya pedido la de hoy, y elegir una que aún no está en
 * memoria dispara su carga.
 *
 * Los bloques sin semanas quedan fuera: no se pueden situar en el calendario
 * y no hay nada que ofrecer de ellos.
 */
export function semanasDeCadaBloque<T extends BloqueOrdenable & { id: string }>(
    bloques: T[],
    hoy: Date = new Date()
): GrupoDeSemanas<T>[] {
    return bloques
        .filter(b => b.start_week != null && b.end_week != null && b.end_week >= b.start_week)
        .map(b => ({
            bloque: b,
            anio: b.start_date ? new Date(b.start_date).getFullYear() : hoy.getFullYear(),
            semanas: Array.from(
                { length: b.end_week! - b.start_week! + 1 },
                (_, i) => b.start_week! + i
            ),
        }))
        .sort((a, b) =>
            a.anio !== b.anio ? a.anio - b.anio : a.bloque.start_week! - b.bloque.start_week!
        );
}
