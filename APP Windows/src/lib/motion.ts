/**
 * ANVIL STRENGTH — PRIMITIVAS DE MOVIMIENTO
 *
 * Espejo en JS de los tokens de movimiento de src/styles/tokens.css, para
 * que framer-motion y CSS no se desincronicen.
 *
 * Criterio: el movimiento comunica ESTADO (algo aparece, cambia, carga,
 * se confirma). Nunca decora. Si una animación se puede quitar sin que el
 * usuario pierda información, sobra.
 *
 * No hay secuencias orquestadas de carga de página: el usuario entra a
 * hacer una tarea, no a ver cómo carga la interfaz.
 */

/** Salida exponencial (out-quint). Arranca rápido y frena: la interfaz
 *  responde al instante y luego se asienta. Sin rebote ni elástico. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
    instant: 0.09,
    fast: 0.15,
    base: 0.22,
    slow: 0.32,
} as const;

/**
 * ¿El usuario ha pedido no ver animaciones?
 *
 * Se lee en cada llamada en lugar de cachearse: la preferencia se puede
 * cambiar con la pestaña abierta.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Transición estándar. Con movimiento reducido colapsa a instantánea. */
export function transition(duration: number = DURATION.base) {
    return prefersReducedMotion()
        ? { duration: 0 }
        : { duration, ease: EASE_OUT };
}

// ---------------------------------------------------------------------
// Variantes reutilizables
// ---------------------------------------------------------------------

/** Aparición neutra. La alternativa con movimiento reducido es un
 *  fundido, no la ausencia total de transición. */
export const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

/** Entrada de panel, acordeón o fila nueva: sube 8px al aparecer.
 *  8px es suficiente para leerse como "ha llegado" sin desplazar la vista. */
export const riseIn = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
};

/** Modal / diálogo: escala muy sutil. Por encima de 0.98 se nota barato. */
export const dialogIn = {
    initial: { opacity: 0, scale: 0.98, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 4 },
};

/**
 * Escalonado de lista.
 *
 * Legítimo dentro de UNA lista (series de un ejercicio, atletas del coach):
 * ayuda a leer el orden. Ilegítimo como entrada uniforme aplicada a cada
 * sección de una pantalla — eso es el reflejo, no diseño.
 *
 * `cap` evita que una lista de 40 filas tarde 4 segundos en entrar.
 */
export function stagger(index: number, step = 0.03, cap = 8) {
    if (prefersReducedMotion()) return transition(DURATION.fast);
    return {
        duration: DURATION.base,
        ease: EASE_OUT,
        delay: Math.min(index, cap) * step,
    };
}

/** Feedback de pulsación. Solo para controles que ejecutan una acción. */
export const pressable = {
    whileHover: { scale: 1.01 },
    whileTap: { scale: 0.985 },
    transition: { duration: DURATION.instant, ease: EASE_OUT },
};
