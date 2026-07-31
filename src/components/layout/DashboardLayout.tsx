import { ReactNode, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Globe, LogOut, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NotificationBell } from '../ui/NotificationBell';
import { transition, DURATION } from '../../lib/motion';

interface MenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
}

interface DashboardLayoutProps {
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
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
    userId,
    title,
    onBack,
    onLogout,
    userName,
}) => {
    const visibleItems = menuItems.filter(item => item.label !== 'QA: Test DB');

    return (
        <div className="flex h-screen bg-surface-canvas text-white overflow-hidden font-sans">

            {/* ============ SIDEBAR (escritorio) ============ */}
            <aside className="hidden md:flex flex-col w-56 shrink-0 bg-[#111111] border-r border-white/[0.06]">
                {/* Marca */}
                <div className="h-16 flex items-center px-5 border-b border-white/[0.06] shrink-0">
                    <span className="font-black text-lg tracking-tight text-white select-none">
                        ANVIL<span className="text-anvil-red">.</span>
                    </span>
                </div>

                {/* Navegación */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-hide">
                    {visibleItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 active:scale-[0.98] ${
                                item.isActive ? 'text-white' : 'text-gray-500 hover:text-white hover:bg-white/[0.04]'
                            }`}
                        >
                            {item.isActive && (
                                <motion.span
                                    layoutId="sidebar-active"
                                    className="absolute inset-0 bg-anvil-red/10 border border-anvil-red/20 rounded-xl"
                                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                />
                            )}
                            <span className={`relative shrink-0 ${item.isActive ? 'text-anvil-red' : ''}`}>{item.icon}</span>
                            <span className="relative truncate">{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Pie: salida del panel.
                    Vive al fondo de la barra lateral y no en un menú escondido
                    porque hasta ahora NO existía ninguna forma de cerrar sesión
                    ni de volver a la web desde dentro del panel. */}
                <div className="border-t border-white/[0.06] p-3 shrink-0 space-y-0.5">
                    <Link
                        to="/inicio"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-500 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white"
                    >
                        <Globe size={17} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">Ver la web</span>
                    </Link>

                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-500 transition-colors duration-150 hover:bg-[var(--danger-quiet)] hover:text-danger active:scale-[0.98]"
                        >
                            <LogOut size={17} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">Cerrar sesión</span>
                        </button>
                    )}

                    {userName && (
                        <p className="truncate px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-700">
                            {userName}
                        </p>
                    )}
                </div>
            </aside>

            {/* ============ COLUMNA PRINCIPAL ============ */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Barra superior */}
                <header className="h-14 md:h-16 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 bg-[#1a1a1a]/90 backdrop-blur border-b border-white/[0.06] z-40">
                    <div className="flex items-center gap-2 min-w-0">
                        {onBack ? (
                            <button
                                onClick={onBack}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] text-xs font-bold uppercase tracking-wide transition-colors duration-150 active:scale-[0.97]"
                                aria-label="Volver"
                            >
                                <ArrowLeft size={16} />
                                <span className="hidden sm:inline">Volver</span>
                            </button>
                        ) : (
                            <span className="md:hidden font-black text-base tracking-tight text-white select-none">
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
                        {userId && <NotificationBell userId={userId} />}
                        {/* En móvil la barra inferior ya va llena de pestañas, así
                            que la salida vive aquí arriba en vez de robarle un
                            hueco a la navegación. */}
                        <AccountMenu onLogout={onLogout} userName={userName} />
                    </div>
                </header>

                {/* Contenido */}
                <main className="flex-1 overflow-y-auto pb-24 md:pb-6 scrollbar-hide bg-surface-canvas">
                    {children}
                </main>
            </div>

            {/* ============ NAV INFERIOR (móvil) ============ */}
            <nav className="fixed bottom-0 left-0 right-0 bg-[#141414]/95 backdrop-blur-md border-t border-white/[0.08] z-50 px-2 py-1.5 flex justify-around items-stretch pb-safe md:hidden">
                {visibleItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={item.onClick}
                        aria-label={item.label}
                        className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-0 flex-1 transition-colors duration-150 ${
                            item.isActive ? 'text-anvil-red' : 'text-gray-500'
                        }`}
                    >
                        {item.isActive && (
                            <motion.span
                                layoutId="bottomnav-active"
                                className="absolute inset-x-1 inset-y-0 bg-anvil-red/10 rounded-xl"
                                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                            />
                        )}
                        <span className={`relative transition-transform duration-150 ${item.isActive ? 'scale-110' : ''}`}>
                            {item.icon}
                        </span>
                        <span className="relative text-[8px] font-black uppercase tracking-wide truncate max-w-full">
                            {item.label.replace('Mi ', '').replace('Mis ', '')}
                        </span>
                    </button>
                ))}
            </nav>
        </div>
    );
};

/**
 * Menú de cuenta para móvil: ver la web y cerrar sesión.
 *
 * En escritorio estas dos acciones viven al pie de la barra lateral, siempre
 * visibles. Aquí van plegadas porque la barra inferior ya tiene todas las
 * pestañas y meter una séptima dejaría los iconos ilegibles.
 */
function AccountMenu({
    onLogout,
    userName,
}: {
    onLogout?: () => void | Promise<void>;
    userName?: string | null;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Cerrar al pulsar fuera o con Escape. Sin esto el menú se queda abierto
    // tapando contenido al navegar por debajo.
    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative md:hidden">
            <button
                onClick={() => setOpen(v => !v)}
                aria-label="Cuenta y salida"
                aria-expanded={open}
                aria-haspopup="menu"
                className="rounded-lg p-2 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
            >
                <MoreVertical size={18} aria-hidden="true" />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, scale: 0.97, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -4 }}
                        transition={transition(DURATION.fast)}
                        // El menú cuelga del botón, así que escala desde su
                        // esquina y no desde el centro.
                        style={{ transformOrigin: 'top right' }}
                        className="absolute right-0 top-full z-dropdown mt-2 w-52 overflow-hidden rounded-card bg-surface-overlay p-1.5 shadow-overlay"
                    >
                        {userName && (
                            <p className="truncate px-3 py-2 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                {userName}
                            </p>
                        )}

                        <Link
                            to="/inicio"
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
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
