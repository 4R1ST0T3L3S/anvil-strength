import { Skeleton } from '../ui/Skeleton';

/**
 * ANVIL STRENGTH — ARMAZÓN DEL PANEL, MIENTRAS CARGA
 * =====================================================================
 *
 * QUÉ SUSTITUYE, Y POR QUÉ ES EL CAMBIO QUE MÁS SE NOTA
 *
 * `DashboardSkeleton` no es un esqueleto: es una pantalla COMPLETA con la
 * mascota y "Cargando tus gains…". Y se usaba como `fallback` de 21
 * `Suspense`, o sea en cada cambio de ruta del panel.
 *
 * El efecto es que tocar una pestaña borra la interfaz entera —barra
 * lateral, cabecera, barra de pestañas— y la vuelve a pintar medio segundo
 * después. El ojo lo lee como "se ha recargado la página", que es
 * exactamente la sensación contraria a la de una aplicación.
 *
 * Aquí el armazón NO desaparece. Lo único que se rellena con cajas grises es
 * la zona de contenido, que es lo único que de verdad está cargando.
 *
 *
 * LA MASCOTA NO SE JUBILA
 *
 * Sigue en `DashboardSkeleton`, que ahora tiene un solo uso legítimo: el
 * arranque en frío en `App.tsx`, mientras se comprueba la sesión. Esa espera
 * sí es larga, sí es una pantalla en blanco de verdad, y sí merece tener
 * marca. La diferencia es que ocurre una vez por visita y no en cada
 * pestaña.
 *
 *
 * LAS MEDIDAS TIENEN QUE COINCIDIR CON `DashboardLayout`
 *
 * `h-16` en la cabecera (oculta en móvil, visible desde `md` — desde el 30
 * ago 2026 ya no hay barra lateral que dibujar aquí: el Dashboard de
 * escritorio la sustituyó por el propio `CoachHome`/`AthleteHome`), y
 * `min-h-[52px]` en las pestañas de la barra flotante de abajo. Si alguna
 * cambia allí y no aquí, aparece el salto que todo esto viene a evitar. Es
 * la única razón por la que estos números están repetidos: extraerlos a
 * constantes compartidas obligaría a `DashboardLayout` a importar del
 * esqueleto o al revés, y son dos piezas que no deben depender la una de la
 * otra.
 */
export function AppShellSkeleton() {
    return (
        <div
            className="flex h-[100dvh] overflow-hidden bg-surface-canvas font-sans"
            // Un lector anuncia que se está cargando UNA vez, aquí, en vez de
            // recitar las treinta cajas grises de dentro (que van `aria-hidden`).
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="sr-only">Cargando la página…</span>

            {/* ============ COLUMNA PRINCIPAL ============ */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Oculta en móvil, igual que la cabecera real. En escritorio
                    la marca SÍ se pinta de verdad: es lo único que se sabe
                    con certeza mientras carga, y verla desde el primer frame
                    es lo que hace que esto se lea como la misma aplicación y
                    no como otra pantalla. */}
                <header className="z-40 hidden h-16 shrink-0 items-center justify-between gap-3 border-b border-subtle bg-surface-canvas/90 px-6 backdrop-blur md:flex">
                    <span className="select-none text-t-base font-black tracking-tight text-ink">
                        ANVIL<span className="text-brand-text">.</span>
                    </span>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-9 rounded-field" />
                        <Skeleton className="h-9 w-9 rounded-field" />
                    </div>
                </header>

                <main className="flex-1 overflow-hidden bg-surface-canvas p-4 md:p-6">
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                        {/* Una cifra grande arriba y contenido debajo: es la
                            forma que tienen casi todas las pantallas del panel
                            (inicio del atleta, inicio del entrenador, la ficha),
                            así que el hueco reservado coincide con lo que llega. */}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="flex flex-col gap-2 rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                                    <Skeleton className="h-2.5 w-16" />
                                    <Skeleton className="h-8 w-20" />
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-2">
                            {Array.from({ length: 3 }, (_, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                                    <Skeleton className="h-10 w-10 shrink-0 rounded-pill" />
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <Skeleton className="h-4 w-2/5" />
                                        <Skeleton className="h-3 w-1/4" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>

            {/* ============ BARRA DE PESTAÑAS (móvil) ============ */}
            {/* Píldora flotante, igual que la real: separada del borde, no
                pegada a él. */}
            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-sticky md:hidden">
                <nav className="flex items-stretch justify-around rounded-3xl border border-subtle bg-surface-canvas/80 px-2 py-1 shadow-2xl backdrop-blur-xl">
                    {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5">
                            <Skeleton className="h-5 w-5 rounded-chip" />
                            <Skeleton className="h-2 w-10" />
                        </div>
                    ))}
                </nav>
            </div>
        </div>
    );
}
