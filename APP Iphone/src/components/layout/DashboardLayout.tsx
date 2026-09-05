import { ReactNode, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { Globe, LogOut, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnchoredMenu } from '../ui/AnchoredMenu';

export interface MenuItem {
    icon: React.ReactNode;
    label: string;
    /**
     * Etiqueta para la barra inferior del móvil.
     *
     * Una pestaña mide 72px de ancho: "Competiciones" no cabe ni de lejos y
     * se cortaba a mitad de palabra. Recortar con puntos suspensivos no
     * ayuda —"Competi…" no dice más que "Comps"— así que la versión corta se
     * escribe a mano donde se sabe qué se puede sacrificar.
     */
    shortLabel?: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
    /**
     * Fuera de la barra inferior del móvil. Cinco pestañas es el techo: con
     * las nueve que había, cada una medía 38px de ancho y la etiqueta se
     * cortaba a dos letras. Lo que se marca aquí sigue en la barra lateral de
     * escritorio y aparece en el menú de cuenta en móvil, así que no se
     * pierde ningún acceso.
     */
    hideOnMobileBar?: boolean;
}

/**
 * CONMUTADOR DE PANEL.
 *
 * Quien tiene los dos paneles —entrena a gente y además le entrenan— necesita
 * ir y volver. Antes esto era un `menuItem` con `hideOnMobileBar`, así que en
 * el móvil se hundía en el menú de la ⋮ y no había forma evidente de cambiar
 * de panel. Como es un cambio de CONTEXTO y no una pestaña más, sube a un
 * control propio: un botón fijo en la cabecera del móvil y en el pie de la
 * barra lateral de escritorio. Siempre visible, nunca escondido.
 */
export interface PanelSwitch {
    /** Texto completo (escritorio y etiqueta accesible). */
    label: string;
    /** Versión corta para la píldora del móvil, donde no cabe todo. */
    shortLabel?: string;
    icon: React.ReactNode;
    onClick: () => void;
}

export interface DashboardLayoutProps {
    menuItems: MenuItem[];
    children: ReactNode;
    /** Si se pasa, muestra la campana de notificaciones en la barra superior */
    userId?: string;
    /** Título de la vista actual (barra superior) */
    title?: string;
    /** Si se pasa, muestra el botón de volver en la barra superior */
    onBack?: () => void;
    /** Cierra la sesión. Sin esto no hay forma de salir del panel. */
    onLogout?: () => void | Promise<void>;
    /** Nombre a mostrar en el pie de la barra lateral. */
    userName?: string | null;
    /** Conmutador entre panel de gestión y panel de atleta. Ver `PanelSwitch`. */
    panelSwitch?: PanelSwitch;
    /** Oculta la cabecera superior en escritorio. Útil para que la Home la integre sola. */
    hideHeaderOnDesktop?: boolean;
}

// `userId`, `title`, `onBack`, `onLogout`... siguen en las props porque los
// pasan las páginas, pero aquí no hay cabecera que los pinte: cada pantalla
// trae la suya y la salida vive en Perfil.
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
}) => {
    const visibleItems = menuItems.filter(item => item.label !== 'QA: Test DB');
    const barItems = visibleItems.filter(item => !item.hideOnMobileBar);

    return (
        <div className="flex h-[100dvh] bg-surface-canvas text-ink overflow-hidden font-sans pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">

            {/* ============ COLUMNA PRINCIPAL ============ */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Contenido.
                    `overflow-x-hidden` es el corte de seguridad del panel
                    entero: aquí dentro viven tablas, rejillas de semanas y
                    gráficas, y basta con que una se pase de ancho para que
                    arrastre la PÁGINA hacia la derecha —cabecera y barra de
                    pestañas incluidas— y deje medio móvil en negro. Los hijos
                    que sí necesitan desplazarse de lado (las pestañas de la
                    ficha, los días de la semana) traen su propio
                    `overflow-x-auto` y siguen funcionando igual: esto solo
                    impide que el desbordamiento se propague al armazón. */}
                {/* `data-scroll-host`: aquí dentro `window.scrollY` vale SIEMPRE cero,
                    porque quien se desplaza es este <main> y no la ventana. Lo que
                    necesita el scroll (volver arriba, restaurar la posición al
                    volver atrás) pregunta por este atributo. Ver src/lib/scrollHost.ts. */}
                <main
                    data-scroll-host
                    // `--tabbar-h`: la altura que ocupa la barra inferior del
                    // móvil. Lo que flote abajo la lee para apartarse en vez de
                    // quedarse encima de "Perfil".
                    style={{ ['--tabbar-h' as string]: 'var(--tabbar-alto)' }}
                    className="flex-1 overflow-y-auto overflow-x-hidden pb-28 scrollbar-hide bg-surface-canvas"
                >
                    {children}
                </main>
            </div>

            {/* ============ NAV INFERIOR ============ */}
            {/* Barra flotante y translúcida, separada del borde en vez de
                pegada a él. El hueco de `--tabbar-alto` (tokens.css) tiene
                la geometría exacta de esta versión. Ahora 100% visible en
                todos los tamaños de pantalla. */}
            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-sticky">
                <nav className="flex items-stretch justify-around rounded-3xl border border-subtle bg-surface-canvas/80 px-2 py-1 shadow-2xl backdrop-blur-xl">
                    {barItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            aria-label={item.label}
                            aria-current={item.isActive ? 'page' : undefined}
                            // `min-h-[52px]`: por debajo de 44px el pulgar falla mas
                            // de lo que acierta.
                            className={`relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-card px-1 py-1.5 transition-colors duration-fast ${
                                item.isActive ? 'text-brand-text' : 'text-ink-subtle'
                            }`}
                        >
                            {item.isActive && (
                                <m.span
                                    layoutId="bottomnav-active"
                                    className="absolute inset-x-0.5 inset-y-0 rounded-card bg-[var(--brand-quiet)]"
                                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                                />
                            )}
                            <span className="relative shrink-0">{item.icon}</span>
                            <span className="relative max-w-full truncate text-t-2xs font-bold leading-none tracking-tight">
                                {item.shortLabel ?? item.label.replace('Mi ', '').replace('Mis ', '')}
                            </span>
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
};

/**
 * Menú de cuenta para móvil: las pestañas que no caben en la barra inferior,
 * ver la web y cerrar sesión.
 *
 * En escritorio todo esto está siempre visible en la barra lateral. Aquí va
 * plegado porque la barra inferior topa en cinco pestañas: por encima de eso
 * cada icono baja de los 44px de zona pulsable que necesita un pulgar.
 */
export function AccountMenu({
    onLogout,
    userName,
    items = [],
}: {
    onLogout?: () => void | Promise<void>;
    userName?: string | null;
    items?: MenuItem[];
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Cerrar al pulsar fuera o con Escape lo resuelve `AnchoredMenu`.

    return (
        <div>
            <button
                ref={buttonRef}
                onClick={() => setOpen(v => !v)}
                aria-label="Cuenta y salida"
                aria-expanded={open}
                aria-haspopup="menu"
                // 44x44. Medía 34 y es la única puerta a "cerrar sesión" y a
                // las pestañas que no caben en la barra inferior: fallarlo deja
                // al usuario sin salida visible del panel.
                className="flex h-11 w-11 items-center justify-center rounded-field text-ink-muted transition-colors duration-fast hover:bg-white/[0.06] hover:text-ink"
            >
                <MoreVertical size={20} aria-hidden="true" />
            </button>

            {/* PORTAL, no `absolute`.
                Esta barra superior lleva `backdrop-blur`, y un filtro crea
                contexto de apilamiento: el menú quedaba encerrado dentro de la
                cabecera y por debajo de cualquier elemento fijo del contenido
                —la cabecera pegajosa del registro, con `z-sticky`—, así que en
                "Mi planificación" aparecía cortado por arriba. Subir el
                `z-index` no lo arregla: desde dentro de un contexto de
                apilamiento no se puede saltar por encima de él.

                `AnchoredMenu` lo saca a `document.body` en `position: fixed`,
                mide el hueco que queda debajo del botón y, si no cabe, lo abre
                hacia arriba. Es el mismo componente que ya usaba el
                constructor de rutinas. */}
            <AnchoredMenu
                open={open}
                onClose={() => setOpen(false)}
                anchorRef={buttonRef}
                align="end"
                width={208}
                className="z-tooltip max-h-[min(75vh,32rem)] overflow-y-auto rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
            >
                        {userName && (
                            <p className="truncate px-3 py-2 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                {userName}
                            </p>
                        )}

                        {items.map((item) => (
                            <button
                                key={item.label}
                                role="menuitem"
                                onClick={() => { setOpen(false); item.onClick(); }}
                                className={`flex w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-t-sm font-semibold transition-colors duration-fast ease-snap hover:bg-surface-raised ${
 item.isActive ? 'text-brand-text' : 'text-ink-muted hover:text-ink'
 }`}
                            >
                                <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                                {item.label}
                            </button>
                        ))}

                        {items.length > 0 && <div className="my-1.5 h-px bg-[var(--border-subtle)]" />}

                        <Link
                            to="/web"
                            role="menuitem"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2.5 rounded-field px-3 py-2.5 text-t-sm font-medium text-ink-muted transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                        >
                            <Globe size={16} aria-hidden="true" />
                            Ver la web
                        </Link>

                        {onLogout && (
                            <button
                                role="menuitem"
                                onClick={() => { setOpen(false); onLogout(); }}
                                className="flex w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-t-sm font-medium text-ink-muted transition-colors duration-fast ease-snap hover:bg-[var(--danger-quiet)] hover:text-danger-text"
                            >
                                <LogOut size={16} aria-hidden="true" />
                                Cerrar sesión
                            </button>
                        )}
            </AnchoredMenu>
        </div>
    );
}

