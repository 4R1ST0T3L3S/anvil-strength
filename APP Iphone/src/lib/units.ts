import type { WeightUnit } from './prefs/contract';

/**
 * UNIDADES DE PESO — SIEMPRE SE GUARDA EN KG.
 * =====================================================================
 * La unidad es una capa de PRESENTACIÓN, nunca de almacenamiento. Cambiar lo
 * que se guarda invalidaría todo el histórico y las métricas de VBT ya
 * calculadas (velocidad, potencia... dependen de la masa en kg). Estas
 * funciones convierten SOLO en el borde: al pintar en pantalla y al leer lo
 * que el usuario ha escrito.
 */

const KG_PER_LB = 0.45359237;

/** kg (almacenado) → el número que se enseña en pantalla. */
export function toDisplay(kg: number | null | undefined, unit: WeightUnit): number | null {
    if (kg == null || !Number.isFinite(kg)) return null;
    return unit === 'lb' ? kg / KG_PER_LB : kg;
}

/** Lo que el usuario ha escrito, en SU unidad → kg para guardar. */
export function fromInput(value: number | null | undefined, unit: WeightUnit): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return unit === 'lb' ? value * KG_PER_LB : value;
}

export const unitLabel = (unit: WeightUnit): string => unit;

/**
 * Redondeo al disco disponible más cercano.
 *
 * `stepKg` es el salto mínimo que se puede montar con discos (2.5 kg por
 * defecto, configurable en preferencias). En libras se redondea al mismo
 * paso convertido, no a un número "bonito" en libras: los discos que hay en
 * el gimnasio están en kg, y es eso lo que de verdad se puede montar.
 */
export function roundToPlate(kg: number, stepKg: number): number {
    if (stepKg <= 0) return kg;
    return Math.round(kg / stepKg) * stepKg;
}

/**
 * Formatea un peso en kg para pantalla, en la unidad del usuario.
 * Sin decimales sobrantes: "102.50 kg" no aparece nunca — es "102.5 kg" o,
 * si es entero, "102 kg".
 */
export function formatLoad(kg: number | null | undefined, unit: WeightUnit): string {
    const value = toDisplay(kg, unit);
    if (value == null) return '—';
    const rounded = Math.round(value * 100) / 100;
    return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} ${unit}`;
}
