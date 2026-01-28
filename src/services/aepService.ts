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
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    let lastError: any;

    for (const proxy of proxies) {
        try {
            console.log(`Trying proxy: ${proxy}`);
            const response = await fetch(proxy);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const text = await response.text();
            if (!text || text.trim().length === 0) throw new Error('Empty response');
            return text;
        } catch (err) {
            console.warn(`Proxy failed: ${proxy}`, err);
            lastError = err;
        }
    }

    throw new Error(`All proxies failed. Last error: ${lastError?.message}`);
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
