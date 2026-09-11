import { ReactNode, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { ChevronsUpDown, Globe, LogOut, MoreHorizontal, Monitor, Moon, Sun, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnchoredMenu, MenuItem as MenuOpcion, MenuSeparador, MenuEtiqueta } from '../ui/AnchoredMenu';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { Contador } from '../ui/Badge';
import { List, ListRow } from '../ui/List';
import { useTema } from '../../hooks/useTema';
import type { Tema } from '../../lib/tema';
import { cn } from '../../lib/utils';

/**
 * EL ARMAZÓN DEL PANEL
 * =====================================================================
 *
 * Dos disposiciones, una sola pieza:
 *
 *   ESCRITORIO (≥ lg): barra lateral fija a la izquierda —la marca, la
 *   navegación completa con contadores, el conmutador de panel y la cuenta—
 *   y una columna de contenido con su propio scroll. Sin cabecera superior:
 *   cada pantalla pone la suya con `PageHeader`, así que no hay dos títulos
 *   compitiendo.
 *
 *   MÓVIL: una barra de pestañas flotante y translúcida, de cinco huecos
 *   como máximo (el pulgar no acierta con más). Lo que no cabe vive en la
 *   hoja «Más», junto con el tema, la web y la salida. Un contador rojo
 *   sobre la pestaña dice cuántas cosas esperan.
 *
 * `--tabbar-alto` (tokens.css) tiene la geometría exacta de la barra para
 * que lo que flota abajo (volver arriba, avisos) se aparte de ella.
 */

export interface MenuItem {
    icon: React.ReactNode;
    label: string;
    /** Etiqueta corta para la barra del móvil: una pestaña mide ~70px. */
    shortLabel?: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
    /** Fuera de la barra del móvil: va en la hoja «Más». En escritorio siempre se ve. */
    hideOnMobileBar?: boolean;
    /** Pendientes: entrenamientos por revisar, mensajes sin leer. */
    badge?: number;
}

/**
 * CONMUTADOR DE PANEL. Quien entrena a gente y además le entrenan necesita
 * ir y volver. Es un cambio de CONTEXTO, no una pestaña más: en escritorio
 * va al pie de la barra lateral y en móvil dentro de «Más», arriba del todo.
 */
export interface PanelSwitch {
    label: string;
    shortLabel?: string;
    icon: React.ReactNode;
    onClick: () => void;
}

export interface DashboardLayoutProps {
    menuItems: MenuItem[];
    children: ReactNode;
    userId?: string;
    /** Conservado por compatibilidad: la cabecera la pone cada pantalla (`PageHeader`). */
    title?: string;
    /** Conservado por compatibilidad: ver `title`. */
    onBack?: () => void;
    onLogout?: () => void | Promise<void>;
    userName?: string | null;
    userAvatar?: string | null;
    panelSwitch?: PanelSwitch;
    /** Conservado por compatibilidad: en el sistema actual nunca hay cabecera del armazón. */
    hideHeaderOnDesktop?: boolean;
    /** La vista cabe entera en la pantalla del ordenador (el inicio): sin margen inferior. */
    ajustarAPantalla?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
    onLogout,
    userName,
    userAvatar,
    panelSwitch,
    ajustarAPantalla = false,
}) => {
    const visibles = menuItems.filter(item => item.label !== 'QA: Test DB');
    const enBarra = visibles.filter(item => !item.hideOnMobileBar).slice(0, 4);
    const enMas = visibles.filter(item => !enBarra.includes(item));
    const [masAbierto, setMasAbierto] = useState(false);

    // «Más» es la quinta pestaña, y la única que no navega: abre la hoja.
    // Se pinta con contador si algo de lo que esconde lo tiene.
    const pendientesEnMas = enMas.reduce((n, i) => n + (i.badge ?? 0), 0);
    const masActivo = enMas.some(i => i.isActive);

    return (
        <div className="flex h-[100dvh] overflow-hidden bg-surface-canvas font-sans text-ink">

            {/* ============ BARRA LATERAL (escritorio) ============ */}
            <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[var(--separator)] bg-surface-sidebar lg:flex">
                <div className="flex h-16 shrink-0 items-center px-5">
                    <Marca />
                </div>

                <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3" aria-label="Secciones">
                    {visibles.map(item => (
                        <ItemLateral key={item.label} item={item} />
                    ))}
                </nav>

                <div className="shrink-0 border-t border-[var(--separator)] p-3">
                    {panelSwitch && (
                        <button
                            type="button"
                            onClick={panelSwitch.onClick}
                            className="mb-2 flex h-10 w-full items-center gap-2.5 rounded-[10px] bg-[var(--brand-quiet)] px-3 text-t-sm font-semibold text-brand-text transition-colors duration-fast ease-snap hover:bg-[var(--brand-quiet-strong)]"
                        >
                            <span className="shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]" aria-hidden="true">{panelSwitch.icon}</span>
                            <span className="truncate">{panelSwitch.label}</span>
                        </button>
                    )}
                    <CuentaLateral onLogout={onLogout} userName={userName} userAvatar={userAvatar} />
                </div>
            </aside>

            {/* ============ CONTENIDO ============ */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* `overflow-x-hidden` es el corte de seguridad del panel entero:
                    una tabla que se pase de ancho no puede arrastrar la página.
                    `data-scroll-host`: quien se desplaza es este <main>, no la
                    ventana. Ver src/lib/scrollHost.ts. */}
                <main
                    data-scroll-host
                    style={{ ['--tabbar-h' as string]: 'var(--tabbar-alto)' }}
                    className={cn(
                        'flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-canvas',
                        'pb-[calc(var(--tabbar-alto)+1rem+env(safe-area-inset-bottom,0px))] lg:pb-6',
                        ajustarAPantalla && 'pc:pb-0'
                    )}
                >
                    {children}
                </main>
            </div>

            {/* ============ BARRA DE PESTAÑAS (móvil) ============ */}
            <div className="fixed bottom-[calc(10px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-sticky lg:hidden">
                <nav
                    aria-label="Secciones"
                    className="material-bar flex h-[60px] items-stretch justify-around rounded-[22px] border border-[var(--card-border)] px-1 shadow-overlay"
                >
                    {enBarra.map(item => (
                        <PestanaMovil
                            key={item.label}
                            icon={item.icon}
                            label={item.shortLabel ?? item.label.replace(/^Mis? /, '')}
                            active={item.isActive}
                            badge={item.badge}
                            onClick={item.onClick}
                        />
                    ))}
                    {(enMas.length > 0 || onLogout) && (
                        <PestanaMovil
                            icon={<MoreHorizontal size={22} />}
                            label="Más"
                            active={masActivo || masAbierto}
                            badge={pendientesEnMas}
                            onClick={() => setMasAbierto(true)}
                        />
                    )}
                </nav>
            </div>

            <HojaMas
                open={masAbierto}
                onClose={() => setMasAbierto(false)}
                items={enMas}
                panelSwitch={panelSwitch}
                onLogout={onLogout}
                userName={userName}
                userAvatar={userAvatar}
            />
        </div>
    );
};

