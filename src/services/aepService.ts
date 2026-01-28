import Papa from 'papaparse';

export interface Competition {
    fecha: string;
    campeonato: string;
    sede: string;
    inscripciones: string;
}

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';
// Using AllOrigins as a proxy to bypass CORS
const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_URL)}`;

export const fetchCompetitions = async (): Promise<Competition[]> => {
    try {
        console.log('Fetching calendar from:', PROXY_URL);
        const response = await fetch(PROXY_URL);

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();
        console.log('CSV Raw Data Preview:', csvText.substring(0, 500)); // Debug log

        if (!csvText || csvText.trim().length === 0) {
            throw new Error('Recibido CSV vacío');
        }

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
                        if (rowStr.includes('fecha') && (rowStr.includes('campeonato') || rowStr.includes('nombre'))) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        console.error('No header found in rows:', rows.slice(0, 10));
                        reject(new Error('No se encontró la fila de cabecera (FECHA/CAMPEONATO)'));
                        return;
                    }

                    console.log(`Header found at row ${headerRowIndex}:`, rows[headerRowIndex]);

                    const headers = rows[headerRowIndex].map(h => h.toString().toLowerCase().trim());
                    const dateIdx = headers.findIndex(h => h.includes('fecha'));
                    const nameIdx = headers.findIndex(h => h.includes('campeonato') || h.includes('nombre'));
                    const locIdx = headers.findIndex(h => h.includes('sede') || h.includes('lugar'));
                    const linkIdx = headers.findIndex(h => h.includes('inscrip') || h.includes('link'));

                    if (dateIdx === -1 || nameIdx === -1) {
                        reject(new Error(`Cabeceras críticas no encontradas. Indices: Date=${dateIdx}, Name=${nameIdx}`));
                        return;
                    }

                    const validData: Competition[] = rows
                        .slice(headerRowIndex + 1)
                        .map(row => ({
                            fecha: row[dateIdx] || '',
                            campeonato: row[nameIdx] || '',
                            sede: locIdx !== -1 ? row[locIdx] : 'Por determinar',
                            inscripciones: linkIdx !== -1 ? row[linkIdx] : ''
                        }))
                        .filter(item => {
                            // Strict filtering: Must have date and name, and date shouldn't be the header repeated
                            return item.fecha &&
                                item.fecha.length > 2 &&
                                !item.fecha.toLowerCase().includes('fecha') &&
                                item.campeonato;
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
