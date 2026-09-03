import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Anchura de un panel, ajustable arrastrando y recordada entre sesiones.
 *
 * `side: 'right'` significa que el panel vive a la DERECHA, así que arrastrar
 * hacia la izquierda lo ensancha. Sin esto el tirador funciona al revés y se
 * siente roto aunque el número sea correcto.
 */
export function usePanelWidth(
    storageKey: string,
    { initial, min, max, side = 'right' }: { initial: number; min: number; max: number; side?: 'left' | 'right' }
) {
    const [width, setWidth] = useState<number>(() => {
        const saved = Number(localStorage.getItem(storageKey));
        return Number.isFinite(saved) && saved >= min && saved <= max ? saved : initial;
    });

    const [dragging, setDragging] = useState(false);
    const start = useRef<{ pointer: number; width: number } | null>(null);

    const onPointerDown = useCallback((event: React.PointerEvent) => {
        // Capturar el puntero es lo que hace que el arrastre siga funcionando
        // cuando el cursor se sale del tirador, que son 6px de ancho y se
        // abandonan al primer movimiento rápido.
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        start.current = { pointer: event.clientX, width };
        setDragging(true);
    }, [width]);

    useEffect(() => {
        if (!dragging) return;

        const onMove = (event: PointerEvent) => {
            if (!start.current) return;
            const delta = event.clientX - start.current.pointer;
            const next = start.current.width + (side === 'right' ? -delta : delta);
            setWidth(Math.min(max, Math.max(min, next)));
        };

        const onUp = () => {
            setDragging(false);
            start.current = null;
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [dragging, min, max, side]);

    // Se guarda al SOLTAR, no en cada píxel: escribir en `localStorage` es
    // síncrono y hacerlo sesenta veces por segundo mientras se arrastra
    // bloquea el hilo principal y el tirador da tirones.
    useEffect(() => {
        if (dragging) return;
        try { localStorage.setItem(storageKey, String(Math.round(width))); } catch { /* modo privado */ }
    }, [dragging, width, storageKey]);

    /**
     * El teclado también tiene que poder mover esto. Un panel que solo se
     * ajusta arrastrando deja fuera a quien no usa ratón, y el tirador es un
     * control como cualquier otro.
     */
    const onKeyDown = useCallback((event: React.KeyboardEvent) => {
        const step = event.shiftKey ? 48 : 16;
        const grow = side === 'right' ? 'ArrowLeft' : 'ArrowRight';
        const shrink = side === 'right' ? 'ArrowRight' : 'ArrowLeft';

        if (event.key === grow) { event.preventDefault(); setWidth(w => Math.min(max, w + step)); }
        if (event.key === shrink) { event.preventDefault(); setWidth(w => Math.max(min, w - step)); }
        if (event.key === 'Home') { event.preventDefault(); setWidth(initial); }
    }, [side, min, max, initial]);

    return { width, dragging, onPointerDown, onKeyDown, reset: () => setWidth(initial), min, max };
}

/**
 * El tirador.
 *
 * Mide 5px de ancho visible pero la zona sensible se extiende 8px a cada lado
 * con un pseudo-elemento: un objetivo de 5px es prácticamente imposible de
 * agarrar y el usuario acaba pensando que el panel no se puede ajustar.
 *
 * Doble clic devuelve la anchura por defecto, que es la salida cuando alguien
 * se pasa arrastrando y no sabe volver.
 */
export function ResizeHandle({
    width,
    dragging,
    onPointerDown,
    onKeyDown,
    onReset,
    min,
    max,
    label,
}: {
    width: number;
    dragging: boolean;
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    onReset: () => void;
    min: number;
    max: number;
    label: string;
}) {
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={Math.round(width)}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onDoubleClick={onReset}
            title="Arrastra para ajustar · doble clic para restablecer"
            className={`relative w-1.5 shrink-0 cursor-col-resize touch-none select-none transition-colors duration-fast before:absolute before:inset-y-0 before:-left-2 before:-right-2 before:content-[''] block
 ${dragging ? 'bg-brand' : 'bg-transparent hover:bg-[var(--brand-line)]'}`}
        >
            {/* Marca central. Solo se ve al pasar por encima o al arrastrar:
                una línea siempre visible en mitad de la pantalla es ruido. */}
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-pill transition-opacity duration-fast ${
 dragging ? 'bg-brand-ink opacity-100' : 'bg-ink-subtle opacity-0 hover:opacity-100'
 }`}
            />
        </div>
    );
}