// =====================================================================
// PIEZAS
// =====================================================================

function Marca() {
    return (
        <span className="flex items-center gap-2 select-none">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand text-brand-ink" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M4 7h16v3H15.5v2.5h2v3H15l-1 3H10l-1-3H6.5v-3h2V10H4z" />
                </svg>
            </span>
            <span className="text-t-base font-semibold tracking-[-0.01em] text-ink">Anvil</span>
        </span>
    );
}

function ItemLateral({ item }: { item: MenuItem }) {
    return (
        <button
            type="button"
            onClick={item.onClick}
            data-no-press
            aria-current={item.isActive ? 'page' : undefined}
            className={cn(
                'flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-t-sm',
                'transition-colors duration-fast ease-snap',
                item.isActive
                    ? 'bg-[var(--fill-selected)] font-semibold text-ink'
                    : 'font-medium text-ink-muted hover:bg-[var(--fill-hover)] hover:text-ink'
            )}
        >
            <span
                className={cn('shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]', item.isActive ? 'text-ink' : 'text-ink-subtle')}
                aria-hidden="true"
            >
                {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
                <Contador n={item.badge} aria-label={`${item.badge} pendientes`} />
            )}
        </button>
    );
}

function PestanaMovil({
    icon,
    label,
    active,
    badge,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    badge?: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-no-press
            aria-label={badge ? `${label}, ${badge} pendientes` : label}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[16px] px-1',
                'transition-colors duration-fast ease-snap',
                active ? 'text-brand-text' : 'text-ink-subtle'
            )}
        >
            <span className="relative">
                {/* El icono no se escala al activarse: en algo que se pulsa
                    decenas de veces al día, un salto de tamaño se lee como
                    parpadeo. El color y la etiqueta ya dicen cuál está activo. */}
                <span className="[&>svg]:h-[22px] [&>svg]:w-[22px]" aria-hidden="true">{icon}</span>
                {badge != null && badge > 0 && (
                    <span
                        className="absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-brand px-1 text-t-2xs font-semibold tabular-nums leading-none text-brand-ink ring-2 ring-[var(--surface-canvas)]"
                        aria-hidden="true"
                    >
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
            <span className={cn('max-w-full truncate text-[10.5px] leading-none', active ? 'font-semibold' : 'font-medium')}>
                {label}
            </span>
            {active && (
                <m.span
                    layoutId="tabbar-activa"
                    aria-hidden="true"
                    className="absolute bottom-[5px] h-[3px] w-[3px] rounded-pill bg-brand-text"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
            )}
        </button>
    );
}

