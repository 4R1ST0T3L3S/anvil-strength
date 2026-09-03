/**
 * ANVIL STRENGTH — VERSIÓN DEL MOTOR DE ANÁLISIS
 * =====================================================================
 *
 * PARA QUÉ SIRVE ESTO
 *
 * Sin versión, dos mediciones de la misma barra separadas seis meses son
 * incomparables y nadie puede decir por qué: ¿mejoró el atleta, o mejoró el
 * algoritmo? Es exactamente la pregunta que hay que poder responder cuando se
 * empiece a calibrar contra el encoder.
 *
 * Con la versión guardada junto a cada medición se pueden hacer tres cosas que
 * hoy son imposibles:
 *
 *   · SABER de qué motor salió un número antiguo antes de meterlo en un perfil
 *     carga-velocidad;
 *   · EXPULSAR del análisis las mediciones de un motor que se descubrió sesgado,
 *     sin tirar las buenas;
 *   · MEDIR si un cambio mejora, reanalizando los mismos vídeos con dos motores
 *     y comparando los dos contra el encoder (Fase 10).
 *
 *
 * POR QUÉ UN NÚMERO Y NO UNA CADENA
 *
 * Las métricas viven en una bolsa JSONB cuyo catálogo (`metric_definitions`)
 * describe valores NUMÉRICOS: unidad, decimales, rango válido. Meter ahí una
 * cadena obligaría a que el catálogo, el registro del cliente y todas las
 * pantallas que pintan métricas supieran distinguir dos tipos de valor — y ese
 * es justo el coste que el modelo de bolsa existe para evitar.
 *
 * Así que la versión viaja codificada como entero y se formatea al enseñarla.
 * La codificación deja sitio de sobra y ordena igual que el número de versión:
 *
 *     mayor × 10.000  +  menor × 100  +  parche
 *
 *     v2.0.0  →  20000
 *     v2.1.0  →  20100
 *     v2.1.3  →  20103
 *
 * Ordenar por el entero es ordenar por versión, que es lo que hará cualquier
 * consulta de «dame las mediciones de v2.1 o mejor».
 *
 *
 * CUÁNDO SUBIRLA — Y CUÁNDO NO
 *
 * Se sube cuando cambia **lo que sale para la misma entrada**: el filtrado, la
 * segmentación, la calibración, el detector, la definición de una métrica.
 * NO se sube por cambiar un color, un texto, una gráfica ni el orden de las
 * tarjetas: eso no mueve ni un decimal y subir la versión por ello llenaría el
 * histórico de versiones que no significan nada.
 *
 * La regla práctica: **si hay que volver a pasar los sintéticos, sube la
 * versión.** Si no, no.
 */

/** Componentes de la versión actual del motor. */
export const PWR_ENGINE = {
    major: 2,
    minor: 0,
    patch: 0,
} as const;

/**
 * La versión como entero, que es lo que se guarda en la bolsa de métricas.
 *
 * Ver la cabecera para la codificación.
 */
export const PWR_ENGINE_VERSION_CODE =
    PWR_ENGINE.major * 10000 + PWR_ENGINE.minor * 100 + PWR_ENGINE.patch;

/** La versión legible: `v2.0.0`. */
export const PWR_ENGINE_VERSION = `v${PWR_ENGINE.major}.${PWR_ENGINE.minor}.${PWR_ENGINE.patch}`;

/** Nombre completo para informes y exportaciones: `PWR Engine v2.0.0`. */
export const PWR_ENGINE_LABEL = `PWR Engine ${PWR_ENGINE_VERSION}`;

/**
 * Deshace la codificación de un entero guardado.
 *
 * Devuelve `null` para lo que no sea un código válido — incluido el `undefined`
 * de las mediciones anteriores a que existiera esto, que son legítimamente
 * «sin versión» y no deben pintarse como «v0.0.0».
 */
export function decodeEngineVersion(code: number | null | undefined): string | null {
    if (typeof code !== 'number' || !Number.isFinite(code) || code <= 0) return null;

    const major = Math.floor(code / 10000);
    const minor = Math.floor((code % 10000) / 100);
    const patch = code % 100;

    return `v${major}.${minor}.${patch}`;
}

/**
 * Cómo llamar a una medición sin versión.
 *
 * Todo lo guardado antes del 18 de agosto de 2026 cae aquí. No es un error ni
 * un dato corrupto: es que se midió antes de que hubiera con qué marcarlo, y
 * decirlo así es más honesto que inventarle una versión.
 */
export const UNVERSIONED_LABEL = 'anterior a v2.0';
