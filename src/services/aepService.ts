import Papa from 'papaparse';

export interface Competition {
    fecha: string;
    dateIso?: string;
    endDateIso?: string; // Add End Date ISO
    campeonato: string;
    sede: string;
    organizador?: string; // Added field
    inscripciones: string;
    level: 'IPF' | 'EPF' | 'NACIONAL' | 'AEP 1' | 'AEP 2' | 'AEP 3' | 'COMPETICIÓN';
}

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Mm-CytTHU59mqGk_oMuSMIGAG6eqYDt4/export?format=csv&gid=577884253';

// Fallback proxy strategy
const fetchWithFallback = async (targetUrl: string): Promise<string> => {
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    let lastError: unknown;

    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per proxy

            const response = await fetch(proxy, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`Status ${response.status}`);
            const text = await response.text();
            if (!text || text.trim().length === 0) throw new Error('Empty response');

            return text;
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            const errorName = err instanceof Error ? err.name : 'Error';
            console.warn(`Proxy failed: ${proxy}`, errorName === 'AbortError' ? 'Timeout' : errorMessage);
            lastError = err;
        }
    }

    const lastErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All proxies failed. Last error: ${lastErrorMessage || 'Unknown'}`);
};

// Helper to parse Spanish date formats and select the "Best" date based on rules:
// - If AEP 3: Prefer SUNDAY
// - If AEP 1 / AEP 2 / National: Prefer SATURDAY
// - If range detected: Return range start and end
const parseBestDate = (dateStr: string): { str: string, iso?: string, endIso?: string } => {
    try {
        const year = 2026;
        const months: { [key: string]: number } = {
            'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
        };

        const cleanStr = dateStr.toLowerCase().trim();
        const foundMonths = Object.keys(months).filter(m => cleanStr.includes(m));

        if (foundMonths.length === 0) return { str: dateStr }; // Return original if parse fails

        const lastMonthStr = foundMonths[foundMonths.length - 1];
        const monthIndex = months[lastMonthStr];

        // Extract all numbers (potential days)
        const numbers = cleanStr.match(/\d+/g);
        if (!numbers) return { str: dateStr };

        const dayCandidates = numbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 31);

        if (dayCandidates.length === 0) return { str: dateStr };

        // If only one day, return it
        if (dayCandidates.length === 1) {

            // Adjust simple string to be cleaner? e.g. "20 Ene"
            return {
                str: `${dayCandidates[0]} ${lastMonthStr.charAt(0).toUpperCase() + lastMonthStr.slice(1)}`,
                iso: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayCandidates[0]).padStart(2, '0')}`
            };
        }

        // Multiple days: Apply Logic
        // Determine target Day of Week (0=Sun, 6=Sat)
        // Rule: AEP 3 -> Sunday (0). Others -> Saturday (6).

        // NEWLOGIC: If range (e.g. 2 days), we want the START and END.
        // Assuming consecutive days from the candidates.
        dayCandidates.sort((a, b) => a - b);
        const firstDay = dayCandidates[0];
        const lastDay = dayCandidates[dayCandidates.length - 1];

        // Construct ISOs
        const startIso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(firstDay).padStart(2, '0')}`;
        const endIso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // formatted string "25-26 Ene"
        const formattedStr = `${firstDay}-${lastDay} ${lastMonthStr.charAt(0).toUpperCase() + lastMonthStr.slice(1)}`;

        return {
            str: formattedStr,
            iso: startIso,
            endIso: endIso
        };

    } catch {
        return { str: dateStr };
    }
};

// Helper to determine competition level based on strict hierarchy AND explicit Excel column
const determineLevel = (name: string, rawLevel: string = ''): Competition['level'] => {
    const n = name.toLowerCase();
    const l = rawLevel.toLowerCase().trim();

    // 0. EXPLICIT EXCEL COLUMN (Highest Priority if clear match)
    // Added 'aep2', 'aep1' (no space) support
    if (l.includes('aep-1') || l.includes('aep 1') || l.includes('aep1')) return 'AEP 1';
    if (l.includes('aep-2') || l.includes('aep 2') || l.includes('aep2') || l.includes('este-2')) return 'AEP 2';
    if (l.includes('aep-3') || l.includes('aep 3') || l.includes('aep3')) return 'AEP 3';
    if (l.includes('nacional') || l.includes('españa')) return 'NACIONAL';
    if (l.includes('europeo') || l.includes('epf') || l.includes('western')) return 'EPF';
    if (l.includes('mundial') || l.includes('world') || l.includes('ipf') || l.includes('olimpiada')) return 'IPF';

    // 1. Fallback: Name-based Hierarchy (International)
    if (n.includes('world') || n.includes('mundial') || n.includes('ipf') || n.includes('olimpiada')) return 'IPF';
    if (n.includes('europeo') || n.includes('epf') || n.includes('western')) return 'EPF';

    // 2. National
    if (n.includes('nacional') || n.includes('españa') || n.includes('copa de españa')) return 'NACIONAL';

    // 3. Regional (AEP Levels) - Fallback
    if (n.includes('aep-1') || n.includes('aep 1')) return 'AEP 1';
    if (n.includes('aep-2') || n.includes('aep 2') || n.includes('este-2')) return 'AEP 2';
    if (n.includes('aep-3') || n.includes('aep 3') || n.includes('regional')) return 'AEP 3';

    // Default
    return 'COMPETICIÓN';
};

export const fetchCompetitions = async (): Promise<Competition[]> => {
    try {
        const csvText = await fetchWithFallback(SHEET_URL);

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: false,
                skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data as string[][];
                    let headerRowIndex = -1;

                    // Find Header
                    for (let i = 0; i < Math.min(rows.length, 20); i++) {
                        const rowStr = JSON.stringify(rows[i]).toLowerCase();
                        if (rowStr.includes('fecha') && (
                            rowStr.includes('competiciones') ||
                            rowStr.includes('localidad') ||
                            rowStr.includes('organizador') ||
                            rowStr.includes('club')
                        )) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        reject(new Error('No se encontró la fila de cabecera (FECHA/COMPETICIONES/LOCALIDAD)'));
                        return;
                    }

                    // Map Indices
                    const headers = rows[headerRowIndex].map(h => h.toString().toLowerCase().trim());
                    const dateIdx = headers.findIndex(h => h.includes('fecha'));
                    const nameIdx = headers.findIndex(h => h.includes('campeonato') || h.includes('competiciones') || h.includes('nombre'));
                    const locIdx = headers.findIndex(h => h.includes('sede') || h.includes('localidad') || h.includes('lugar'));
                    const orgIdx = headers.findIndex(h => h.includes('organizador') || h.includes('club'));
                    const linkIdx = headers.findIndex(h => h.includes('inscrip') || h.includes('link'));
                    // User mentioned Column F (Index 5). We look for "Nivel", "Caracter", "Tipo" or fallback to index 5 if plausible.
                    let levelIdx = headers.findIndex(h => h.includes('nivel') || h.includes('caracter') || h.includes('carácter') || h.includes('tipo'));

                    // Fallback to Column F (Index 5 relative to table start) if header not found but matches typical structure
                    if (levelIdx === -1 && headers.length > 5) {
                        // Heuristic: If column 5 exists, use it. The user specifically mentioned Column F.
                        levelIdx = 5;
                        console.warn('Level header not found, falling back to Column F (Index 5)');
                    }

                    if (dateIdx === -1 || nameIdx === -1) {
                        reject(new Error(`Cabeceras críticas no encontradas. Indices: Date=${dateIdx}, Name=${nameIdx}`));
                        return;
                    }

                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(new Date().getDate() - 7);

                    const validData: Competition[] = rows
                        .slice(headerRowIndex + 1)
                        .map(row => {
                            const rawDateStr = row[dateIdx] || '';
                            const name = row[nameIdx] || '';
                            const rawLevel = levelIdx !== -1 ? (row[levelIdx] || '') : '';

                            // 1. Determine Level First
                            const level = determineLevel(name, rawLevel);

                            // 2. Parse Date using Level Context
                            const parsed = parseBestDate(rawDateStr);

                            return {
                                fecha: parsed.str, // Use the formatted "best" date string
                                dateIso: parsed.iso,
                                endDateIso: parsed.endIso,
                                campeonato: name,
                                sede: locIdx !== -1 ? row[locIdx] : 'Por determinar',
                                organizador: orgIdx !== -1 ? row[orgIdx] : '',
                                inscripciones: linkIdx !== -1 ? row[linkIdx] : '',
                                level: level
                            };
                        })
                        .filter(item => {
                            // 1. Basic Validity
                            const isValid = item.fecha &&
                                item.fecha.length > 2 &&
                                !item.fecha.toLowerCase().includes('fecha') &&
                                !item.fecha.toLowerCase().includes('trimestre') &&
                                item.campeonato;

                            if (!isValid) return false;

                            // 2. Date Filtering
                            if (!item.dateIso) return true;
                            const itemDate = new Date(item.dateIso);
                            if (itemDate < oneWeekAgo) return false;

                            return true;
                        });

                    resolve(validData);
                },
                error: (error: Error) => {
                    reject(new Error(`Error parseando CSV: ${error.message}`));
                }
            });
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido al cargar el calendario';
        throw new Error(message);
    }
};
