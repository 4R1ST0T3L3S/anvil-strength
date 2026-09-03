import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export interface MenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
    /**
     * Vista secundaria: análisis, preferencias, calendario, ranking... No
     * sale en las tarjetas de la Home. Ahora mismo no la pinta nadie; queda
     * la marca para la navegación que sustituya al antiguo menú de cuenta.
     */
    enMenuCuenta?: boolean;
}

export interface DashboardLayoutProps {
    menuItems: MenuItem[];
    children: ReactNode;
    /** Título de la vista actual (barra superior) */
    title?: string;
    /** Si se pasa, muestra el botón de volver en la barra superior */
    onBack?: () => void;
    /** Oculta la cabecera superior. Útil para que la Home la integre sola. */
    hideHeaderOnDesktop?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    children,
    title,
    onBack,
    hideHeaderOnDesktop = false,
}) => {
    return (
        <div className="flex h-[100dvh] bg-surface-canvas text-ink overflow-hidden font-sans">

            {/* ============ COLUMNA PRINCIPAL ============ */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Barra superior.
                    La Home la esconde (`hideHeaderOnDesktop`) porque pinta la
                    suya propia vía `headerActions` de `CoachHome`/`AthleteHome`.
                    El resto de vistas la usan para el título y el botón de
                    volver. */}
                <header className={`h-16 shrink-0 items-center justify-between gap-3 px-6 bg-surface-canvas/90 backdrop-blur border-b border-subtle z-40 ${hideHeaderOnDesktop ? 'hidden' : 'flex'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {onBack ? (
                            <button
                                onClick={onBack}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 -ml-1 rounded-lg text-ink-muted hover:text-ink hover:bg-white/[0.06] text-xs font-bold uppercase tracking-wide transition-colors duration-fast active:scale-[0.97]"
                                aria-label="Volver"
                            >
                                <ArrowLeft size={16} />
                                <span>Volver</span>
                            </button>
                        ) : (
                            <span className="font-black text-base tracking-tight text-ink select-none">
                                ANVIL<span className="text-brand-text">.</span>
                            </span>
                        )}
                        {title && (
                            <h1 className="font-black uppercase tracking-tight text-ink truncate text-base">
                                {title}
                            </h1>
                        )}
                    </div>

                </header>

                {/* Contenido.
                    `overflow-x-hidden` es el corte de seguridad del panel
                    entero: aquí dentro viven tablas, rejillas de semanas y
                    gráficas, y basta con que una se pase de ancho para que
                    arrastre la PÁGINA hacia la derecha —cabecera incluida—.
                    Los hijos que sí necesitan desplazarse de lado (las pestañas
                    de la ficha, los días de la semana) traen su propio
                    `overflow-x-auto` y siguen funcionando igual: esto solo
                    impide que el desbordamiento se propague al armazón. */}
                {/* `data-scroll-host`: aquí dentro `window.scrollY` vale SIEMPRE cero,
                    porque quien se desplaza es este <main> y no la ventana. Lo que
                    necesita el scroll (volver arriba, restaurar la posición al
                    volver atrás) pregunta por este atributo. Ver src/lib/scrollHost.ts. */}
                <main
                    data-scroll-host
                    className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-canvas pb-6"
                >
                    {children}
                </main>
            </div>
        </div>
    );
};
