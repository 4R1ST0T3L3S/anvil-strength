import Papa from 'papaparse';
import { AEP_2026_FALLBACK_CSV, AEP_2026_FALLBACK_UPDATED } from '../data/aepCalendar2026';
import { CapacitorHttp } from '@capacitor/core';
import { esNativo, URL_WEB } from '../lib/plataforma';

export interface Competition {
    fecha: string;
    dateIso?: string;
    endDateIso?: string;
    campeonato: string;
    sede: string;
    organizador?: string;
    inscripciones: string;
    level: 'IPF' | 'EPF' | 'NACIONAL' | 'AEP 1' | 'AEP 2' | 'AEP 3' | 'COMPETICIÓN';
}

/** De dónde han salido los datos que se están enseñando. */
export type CompetitionSource = 'red' | 'cache' | 'local';

export interface CompetitionsResult {
    competitions: Competition[];
    source: CompetitionSource;
    /** Cuándo se leyeron de la federación. Null si vienen del respaldo local. */
    fetchedAt: string | null;
    /** Qué falló, si es que falló algo. Se enseña junto a los datos, no en vez de ellos. */
    warning: string | null;
}

/**
 * Ruta propia, en el mismo origen. Ver `api/aep.ts`.
 *
 * Sustituye a los tres proxies públicos que había aquí. Aquellos eran
 * servicios ajenos y gratuitos, y cuando caían —que caían— la pantalla se
 * quedaba vacía sin explicación. Además ninguno estaba en la política de
 * contenido del sitio, que solo permite `connect-src 'self'`.
 */
const CSV_ENDPOINT = '/api/aep';

const CACHE_KEY = 'aep_calendar_data_v3';

interface CachedPayload {
    timestamp: number;
    data: Competition[];
}

// =====================================================================
// PARSEO
// =====================================================================

/**
 * Elige la fecha "buena" de una celda que puede traer un día suelto ("17 ene")
 * o un rango ("24-25 ene", "28-01 feb-mar").
 */
