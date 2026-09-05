import { Skeleton, SkeletonText } from '../ui/Skeleton';

/**
 * Esqueleto de una página de la web PÚBLICA.
 *
 * Hermano de `AppShellSkeleton`, que reserva el armazón del panel. Aquí no
 * hay armazón que reservar: las páginas públicas —legales, invitación,
 * reclamación, vuelta de un login externo— traen su propia cabecera dentro
 * del componente, así que mientras el trozo se descarga no hay nada que
 * mantener en pantalla.
 *
 * Lo que sí se puede hacer es reservar la FORMA: una barra arriba, un
 * titular y un bloque de texto. Con eso, cuando llega la página de verdad,
 * el contenido aparece donde ya había un hueco en vez de empujar la vista.
 *
 * Antes de esto, las siete rutas públicas usaban el mismo interstitial de
 * pantalla completa con la mascota que usaba el panel: pulsar "Aviso legal"
 * en el pie de la portada tapaba la web entera con "Cargando tus gains…".
 */
export function PageSkeleton() {
    return (
        <div
            className="min-h-[100dvh] bg-surface-canvas"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="sr-only">Cargando la página…</span>

            {/* La cabecera es fija y mide 64px en la web pública: reservarla
                evita que el contenido salte hacia abajo al montarse. */}
            <div className="flex h-16 items-center justify-between border-b border-subtle px-6">
                <span className="select-none text-t-lg font-black tracking-tight text-ink">
                    ANVIL<span className="text-brand-text">.</span>
                </span>
                <Skeleton className="h-9 w-24" />
            </div>

            <div className="mx-auto w-full max-w-[760px] px-6 py-16">
                <Skeleton className="h-9 w-2/3" />
                <div className="mt-8 flex flex-col gap-8">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div key={i} className="flex flex-col gap-3">
                            <Skeleton className="h-4 w-1/3" />
                            <SkeletonText lineas={3} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
