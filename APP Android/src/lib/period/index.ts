/**
 * ANVIL STRENGTH — PERIODO TEMPORAL
 * =====================================================================
 * Una sola puerta de entrada.
 *
 *   types.ts          Qué se puede preguntar y con qué precisión.
 *   resolve.ts        De "este mes" a un rango de fechas o una lista de semanas.
 *   url.ts            El periodo vive en la dirección, no en un useState.
 *   applicability.ts  Qué periodo tiene sentido en qué pantalla.
 *   usePeriodo.ts     Las tres piezas juntas, para una pantalla.
 *
 * El selector visual es `src/components/ui/PeriodSelector.tsx`.
 */

export type { Periodo, PeriodoResuelto, TipoPeriodo, Resolucion } from './types';
export { PERIODOS_POR_DEFECTO } from './types';

export type { BloqueTemporal } from './resolve';
export { resolverPeriodo, dentroDelPeriodo, semanaDentroDelPeriodo } from './resolve';

export {
    PARAMETRO,
    PERIODO_POR_DEFECTO,
    periodoATexto,
    textoAPeriodo,
    leerPeriodo,
    conPeriodo,
} from './url';

export type { Ambito } from './applicability';
export { reglaDe, admite, ajustarAlAmbito } from './applicability';

export { usePeriodo } from './usePeriodo';
