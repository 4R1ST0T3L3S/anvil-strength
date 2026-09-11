import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useClaseDeRegistro } from '../layout/RegistroMarca';

/**
 * MENÚ COLGADO DE UN BOTÓN, FUERA DEL FLUJO
 * =====================================================================
 *
 * Un desplegable en `position: absolute` hereda los recortes de su
 * contenedor (`overflow: hidden` del acordeón de semanas) y queda atrapado en
 * los contextos de apilamiento que crea un `backdrop-filter` (la barra
 * superior). Subir el `z-index` no arregla ninguna de las dos cosas.
 *
 * Aquí el menú sale por PORTAL a `<body>` en `position: fixed`, midiendo
 * dónde está el botón. Se reposiciona con el scroll (también el de
 * contenedores internos) y al cambiar el tamaño; abre hacia arriba si abajo
 * no cabe, y nunca se sale de la ventana.
 *
 * `MenuItem`, `MenuSeparador` y `MenuEtiqueta`, abajo, son el vocabulario de
 * dentro: la misma fila, el mismo hover y la misma marca en toda la app.
 */

type Align = 'start' | 'end';

const ESTILO_POR_DEFECTO =
    'z-tooltip max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain rounded-[14px] border border-[var(--card-border)] bg-surface-overlay p-1.5 shadow-overlay animate-pop';

export function AnchoredMenu({
    open,
    onClose,
    anchorRef,
    align = 'start',
    width = 176,
    className,
    role = 'menu',
    children,
}: {
    open: boolean;
    onClose: () => void;
    /** El botón del que cuelga el menú. */
    anchorRef: React.RefObject<HTMLElement | null>;
    /** A qué lado del botón se alinea. */
    align?: Align;
    /**
     * Ancho DESEADO en píxeles. Si no cabe en la ventana se reduce hasta el
     * disponible: en un móvil estrecho el menú se estrecha en vez de salirse.
     */
    width?: number;
    /** Clases del contenedor. Sustituyen al estilo por defecto. */
    className?: string;
    /**
     * `menu` cuando dentro hay opciones que se pulsan; `dialog` para paneles
     * que enseñan contenido (las notificaciones).
     */
    role?: 'menu' | 'dialog';
    children: ReactNode;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const registro = useClaseDeRegistro();

    /**
     * `useLayoutEffect` y no `useEffect`: la posición tiene que estar
     * calculada ANTES de pintar, o el menú aparece un fotograma en la esquina
     * y salta a su sitio.
     */
    useLayoutEffect(() => {
        if (!open) return;

        const place = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;

            const rect = anchor.getBoundingClientRect();
            const menuHeight = menuRef.current?.offsetHeight ?? 0;
            const margin = 8;

            const boxWidth = Math.min(width, window.innerWidth - margin * 2);

            const below = rect.bottom + 6;
            const fitsBelow = below + menuHeight + margin <= window.innerHeight;
            const preferred = fitsBelow ? below : rect.top - menuHeight - 6;

            const top = Math.min(
                Math.max(margin, preferred),
                Math.max(margin, window.innerHeight - menuHeight - margin)
            );

            const raw = align === 'end' ? rect.right - boxWidth : rect.left;
            const left = Math.min(
                Math.max(margin, raw),
                Math.max(margin, window.innerWidth - boxWidth - margin)
            );

            setPosition({ top, left, width: boxWidth });
        };

        place();

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
            role={role}
            style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width: position?.width ?? width,
                // Invisible hasta tener medida: con el menú ya en el DOM se
                // puede medir su alto, que decide si abre hacia arriba.
                visibility: position ? 'visible' : 'hidden',
                transformOrigin: align === 'end' ? 'top right' : 'top left',
            }}
            className={cn(className ?? ESTILO_POR_DEFECTO, registro)}
        >
            {children}
        </div>,
        document.body
    );
}

// =====================================================================
// EL CONTENIDO DE UN MENÚ
// =====================================================================

export function MenuItem({
    icono,
    children,
    pista,
    onClick,
    activa = false,
    peligro = false,
    disabled = false,
    role = 'menuitem',
    derecha,
}: {
    icono?: ReactNode;
    children: ReactNode;
    /** Segunda línea, más discreta. */
    pista?: ReactNode;
    onClick?: () => void;
    /** Opción elegida: fondo de selección y marca. */
    activa?: boolean;
    peligro?: boolean;
    disabled?: boolean;
    role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
    /** Algo a la derecha: un atajo, un contador. */
    derecha?: ReactNode;
}) {
    return (
        <button
            type="button"
            role={role}
            aria-checked={role === 'menuitem' ? undefined : activa}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex min-h-[40px] w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-t-sm',
                'transition-colors duration-fast ease-snap',
                'disabled:cursor-not-allowed disabled:opacity-40',
                peligro
                    ? 'text-danger-text hover:bg-[var(--danger-quiet)]'
                    : activa
                        ? 'bg-[var(--fill-selected)] text-ink'
                        : 'text-ink hover:bg-[var(--fill-hover)]'
            )}
        >
            {icono && (
                <span
                    className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-[17px] [&>svg]:w-[17px]',
                        peligro ? 'text-danger-text' : 'text-ink-muted'
                    )}
                    aria-hidden="true"
                >
                    {icono}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{children}</span>
                {pista && <span className="mt-0.5 block text-t-xs leading-snug text-ink-subtle">{pista}</span>}
            </span>
            {derecha}
            {activa && role !== 'menuitem' && (
                <Check className="h-4 w-4 shrink-0 text-brand-text" strokeWidth={2.5} aria-hidden="true" />
            )}
        </button>
    );
}

export function MenuSeparador() {
    return <div role="separator" className="-mx-1.5 my-1.5 h-px bg-[var(--separator)]" />;
}

export function MenuEtiqueta({ children }: { children: ReactNode }) {
    return <p className="truncate px-2.5 pb-1 pt-1.5 text-t-xs font-medium text-ink-subtle">{children}</p>;
}
