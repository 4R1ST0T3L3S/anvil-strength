import Papa from 'papaparse';

export interface Competition {
    fecha: string;
    campeonato: string;
    sede: string;
    inscripciones: string;
}

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';
// Fallback proxy strategy
const fetchWithFallback = async (targetUrl: string): Promise<string> => {
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, // Usually very reliable
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
        // `https://thingproxy.freeboard.io/fetch/${targetUrl}` // Backup if needed
    ];

    let lastError: any;

    for (const proxy of proxies) {
        try {
            console.log(`Trying proxy: ${proxy}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per proxy

            const response = await fetch(proxy, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`Status ${response.status}`);
            const text = await response.text();
            if (!text || text.trim().length === 0) throw new Error('Empty response');

            return text;
        } catch (err: any) {
            console.warn(`Proxy failed: ${proxy}`, err.name === 'AbortError' ? 'Timeout' : err.message);
            lastError = err;
        }
    }

    throw new Error(`All proxies failed. Last error: ${lastError?.message || 'Unknown'}`);
};

// Helper to parse Spanish date formats
const parseDate = (dateStr: string): Date | null => {
    try {
        const year = 2026;
        const months: { [key: string]: number } = {
            'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
        };

        const cleanStr = dateStr.toLowerCase().trim();

        // Match standard format "DD-DD mmm" or "DD mmm"
        // We only care about the END date for filtering "past" events
        // Examples: "17-ene", "24-25 ene", "28-01 feb-mar"

        // Find all month names in the string
        const foundMonths = Object.keys(months).filter(m => cleanStr.includes(m));

        if (foundMonths.length === 0) return null;

        // Take the last month found (covers "feb-mar" case)
        const lastMonthStr = foundMonths[foundMonths.length - 1];
        const monthIndex = months[lastMonthStr];

        // Find numbers. If range "24-25", we want 25. If "28-01", we want 01.
        // We can split by tokens and find the number closest to the month string?
        // Simpler: Extract all numbers, take the last one IF it appears *before* or near the month?
        // Actually, "28-01 feb-mar" -> logic is tricky.

        // Let's rely on the LAST number found in the string?
        // "24-25 ene" -> 25. Correct.
        // "17-ene" -> 17. Correct.
        // "28-01 feb-mar" -> 01 (matches mar). Correct.

        const numbers = cleanStr.match(/\d+/g);
        if (!numbers) return null;

        const day = parseInt(numbers[numbers.length - 1]);

        if (day < 1 || day > 31) return null;

        return new Date(year, monthIndex, day);
    } catch (e) {
        return null;
    }
};

export const fetchCompetitions = async (): Promise<Competition[]> => {
    try {
        const csvText = await fetchWithFallback(SHEET_URL);
        console.log('CSV Raw Data Preview:', csvText.substring(0, 500)); // Debug log

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: false, // We will find headers manually
                skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data as string[][];

                    // Strategy: Find the row index that contains "FECHA" and "CAMPEONATO"
                    let headerRowIndex = -1;

                    for (let i = 0; i < Math.min(rows.length, 20); i++) { // Check first 20 rows
                        const rowStr = JSON.stringify(rows[i]).toLowerCase();
                        // Adjusted candidates based on screenshot: "FECHA" and ("COMPETICIONES" or "LOCALIDAD" or "ORGANIZADOR")
                        if (rowStr.includes('fecha') && (
                            rowStr.includes('competiciones') ||
                            rowStr.includes('localidad') ||
                            rowStr.includes('organizador')
                        )) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        console.error('No header found in rows:', rows.slice(0, 10));
                        reject(new Error('No se encontró la fila de cabecera (FECHA/COMPETICIONES/LOCALIDAD)'));
                        return;
                    }

                    console.log(`Header found at row ${headerRowIndex}:`, rows[headerRowIndex]);

                    const headers = rows[headerRowIndex].map(h => h.toString().toLowerCase().trim());
                    const dateIdx = headers.findIndex(h => h.includes('fecha'));
                    // Match "campeonato" or "competiciones" or "nombre"
                    const nameIdx = headers.findIndex(h => h.includes('campeonato') || h.includes('competiciones') || h.includes('nombre'));
                    // Match "sede" or "localidad" or "lugar"
                    const locIdx = headers.findIndex(h => h.includes('sede') || h.includes('localidad') || h.includes('lugar'));
                    // Match "inscripciones" or "link" or just "inscrip"
                    const linkIdx = headers.findIndex(h => h.includes('inscrip') || h.includes('link'));

                    if (dateIdx === -1 || nameIdx === -1) {
                        reject(new Error(`Cabeceras críticas no encontradas. Indices: Date=${dateIdx}, Name=${nameIdx}`));
                        return;
                    }

                    const today = new Date();
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(today.getDate() - 7);

                    const validData: Competition[] = rows
                        .slice(headerRowIndex + 1)
                        .map(row => ({
                            fecha: row[dateIdx] || '',
                            campeonato: row[nameIdx] || '',
                            sede: locIdx !== -1 ? row[locIdx] : 'Por determinar',
                            inscripciones: linkIdx !== -1 ? row[linkIdx] : ''
                        }))
                        .filter(item => {
                            // 1. Basic Validity
                            const isValid = item.fecha &&
                                item.fecha.length > 2 &&
                                !item.fecha.toLowerCase().includes('fecha') &&
                                !item.fecha.toLowerCase().includes('trimestre') &&
                                item.campeonato;

                            if (!isValid) return false;

                            // 2. Date Filtering (Remove if ended > 1 week ago)
                            const itemDate = parseDate(item.fecha);

                            // If we can't parse the date, we KEEP it to be safe (don't hide potentially valid events)
                            if (!itemDate) return true;

                            // If itemDate < oneWeekAgo => It's old, filter it out
                            if (itemDate < oneWeekAgo) {
                                return false;
                            }

                            return true;
                        });

                    console.log(`Parsed ${validData.length} valid competitions.`);
                    resolve(validData);
                },
                error: (error: any) => {
                    console.error('PapaParse logic error:', error);
                    reject(new Error(`Error parseando CSV: ${error.message}`));
                }
            });
        });
    } catch (error: any) {
        console.error('Service catch block:', error);
        // Propagate the error message
        throw new Error(error.message || 'Error desconocido al cargar el calendario');
    }
};
