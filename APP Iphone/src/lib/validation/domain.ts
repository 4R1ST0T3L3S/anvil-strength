/**
 * ANVIL STRENGTH — RANGOS DEL DOMINIO
 * =====================================================================
 *
 * Los límites de lo que es un dato de powerlifting creíble, en UN solo
 * sitio. Hoy no hay ninguno: nada impide teclear 900 kg en una serie, un
 * RPE de 14 o una competición en el año 0025.
 *
 * ESTOS NÚMEROS NO SON VALIDACIÓN DE SEGURIDAD, SON REDES ANTIERRATAS.
 * El objetivo no es impedir un dato raro sino cazar el dedo que se resbala:
 * el 1400 que iba a ser 140, el RPE 88 que iba a ser 8. Por eso los techos
 * están holgados y no ajustados al récord del mundo — un techo apretado
 * convierte una marca legítima en un error que no se puede guardar.
 *
 * Todo en KILOS, siempre. La unidad de pantalla la resuelve
 * `useAthletePrefs()` en el borde; aquí dentro no entra. Es la misma regla
 * que ya sigue `LoggerSetRow`: convertir solo al mostrar y al leer, nunca en
 * el almacenamiento ni en una fórmula intermedia.
 */

import { combinar, entero, fecha, numeroEnRango, requerido } from './rules';
import type { Validador } from './rules';

/**
 * Carga de una serie, en kg.
 *
 * Techo 600: el récord absoluto de peso muerto con equipo ronda los 550, y
 * el mayor total de la historia está por encima de 1.400 pero repartido en
 * tres levantamientos. 600 en UNA serie deja sitio de sobra a cualquier
 * atleta real y caza el 1400 que iba a ser 140.
 *
 * Suelo 0 y no 1: una serie con la barra vacía o con banda elástica se
 * registra con carga 0 y es un dato legítimo.
 */
export const CARGA_KG = { min: 0, max: 600 } as const;

/** Repeticiones de una serie. 100 cubre cualquier serie de resistencia. */
export const REPS = { min: 1, max: 100 } as const;

/** Series de un ejercicio dentro de una sesión. */
export const SERIES = { min: 1, max: 50 } as const;

/**
 * RPE — esfuerzo percibido. La escala de powerlifting es 1-10 con medios
 * puntos (7,5 · 8 · 8,5). No es entero.
 */
export const RPE = { min: 1, max: 10 } as const;

/** RIR — repeticiones en reserva. El complementario del RPE. */
export const RIR = { min: 0, max: 10 } as const;

/**
 * Porcentaje del 1RM.
 *
 * Techo 150 y no 100 A PROPÓSITO: los sobrecargas (excéntricas, isométricas
 * en rango parcial, walkouts) se programan por encima del máximo, y son
 * trabajo normal en un bloque de fuerza. Un techo de 100 los haría
 * imposibles de escribir.
 */
export const PORCENTAJE_1RM = { min: 1, max: 150 } as const;

/** Velocidad media de la barra, en m/s. Por encima de 3 no hay levantamiento. */
export const VELOCIDAD_MS = { min: 0.01, max: 3 } as const;

/** Peso corporal, en kg. */
export const PESO_CORPORAL_KG = { min: 20, max: 300 } as const;

/** Descanso entre series, en segundos. Tope: media hora. */
export const DESCANSO_S = { min: 0, max: 1800 } as const;

/** Semanas de un bloque de entrenamiento. */
export const SEMANAS_BLOQUE = { min: 1, max: 52 } as const;

/**
 * Ventana de fechas aceptable.
 *
 * Cinco años atrás y tres adelante. Atrás, porque se importan historiales;
 * adelante, porque un calendario de competiciones se publica con año y pico
 * de antelación. Fuera de ahí es una errata en el año, siempre.
 */
export function ventanaDeFechas() {
    const hoy = new Date();
    return {
        desde: new Date(hoy.getFullYear() - 5, 0, 1),
        hasta: new Date(hoy.getFullYear() + 3, 11, 31),
    };
}

// =====================================================================
// VALIDADORES LISTOS
// =====================================================================
/**
 * Se exportan ya montados para que una pantalla no tenga que acordarse ni
 * del rango ni de cómo se llama la cosa. Si mañana el techo de carga cambia,
 * cambia aquí y no en los once formularios que la piden.
 */

export const validarCarga: Validador<string> = numeroEnRango(CARGA_KG.min, CARGA_KG.max, { unidad: 'kg', que: 'La carga' });

export const validarReps: Validador<string> = combinar(
    entero('Las repeticiones'),
    numeroEnRango(REPS.min, REPS.max, { que: 'Las repeticiones' })
);

export const validarSeries: Validador<string> = combinar(
    entero('El número de series'),
    numeroEnRango(SERIES.min, SERIES.max, { que: 'El número de series' })
);

export const validarRpe: Validador<string> = numeroEnRango(RPE.min, RPE.max, { que: 'El RPE' });
export const validarRir: Validador<string> = numeroEnRango(RIR.min, RIR.max, { que: 'El RIR' });

export const validarPorcentaje1RM: Validador<string> = numeroEnRango(
    PORCENTAJE_1RM.min,
    PORCENTAJE_1RM.max,
    { unidad: '%', que: 'El porcentaje' }
);

export const validarVelocidad: Validador<string> = numeroEnRango(
    VELOCIDAD_MS.min,
    VELOCIDAD_MS.max,
    { unidad: 'm/s', que: 'La velocidad' }
);

export const validarPesoCorporal: Validador<string> = numeroEnRango(
    PESO_CORPORAL_KG.min,
    PESO_CORPORAL_KG.max,
    { unidad: 'kg', que: 'El peso corporal' }
);

export const validarDescanso: Validador<string> = combinar(
    entero('El descanso'),
    numeroEnRango(DESCANSO_S.min, DESCANSO_S.max, { unidad: 's', que: 'El descanso' })
);

export const validarSemanas: Validador<string> = combinar(
    entero('Las semanas'),
    numeroEnRango(SEMANAS_BLOQUE.min, SEMANAS_BLOQUE.max, { que: 'El número de semanas' })
);

/** Fecha dentro de la ventana razonable. `obligatoria` para bloques (K10). */
export function validarFecha({ obligatoria = false, que = 'La fecha' } = {}) {
    const { desde, hasta } = ventanaDeFechas();
    return combinar(
        obligatoria ? requerido<string>(que.toLowerCase()) : null,
        fecha({ desde, hasta, que })
    );
}
