import { useEffect, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { escucharScroll, irAScroll, posicionDeScroll, recorridoDeScroll } from '../../lib/scrollHost';

/**
 * ANVIL STRENGTH — VOLVER ARRIBA
 * =====================================================================
 *
 * CUÁNDO APARECE, Y POR QUÉ NO ANTES
 *
 * A partir de **dos pantallas** de scroll, y solo si queda al menos otra
 * pantalla por delante. Las dos condiciones tienen motivo:
 *
 *   · Dos pantallas, y no una: a una pantalla de distancia, subir con el dedo
 *     es igual de rápido que buscar un botón. Un botón que aparece antes de
 *     hacer falta es un elemento flotante tapando contenido.
 *   · Que quede recorrido por delante: si estás a dos pantallas del principio
 *     pero ya en el final, la página es corta y el botón sobra.
 *
 * Al subir con el dedo se esconde otra vez, aunque sigas a mitad de página.
 * Quien está subiendo ya está haciendo lo que el botón ofrece.
 *
 *
 * DÓNDE SE PONE, QUE ES LO QUE MÁS SE ROMPE
 *
 * Abajo a la derecha, pero con `bottom` distinto según dónde esté:
 *
 *   · En el panel y en móvil hay una barra de pestañas pegada al borde
 *     inferior. Sin apartarse, el botón se queda encima de "Perfil".
 *   · En iPhone hay además la barra de gestos, y por eso `pb-safe`.
 *
 * Se resuelve con `--tabbar-h`, que `DashboardLayout` declara y la web pública
 * no. Así el mismo botón sirve para los dos sitios sin preguntar por la ruta.
 *
 *
 * SIN MOVIMIENTO REDUCIDO NO ES QUE NO ANIME: ES QUE NO ANIMA NADA
 *
 * El botón sigue apareciendo y desapareciendo, pero de golpe, y el propio
 * salto arriba es instantáneo en vez de suave. Un desplazamiento largo y
 * animado es justo el tipo de movimiento que provoca mareo a quien pide
 * `prefers-reduced-motion`.
 */

/** Dos pantallas. Ver la nota de arriba. */
const UMBRAL = () => window.innerHeight * 2;

export function BackToTop() {
    const [visible, setVisible] = useState(false);
    const reduce = useReducedMotion();

    useEffect(() => {
        let ultimo = posicionDeScroll();
        let pendiente = false;

        const evaluar = () => {
            pendiente = false;
            const y = posicionDeScroll();
            const subiendo = y < ultimo;
            ultimo = y;

            // Queda al menos una pantalla por delante.
            const quedaCamino = recorridoDeScroll() - y > window.innerHeight;

            setVisible(y > UMBRAL() && quedaCamino && !subiendo);
        };

        /*
         * El evento de scroll llega decenas de veces por segundo. Sin este
         * embudo, cada una de ellas leería `scrollHeight` — que obliga al
         * navegador a recalcular la disposición— en mitad del desplazamiento.
         * Con rAF se hace una vez por frame como mucho, y justo cuando el
         * navegador va a pintar de todas formas.
         */
        const alDesplazar = () => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(evaluar);
        };

        evaluar();
        return escucharScroll(alDesplazar);
    }, []);

    return (
        <AnimatePresence>
            {visible && (
                <m.button
                    type="button"
                    onClick={() => irAScroll(0, reduce ? 'instant' : 'smooth')}
                    aria-label="Volver arriba"
                    title="Volver arriba"
                    initial={reduce ? false : { opacity: 0, y: 12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
                    transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                    className={[
                        'fixed right-4 z-sticky flex h-11 w-11 items-center justify-center',
                        // `--tabbar-h` solo existe dentro del panel; en la web
                        // pública el `fallback` de 0px deja el botón abajo.
                        'bottom-[calc(1rem+var(--tabbar-h,0px)+env(safe-area-inset-bottom,0px))]',
                        'rounded-pill border border-[var(--border-default)] bg-surface-overlay/90 backdrop-blur-md',
                        'text-ink-muted shadow-overlay',
                        'transition-colors duration-fast ease-snap',
                        'hover:bg-surface-raised hover:text-ink',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                    ].join(' ')}
                >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                </m.button>
            )}
        </AnimatePresence>
    );
}
