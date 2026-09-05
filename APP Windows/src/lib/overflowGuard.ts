/**
 * DETECTOR DE DESBORDES HORIZONTALES — SOLO EN DESARROLLO.
 *
 *
 * POR QUÉ HACE FALTA UN DETECTOR Y NO BASTA CON MIRAR
 *
 * El armazón del panel (`DashboardLayout`) lleva `overflow-x-hidden` en
 * `<main>`, y con razón: sin él, una tabla ancha arrastra la PÁGINA ENTERA
 * hacia la derecha y deja media pantalla en negro.
 *
 * El efecto secundario es que un elemento demasiado ancho ya no se nota. No
 * hay barra de desplazamiento, no hay aviso en consola, no hay nada: solo una
 * tarjeta a la que le falta el lado derecho. Que es exactamente como se ve un
 * panel "que se ve algo mal" y no se sabe por qué.
 *
 * El caso que motivó esto: `grid gap-3 md:grid-cols-2`. Por debajo de `md` no
 * hay ninguna definición de columnas, así que la columna es implícita y por
 * tanto `auto`, y `auto` se dimensiona al MAX-CONTENT de lo que lleva dentro.
 * `truncate` no ayuda —pone `white-space: nowrap`, que es justo lo contrario—,
 * así que una competición con nombre largo pedía 555px dentro de una pantalla
 * de 375. La corrección es `grid-cols-1`, que en Tailwind compila a
 * `repeat(1, minmax(0, 1fr))`.
 *
 *
 * QUÉ MIDE, Y QUÉ NO
 *
 * Recorre el árbol y avisa de cada elemento cuyo borde derecho se sale del
 * ancho de la ventana. Se ignoran a propósito:
 *
 *   · Los carruseles. Un contenedor con `overflow-x` propio desborda porque
 *     ESE es su trabajo; el aviso sería ruido en cada pasada.
 *   · Los adornos absolutos. Las marcas de agua de las tarjetas se anclan
 *     fuera del borde y las recorta el `overflow-hidden` del padre.
 *   · Lo que se sale menos de 2px, que es redondeo de subpíxel.
 *
 * Se queda con el ANTECESOR más alto de cada desborde: si una tarjeta se
 * pasa de ancho, lo interesante es la tarjeta, no los nueve `span` que lleva
 * dentro y que se salen por arrastre.
 */

/**
 * Quién recorta a este elemento, y si eso es intencionado.
 *
 * Es la distinción que hace que el informe sirva de algo:
 *
 *   · Un carrusel envuelve su pista de 15.000px en un `overflow-hidden`
 *     propio. Ese recorte ES el diseño; avisar sería ruido en cada pasada.
 *   · Una tarjeta demasiado ancha no tiene a nadie que la recorte hasta
 *     llegar al `<main>` del armazón. Ese recorte es el accidente.
 *
 * Así que la regla no es "¿se sale?" sino "¿se sale hasta el armazón?".
 */
function loRecortaElArmazon(el: Element): boolean {
    for (let p = el.parentElement; p; p = p.parentElement) {
        const { overflowX } = getComputedStyle(p);
        if (overflowX === 'visible') continue;

        // El primero que recorta manda. Si es un contenedor cualquiera, el
        // recorte estaba previsto; si hemos llegado al armazón, no.
        return p.tagName === 'MAIN' || p.tagName === 'BODY' || p === document.documentElement;
    }
    return true; // Nadie lo recorta: se sale de la página entera.
}

export interface Desborde {
    /** `Element` y no `HTMLElement`: los adornos que desbordan son `<svg>`. */
    elemento: Element;
    ancho: number;
    seSalePor: number;
}

/**
 * Un adorno anclado fuera del borde y recortado por su padre.
 *
 * El antecesor que lo posiciona se busca a mano y NO con `offsetParent`:
 * `offsetParent` no existe en los elementos SVG, y las marcas de agua de las
 * tarjetas son justamente `<svg>` —los iconos de lucide—, así que con
 * `offsetParent` se colaban en el informe todas y cada una de las veces.
 */
function esAdornoRecortado(el: Element): boolean {
    if (getComputedStyle(el).position !== 'absolute') return false;

    for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === 'static') continue;
        return cs.overflow === 'hidden' || cs.overflowX === 'hidden';
    }
    return false;
}

/**
 * Busca los desbordes que hay AHORA en la página.
 *
 * Devuelve la lista además de avisar por consola para poder usarlo desde una
 * prueba o desde la consola del navegador: `__anvilDesbordes()`.
 */
export function buscarDesbordes(): Desborde[] {
    const limite = document.documentElement.clientWidth;
    const crudos: Element[] = [];

    for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= limite + 2 && r.left >= -2) continue;
        if (esAdornoRecortado(el)) continue;
        if (!loRecortaElArmazon(el)) continue;

        crudos.push(el);
    }

    // Solo el antecesor más alto de cada rama: el culpable, no sus hijos.
    const culpables = crudos.filter(el => !crudos.some(otro => otro !== el && otro.contains(el)));

    return culpables.map(el => ({
        elemento: el,
        ancho: Math.round(el.getBoundingClientRect().width),
        seSalePor: Math.round(el.getBoundingClientRect().right - limite),
    }));
}

/**
 * Deja el detector escuchando. Se llama una vez, desde `main.tsx`, detrás de
 * `import.meta.env.DEV`.
 *
 * Se comprueba al cambiar de tamaño y cuando el árbol se queda quieto tras
 * un cambio: medir en cada mutación en mitad de un render daría falsos
 * positivos con elementos a medio colocar.
 */
export function instalarDetectorDeDesbordes(): void {
    let pendiente = 0;

    const revisar = () => {
        const desbordes = buscarDesbordes();
        if (desbordes.length === 0) return;

        const ancho = document.documentElement.clientWidth;
        console.groupCollapsed(
            `%c⇥ ${desbordes.length} desborde(s) horizontal(es) a ${ancho}px`,
            'color:#ef4444;font-weight:bold',
        );
        console.info(
            'Van a quedar RECORTADOS por el `overflow-x-hidden` del armazón, así que en ' +
            'pantalla no se ven como un desbordamiento sino como un elemento al que le ' +
            'falta el lado derecho.\n\n' +
            'Sospechoso habitual: una rejilla cuyo `grid-cols-*` va detrás de un ' +
            'breakpoint (`grid gap-3 En móvil no hay columnas grid-cols-2`). ' +
            'declaradas, la columna implícita es `auto` y `auto` mide el max-content. ' +
            'Se arregla añadiendo `grid-cols-1`.',
        );
        for (const d of desbordes) {
            console.warn(`+${d.seSalePor}px (ancho ${d.ancho}px)`, d.elemento);
        }
        console.groupEnd();
    };

    const programar = () => {
        window.clearTimeout(pendiente);
        pendiente = window.setTimeout(revisar, 400);
    };

    new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', programar);
    programar();

    // Puerta manual: útil para revisar una pantalla concreta sin esperar.
    (window as unknown as { __anvilDesbordes: typeof buscarDesbordes }).__anvilDesbordes =
        buscarDesbordes;
}