const parseBestDate = (dateStr: string): { str: string; iso?: string; endIso?: string } => {
    try {
        const year = 2026;
        const months: { [key: string]: number } = {
            ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
            jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
        };

        const cleanStr = dateStr.toLowerCase().trim();

        // Los meses, EN EL ORDEN EN QUE APARECEN en el texto. Antes se sacaban
        // recorriendo el diccionario, que va de enero a diciembre, así que en
        // "29 ago - 07 sep" el orden de aparición se perdía.
        const monthMatches = [...cleanStr.matchAll(/ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic/g)]
            .map(m => m[0]);

        if (monthMatches.length === 0) return { str: dateStr };

        const startMonth = monthMatches[0];
        const endMonth = monthMatches[monthMatches.length - 1];
        const crossesMonths = startMonth !== endMonth;

        const numbers = cleanStr.match(/\d+/g);
        if (!numbers) return { str: dateStr };

        const dayCandidates = numbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 31);
        if (dayCandidates.length === 0) return { str: dateStr };

        const cap = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
        const iso = (month: string, day: number) =>
            `${year}-${String(months[month] + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (dayCandidates.length === 1) {
            return {
                str: `${dayCandidates[0]} ${cap(endMonth)}`,
                iso: iso(endMonth, dayCandidates[0]),
            };
        }

        // Con DOS meses no se puede ordenar por número: "29 ago - 07 sep"
        // ordenado da 7-29, que es un rango al revés y además del mes
        // equivocado. Cuando el rango cruza de mes manda el orden de lectura;
        // dentro de un mismo mes sí se ordena, porque hay hojas que escriben
        // "25-24 ene".
        let firstDay: number;
        let lastDay: number;

        if (crossesMonths) {
            firstDay = dayCandidates[0];
            lastDay = dayCandidates[dayCandidates.length - 1];
        } else {
            const sorted = [...dayCandidates].sort((a, b) => a - b);
            firstDay = sorted[0];
            lastDay = sorted[sorted.length - 1];
        }

        return {
            str: crossesMonths
                ? `${firstDay} ${cap(startMonth)} - ${lastDay} ${cap(endMonth)}`
                : `${firstDay}-${lastDay} ${cap(endMonth)}`,
            iso: iso(startMonth, firstDay),
            endIso: iso(endMonth, lastDay),
        };
    } catch {
        return { str: dateStr };
    }
};

/** Nivel de la competición: manda la columna del Excel; el nombre es el respaldo. */
const determineLevel = (name: string, rawLevel: string = ''): Competition['level'] => {
    const n = name.toLowerCase();
    const l = rawLevel.toLowerCase().trim();

    if (l.includes('aep-1') || l.includes('aep 1') || l.includes('aep1')) return 'AEP 1';
    if (l.includes('aep-2') || l.includes('aep 2') || l.includes('aep2') || l.includes('este-2')) return 'AEP 2';
    if (l.includes('aep-3') || l.includes('aep 3') || l.includes('aep3')) return 'AEP 3';
    if (l.includes('nacional') || l.includes('españa')) return 'NACIONAL';
    if (l.includes('europeo') || l.includes('epf') || l.includes('western')) return 'EPF';
    if (l.includes('mundial') || l.includes('world') || l.includes('ipf') || l.includes('olimpiada')) return 'IPF';

    if (n.includes('world') || n.includes('mundial') || n.includes('ipf') || n.includes('olimpiada')) return 'IPF';
    if (n.includes('europeo') || n.includes('epf') || n.includes('western')) return 'EPF';
    if (n.includes('nacional') || n.includes('españa') || n.includes('copa de españa')) return 'NACIONAL';
    if (n.includes('aep-1') || n.includes('aep 1')) return 'AEP 1';
    if (n.includes('aep-2') || n.includes('aep 2') || n.includes('este-2')) return 'AEP 2';
    if (n.includes('aep-3') || n.includes('aep 3') || n.includes('regional')) return 'AEP 3';

    return 'COMPETICIÓN';
};

/**
 * CSV crudo -> competiciones.
 *
 * Es SÍNCRONO y no devuelve una promesa. Antes vivía dentro del callback
 * `complete` de Papa envuelto en un `new Promise`, lo que ataba el parseo al
 * único origen que había. Ahora el mismo código sirve para lo que llega de la
 * red y para el respaldo local, así que no hay dos caminos que puedan
 * comportarse distinto.
 */
export function parseCompetitionsCsv(csvText: string): Competition[] {
    const results = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
    const rows = results.data;

    // La cabecera no está en la primera fila: la hoja de la AEP arranca con el
    // logotipo, el título y la fecha de actualización.
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const rowStr = JSON.stringify(rows[i]).toLowerCase();
        if (
            rowStr.includes('fecha') &&
            (rowStr.includes('competicion') || rowStr.includes('localidad') ||
                rowStr.includes('organizador') || rowStr.includes('club'))
        ) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        throw new Error('No se encontró la fila de cabecera (FECHA / COMPETICIONES / LOCALIDAD)');
    }

    const headers = rows[headerRowIndex].map(h => h.toString().toLowerCase().trim());
    const dateIdx = headers.findIndex(h => h.includes('fecha'));
    const nameIdx = headers.findIndex(h => h.includes('campeonato') || h.includes('competicion') || h.includes('nombre'));
    const locIdx = headers.findIndex(h => h.includes('sede') || h.includes('localidad') || h.includes('lugar'));
    const orgIdx = headers.findIndex(h => h.includes('organizador') || h.includes('club'));
    const linkIdx = headers.findIndex(h => h.includes('inscrip') || h.includes('link'));

    let levelIdx = headers.findIndex(h =>
        h.includes('nivel') || h.includes('caracter') || h.includes('carácter') || h.includes('tipo')
    );
    // La columna F es la del nivel en el formato histórico de la federación.
    if (levelIdx === -1 && headers.length > 5) levelIdx = 5;

    if (dateIdx === -1 || nameIdx === -1) {
        throw new Error(`Cabeceras críticas no encontradas (fecha=${dateIdx}, nombre=${nameIdx})`);
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(new Date().getDate() - 7);

    return rows
        .slice(headerRowIndex + 1)
        .map(row => {
            const rawDateStr = row[dateIdx] || '';
            const name = row[nameIdx] || '';
            const rawLevel = levelIdx !== -1 ? (row[levelIdx] || '') : '';

            const level = determineLevel(name, rawLevel);
            const parsed = parseBestDate(rawDateStr);

            const sede = locIdx !== -1 ? (row[locIdx] || '') : '';
            const organizador = orgIdx !== -1 ? (row[orgIdx] || '') : '';

            return {
                fecha: parsed.str,
                dateIso: parsed.iso,
                endDateIso: parsed.endIso,
                campeonato: name,
                sede: sede || 'Por determinar',
                organizador,
                inscripciones: linkIdx !== -1 ? row[linkIdx] : '',
                level,
                // Solo para filtrar: distingue una competición de verdad de una
                // fila de la leyenda. No sale de esta función.
                _hasData: Boolean(rawLevel.trim() || sede.trim() || organizador.trim()),
            };
        })
        .filter(item => {
            const isValid =
                item.fecha &&
                item.fecha.length > 2 &&
                !item.fecha.toLowerCase().includes('fecha') &&
                !item.fecha.toLowerCase().includes('trimestre') &&
                item.campeonato;

            if (!isValid) return false;

            // La hoja de la AEP termina con una LEYENDA de colores
            // ("CÓDIGO / DE / COLORES" + el significado de cada nivel). Esas
            // filas tienen nombre pero ni nivel, ni sede, ni organizador, y se
            // colaban en el calendario como si fueran competiciones:
            // "CAMPEONATO CLASIFICATORIO NACIONAL" con fecha "CÓDIGO".
            if (!item._hasData) return false;

            // Las que no tienen fecha cerrada ("pendiente", "sin confirmar")
            // se quedan: son competiciones reales del año en curso.
            if (!item.dateIso) return true;
            return new Date(item.dateIso) >= oneWeekAgo;
        })
        .map(({ _hasData, ...competition }) => {
            void _hasData;
            return competition satisfies Competition;
        });
}

// =====================================================================
// CACHÉ
// =====================================================================

function readCache(): CachedPayload | null {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        const parsed = JSON.parse(cached) as CachedPayload;
        return Array.isArray(parsed.data) ? parsed : null;
    } catch {
        return null;
    }
}

function writeCache(data: Competition[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
        /* modo privado o cuota llena: la caché es una mejora, no un requisito */
    }
}

// =====================================================================
// API PÚBLICA
// =====================================================================

/**
 * Trae el calendario, en este orden:
 *
 *   1. Caché fresca (de hoy mismo). Instantáneo.
 *   2. La federación, a través de nuestro propio proxy.
 *   3. Caché caducada, si la hay.
 *   4. La copia local del Excel oficial.
 *
 * NUNCA lanza. Un calendario es información de consulta: quedarse sin él
 * porque un servidor de terceros esté caído no es una respuesta aceptable, y
 * era exactamente lo que pasaba. Lo que sí hace es decir de dónde salen los
 * datos, para que la pantalla lo pueda advertir.
 */
export async function fetchCompetitionsDetailed(
    { force = false }: { force?: boolean } = {}
): Promise<CompetitionsResult> {
    const cached = readCache();

    // La caché caduca a las 12:00 de la noche (cambio de día), no a las N
    // horas: el calendario de la federación no cambia tan seguido como
    // para justificar refrescarlo varias veces en el mismo día, y así se
    // ahorra una petición al proxy en cada apertura de la app.
    const isSameDay = cached && (new Date(Date.now()).setHours(0, 0, 0, 0) === new Date(cached.timestamp).setHours(0, 0, 0, 0));

    if (!force && cached && isSameDay) {
        return {
            competitions: cached.data,
            source: 'cache',
            fetchedAt: new Date(cached.timestamp).toISOString(),
            warning: null,
        };
    }

    let networkError = 'No se pudo contactar con la federación';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        let csvText: string;
        if (esNativo()) {
            // Dentro del APK no existe `/api/aep` (es una función de Vercel) y
            // la web no manda cabeceras CORS. `CapacitorHttp` hace la petición
            // desde el lado nativo, que no tiene CORS que respetar.
            clearTimeout(timeoutId);
            const respuesta = await CapacitorHttp.get({
                url: `${URL_WEB}${CSV_ENDPOINT}`,
                headers: { Accept: 'text/csv' },
                connectTimeout: 12000,
                readTimeout: 12000,
                responseType: 'text',
            });
            if (respuesta.status < 200 || respuesta.status >= 300) {
                throw new Error(`El servidor respondió ${respuesta.status}`);
            }
            csvText = typeof respuesta.data === 'string' ? respuesta.data : String(respuesta.data ?? '');
        } else {
            const response = await fetch(CSV_ENDPOINT, {
                signal: controller.signal,
                headers: { Accept: 'text/csv' },
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`El servidor respondió ${response.status}`);

            csvText = await response.text();
        }
        if (!csvText.trim()) throw new Error('Respuesta vacía');

        const competitions = parseCompetitionsCsv(csvText);
        if (competitions.length === 0) throw new Error('La hoja no traía ninguna competición');

        writeCache(competitions);
        return { competitions, source: 'red', fetchedAt: new Date().toISOString(), warning: null };
    } catch (error) {
        networkError = error instanceof Error ? error.message : String(error);
        console.warn('Calendario AEP: falló la lectura remota —', networkError);
    }

    if (cached) {
        return {
            competitions: cached.data,
            source: 'cache',
            fetchedAt: new Date(cached.timestamp).toISOString(),
            warning: 'No se ha podido comprobar si hay cambios. Estás viendo la última versión descargada.',
        };
    }

    try {
        return {
            competitions: parseCompetitionsCsv(AEP_2026_FALLBACK_CSV),
            source: 'local',
            fetchedAt: null,
            warning: `No se ha podido contactar con la federación. Calendario oficial del ${AEP_2026_FALLBACK_UPDATED}.`,
        };
    } catch (error) {
        console.error('Calendario AEP: el respaldo local tampoco se pudo leer', error);
        return {
            competitions: [],
            source: 'local',
            fetchedAt: null,
            warning: `No se pudo cargar el calendario: ${networkError}`,
        };
    }
}

/** Compatibilidad con las pantallas que solo quieren la lista. */
export const fetchCompetitions = async (): Promise<Competition[]> =>
    (await fetchCompetitionsDetailed()).competitions;
