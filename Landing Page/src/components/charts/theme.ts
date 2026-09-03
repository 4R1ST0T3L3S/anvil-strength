/**
 * ANVIL STRENGTH — ASPECTO DE LAS GRÁFICAS
 * =====================================================================
 *
 * QUÉ SUSTITUYE
 *
 * Cuatro copias de la misma configuración de ejes, rejilla y tooltip:
 * `AthleteLogTab`, `AthleteStatsModal`, `CoachVbtTab` y `SeriesReport`.
 * Las tres primeras eran idénticas; la cuarta se había quedado atrás y
 * seguía con hexadecimales a mano (`#666`, `#888`, `#141414`,
 * `rgba(255,255,255,0.1)`), así que el informe de series se pintaba con
 * unos grises que no son los del sistema.
 *
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 *
 * Recharts recibe COLORES, no clases: no se le puede pasar `text-ink-subtle`
 * y esperar que funcione. Eso significa que cada gráfica escrita a mano es
 * un sitio donde el tema está copiado en vez de referenciado, y por tanto un
 * sitio que NO cambiará solo cuando llegue el modo claro (F7).
 *
 * Con esto centralizado, el modo claro en las gráficas es cambiar este
 * fichero. Sin esto, son cuatro ficheros y la garantía de olvidarse de uno.
 *
 * Los valores son `var(--…)` y no literales a propósito: el navegador los
 * resuelve en tiempo de ejecución, así que un cambio de `data-theme` los
 * repinta sin que React tenga que volver a renderizar nada.
 */

/** Ejes: color y tamaño del texto de las marcas. */
export const EJE = {
    stroke: 'var(--border-default)',
    tick: { fill: 'var(--ink-subtle)', fontSize: 11 },
    tickLine: false,
    axisLine: false,
} as const;

/** Rejilla. Solo horizontal: las verticales compiten con los propios datos. */
export const REJILLA = {
    stroke: 'var(--border-subtle)',
    strokeDasharray: '3 3',
    vertical: false,
} as const;

/** Tooltip. Se pasa a `<Tooltip {...TOOLTIP} />`. */
export const TOOLTIP = {
    contentStyle: {
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        fontSize: 12,
        color: 'var(--ink)',
        boxShadow: 'var(--shadow-md)',
        // Sin esto, en una serie de doce puntos el cuadro salta de tamaño en
        // cada punto porque las cifras no tienen la misma anchura.
        fontVariantNumeric: 'tabular-nums',
    },
    labelStyle: { color: 'var(--ink-subtle)', fontSize: 11, marginBottom: 4 },
    // El cursor es la banda que resalta el punto bajo el ratón. Con el gris
    // por defecto de recharts tapa el dato; con esto lo acompaña.
    cursor: { stroke: 'var(--border-strong)', strokeWidth: 1 },
} as const;

/** Leyenda. */
export const LEYENDA = {
    wrapperStyle: { fontSize: 12, color: 'var(--ink-muted)', paddingTop: 8 },
    iconType: 'circle' as const,
    iconSize: 8,
};

/**
 * Serie principal: el rojo de marca.
 *
 * `strokeWidth: 2` y no 1: sobre fondo oscuro una línea de un píxel
 * desaparece a mitad de pantalla en un portátil sin pantalla de alta
 * densidad.
 */
export const SERIE = {
    stroke: 'var(--brand)',
    strokeWidth: 2,
    // Los puntos solo al pasar por encima: doce círculos permanentes sobre una
    // línea de doce puntos convierten la tendencia en un collar de cuentas.
    dot: false,
    activeDot: { r: 4, strokeWidth: 0, fill: 'var(--brand)' },
} as const;

/** Serie secundaria, para comparar contra la principal. */
export const SERIE_SECUNDARIA = {
    stroke: 'var(--info)',
    strokeWidth: 2,
    dot: false,
    activeDot: { r: 4, strokeWidth: 0, fill: 'var(--info)' },
    strokeDasharray: '4 3',
} as const;

/**
 * Alturas estándar.
 *
 * Existen para que el esqueleto y la gráfica midan LO MISMO. Si no coinciden,
 * la página salta hacia abajo cuando llegan los datos, que es justo lo que
 * el esqueleto viene a evitar.
 */
export const ALTO = {
    /** Miniatura dentro de una tarjeta. */
    mini: 120,
    /** El tamaño normal de un panel. */
    normal: 240,
    /** Gráfica principal de una pantalla de estadísticas. */
    grande: 320,
} as const;
