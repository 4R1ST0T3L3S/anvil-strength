/**
 * ANVIL STRENGTH — EL PERIODO VIVE EN LA URL
 * =====================================================================
 *
 * POR QUÉ EN LA URL Y NO EN UN `useState`
 *
 * Tres cosas que solo funcionan si el periodo está en la dirección:
 *
 *   1. **Compartir.** Un entrenador manda "mira esto" con el enlace, y el
 *      otro ve lo mismo. Con estado local, ve "desde siempre".
 *   2. **El botón atrás.** Cambiar de "esta semana" a "este mes" y volver
 *      atrás debería deshacer el filtro, no salir de la pantalla.
 *   3. **Recargar.** F5 no debería tirar lo que estabas mirando.
 *
 * Es la misma razón por la que las vistas del panel ya están en la ruta
 * (`/dashboard/:view`) en vez de en un `useState`.
 *
 *
 * EL FORMATO
 *
 *   ?periodo=semana
 *   ?periodo=mes
 *   ?periodo=12s          (últimas 12 semanas)
 *   ?periodo=todo
 *   ?periodo=bloque:<id>
 *
 * Corto a propósito: esta cadena acaba en enlaces que se pegan en WhatsApp.
 * Y tolerante al leerlo: cualquier cosa que no se entienda cae en el periodo
 * por defecto en vez de romper la pantalla. Una URL manipulada a mano no
 * puede dejar a nadie con un error.
 */

import type { Periodo } from './types';

export const PARAMETRO = 'periodo';

/** El periodo por defecto cuando la URL no dice nada. */
export const PERIODO_POR_DEFECTO: Periodo = { tipo: 'ultimas', semanas: 4 };

/** Periodo → cadena para la URL. */
export function periodoATexto(p: Periodo): string {
    switch (p.tipo) {
        case 'semana': return 'semana';
        case 'mes': return 'mes';
        case 'todo': return 'todo';
        case 'ultimas': return `${Math.max(1, p.semanas ?? 4)}s`;
        case 'bloque': return p.blockId ? `bloque:${p.blockId}` : 'todo';
    }
}

/** Cadena de la URL → periodo. Nunca lanza. */
export function textoAPeriodo(texto: string | null | undefined): Periodo {
    if (!texto) return PERIODO_POR_DEFECTO;

    const limpio = texto.trim().toLowerCase();

    if (limpio === 'semana') return { tipo: 'semana' };
    if (limpio === 'mes') return { tipo: 'mes' };
    if (limpio === 'todo') return { tipo: 'todo' };

    // `12s` → últimas 12 semanas. Se topa en 260 (cinco años): más allá no es
    // un periodo, es "desde siempre" con pasos intermedios inútiles.
    const ultimas = /^(\d{1,3})s$/.exec(limpio);
    if (ultimas) {
        const n = Number(ultimas[1]);
        if (n >= 1 && n <= 260) return { tipo: 'ultimas', semanas: n };
        return PERIODO_POR_DEFECTO;
    }

    if (limpio.startsWith('bloque:')) {
        // El identificador NO se pasa a minúsculas: es un UUID y va tal cual.
        const id = texto.trim().slice('bloque:'.length);
        // Se valida la forma para no llevar basura a una consulta.
        if (/^[0-9a-fA-F-]{16,40}$/.test(id)) return { tipo: 'bloque', blockId: id };
        return PERIODO_POR_DEFECTO;
    }

    return PERIODO_POR_DEFECTO;
}

/** Lee el periodo de unos parámetros de búsqueda. */
export function leerPeriodo(params: URLSearchParams): Periodo {
    return textoAPeriodo(params.get(PARAMETRO));
}

/**
 * Devuelve unos parámetros NUEVOS con el periodo puesto.
 *
 * No muta los que recibe: `URLSearchParams` es mutable y compartirlo entre
 * renders con `set()` produce cambios que React no ve.
 *
 * El periodo por defecto se BORRA del parámetro en vez de escribirse. Así la
 * dirección se queda limpia mientras nadie ha elegido nada, y solo aparece
 * `?periodo=` cuando hay algo que compartir.
 */
export function conPeriodo(params: URLSearchParams, p: Periodo): URLSearchParams {
    const siguientes = new URLSearchParams(params);
    const texto = periodoATexto(p);

    if (texto === periodoATexto(PERIODO_POR_DEFECTO)) siguientes.delete(PARAMETRO);
    else siguientes.set(PARAMETRO, texto);

    return siguientes;
}
