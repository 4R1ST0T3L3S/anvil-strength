/**
 * BLOQUEO DEL SCROLL DE FONDO, CON CONTADOR
 * =====================================================================
 *
 * Media docena de componentes bloqueaban el scroll a su manera:
 *
 *     useEffect(() => {
 *         document.body.style.overflow = 'hidden';
 *         return () => { document.body.style.overflow = ''; };
 *     }, []);
 *
 * Con UNA capa funciona. Con dos —el editor de día a pantalla completa y,
 * encima, la confirmación de borrar un ejercicio— no: la de arriba se cierra,
 * restaura `overflow` a lo que ella creía que era el valor original y
 * DESBLOQUEA la página estando el editor todavía abierto; o, al revés, se
 * cierra la de abajo primero y el `overflow: hidden` se queda pegado al
 * `<body>` para siempre.
 *
 * Ese segundo caso es el que se veía como "hay botones que no funcionan hasta
 * que refresco": la página quedaba congelada, no se podía llegar hasta el
 * control, y recargar era lo único que lo arreglaba porque recargar es lo
 * único que devuelve el estilo del `<body>`.
 *
 * Aquí solo hay un contador. El primero que entra bloquea, el último que sale
 * desbloquea, y el orden en que se abren y se cierran deja de importar.
 */

let locks = 0;
let restore: { overflow: string; paddingRight: string } | null = null;

/**
 * Bloquea el scroll. Devuelve la función que lo suelta.
 *
 * Es idempotente por llamada: soltar dos veces la misma cerradura no descuenta
 * dos, que dejaría la página desbloqueada con un modal todavía abierto.
 */
export function lockBodyScroll(): () => void {
    if (typeof document === 'undefined') return () => { };

    const { body, documentElement } = document;

    if (locks === 0) {
        restore = {
            overflow: body.style.overflow,
            paddingRight: body.style.paddingRight,
        };

        // Se compensa el ancho de la barra de scroll para que el contenido de
        // fondo no pegue un salto lateral al abrir el modal.
        const gap = window.innerWidth - documentElement.clientWidth;
        body.style.overflow = 'hidden';
        if (gap > 0) body.style.paddingRight = `${gap}px`;
    }

    locks += 1;
    let released = false;

    return () => {
        if (released) return;
        released = true;
        locks = Math.max(0, locks - 1);

        if (locks === 0 && restore) {
            body.style.overflow = restore.overflow;
            body.style.paddingRight = restore.paddingRight;
            restore = null;
        }
    };
}
