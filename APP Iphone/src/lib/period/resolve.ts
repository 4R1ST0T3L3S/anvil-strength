/**
 * ANVIL STRENGTH — RESOLUCIÓN DE UN PERIODO
 * =====================================================================
 *
 * Convierte "esta semana" o "el bloque de fuerza" en algo con lo que se puede
 * filtrar: un rango de fechas, o una lista de semanas ISO cuando no hay
 * fechas que valgan.
 *
 * Todo el cálculo de semanas ISO se apoya en `src/utils/dateUtils.ts`, que
 * ya espeja lo que hace `week_is_released()` en la base de datos. No se
 * duplica aquí: dos implementaciones de la norma ISO 8601 acaban discrepando
 * en los años que empiezan en viernes, y ese desajuste es imposible de
 * encontrar mirando la pantalla.
 */

import { getISOWeekStart, getWeekNumber, startOfToday } from '../../utils/dateUtils';
import type { Periodo, PeriodoResuelto, Resolucion } from './types';

/** Un bloque, con lo mínimo que hace falta para situarlo en el tiempo. */
export interface BloqueTemporal {
    id: string;
    name?: string | null;
    start_week?: number | null;
    end_week?: number | null;
    start_date?: string | null;
}

const DIA = 24 * 60 * 60 * 1000;

