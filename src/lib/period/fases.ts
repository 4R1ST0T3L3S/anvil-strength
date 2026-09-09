/**
 * ANVIL STRENGTH — DÓNDE ESTÁ EL ATLETA EN SU TEMPORADA
 * =====================================================================
 *
 * "HIPERTROFIA — Semana 3 de 4". Traduce la lista de fases que ha escrito
 * el entrenador y la fecha de hoy en la frase que el atleta lee.
 *
 *
 * LA SEMANA ACTUAL SE DEDUCE, NO SE GUARDA
 *
 * Podría haber una columna `current_week` que el coach subiera cada lunes.
 * El primer lunes que se olvidara, la pantalla mentiría — y mentiría en
 * silencio, que es lo peor que puede hacer un panel de seguimiento. Aquí
 * sale de la fecha de inicio y del día de hoy, así que no se puede
 * desincronizar.
 *
 *
 * LAS FASES SIN FECHA SON UN ESBOZO VÁLIDO
 *
 * Un entrenador esboza la temporada entera —seis fases con sus semanas— y
 * pone las fechas después, o solo pone la de la primera. Todo lo que
 * dependa de fechas devuelve `null` para esas, y quien pinta enseña la
 * fase sin el contador en vez de inventarse un día uno.
 *
 *
 * POR QUÉ EL ENCADENADO ES EXPLÍCITO
 *
 * Si la fase 2 no tiene `start_date`, se toma el día siguiente al final de
 * la 1. Es lo que espera quien escribe "4 semanas de hipertrofia y luego 3
 * de fuerza" sin abrir el calendario. Pero solo se encadena hacia
 * adelante: una fase con fecha propia manda sobre lo que dijera la
 * anterior, porque esa fecha la ha escrito alguien a mano.
 */

/** Cómo llega una fase de la base de datos. */
export interface FaseDeTemporada {
    id: string;
    coach_id: string;
    athlete_id: string;
    macro_id: string | null;
    /** 'SQ' | 'BP' | 'DL', o `null` si la fase es de toda la temporada. */
    movement: string | null;
    name: string;
    weeks: number;
    order_index: number;
    start_date: string | null;
    end_date: string | null;
    color: string | null;
    icon: string | null;
    notes: string | null;
}

/** Una fase con sus fechas ya resueltas y su sitio en el calendario. */
export interface FaseResuelta {
    fase: FaseDeTemporada;
    /** Fecha de inicio efectiva (propia o encadenada). `null` si no se sabe. */
    inicio: Date | null;
    /** Fecha de fin efectiva. `null` si no se sabe. */
    fin: Date | null;
    /** 1..weeks si hoy cae dentro; `null` si no. */
    semanaActual: number | null;
    /** Estado respecto a hoy. `desconocido` cuando no hay fechas. */
    estado: 'pasada' | 'actual' | 'futura' | 'desconocido';
}

// ---------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

/** Medianoche local. Comparar fechas con hora dentro da errores de un día. */
function aMedianoche(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Convierte "2026-09-07" en una fecha LOCAL a medianoche.
 *
 * `new Date('2026-09-07')` la interpreta como UTC, así que al oeste de
 * Greenwich sale el día 6 — y una fase que empieza el lunes aparecería
 * empezando el domingo. Se parte a mano.
 */
export function fechaLocal(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

function sumarDias(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Resuelve la lista entera: ordena, encadena las fechas que faltan y marca
 * en cuál estamos.
 *
 * `hoy` es un parámetro y no `new Date()` por dentro para que las pruebas
 * puedan fijar el día sin tocar el reloj del sistema.
 */
export function resolverFases(
    fases: readonly FaseDeTemporada[],
    hoy: Date = new Date()
): FaseResuelta[] {
    const dia = aMedianoche(hoy);

    const ordenadas = [...fases].sort((a, b) => {
        if (a.order_index !== b.order_index) return a.order_index - b.order_index;
        // Desempate estable por fecha y luego por id: sin él, dos fases con
        // el mismo `order_index` cambiarían de sitio entre renders.
        const fa = fechaLocal(a.start_date)?.getTime() ?? Infinity;
        const fb = fechaLocal(b.start_date)?.getTime() ?? Infinity;
        if (fa !== fb) return fa - fb;
        return a.id.localeCompare(b.id);
    });

    const resueltas: FaseResuelta[] = [];
    /** Final de la fase anterior, para encadenar la siguiente. */
    let finAnterior: Date | null = null;

    for (const fase of ordenadas) {
        const propia = fechaLocal(fase.start_date);
        // Una fecha propia manda sobre el encadenado: la ha escrito alguien.
        const inicio: Date | null = propia ?? (finAnterior ? sumarDias(finAnterior, 1) : null);

        const finExplicito = fechaLocal(fase.end_date);
        const fin: Date | null = finExplicito ?? (inicio ? sumarDias(inicio, fase.weeks * 7 - 1) : null);

        let estado: FaseResuelta['estado'] = 'desconocido';
        let semanaActual: number | null = null;

        if (inicio && fin) {
            if (dia < inicio) estado = 'futura';
            else if (dia > fin) estado = 'pasada';
            else {
                estado = 'actual';
                const transcurridos = Math.floor((dia.getTime() - inicio.getTime()) / DIA_MS);
                // Tope en `weeks`: con un `end_date` escrito a mano más largo
                // que `weeks*7`, la cuenta podría pasarse y decir "semana 6 de 4".
                semanaActual = Math.min(fase.weeks, Math.floor(transcurridos / 7) + 1);
            }
        }

        resueltas.push({ fase, inicio, fin, semanaActual, estado });
        if (fin) finAnterior = fin;
    }

    return resueltas;
}

/**
 * La fase en la que está HOY, para un movimiento o para la temporada.
 *
 * `movimiento` filtra: pasando 'SQ' se buscan primero las fases propias de
 * la sentadilla y, si no hay ninguna, se cae a las generales (`movement`
 * nulo). Ese respaldo es lo que hace que el selector por movimiento
 * funcione desde el primer día sin obligar al coach a escribir tres
 * temporadas paralelas.
 */
export function faseActual(
    fases: readonly FaseDeTemporada[],
    movimiento?: string | null,
    hoy: Date = new Date()
): FaseResuelta | null {
    const propias = movimiento
        ? fases.filter(f => f.movement === movimiento)
        : [];
    const generales = fases.filter(f => f.movement == null);

    const candidatas = propias.length > 0 ? propias : generales;
    if (candidatas.length === 0) return null;

    const resueltas = resolverFases(candidatas, hoy);
    return resueltas.find(r => r.estado === 'actual') ?? null;
}

/**
 * Todas las fases de un movimiento (o generales), ya resueltas.
 * Mismo respaldo que `faseActual`.
 */
export function fasesDe(
    fases: readonly FaseDeTemporada[],
    movimiento?: string | null,
    hoy: Date = new Date()
): FaseResuelta[] {
    const propias = movimiento ? fases.filter(f => f.movement === movimiento) : [];
    const generales = fases.filter(f => f.movement == null);
    return resolverFases(propias.length > 0 ? propias : generales, hoy);
}
