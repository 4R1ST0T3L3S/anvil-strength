/**
 * ANVIL STRENGTH — ARITMÉTICA DE CARGAS
 *
 * Convierte lo que el coach escribe en la casilla de carga a kilos reales.
 *
 * El caso que resuelve: escribir "85%" en un 5x5 y que salgan los 170 kg que
 * le tocan a un atleta con 200 de máximo, en vez de tener que abrir la
 * calculadora del móvil, redondear a mano y volver.
 */

/**
 * Salto mínimo de la barra: 2,5 kg.
 *
 * No es una preferencia. Los discos van en pares, así que el incremento más
 * pequeño que se puede montar con discos de 1,25 kg es 2,5 kg. Redondear a
 * cualquier otra cosa produce un número que el atleta no puede cargar y que
 * acabará redondeando él, probablemente hacia otro lado.
 */
export const BAR_INCREMENT = 2.5;

/**
 * Redondea al múltiplo de `increment` más cercano.
 *
 * A mitad de camino (166,25 entre 165 y 167,5) redondea hacia ARRIBA, que es
 * el comportamiento de Math.round y el que espera cualquiera que haya hecho
 * la cuenta a mano.
 */
export function roundToIncrement(kg: number, increment = BAR_INCREMENT): number {
    if (!Number.isFinite(kg) || increment <= 0) return 0;
    // El redondeo se hace en unidades de incremento y se reconstruye después:
    // operar directamente en decimales arrastra el error de coma flotante y
    // produce cosas como 167.49999999999997.
    return Math.round(kg / increment) * increment;
}

/**
 * Interpreta lo escrito en la casilla de carga.
 *
 * Acepta:
 *   "170"      -> 170 kg tal cual
 *   "85%"      -> el 85% del máximo de referencia
 *   "85 %"     -> lo mismo, con espacio
 *   "85,5%"    -> coma decimal, que es como se escribe en español
 *
 * Devuelve `null` si no hay nada interpretable, y `needsMax` cuando se pidió
 * un porcentaje pero no hay 1RM con el que calcularlo — la interfaz avisa en
 * vez de escribir un cero, que se leería como "sin carga".
 */
export interface ParsedLoad {
    kg: number | null;
    /** true si el usuario escribió un porcentaje. */
    isPercent: boolean;
    /** Porcentaje escrito, para poder mostrarlo junto a los kilos. */
    percent: number | null;
    /** true si es un porcentaje y falta el 1RM de referencia. */
    needsMax: boolean;
}

export function parseLoadInput(
    raw: string,
    referenceMax: number | null | undefined
): ParsedLoad {
    const text = raw.trim().replace(',', '.');

    if (!text) return { kg: null, isPercent: false, percent: null, needsMax: false };

    const percentMatch = text.match(/^(\d+(?:\.\d+)?)\s*%$/);

    if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        if (!Number.isFinite(percent) || percent <= 0) {
            return { kg: null, isPercent: true, percent: null, needsMax: false };
        }
        if (!referenceMax || referenceMax <= 0) {
            return { kg: null, isPercent: true, percent, needsMax: true };
        }
        return {
            kg: roundToIncrement((referenceMax * percent) / 100),
            isPercent: true,
            percent,
            needsMax: false,
        };
    }

    const n = parseFloat(text);
    if (!Number.isFinite(n) || n < 0) {
        return { kg: null, isPercent: false, percent: null, needsMax: false };
    }

    // Un número suelto se respeta tal cual, SIN redondear. El coach puede
    // querer 172,5 o incluso 171 si trabaja con discos fraccionales; el
    // redondeo solo tiene sentido cuando el número lo ha calculado la app.
    return { kg: n, isPercent: false, percent: null, needsMax: false };
}

/**
 * Porcentaje que representa una carga sobre el máximo. Para mostrar "≈82%"
 * junto a unos kilos escritos a mano.
 */
export function percentOfMax(
    kg: number | null | undefined,
    referenceMax: number | null | undefined
): number | null {
    if (!kg || !referenceMax || referenceMax <= 0) return null;
    return Math.round((kg / referenceMax) * 100);
}
