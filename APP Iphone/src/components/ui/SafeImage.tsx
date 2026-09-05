import { useState } from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Imagen que degrada bien cuando el archivo no existe.
 *
 * POR QUÉ HACE FALTA
 * El `rewrite` de SPA de Vercel devuelve `index.html` para cualquier ruta que
 * no encuentre, imágenes incluidas. Una foto que falta no da 404: da **200
 * con `text/html`**. El navegador no puede decodificarlo y deja un hueco, sin
 * error en consola ni en la pestaña de red — imposible de diagnosticar
 * mirando por encima.
 *
 * `vercel.json` ya excluye las extensiones de fichero del rewrite para que
 * un asset ausente vuelva a dar 404 de verdad. Este componente es la otra
 * mitad: que el hueco se vea como un hueco intencionado y no como un fallo
 * de maquetación.
 *
 * El evento `error` de <img> sí se dispara en ambos casos (404 y HTML mal
 * decodificado), así que sirve para los dos.
 */

// `src` se admite como null para poder pasar directamente campos de la BD
// (avatar_url, video_url...) sin comprobarlos en cada punto de uso.
export interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src?: string | null;
    alt: string;
    /** Sustituto a medida. Por defecto, un marcador discreto. */
    fallback?: ReactNode;
    /** Clases del contenedor del sustituto, para conservar la forma del hueco. */
    fallbackClassName?: string;
}

export function SafeImage({
    src,
    alt,
    fallback,
    fallbackClassName,
    className,
    ...props
}: SafeImageProps) {
    const [failed, setFailed] = useState(false);

    if (!src || failed) {
        if (fallback) return <>{fallback}</>;

        return (
            <div
                // Se hereda className para que el hueco ocupe exactamente lo
                // mismo que habría ocupado la foto y no descuadre la rejilla.
                className={cn(
                    'flex items-center justify-center bg-surface-raised text-ink-subtle',
                    className,
                    fallbackClassName
                )}
                role="img"
                aria-label={alt}
            >
                <ImageOff className="h-6 w-6" aria-hidden="true" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setFailed(true)}
            {...props}
        />
    );
}
