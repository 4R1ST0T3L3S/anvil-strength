import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE_OUT, prefersReducedMotion } from '../../lib/motion';

interface ViewTransitionProps {
    /** Cambiar este valor dispara la transición. Normalmente, la ruta. */
    transitionKey: string;
    children: ReactNode;
}

/**
 * Cambio de pestaña dentro de un panel.
 *
 * Por qué existe: sin nada, cambiar de vista es un salto seco de un árbol de
 * DOM a otro y el ojo lo lee como "se ha recargado la página", que es
 * exactamente la sensación contraria a la que buscamos. Un fundido corto con
 * 6px de subida basta para que se lea como "ha llegado contenido nuevo".
 *
 * Por qué es TAN corto (150ms de entrada, 90ms de salida): esto se dispara
 * decenas de veces al día. La regla es que cuanto más se repite una
 * animación, menos puede durar; a 300ms una pestaña se siente lenta aunque
 * el contenido ya esté ahí. La salida va más rápida que la entrada porque
 * el usuario ya ha decidido irse: lo que espera es lo nuevo, no despedirse
 * de lo viejo.
 *
 * `mode="wait"` y no un cruce: dos pantallas superpuestas a media opacidad
 * son ilegibles, y con contenido de altura distinta el scroll salta.
 */
export function ViewTransition({ transitionKey, children }: ViewTransitionProps) {
    const reduced = prefersReducedMotion();

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={transitionKey}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                // La salida va más rápida que la entrada: quien cambia de
                // pestaña quiere ver lo nuevo, no ver irse lo viejo.
                exit={{
                    opacity: 0,
                    ...(reduced ? {} : { y: -4 }),
                    transition: { duration: reduced ? 0.01 : DURATION.instant, ease: EASE_OUT },
                }}
                transition={{
                    duration: reduced ? 0.01 : DURATION.fast,
                    ease: EASE_OUT,
                }}
                // `h-full` y no `min-h-full`: las pantallas que colocan algo
                // en absoluto respecto al alto disponible —el pie del
                // registro de series— necesitan que este contenedor tenga
                // altura definida. Con `min-h-full` la cadena de porcentajes
                // se rompe y el pie se va al final del contenido, fuera de la
                // vista. Lo más alto que esto sigue desbordando y hace scroll
                // en `main`, que es quien lo gestiona.
                className="h-full"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
