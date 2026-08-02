import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * MENÚ COLGADO DE UN BOTÓN, FUERA DEL FLUJO
 * =====================================================================
 *
 * QUÉ PROBLEMA RESUELVE
 * Un desplegable en `position: absolute` vive dentro de su contenedor, y
 * eso significa que hereda sus recortes. En el constructor de rutinas el
 * menú de "agendar en qué día" colgaba de una tarjeta que está dentro del
 * acordeón de la semana, que necesita `overflow-hidden` para poder animar
 * su apertura. Resultado: el menú se recortaba contra el borde inferior de
 * la semana y los últimos días de la lista —jueves, viernes, sábado,
 * domingo— sencillamente no se podían pulsar.
 *
 * Subir el `z-index` no arregla nada: `overflow: hidden` recorta, no
 * ordena. Y quitarlo del acordeón rompería la animación de plegado.
 *
 * LA SOLUCIÓN
 * Sacar el menú del árbol con un portal y colocarlo en `position: fixed`
 * contra la ventana, midiendo dónde está el botón. Así ningún contenedor
 * intermedio puede recortarlo ni taparlo.
 *
 * Se reposiciona al hacer scroll y al cambiar el tamaño porque `fixed` no
 * sigue al botón: sin eso, bastaba con desplazar la página un poco para que
 * el menú se quedara flotando lejos de su origen.
 */

type Align = 'start' | 'end';

export function AnchoredMenu({
    open,
    onClose,
    anchorRef,
    align = 'start',
    width = 176,
    children,
}: {
    open: boolean;
    onClose: () => void;
    /** El botón del que cuelga el menú. */
    anchorRef: React.RefObject<HTMLElement | null>;
    /** A qué lado del botón se alinea. */
    align?: Align;
    /** Ancho en píxeles. Fijo para poder decidir si cabe antes de pintarlo. */
    width?: number;
    children: ReactNode;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    /**
     * `useLayoutEffect` y no `useEffect`: la posición tiene que estar
     * calculada ANTES de que el navegador pinte. Con `useEffect` el menú
     * aparece un fotograma en la esquina superior izquierda y salta a su
     * sitio, que es un parpadeo perfectamente visible.
     */
    useLayoutEffect(() => {
        if (!open) return;

        const place = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;

            const rect = anchor.getBoundingClientRect();
            const menuHeight = menuRef.current?.offsetHeight ?? 0;
            const margin = 8;

            // Debajo del botón por defecto. Si no cabe —el menú de un día de
            // la última fila, con la ventana ya cerca del final— se abre
            // hacia arriba en vez de salirse por debajo de la pantalla.
            const below = rect.bottom + 6;
            const fitsBelow = below + menuHeight + margin <= window.innerHeight;
            const preferred = fitsBelow ? below : rect.top - menuHeight - 6;

            // Y pase lo que pase, dentro de la pantalla. Cuando el botón está
            // medio fuera —una tarjeta al borde inferior de la zona
            // desplazable— ni arriba ni abajo caben del todo, y sin esto el
            // último día del menú quedaba cortado por el canto de la ventana,
            // que es exactamente el fallo que veníamos a arreglar.
            const top = Math.min(
                Math.max(margin, preferred),
                Math.max(margin, window.innerHeight - menuHeight - margin)
            );

            const raw = align === 'end' ? rect.right - width : rect.left;
            // Y que no se salga por los lados en un móvil estrecho.
            const left = Math.min(
                Math.max(margin, raw),
                Math.max(margin, window.innerWidth - width - margin)
            );

            setPosition({ top, left });
        };

        place();

        // `capture` para enterarse también del scroll de contenedores
        // internos: el menú cuelga de una tarjeta que vive dentro de la zona
        // desplazable del constructor, no del scroll de la ventana.
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open, align, width, anchorRef]);

    // Cerrar al pulsar fuera o con Escape. El botón que abre queda excluido:
    // sin eso, su propio clic cerraba y volvía a abrir en el mismo gesto.
    useEffect(() => {
        if (!open) return;

        const onPointer = (e: PointerEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose, anchorRef]);

    if (!open) return null;

    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width,
                // Invisible hasta tener medida. Con el menú ya en el DOM se
                // puede medir su alto, que es lo que decide si abre hacia
                // arriba o hacia abajo.
                visibility: position ? 'visible' : 'hidden',
            }}
            className="z-tooltip max-h-[min(60vh,24rem)] overflow-y-auto rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
        >
            {children}
        </div>,
        document.body
    );
}
