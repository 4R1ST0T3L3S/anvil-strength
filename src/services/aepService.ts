import Papa from 'papaparse';

export interface Competition {
    fecha: string;
    campeonato: string;
    sede: string;
    inscripciones: string;
}

const DATA_URL = 'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';

export const fetchCompetitions = async (): Promise<Competition[]> => {
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error('Error fetching data');
        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    // Filter and map raw data
                    // We look for rows that have at least a date and a championship name
                    const validData = results.data
                        .map((row: any) => ({
                            fecha: row['FECHA'] || row['Fecha'] || '', // Handle strict casing if header varies
                            campeonato: row['CAMPEONATO'] || row['Campeonato'] || '',
                            sede: row['SEDE'] || row['Sede'] || 'Por determinar',
                            inscripciones: row['INSCRIPCIONES'] || row['Inscripciones'] || ''
                        }))
                        .filter(item => item.fecha && item.campeonato && !item.fecha.toLowerCase().includes('fecha')); // Basic filter

                    resolve(validData);
                },
                error: (error: any) => {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error('Error fetching competitions:', error);
        return [];
    }
};
