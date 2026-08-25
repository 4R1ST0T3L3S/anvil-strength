import { ReactNode, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, LogOut, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NotificationBell } from '../ui/NotificationBell';
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

import { useMediaQuery } from '../../hooks/useMediaQuery';

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
    userId,
    title,
    onBack,
    onLogout,
    userName,
    panelSwitch,
    hideHeaderOnDesktop = false,
}) => {
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const visibleItems = menuItems.filter(item => item.label !== 'QA: Test DB');
    const barItems = visibleItems.filter(item => !item.hideOnMobileBar);
    const overflowItems = visibleItems.filter(item => item.hideOnMobileBar);

    return (
        <div className="flex h-screen bg-surface-canvas text-white overflow-hidden font-sans">

            {/* ============ COLUMNA PRINCIPAL ============ */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Barra superior */}
                <header className={`h-14 md:h-16 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 bg-surface-canvas/90 backdrop-blur border-b border-subtle z-40 ${hideHeaderOnDesktop ? 'md:hidden' : ''}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {onBack ? (
                            <button
                                onClick={onBack}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 -ml-1 rounded-lg text-ink-muted hover:text-white hover:bg-white/[0.06] text-xs font-bold uppercase tracking-wide transition-colors duration-fast active:scale-[0.97]"
                                aria-label="Volver"
                            >
                                <ArrowLeft size={16} />
                                <span className="hidden sm:inline">Volver</span>
                            </button>
                        ) : (
                            <span className="font-black text-base tracking-tight text-white select-none">
                                ANVIL<span className="text-anvil-red">.</span>
                            </span>
                        )}
                        {title && (
                            <h1 className="font-black uppercase tracking-tight text-sm md:text-base text-white truncate">
                                {title}
                            </h1>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Conmutador de panel: píldora fija en la cabecera, visible siempre */}
                        {panelSwitch && (!hideHeaderOnDesktop || !isDesktop) && (
                            <button
                                onClick={panelSwitch.onClick}
                                aria-label={panelSwitch.label}
                                className="flex h-9 items-center gap-1.5 rounded-field border border-anvil-red/25 bg-anvil-red/10 px-2.5 text-[11px] font-bold uppercase tracking-wide text-anvil-red transition-colors duration-fast active:scale-[0.97]"
                            >
                                <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{panelSwitch.icon}</span>
                                <span className="max-w-[92px] truncate">{panelSwitch.shortLabel ?? panelSwitch.label}</span>
                            </button>
                        )}
                        {userId && (!hideHeaderOnDesktop || !isDesktop) && <NotificationBell userId={userId} />}
                        {/* En móvil la barra inferior ya va llena de pestañas, así
                            que la salida vive aquí arriba en vez de robarle un
                            hueco a la navegación. */}
                        {(!hideHeaderOnDesktop || !isDesktop) && (
                            <AccountMenu onLogout={onLogout} userName={userName} items={overflowItems} />
                        )}
                    </div>
                </header>

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
                <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-6 scrollbar-hide bg-surface-canvas">
                    {children}
                </main>
            </div>

            {/* ============ NAV INFERIOR (móvil) ============ */}
            {/* Barra inferior del movil.
                Vive pegada al borde de la pantalla, asi que necesita `pb-safe`
                para no quedar debajo de la barra de gestos del iPhone. */}
            <nav className="fixed bottom-0 left-0 right-0 z-sticky flex items-stretch justify-around border-t border-subtle bg-surface-canvas/95 px-1 pb-safe pt-1 backdrop-blur-md md:hidden">
                {barItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={item.onClick}
                        aria-label={item.label}
                        aria-current={item.isActive ? 'page' : undefined}
                        // `min-h-[52px]`: por debajo de 44px el pulgar falla mas
                        // de lo que acierta, y esta barra se usa de pie, con una
                        // mano y el movil moviendose.
                        className={`relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-card px-1 py-1.5 transition-colors duration-fast ${
                            item.isActive ? 'text-brand' : 'text-ink-subtle'
                        }`}
                    >
                        {item.isActive && (
                            <motion.span
                                layoutId="bottomnav-active"
                                className="absolute inset-x-0.5 inset-y-0 rounded-card bg-[var(--brand-quiet)]"
                                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                            />
                        )}
                        {/* El icono NO se escala al activarse. Un salto de
                            tamano en algo que se pulsa decenas de veces al dia
                            se lee como parpadeo; el color y el fondo ya dicen
                            cual esta activo. */}
                        <span className="relative shrink-0">{item.icon}</span>
                        {/* 10px es el suelo. A los 8px que tenia, la etiqueta
                            era una mancha gris: se leia el icono y el texto
                            solo anadia ruido debajo. */}
                        <span className="relative max-w-full truncate text-[10px] font-bold leading-none tracking-tight">
                            {item.shortLabel ?? item.label.replace('Mi ', '').replace('Mis ', '')}
                        </span>
                    </button>
                ))}
            </nav>
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
                className="flex h-11 w-11 items-center justify-center rounded-field text-ink-muted transition-colors duration-fast hover:bg-white/[0.06] hover:text-white"
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
                                    item.isActive ? 'text-brand' : 'text-ink-muted hover:text-ink'
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
                                className="flex w-full items-center gap-2.5 rounded-field px-3 py-2.5 text-t-sm font-medium text-ink-muted transition-colors duration-fast ease-snap hover:bg-[var(--danger-quiet)] hover:text-danger"
                            >
                                <LogOut size={16} aria-hidden="true" />
                                Cerrar sesión
                            </button>
                        )}
            </AnchoredMenu>
        </div>
    );
}
