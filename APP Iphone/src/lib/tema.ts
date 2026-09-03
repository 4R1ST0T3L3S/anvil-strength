/**
 * ANVIL STRENGTH — EL TEMA
 * =====================================================================
 *
 * TRES OPCIONES, NO DOS
 *
 *   · `sistema` — lo que diga el sistema operativo, y CAMBIA CON ÉL. Es lo
 *     que hay por defecto, porque quien tiene el móvil puesto en claro de día
 *     y oscuro de noche no quiere elegir dos veces al día.
 *   · `claro` / `oscuro` — una elección explícita, que manda sobre el sistema.
 *
 * Un interruptor de dos posiciones no puede expresar «lo que diga el
 * sistema»: en cuanto lo tocas una vez, te quedas fijado para siempre sin
 * haberlo pedido.
 *
 *
 * DÓNDE VIVE LA VERDAD
 *
 * En el atributo `data-theme` del `<html>`, que es lo que lee `tokens.css`.
 * Lo escribe `aplicarTema`, y lo escribe TAMBIÉN un script en `index.html`
 * que corre antes del primer pintado — ver la nota del destello.
 *
 * `localStorage` y no una tabla: el tema es del DISPOSITIVO, no de la cuenta.
 * El mismo entrenador puede querer claro en el portátil del gimnasio y oscuro
 * en el móvil, y sincronizarlo por cuenta se lo impediría.
 */

export type Tema = 'sistema' | 'claro' | 'oscuro';

export const CLAVE_TEMA = 'anvil_tema';

export function leerTema(): Tema {
    try {
        const v = localStorage.getItem(CLAVE_TEMA);
        return v === 'claro' || v === 'oscuro' ? v : 'sistema';
    } catch {
        return 'sistema';
    }
}

/** Qué se pinta de verdad ahora mismo, ya resuelto el caso `sistema`. */
export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
    if (tema !== 'sistema') return tema;
    try {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
    } catch {
        return 'oscuro';
    }
}

/**
 * Pone el tema en el DOM.
 *
 * Escribe tres cosas, y las tres hacen falta:
 *
 *   1. `data-theme`, que es lo que activa el bloque de `tokens.css`.
 *   2. `color-scheme`, que es lo que hace que el navegador pinte en el tono
 *      correcto lo que NO controla el CSS: las barras de scroll, los
 *      selectores de fecha, el fondo detrás del rebote elástico. Sin esto
 *      quedan barras blancas en una app oscura, o al revés.
 *   3. `<meta name="theme-color">`, que es la barra del sistema en móvil y en
 *      la PWA instalada. Si no se actualiza, alguien en modo claro tiene una
 *      franja negra arriba que no pertenece a ninguna parte.
 */
export function aplicarTema(tema: Tema) {
    const efectivo = temaEfectivo(tema);
    const raiz = document.documentElement;

    /*
     * APAGAR LAS TRANSICIONES DURANTE EL CAMBIO.
     *
     * Medio proyecto lleva `transition-colors` para que los estados de hover
     * se sientan suaves. Al cambiar de tema, TODOS ellos animan a la vez: en
     * vez de un cambio limpio se ve una mancha que va reptando por la página
     * durante 200ms, y cada elemento llega a destiempo según cuándo empezó.
     *
     * Se pilló midiendo: un `background-color` que debía ser blanco devolvía
     * `oklab(0.265 0 0)` —el gris del modo oscuro— porque la lectura cayó en
     * mitad de la transición.
     *
     * Un tema no es un cambio de estado de un control: es como encender la
     * luz de la habitación. Ocurre de golpe.
     *
     * El `void raiz.offsetHeight` de más abajo no es basura: leer esa
     * propiedad obliga al navegador a recalcular la disposición AHORA, con la
     * clase ya puesta. Sin esa lectura, poner y quitar la clase dentro del
     * mismo hilo se colapsa en nada y las transiciones vuelven a correr.
     */
    raiz.classList.add('cambiando-tema');

    raiz.setAttribute('data-theme', efectivo === 'claro' ? 'light' : 'dark');
    raiz.style.colorScheme = efectivo === 'claro' ? 'light' : 'dark';

    const meta = document.querySelector('meta[name="theme-color"]');
    // Los dos salen de tokens.css: `--surface-sunken` de cada modo. Escritos
    // aquí en hexadecimal porque `<meta>` no entiende `var()`.
    if (meta) meta.setAttribute('content', efectivo === 'claro' ? '#e6e6e6' : '#0a0a0a');

    void raiz.offsetHeight;
    requestAnimationFrame(() => raiz.classList.remove('cambiando-tema'));
}

export function guardarTema(tema: Tema) {
    try {
        // `sistema` se BORRA en vez de guardarse. Así, si algún día cambia el
        // valor por defecto, quien nunca eligió nada se va con el nuevo en vez
        // de quedarse anclado a una preferencia que no llegó a expresar.
        if (tema === 'sistema') localStorage.removeItem(CLAVE_TEMA);
        else localStorage.setItem(CLAVE_TEMA, tema);
    } catch { /* modo privado: el tema dura la sesión y ya está */ }
    aplicarTema(tema);
}