/** Medianoche local del día de `d`. */
function aMedianoche(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Último instante del día de `d` (23:59:59.999 local). */
function aFinDelDia(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Las semanas ISO que caen dentro de un rango de fechas.
 *
 * Se recorre semana a semana en vez de calcular la diferencia, porque el
 * número de semana se reinicia al cambiar de año y una resta daría negativo
 * en un rango que cruce diciembre.
 */
function semanasEntre(desde: Date, hasta: Date): number[] {
    const salida: number[] = [];
    let cursor = aMedianoche(desde);
    const fin = aMedianoche(hasta).getTime();

    // Tope de seguridad: 520 semanas son diez años. Sin él, una fecha
    // corrupta convierte esto en un bucle infinito que cuelga la pestaña.
    let vueltas = 0;
    while (cursor.getTime() <= fin && vueltas < 520) {
        const semana = getWeekNumber(cursor);
        if (!salida.includes(semana)) salida.push(semana);
        cursor = new Date(cursor.getTime() + 7 * DIA);
        vueltas++;
    }
    return salida;
}

/** "Semana 34 · 18-24 ago". Para el selector. */
function etiquetaDeSemana(fecha: Date): string {
    const lunes = getISOWeekStart(getWeekNumber(fecha), fecha.getFullYear());
    const domingo = new Date(lunes.getTime() + 6 * DIA);
    const f = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `${f(lunes)} – ${f(domingo)}`;
}

/**
 * Resuelve un periodo.
 *
 * `bloques` hace falta solo para el tipo `bloque`; para el resto se ignora.
 * `hoy` se puede pasar para poder probar esto sin depender del reloj.
 */
export function resolverPeriodo(
    periodo: Periodo,
    { bloques = [], hoy = startOfToday() }: { bloques?: BloqueTemporal[]; hoy?: Date } = {}
): PeriodoResuelto {
    const base = { periodo, motivoOrdinal: null as string | null };

    switch (periodo.tipo) {
        // ---------------------------------------------------------------
        case 'todo':
            return {
                ...base,
                resolucion: 'calendar',
                desde: null,
                hasta: null,
                semanas: null,
                etiqueta: 'Desde siempre',
            };

        // ---------------------------------------------------------------
        case 'semana': {
            const lunes = getISOWeekStart(getWeekNumber(hoy), hoy.getFullYear());
            const domingo = new Date(lunes.getTime() + 6 * DIA);
            return {
                ...base,
                resolucion: 'calendar',
                desde: aMedianoche(lunes),
                hasta: aFinDelDia(domingo),
                semanas: [getWeekNumber(hoy)],
                etiqueta: `Esta semana · ${etiquetaDeSemana(hoy)}`,
            };
        }

        // ---------------------------------------------------------------
        case 'mes': {
            const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            // Día 0 del mes siguiente = último día de este.
            const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
            return {
                ...base,
                resolucion: 'calendar',
                desde: aMedianoche(primero),
                hasta: aFinDelDia(ultimo),
                semanas: semanasEntre(primero, ultimo),
                etiqueta: hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
            };
        }

        // ---------------------------------------------------------------
        case 'ultimas': {
            const n = Math.max(1, periodo.semanas ?? 4);
            const lunesDeEsta = getISOWeekStart(getWeekNumber(hoy), hoy.getFullYear());
            // `n` semanas CONTANDO la actual: hacia atrás se retrocede n-1.
            const desde = new Date(lunesDeEsta.getTime() - (n - 1) * 7 * DIA);
            const hasta = new Date(lunesDeEsta.getTime() + 6 * DIA);
            return {
                ...base,
                resolucion: 'calendar',
                desde: aMedianoche(desde),
                hasta: aFinDelDia(hasta),
                semanas: semanasEntre(desde, hasta),
                etiqueta: `Últimas ${n} semanas`,
            };
        }

        // ---------------------------------------------------------------
        case 'bloque': {
            const bloque = bloques.find(b => b.id === periodo.blockId);

            if (!bloque) {
                return {
                    ...base,
                    resolucion: 'ordinal',
                    desde: null,
                    hasta: null,
                    semanas: null,
                    etiqueta: 'Bloque',
                    motivoOrdinal: 'Ese bloque ya no está en la lista.',
                };
            }

            const nombre = bloque.name?.trim() || 'Bloque';
            const primeraSemana = bloque.start_week ?? 1;
            const ultimaSemana = bloque.end_week ?? primeraSemana;
            const semanas = Array.from(
                { length: Math.max(1, ultimaSemana - primeraSemana + 1) },
                (_, i) => primeraSemana + i
            );

            /*
             * SIN FECHA DE INICIO, MODO ORDINAL. Decisión K10.
             *
             * Se puede agregar por número de semana —y eso es útil: "la
             * semana 3 del bloque"— pero NO se puede situar en el calendario,
             * así que ni "este mes" ni comparar con otro bloque por fechas
             * tienen respuesta. La interfaz lo dice con `motivoOrdinal` en vez
             * de inventarse un lunes.
             */
            if (!bloque.start_date) {
                return {
                    ...base,
                    resolucion: 'ordinal',
                    desde: null,
                    hasta: null,
                    semanas,
                    etiqueta: nombre,
                    motivoOrdinal:
                        'Este bloque no tiene fecha de inicio, así que sus semanas no se pueden situar en el calendario. ' +
                        'Ponle una fecha y las estadísticas por mes empezarán a funcionar.',
                };
            }

            const inicio = new Date(bloque.start_date);
            if (Number.isNaN(inicio.getTime())) {
                return {
                    ...base,
                    resolucion: 'ordinal',
                    desde: null,
                    hasta: null,
                    semanas,
                    etiqueta: nombre,
                    motivoOrdinal: 'La fecha de inicio de este bloque no es válida.',
                };
            }

            /*
             * El año sale de `start_date`, no del año en curso.
             *
             * `week_number` es la semana ISO DEL AÑO, así que un bloque que
             * empieza en la semana 50 y dura seis pasa a las semanas 1, 2 y 3
             * del año SIGUIENTE. Tomando el año actual, esas tres semanas se
             * situarían once meses antes de donde van.
             */
            const anyo = inicio.getFullYear();
            const lunesPrimera = getISOWeekStart(primeraSemana, anyo);

            // Si la última semana tiene un número MENOR que la primera, el
            // bloque cruza el fin de año y hay que buscarla en el siguiente.
            const anyoUltima = ultimaSemana < primeraSemana ? anyo + 1 : anyo;
            const lunesUltima = getISOWeekStart(ultimaSemana, anyoUltima);
            const domingoUltima = new Date(lunesUltima.getTime() + 6 * DIA);

            return {
                ...base,
                resolucion: 'calendar' as Resolucion,
                desde: aMedianoche(lunesPrimera),
                hasta: aFinDelDia(domingoUltima),
                semanas: semanasEntre(lunesPrimera, domingoUltima),
                etiqueta: nombre,
            };
        }
    }
}

/**
 * ¿Esta fecha entra en el periodo?
 *
 * En modo ordinal siempre devuelve `true`: sin calendario no se puede filtrar
 * por fecha, y devolver `false` escondería datos que sí existen. Quien filtre
 * en modo ordinal tiene que usar `semanas`.
 */
export function dentroDelPeriodo(fechaISO: string | null | undefined, p: PeriodoResuelto): boolean {
    if (p.resolucion === 'ordinal') return true;
    if (!p.desde && !p.hasta) return true;
    if (!fechaISO) return false;

    const t = new Date(fechaISO).getTime();
    if (Number.isNaN(t)) return false;
    if (p.desde && t < p.desde.getTime()) return false;
    if (p.hasta && t > p.hasta.getTime()) return false;
    return true;
}

/** ¿Esta semana ISO entra en el periodo? Sirve en las dos resoluciones. */
export function semanaDentroDelPeriodo(semana: number, p: PeriodoResuelto): boolean {
    if (!p.semanas) return true;
    return p.semanas.includes(semana);
}
