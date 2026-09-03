import type { CoachPrefs } from './contract';

/**
 * OPACIDAD POR INTENSIDAD.
 * =====================================================================
 * Traduce un valor de intensidad (RPE, %1RM, o carga relativa al máximo del
 * bloque) a una opacidad entre `minAlpha` y `maxAlpha`. Cuando el ajuste
 * está apagado (`intensity.enabled = false`, el valor de hoy) devuelve
 * `maxAlpha` siempre: el color se pinta a su intensidad plena, que es el
 * comportamiento actual sin esta función.
 *
 * `value` viene YA normalizado a 0-1 por quien llama (el RPE de 0 a 10 se
 * divide entre 10, el %1RM entre 100...): esta función no sabe de escalas,
 * solo de la curva y el rango.
 */
export function intensityAlpha(value: number | null | undefined, prefs: CoachPrefs['intensity']): number {
    if (!prefs.enabled || value == null || !Number.isFinite(value)) return prefs.maxAlpha;

    const clamped = Math.min(1, Math.max(0, value));
    const eased = prefs.curve === 'contrast' ? clamped * clamped : clamped;
    return prefs.minAlpha + eased * (prefs.maxAlpha - prefs.minAlpha);
}

/** Normaliza un RPE (0-10) a 0-1 para `intensityAlpha`. */
export const rpeToUnit = (rpe: number | null | undefined): number | null =>
    rpe == null ? null : Math.min(1, Math.max(0, rpe / 10));

/** Normaliza un porcentaje de 1RM (0-100+) a 0-1, con techo en 1. */
export const percentToUnit = (percent: number | null | undefined): number | null =>
    percent == null ? null : Math.min(1, Math.max(0, percent / 100));
