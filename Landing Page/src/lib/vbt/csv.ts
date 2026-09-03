/**
 * ANVIL STRENGTH — LECTURA DE FICHEROS DE ENCODER
 * =====================================================================
 * Convierte el CSV que exporta un encoder en las cifras que la aplicación
 * guarda: velocidad de cada repetición y resumen de la serie.
 *
 * El mapeo de columnas vive en `features/coach/utils/vbtParser.ts` y se
 * reutiliza tal cual: cada fabricante llama a la velocidad media de una
 * forma distinta ("Vm", "Avg Vel", "Mean Velocity"…) y esa lista ya está
 * hecha y probada contra ficheros reales.
 *
 * Este módulo añade lo que faltaba: agrupar por serie y resumir. Antes, un
 * CSV solo se podía DIBUJAR; sus números no llegaban a la base de datos, así
 * que comparar la velocidad de hoy con la del mes pasado obligaba a abrir dos
 * gráficas y mirarlas a ojo.
 */

import Papa from 'papaparse';
import { mapRowToVbt, isValidVbtRow, type VbtRow } from '../../features/coach/utils/vbtParser';
import { velocityLoss } from './analysis';
import type { VbtMetrics } from '../../types/training';

/**
 * Una repetición suelta, con las tres magnitudes que se pueden contrastar.
 *
 * Existe para la calibración con encoder (Fases 9 y 10): comparar PWR con un
 * aparato de referencia se hace **repetición a repetición**, y el resumen de
 * la serie no sirve para eso. Una serie donde PWR mide la primera repetición
 * 5 cm/s de más y la última 5 cm/s de menos tiene un resumen impecable y dos
 * repeticiones mal medidas.
 *
 * Las unidades son las de la aplicación: m/s y METROS.
 */
export interface ParsedVbtRep {
    /** Posición dentro de la serie, empezando en 1. */
    index: number;
    meanVelocity: number | null;
    peakVelocity: number | null;
    romM: number | null;
}

/** Una serie reconstruida a partir de las filas del fichero. */
export interface ParsedVbtSet {
    /** Número de serie tal y como venía en el fichero. */
    setNumber: number;
    reps: number;
    /** Carga de la serie, si el fichero la trae. */
    loadKg: number | null;
    /** Velocidad media de cada repetición, en orden. */
    repVelocities: number[];
    /** Cada repetición con su detalle. Para contrastar contra PWR. */
    repDetails: ParsedVbtRep[];
    metrics: VbtMetrics;
}

export interface ParsedVbtFile {
    sets: ParsedVbtSet[];
    /** Filas útiles encontradas. Cero significa formato no reconocido. */
    rowCount: number;
    /** Resumen del fichero entero, para cuando se trata como una sola serie. */
    overall: VbtMetrics;
}

/** Media aritmética, o null si no hay nada que promediar. */
function mean(values: number[]): number | null {
    const usable = values.filter(v => Number.isFinite(v) && v > 0);
    if (usable.length === 0) return null;
    return usable.reduce((a, b) => a + b, 0) / usable.length;
}

function max(values: number[]): number | null {
    const usable = values.filter(v => Number.isFinite(v) && v > 0);
    return usable.length ? Math.max(...usable) : null;
}

/**
 * El ROM de los ficheros llega en centímetros o en milímetros según el
 * fabricante, y la aplicación lo guarda en METROS.
 *
 * La heurística mira la magnitud porque no hay forma fiable de saber la
 * unidad: un recorrido de sentadilla está entre 0,3 y 0,8 m, entre 30 y 80
 * cm, y entre 300 y 800 mm. Los tres rangos no se solapan, así que el propio
 * número dice en qué unidad viene.
 */
function romToMeters(raw: number | null): number | null {
    if (raw === null || raw <= 0) return null;
    if (raw > 100) return raw / 1000;  // milímetros
    if (raw > 3) return raw / 100;     // centímetros
    return raw;                        // ya en metros
}

/** Resume un grupo de repeticiones en las métricas que se guardan. */
function summarize(rows: VbtRow[]): VbtMetrics {
    const velocities = rows.map(r => r.Vm || r.Vmp).filter(v => v > 0);

    return {
        meanVelocity: mean(velocities),
        peakVelocity: max(rows.map(r => r.Vmax)),
        // La pérdida se recalcula SIEMPRE a partir de las repeticiones, aunque
        // el fichero traiga su propia columna de "Loss": cada fabricante la
        // define contra una referencia distinta (la primera repetición, la
        // mejor, la media de las dos primeras) y mezclarlas haría incomparables
        // dos series medidas con aparatos distintos.
        velocityLoss: velocityLoss(velocities),
        meanPower: mean(rows.map(r => r.Potencia)),
        peakPower: max(rows.map(r => r.Potencia)),
        rom: romToMeters(mean(rows.map(r => r.ROM))),
        est1RM: null,
    };
}

/** Nº de serie de una fila. Sin él, todo el fichero es una sola serie. */
function setNumberOf(row: VbtRow): number {
    const match = row.name.match(/S(\d+)/i);
    return match ? Number(match[1]) : 1;
}

/**
 * Interpreta el texto de un CSV ya leído.
 *
 * Se separa de la descarga para poder usarlo con un `File` local (entrada
 * manual) y con una URL (fichero ya subido) sin duplicar el mapeo.
 */
export function parseVbtText(text: string): ParsedVbtFile {
    const result = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
    });

    const rows = (result.data ?? []).map(mapRowToVbt).filter(isValidVbtRow);

    const bySet = new Map<number, VbtRow[]>();
    for (const row of rows) {
        const n = setNumberOf(row);
        const list = bySet.get(n);
        if (list) list.push(row);
        else bySet.set(n, [row]);
    }

    const sets: ParsedVbtSet[] = [...bySet.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([setNumber, group]) => ({
            setNumber,
            reps: group.length,
            loadKg: max(group.map(r => r.Carga)),
            repVelocities: group.map(r => r.Vm || r.Vmp).filter(v => v > 0),
            // El ROM se convierte a metros AQUÍ y no al compararlo: cada
            // fabricante lo exporta en la unidad que le parece, y dejar la
            // conversión aguas abajo es garantizar que un día se compare un
            // recorrido en centímetros contra uno en metros y salga un error
            // del 9.900% que parece un fallo del analizador.
            repDetails: group.map((r, i) => ({
                index: i + 1,
                meanVelocity: (r.Vm || r.Vmp) > 0 ? (r.Vm || r.Vmp) : null,
                peakVelocity: r.Vmax > 0 ? r.Vmax : null,
                romM: romToMeters(r.ROM > 0 ? r.ROM : null),
            })),
            metrics: summarize(group),
        }));

    return { sets, rowCount: rows.length, overall: summarize(rows) };
}

/** Lee un fichero del disco del usuario. */
export function parseVbtFile(file: File): Promise<ParsedVbtFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.onload = () => {
            try {
                resolve(parseVbtText(String(reader.result ?? '')));
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}
