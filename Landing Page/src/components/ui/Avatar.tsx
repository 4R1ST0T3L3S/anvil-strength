import { useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * AVATAR
 * =====================================================================
 *
 * Foto si hay y carga; si no, las iniciales sobre un gris del sistema —
 * nunca un degradado rojo: el acento no decora, y veinte círculos rojos en
 * una lista gritan más que el contenido.
 *
 * Si la foto falla (enlace roto, archivo borrado) se cae a las iniciales en
 * vez de dejar un hueco, que es lo que pasaba con un `<img>` a pelo.
 */

export function iniciales(nombre?: string | null): string {
    const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '·';
    const primera = partes[0][0] ?? '';
    const segunda = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
    return (primera + segunda).toUpperCase();
}

export function Avatar({
    nombre,
    src,
    size = 40,
    className,
    anillo = false,
}: {
    nombre?: string | null;
    src?: string | null;
    /** Diámetro en px. */
    size?: number;
    className?: string;
    /** Borde del color del lienzo: para avatares que se solapan o llevan un punto encima. */
    anillo?: boolean;
}) {
    const [fallo, setFallo] = useState(false);
    const conFoto = !!src && !fallo;

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill',
                'bg-[var(--fill-strong)] font-semibold text-ink-muted',
                anillo && 'ring-2 ring-[var(--surface-canvas)]',
                className
            )}
            style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
            aria-hidden="true"
        >
            {conFoto ? (
                <img
                    src={src!}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={() => setFallo(true)}
                />
            ) : (
                <span className="leading-none tracking-[-0.01em]">{iniciales(nombre)}</span>
            )}
        </span>
    );
}