/** La fila de cuenta al pie de la barra lateral: abre tema, web y salida. */
function CuentaLateral({
    onLogout,
    userName,
    userAvatar,
}: {
    onLogout?: () => void | Promise<void>;
    userName?: string | null;
    userAvatar?: string | null;
}) {
    const [abierto, setAbierto] = useState(false);
    const anclaRef = useRef<HTMLButtonElement>(null);
    const { tema, establecer } = useTema();

    return (
        <>
            <button
                ref={anclaRef}
                type="button"
                onClick={() => setAbierto(v => !v)}
                aria-haspopup="menu"
                aria-expanded={abierto}
                data-no-press
                className="flex h-12 w-full items-center gap-2.5 rounded-[10px] px-2 text-left transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)]"
            >
                <Avatar nombre={userName} src={userAvatar} size={32} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-sm font-semibold text-ink">{userName || 'Mi cuenta'}</span>
                    <span className="block text-t-xs text-ink-subtle">Cuenta y ajustes</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
            </button>

            <AnchoredMenu open={abierto} onClose={() => setAbierto(false)} anchorRef={anclaRef} align="start" width={224}>
                <MenuEtiqueta>Apariencia</MenuEtiqueta>
                {OPCIONES_TEMA.map(o => (
                    <MenuOpcion
                        key={o.valor}
                        role="menuitemradio"
                        icono={<o.icono />}
                        activa={tema === o.valor}
                        onClick={() => establecer(o.valor)}
                    >
                        {o.etiqueta}
                    </MenuOpcion>
                ))}
                <MenuSeparador />
                <Link to="/web" role="menuitem" onClick={() => setAbierto(false)} className="block">
                    <MenuOpcion icono={<Globe />}>Ver la web</MenuOpcion>
                </Link>
                {onLogout && (
                    <MenuOpcion icono={<LogOut />} peligro onClick={() => { setAbierto(false); onLogout(); }}>
                        Cerrar sesión
                    </MenuOpcion>
                )}
            </AnchoredMenu>
        </>
    );
}

const OPCIONES_TEMA: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
    { valor: 'sistema', etiqueta: 'Como el sistema', icono: Monitor },
    { valor: 'claro', etiqueta: 'Claro', icono: Sun },
    { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
];

