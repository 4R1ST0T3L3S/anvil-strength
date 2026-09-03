export interface VbtRow {
    name: string;      // Label for X-Axis (e.g., "S1 R1")
    Vm: number;        // Mean Velocity
    Vmp: number;       // Propulsive Mean Velocity
    Vmax: number;      // Max Velocity 
    Potencia: number;  // Power
    Carga: number;     // Load used
    Fatiga: number;    // Fatigue
    ROM: number;       // Range of motion
    originalRow: Record<string, unknown>;
}

const COLUMN_MAPS: Record<string, string[]> = {
    Vm: ['Vm', 'Avg Vel', 'Mean Velocity', 'Velocidad Media', 'V. Media', 'Mean Vel'],
    Vmp: ['Vmp', 'Propulsive Velocity', 'Velocidad Media Propulsiva', 'V.M.P.', 'Vmp (m/s)'],
    Vmax: ['Vmax', 'Peak Vel', 'Max Velocity', 'Velocidad Máxima', 'Peak Velocity', 'V. Max', 'Vmax (m/s)'],
    Potencia: ['Potencia', 'Power', 'W', 'Peak Power', 'Pico Potencia', 'Potencia (W)'],
    Carga: ['Carga', 'Load', 'Weight', 'kg', 'Masa', 'Carga (kg)'],
    Fatiga: ['Fatiga', 'Loss', 'Fatigue', 'Perdida', '% Loss', 'Velocity Loss', 'Loss (%)'],
    ROM: ['ROM', 'Range', 'Distance', 'Recorrido', 'Dist', 'Amplitud', 'ROM (cm)', 'ROM (mm)'],
    Serie: ['Serie', 'Set', 'Bloque', 'Nº Serie'],
    Rep: ['Rep', 'Repetition', 'R', 'Repetición', 'Nº Rep']
};

/**
 * Tries to find the value of a logical metric in a raw CSV row object
 * using a list of known aliases.
 */
function getValueByAlias(row: Record<string, unknown>, metric: string): unknown {
    const aliases = COLUMN_MAPS[metric];
    if (!aliases) return undefined;

    for (const alias of aliases) {
        // Try exact match
        if (row[alias] !== undefined) return row[alias];
        
        // Try case-insensitive and trimmed match
        const key = Object.keys(row).find(k => k.trim().toLowerCase() === alias.toLowerCase());
        if (key) return row[key];
    }
    return undefined;
}

/**
 * Parses a numeric value from various formats (handling commas as decimals)
 */
export function parseVbtNum(val: unknown): number {
    if (val === undefined || val === null || val === '') return 0;
    // Handle both dot and comma, and remove non-numeric characters except minus sign
    const str = String(val).replace(',', '.').replace(/[^\d.-]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

/**
 * Maps a raw PapaParse result row into a standardized VbtRow
 */
export function mapRowToVbt(row: Record<string, unknown>): VbtRow {
    const serieRaw = String(getValueByAlias(row, 'Serie') || '?');
    const repRaw = String(getValueByAlias(row, 'Rep') || '?');

    // Extract only numbers to avoid things like "S1" or "Rep 1" causing duplicates
    const serieMatch = serieRaw.match(/\d+/);
    const repMatch = repRaw.match(/\d+/);
    const serie = serieMatch ? serieMatch[0] : serieRaw;
    const rep = repMatch ? repMatch[0] : repRaw;

    return {
        name: `S${serie} R${rep}`,
        Vm: parseVbtNum(getValueByAlias(row, 'Vm')),
        Vmp: parseVbtNum(getValueByAlias(row, 'Vmp')),
        Vmax: parseVbtNum(getValueByAlias(row, 'Vmax')),
        Potencia: parseVbtNum(getValueByAlias(row, 'Potencia')),
        Carga: parseVbtNum(getValueByAlias(row, 'Carga')),
        Fatiga: parseVbtNum(getValueByAlias(row, 'Fatiga')),
        ROM: parseVbtNum(getValueByAlias(row, 'ROM')),
        originalRow: row
    };
}

/**
 * Filter function to keep only rows with actual data
 */
export function isValidVbtRow(row: VbtRow): boolean {
    return row.Vm > 0 || row.Vmax > 0 || row.Potencia > 0 || row.ROM > 0;
}
