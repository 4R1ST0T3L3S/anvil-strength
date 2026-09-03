import { AnvilMascot } from '../ui/AnvilMascot';

/**
 * ARRANQUE EN FRÍO. Y SOLO ESO.
 * =====================================================================
 *
 * Esta pantalla existe para UNA espera: la de `App.tsx` comprobando si hay
 * sesión, antes de saber siquiera qué panel toca pintar. Es la única de la
 * aplicación en la que de verdad no hay nada que conservar en pantalla, dura
 * lo que dura una ida y vuelta a Supabase, y ocurre una vez por visita. Ahí
 * una pantalla con la mascota está bien: da marca a la única espera que la
 * merece.
 *
 * LO QUE YA NO HACE, Y ES EL CAMBIO IMPORTANTE
 *
 * Era el `fallback` de los 21 `Suspense` del enrutador, o sea de cada cambio
 * de ruta del panel. Tocar una pestaña borraba la barra lateral, la
 * cabecera y la barra de pestañas, y lo volvía a montar medio segundo
 * después: el ojo lo lee como una recarga de página, no como una navegación.
 *
 * Ahora esas rutas usan `AppShellSkeleton` (el armazón se queda) y
 * `PageSkeleton` (las públicas). Si alguna vez vuelve a aparecer un
 * `fallback={<DashboardSkeleton />}` en el enrutador, es un error.
 */
export function DashboardSkeleton() {
    return (
        <div
            className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-surface-sunken p-4"
            role="status"
            aria-live="polite"
        >
            <AnvilMascot className="h-48 w-48" />

            <div className="flex flex-col items-center gap-3">
                <p className="animate-pulse text-t-xl font-black uppercase italic tracking-tighter text-ink sm:text-t-2xl">
                    Cargando tus gains…
                </p>

                {/* Barra de progreso indeterminada. El movimiento vive ahora en
                    tailwind.config.js (`animate-shimmer`); antes era una
                    etiqueta `<style>` inyectada en el DOM en cada render. */}
                <div className="relative h-1 w-32 overflow-hidden rounded-pill bg-surface-overlay" aria-hidden="true">
                    <div className="absolute left-0 top-0 h-full w-1/2 animate-shimmer bg-brand" />
                </div>
            </div>
        </div>
    );
}
