/**
 * INTERRUPTORES DE FUNCIONALIDAD
 *
 * Para apagar una parte del producto SIN borrarla. Cuando algo no está listo
 * para enseñarse, la alternativa habitual —comentar el bloque, o borrar la
 * pantalla y volver a escribirla más adelante— deja el código muerto o lo
 * pierde. Aquí queda un único sitio donde se ve qué está apagado y por qué,
 * y volver a encenderlo es cambiar `false` por `true`.
 *
 * Apagar una sección implica DOS cosas, y las dos hacen falta: quitarla de la
 * navegación y cortar su ruta. Solo lo primero deja la pantalla accesible
 * escribiendo la URL a mano.
 */
interface FeatureFlags {
    anvilStore: boolean;
}

/**
 * Tipado como `boolean` y no como literal a propósito: con `as const`,
 * TypeScript estrecha el valor a `false` y marca como código muerto todo lo
 * que hay detrás de la comprobación — que es justo el código que queremos
 * conservar intacto para cuando se vuelva a encender.
 */
export const FEATURES: FeatureFlags = {
    /**
     * Tienda Anvil (canje de puntos).
     *
     * Apagada a petición del cliente: el catálogo y la logística de canje aún
     * no existen, así que la pantalla prometía algo que no se puede cumplir.
     * El código sigue entero en src/features/profile/components/AnvilStore.tsx.
     */
    anvilStore: false,
};
