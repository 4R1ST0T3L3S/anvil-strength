/**
 * PALETA DE LAS GRÁFICAS
 * =====================================================================
 * Sale de los tokens (`src/styles/tokens.css`) para que no exista un
 * segundo juego de colores viviendo dentro de recharts.
 */

export const SERIES_COLORS = [
    'var(--brand)',
    'var(--info)',
    'var(--success)',
    'var(--warning)',
    'var(--effort-high)',
];

/**
 * Color ESTABLE de una serie, derivado de su clave.
 *
 * POR QUÉ NO VALE EL ÍNDICE
 *
 * Con `SERIES_COLORS[i % n]`, añadir una pregunta al principio del
 * cuestionario le cambia el color a TODAS las demás. Un coach que se ha
 * aprendido que el sueño es la línea roja abre la pantalla al día siguiente
 * y el sueño es azul, sin que nada haya cambiado en los datos. Y con cinco
 * colores, la sexta pregunta repetía el de la primera.
 *
 * Con un hash del identificador, el color de una pregunta depende solo de
 * ella misma: se mantiene entre sesiones, entre atletas y aunque se
 * reordene el cuestionario.
 *
 * Dos preguntas pueden caer en el mismo color. Es un mal menor, y ahora es
 * raro: las preguntas se reparten en varias gráficas por familia de escala,
 * así que dentro de una misma gráfica suele haber tres o cuatro.
 */
export function colorForKey(key: string): string {
    // djb2. No hace falta nada mejor: solo tiene que repartir y ser estable.
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return SERIES_COLORS[Math.abs(hash) % SERIES_COLORS.length];
}
