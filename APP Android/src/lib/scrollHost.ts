/**
 * ANVIL STRENGTH — QUIÉN HACE SCROLL AQUÍ
 * =====================================================================
 *
 * EL DESCUBRIMIENTO QUE OBLIGA A ESCRIBIR ESTO
 *
 * Esta aplicación tiene DOS sitios que se desplazan, no uno:
 *
 *   · La web pública (portada, competiciones, legales) desplaza la VENTANA,
 *     como cualquier página.
 *   · El panel NO. `DashboardLayout` monta un `<main class="overflow-y-auto">`
 *     dentro de un armazón de altura fija, para que la cabecera y la barra
 *     lateral no se muevan. Ahí dentro, `window.scrollY` vale SIEMPRE cero.
 *
 * Cualquier cosa que lea `window.scrollY` o llame a `window.scrollTo` funciona
 * en la mitad pública y no hace absolutamente nada en el panel — sin fallar,
 * sin avisar, sin dejar rastro en la consola. Un botón de "volver arriba" que
 * no sube, una restauración de scroll que restaura cero.
 *
 * Por eso el `<main>` del panel lleva `data-scroll-host` y todo lo que
 * necesite el scroll pregunta aquí en vez de dar por hecho que es la ventana.
 *
 *
 * POR QUÉ UN ATRIBUTO EN EL DOM Y NO UN CONTEXTO DE REACT
 *
 * Porque quien pregunta no está siempre debajo del que hace scroll. El botón
 * de volver arriba vive en `App.tsx`, por encima del enrutador entero, para
 * ser uno solo y no uno por pantalla. Un contexto le obligaría a colgar del
 * layout, y entonces habría que montarlo dos veces.
 */

/** El elemento que de verdad se desplaza, o `null` si es la ventana. */
export function contenedorDeScroll(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('[data-scroll-host]');
}

/** Cuánto se ha bajado, mire quien mire. */
export function posicionDeScroll(): number {
    const host = contenedorDeScroll();
    return host ? host.scrollTop : window.scrollY;
}

/** Cuánto se PUEDE bajar. Sirve para saber si el botón tiene sentido. */
export function recorridoDeScroll(): number {
    const host = contenedorDeScroll();
    if (host) return host.scrollHeight - host.clientHeight;
    return document.documentElement.scrollHeight - window.innerHeight;
}

export function irAScroll(top: number, behavior: ScrollBehavior = 'instant') {
    const host = contenedorDeScroll();
    if (host) host.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
}

/**
 * Escuchar el scroll venga de donde venga.
 *
 * `capture: true` SOBRE `document`, y esto es lo importante.
 *
 * El evento `scroll` de un elemento NO BURBUJEA: el `<main>` del panel se
 * desplaza y en `window` no se entera nadie. La solución obvia sería
 * suscribirse al `<main>`... pero el panel entra por `lazy()`, así que en el
 * momento de suscribirse todavía no existe, y el oyente no se ataría a nada.
 *
 * Lo que sí ocurre siempre es la fase de CAPTURA: aunque no burbujee hacia
 * arriba, el evento baja desde `document` hasta el elemento. Escuchando ahí se
 * cazan los dos casos —la ventana y cualquier contenedor interno— sin importar
 * cuándo se monte cada uno.
 *
 * `passive: true`: sin eso el navegador tiene que esperar a ver si la función
 * llama a `preventDefault()` antes de mover un solo pixel, y el desplazamiento
 * se vuelve pastoso en móvil. Ninguna de estas funciones lo llama nunca.
 */
export function escucharScroll(fn: () => void): () => void {
    const opciones: AddEventListenerOptions = { passive: true, capture: true };
    document.addEventListener('scroll', fn, opciones);
    return () => document.removeEventListener('scroll', fn, opciones);
}