/** La hoja «Más» del móvil: lo que no cabe en la barra, y la cuenta. */
function HojaMas({
    open,
    onClose,
    items,
    panelSwitch,
    onLogout,
    userName,
    userAvatar,
}: {
    open: boolean;
    onClose: () => void;
    items: MenuItem[];
    panelSwitch?: PanelSwitch;
    onLogout?: () => void | Promise<void>;
    userName?: string | null;
    userAvatar?: string | null;
}) {
    const { tema, establecer } = useTema();

    return (
        <Modal open={open} onClose={onClose} title="Más" size="sm">
            <div className="flex flex-col gap-5 pb-1">
                {(userName || panelSwitch) && (
                    <div className="flex items-center gap-3 px-1">
                        <Avatar nombre={userName} src={userAvatar} size={44} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-t-base font-semibold text-ink">{userName || 'Mi cuenta'}</p>
                            {panelSwitch && (
                                <button
                                    type="button"
                                    onClick={() => { onClose(); panelSwitch.onClick(); }}
                                    className="mt-0.5 text-t-sm font-medium text-brand-text"
                                >
                                    {panelSwitch.label} →
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {items.length > 0 && (
                    <List>
                        {items.map(item => (
                            <ListRow
                                key={item.label}
                                icono={item.icon}
                                titulo={item.label}
                                chevron
                                activa={item.isActive}
                                derecha={item.badge ? <Contador n={item.badge} /> : undefined}
                                onClick={() => { onClose(); item.onClick(); }}
                            />
                        ))}
                    </List>
                )}

                <List titulo="Apariencia">
                    {OPCIONES_TEMA.map(o => (
                        <ListRow
                            key={o.valor}
                            icono={<o.icono />}
                            titulo={o.etiqueta}
                            onClick={() => establecer(o.valor)}
                            derecha={tema === o.valor ? <Check className="h-[18px] w-[18px] text-brand-text" strokeWidth={2.5} aria-hidden="true" /> : undefined}
                        />
                    ))}
                </List>

                <List>
                    <ListRow icono={<Globe />} titulo="Ver la web" chevron onClick={() => { onClose(); window.location.assign('/web'); }} />
                    {onLogout && (
                        <ListRow icono={<LogOut />} titulo="Cerrar sesión" destructiva onClick={() => { onClose(); onLogout(); }} />
                    )}
                </List>
            </div>
        </Modal>
    );
}

/**
 * Menú de cuenta compacto (⋮), para cabeceras de pantalla en móvil que quieran
 * ofrecer las secciones que no caben y la salida. Se conserva porque las
 * pantallas de inicio lo montan; en escritorio la barra lateral ya lo tiene.
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

    return (
        <div className="lg:hidden">
            <button
                ref={buttonRef}
                onClick={() => setOpen(v => !v)}
                aria-label="Cuenta y salida"
                aria-expanded={open}
                aria-haspopup="menu"
                data-no-press
                className="flex h-10 w-10 items-center justify-center rounded-pill text-ink-muted transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] hover:text-ink"
            >
                <MoreHorizontal size={20} aria-hidden="true" />
            </button>

            <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={buttonRef} align="end" width={224}>
                {userName && <MenuEtiqueta>{userName}</MenuEtiqueta>}
                {items.map(item => (
                    <MenuOpcion
                        key={item.label}
                        icono={item.icon}
                        activa={item.isActive}
                        derecha={item.badge ? <Contador n={item.badge} /> : undefined}
                        onClick={() => { setOpen(false); item.onClick(); }}
                    >
                        {item.label}
                    </MenuOpcion>
                ))}
                {items.length > 0 && <MenuSeparador />}
                <Link to="/web" role="menuitem" onClick={() => setOpen(false)} className="block">
                    <MenuOpcion icono={<Globe />}>Ver la web</MenuOpcion>
                </Link>
                {onLogout && (
                    <MenuOpcion icono={<LogOut />} peligro onClick={() => { setOpen(false); onLogout(); }}>
                        Cerrar sesión
                    </MenuOpcion>
                )}
            </AnchoredMenu>
        </div>
    );
}
