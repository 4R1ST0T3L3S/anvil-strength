import { Loader } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Giro de carga.
 *
 * CUÁNDO USAR ESTO Y CUÁNDO UN ESQUELETO
 *
 * Un esqueleto dice "va a aparecer ESTO aquí", y para eso hay que saber qué
 * forma tiene. Sirve para una lista, una tarjeta, una gráfica.
 *
 * El giro dice "espera", sin prometer nada. Es lo correcto solo en dos
 * sitios: mientras se comprueba la sesión al arrancar en frío, y dentro de
 * un botón que está guardando. En todo lo demás va un esqueleto — ver
 * `Skeleton.tsx`. Había 112 de estos repartidos por la aplicación contra 5
 * usos del esqueleto, y esa proporción está justo del revés.
 */
export function LoadingSpinner({
    message = 'Cargando…',
    fullscreen = false,
    className,
}: {
    message?: string;
    fullscreen?: boolean;
    className?: string;
}) {
    const contenido = (
        <div
            className="flex flex-col items-center gap-4"
            // `status` + `polite`: se anuncia sin interrumpir lo que el lector
            // esté diciendo. Antes esto no lo anunciaba nadie, así que quien
            // navega con lector no sabía que había que esperar.
            role="status"
            aria-live="polite"
        >
            <Loader className="animate-spin text-brand-text" size={40} aria-hidden="true" />
            <p className="text-t-sm font-bold uppercase tracking-[0.2em] text-ink-muted">
                {message}
            </p>
        </div>
    );

    if (fullscreen) {
        return (
            // `100dvh` y no `100vh`: en el móvil, con la barra del navegador a
            // la vista, `vh` mide de más y el contenido queda descentrado hacia
            // abajo. Ver la nota general en DESIGN.md.
            <div className={cn('flex min-h-[100dvh] items-center justify-center bg-surface-sunken', className)}>
                {contenido}
            </div>
        );
    }

    return <div className={cn('flex items-center justify-center p-8', className)}>{contenido}</div>;
}
