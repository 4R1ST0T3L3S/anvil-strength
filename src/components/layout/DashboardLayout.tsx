import { ReactNode, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { Globe, LogOut, MoreHorizontal, Monitor, Moon, Sun, Check } from 'lucide-react';
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
 * Una sola disposición para todos los tamaños, la del iPhone: el contenido
 * ocupa la pantalla y abajo flota una barra de pestañas translúcida con
 * cuatro accesos y «Más». No hay barra lateral: el INICIO es el mapa de la
 * aplicación —todas las secciones están en su rejilla— y la barra solo
 * lleva lo que se toca decenas de veces al día. En el ordenador la barra se
 * centra y se estrecha; lo demás es igual.
 *
 * Lo que no cabe en la barra vive en la hoja «Más», junto con el tema, la
 * web y la salida. Un contador rojo sobre la pestaña dice cuántas cosas
 * esperan. La pestaña activa lleva una píldora de fondo que se desliza de
 * una a otra con un muelle corto.
 *
 * `--tabbar-alto` (tokens.css) tiene la geometría exacta de la barra para
 * que lo que flota abajo (volver arriba, avisos) se aparte de ella.
 */

export interface MenuItem {
    icon: React.ReactNode;
    label: string;
    /** Etiqueta corta para la barra: una pestaña mide ~70px. */
    shortLabel?: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
    /** Fuera de la barra: va en la hoja «Más». */
    hideOnMobileBar?: boolean;
    /** Pendientes: entrenamientos por revisar, mensajes sin leer. */
    badge?: number;
}

/**
 * CONMUTADOR DE PANEL. Quien entrena a gente y además le entrenan necesita
 * ir y volver. Es un cambio de CONTEXTO, no una pestaña más: va dentro de
 * «Más», arriba del todo, y en Ajustes.
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
    /** La vista cabe entera en la pantalla del ordenador (el inicio). */
    ajustarAPantalla?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
    onLogout,
    userName,
    userAvatar,
    panelSwitch,
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
            {/* `overflow-x-hidden` es el corte de seguridad del panel entero:
                una tabla que se pase de ancho no puede arrastrar la página.
                `data-scroll-host`: quien se desplaza es este <main>, no la
                ventana. Ver src/lib/scrollHost.ts. */}
            <main
                data-scroll-host
                style={{ ['--tabbar-h' as string]: 'var(--tabbar-alto)' }}
                className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide bg-surface-canvas pb-[calc(var(--tabbar-alto)+1rem+env(safe-area-inset-bottom,0px))]"
            >
                {children}
            </main>

            {/* ============ BARRA DE PESTAÑAS ============ */}
            <div className="pointer-events-none fixed bottom-[calc(10px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-sticky flex justify-center px-3">
                <nav
                    aria-label="Secciones"
                    className="material-bar pointer-events-auto flex h-[64px] w-full max-w-[560px] items-stretch justify-around rounded-[26px] border border-[var(--card-border)] p-1.5 shadow-overlay"
                >
                    {enBarra.map(item => (
                        <Pestana
                            key={item.label}
                            icon={item.icon}
                            label={item.shortLabel ?? item.label.replace(/^Mis? /, '')}
                            active={item.isActive}
                            badge={item.badge}
                            onClick={item.onClick}
                        />
                    ))}
                    {(enMas.length > 0 || onLogout) && (
                        <Pestana
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

function Pestana({
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
        <m.button
            type="button"
            onClick={onClick}
            data-no-press
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 600, damping: 32 }}
            aria-label={badge ? `${label}, ${badge} pendientes` : label}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[20px] px-1',
                'transition-colors duration-fast ease-snap',
                active ? 'text-brand-text' : 'text-ink-subtle hover:text-ink'
            )}
        >
            {/* La píldora de fondo de la pestaña activa se desliza entre
                pestañas (mismo `layoutId`): es lo que hace sentir la barra
                como un objeto y no como cinco botones. */}
            {active && (
                <m.span
                    layoutId="tabbar-activa"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[20px] bg-[var(--brand-quiet)]"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
            )}
            <span className="relative">
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
            <span className={cn('relative max-w-full truncate text-[10.5px] leading-none', active ? 'font-semibold' : 'font-medium')}>
                {label}
            </span>
        </m.button>
    );
}

const OPCIONES_TEMA: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
    { valor: 'sistema', etiqueta: 'Como el sistema', icono: Monitor },
    { valor: 'claro', etiqueta: 'Claro', icono: Sun },
    { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
];

/** La hoja «Más»: lo que no cabe en la barra, y la cuenta. */
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
 * Menú de cuenta compacto (⋮) para la cabecera del inicio: las secciones que
 * no caben en la barra, la web y la salida.
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
        <div>
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
