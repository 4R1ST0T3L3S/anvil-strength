import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Menu, X } from 'lucide-react';
import { SmartAuthButton } from '../ui/SmartAuthButton';
import { AnchoredMenu } from '../ui/AnchoredMenu';
import { useUser } from '../../hooks/useUser';
import { useNavigate, useLocation } from 'react-router-dom';

interface PublicHeaderProps {
    onLoginClick: () => void;
    /** Abre el modal directamente en la pestaña de alta. */
    onSignupClick?: () => void;
}

/**
 * El orden es el mismo en el que aparecen las secciones en la portada: así la
 * barra se lee como un índice de la página y no como una lista suelta.
 *
 * `principal` marca los cinco que se ven en la barra. El resto vive en el
 * menú "MÁS".
 *
 * POR QUÉ CINCO Y NO NUEVE. Los nueve enlaces a 13px con su interlineado no
 * caben por debajo de 1536px, y la solución que había era esconderlos TODOS
 * hasta ese ancho: en un portátil de 1280 o 1440 la web pública se navegaba
 * con menú de hamburguesa. Cinco es el mismo tope que ya rige la barra
 * inferior del móvil (ver DashboardLayout), aplicado al otro extremo.
 */
const NAV_LINKS = [
    { name: 'FILOSOFÍA', href: '#filosofia', principal: true },
    { name: 'SOFTWARE', href: '#software', principal: true },
    { name: 'EQUIPO', href: '#entrenadores', principal: true },
    { name: 'ATLETAS', href: '#atletas', principal: true },
    { name: 'COMPETICIONES', href: '/competiciones', principal: true },
    { name: 'LOGROS', href: '#logros', principal: false },
    { name: 'OPINIONES', href: '#reviews', principal: false },
    { name: 'AFÍLIATE', href: '#afiliacion', principal: false },
    { name: 'CONTACTO', href: '#contacto', principal: false },
];

const IDS_SECCION = NAV_LINKS.filter(l => l.href.startsWith('#')).map(l => l.href.slice(1));

/**
 * Qué sección se está mirando.
 *
 * POR QUÉ HACE FALTA: el estado activo se decidía con
 * `location.pathname === link.href`, y ocho de los nueve enlaces son anclas
 * (`#filosofia`). Un `pathname` nunca vale `'#filosofia'`, así que la
 * comparación era falsa SIEMPRE y la barra no señalaba nada. Tampoco servía
 * mirar el hash: `handleNavClick` hace `preventDefault()` y se desplaza a
 * mano, así que el hash no llega a escribirse nunca.
 *
 * Un observador es además lo correcto: la barra tiene que seguir a la
 * persona cuando hace scroll con la rueda, no solo cuando pulsa un enlace.
 *
 * `rootMargin` recorta la zona de detección a una banda por el tercio
 * superior de la ventana. Sin eso, con secciones que ocupan más de una
 * pantalla, hay dos visibles a la vez casi siempre y el indicador parpadea
 * entre las dos.
 */
function useSeccionVisible(activo: boolean): string | null {
    const [seccion, setSeccion] = useState<string | null>(null);

    useEffect(() => {
        // Sin `setSeccion(null)` aquí. Llamar a setState en el CUERPO de un
        // efecto encadena un render extra, y es justo el error que F2 viene a
        // quitar de otros cuarenta sitios. El valor obsoleto se enmascara al
        // devolverlo, unas líneas más abajo: dentro del observador sí se puede
        // porque eso es una notificación de un sistema externo, no el cuerpo.
        if (!activo) return;

        const visibles = new Set<string>();
        const observador = new IntersectionObserver(
            entradas => {
                for (const e of entradas) {
                    if (e.isIntersecting) visibles.add(e.target.id);
                    else visibles.delete(e.target.id);
                }
                // Si hay varias en la banda, manda la primera en orden de
                // página: es la que el usuario acaba de dejar atrás.
                const primera = IDS_SECCION.find(id => visibles.has(id));
                setSeccion(primera ?? null);
            },
            { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
        );

        // Las secciones se montan con la página, pero este efecto puede correr
        // antes de que existan si la portada llega por una ruta diferida.
        const enganchar = () => {
            let encontradas = 0;
            for (const id of IDS_SECCION) {
                const el = document.getElementById(id);
                if (el) { observador.observe(el); encontradas++; }
            }
            return encontradas;
        };

        if (enganchar() === 0) {
            const t = window.setTimeout(enganchar, 300);
            return () => { window.clearTimeout(t); observador.disconnect(); };
        }

        return () => observador.disconnect();
    }, [activo]);

    return activo ? seccion : null;
}

export function PublicHeader({ onLoginClick, onSignupClick }: PublicHeaderProps) {
    const { data: currentUser } = useUser();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [masAbierto, setMasAbierto] = useState(false);
    const masRef = useRef<HTMLButtonElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const isHome = location.pathname === '/' || location.pathname === '/web';
    const isTransparentPage = isHome || location.pathname === '/competiciones';

    const seccionVisible = useSeccionVisible(isHome);

    /**
     * `passive: true` porque este manejador no llama nunca a
     * `preventDefault()`: sin la promesa, el navegador tiene que esperar a que
     * termine antes de desplazar la página, y eso se nota como scroll pegajoso
     * en móvil.
     *
     * El `requestAnimationFrame` es lo que evita hacer trabajo docenas de
     * veces por frame: el evento se dispara mucho más a menudo de lo que se
     * pinta, y aquí solo interesa el estado en el momento de pintar.
     */
    useEffect(() => {
        let pendiente = false;
        const alHacerScroll = () => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(() => {
                setIsScrolled(window.scrollY > 50);
                pendiente = false;
            });
        };
        window.addEventListener('scroll', alHacerScroll, { passive: true });
        alHacerScroll();
        return () => window.removeEventListener('scroll', alHacerScroll);
    }, []);

    // El menú móvil ocupa la pantalla entera: mientras está abierto, la página
    // de debajo no debe poder desplazarse.
    useEffect(() => {
        if (!isMobileMenuOpen) return;
        const previo = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const alPulsarTecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsMobileMenuOpen(false);
        };
        document.addEventListener('keydown', alPulsarTecla);
        return () => {
            document.body.style.overflow = previo;
            document.removeEventListener('keydown', alPulsarTecla);
        };
    }, [isMobileMenuOpen]);

    const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        setIsMobileMenuOpen(false);
        setMasAbierto(false);

        // Ruta de verdad: navega y se sube arriba.
        if (!href.startsWith('#')) {
            navigate(href);
            window.scrollTo(0, 0);
            return;
        }

        // Ancla dentro de la portada.
        if (isHome) {
            document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Desde otra ruta: se va a la portada con el hash, y allí
            // LandingPage se encarga del salto cuando el DOM ya existe.
            navigate(`/${href}`);
        }
    }, [isHome, navigate]);

    const esActivo = (href: string) =>
        href.startsWith('#')
            ? isHome && seccionVisible === href.slice(1)
            : location.pathname === href;

    const principales = NAV_LINKS.filter(l => l.principal);
    const secundarios = NAV_LINKS.filter(l => !l.principal);
    const hayActivoEnMas = secundarios.some(l => esActivo(l.href));

    return (
        <header
            className={`fixed w-full z-sticky border-b transition-[background-color,border-color,padding] duration-base ease-snap ${
 isScrolled || !isTransparentPage
 ? 'bg-surface-sunken/90 backdrop-blur-md border-subtle py-3 shadow-overlay'
 : 'bg-transparent border-transparent py-6'
 }`}
        >
            {/* Más ancho que el contenido de la página (1180) porque el menú
                centrado necesita hueco a los lados sin comerse los botones. */}
            <div className="max-w-[1560px] mx-auto px-6 flex items-center justify-between relative min-h-[64px]">

                {/* Marca */}
                <div className="flex-shrink-0 flex items-center">
                    <a
                        href="/"
                        onClick={(e) => { e.preventDefault(); navigate('/'); window.scrollTo(0, 0); }}
                        aria-label="Anvil Strength — ir al inicio"
                        className="block rounded-field"
                    >
                        <img
                            src="/logo-dark-removebg-preview.png"
                            alt="Anvil Strength"
                            width={160}
                            height={64}
                            className="h-12 md:h-16 w-auto object-contain"
                        />
                    </a>
                </div>

                {/* Navegación de escritorio.
                    Va posicionada en absoluto y centrada respecto a la cabecera
                    entera: con `flex-1` se centraba en el hueco que dejaban logo
                    y botones, que no miden lo mismo, y el menú aparecía
                    desplazado a la derecha. */}
                <nav
                    aria-label="Secciones del sitio"
                    className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center gap-x-1 whitespace-nowrap lg:flex"
                >
                    {principales.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            aria-current={esActivo(link.href) ? 'page' : undefined}
                            className={`pointer-events-auto flex h-11 items-center rounded-field px-2.5 text-t-xs font-bold uppercase leading-none tracking-[0.06em] transition-colors duration-fast ease-snap hover:text-ink ${
 esActivo(link.href) ? 'text-brand' : 'text-ink-muted'
 }`}
                        >
                            {link.name}
                        </a>
                    ))}

                    <button
                        ref={masRef}
                        onClick={() => setMasAbierto(v => !v)}
                        aria-expanded={masAbierto}
                        aria-haspopup="menu"
                        className={`pointer-events-auto flex h-11 items-center gap-1 rounded-field px-2.5 text-t-xs font-bold uppercase leading-none tracking-[0.06em] transition-colors duration-fast ease-snap hover:text-ink ${
 hayActivoEnMas ? 'text-brand' : 'text-ink-muted'
 }`}
                    >
                        MÁS
                        <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-fast ease-snap ${masAbierto ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                        />
                    </button>
                </nav>

                <AnchoredMenu
                    open={masAbierto}
                    onClose={() => setMasAbierto(false)}
                    anchorRef={masRef}
                    align="start"
                    width={188}
                    className="z-dropdown rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-overlay"
                >
                    {secundarios.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            role="menuitem"
                            onClick={(e) => handleNavClick(e, link.href)}
                            className={`flex h-11 items-center rounded-field px-3 text-t-xs font-bold uppercase tracking-[0.06em] transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink ${
 esActivo(link.href) ? 'text-brand' : 'text-ink-muted'
 }`}
                        >
                            {link.name}
                        </a>
                    ))}
                </AnchoredMenu>

                {/* Acciones */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    <div className="hidden sm:block">
                        <SmartAuthButton
                            variant="ghost"
                            onLoginClick={onLoginClick}
                            className="!font-bebas !italic !tracking-[0.08em] !text-t-sm !min-h-[44px] !py-1.5 !px-4 !border !border-[var(--border-default)] !rounded-field hover:!border-[var(--border-strong)] hover:!bg-white/5"
                        />
                    </div>

                    {onSignupClick && !currentUser && (
                        <button
                            onClick={onSignupClick}
                            className="hidden min-h-[44px] items-center justify-center rounded-field bg-brand px-4 font-bebas text-t-sm italic tracking-[0.08em] text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover sm:inline-flex"
                        >
                            Crear cuenta
                        </button>
                    )}

                    {/* El icono de la tienda ya no está: era un `<button>` sin
                        `onClick`, con una insignia de "0" encima, y la ruta
                        /ropa lleva comentada en AppRoutes desde hace tiempo.
                        Un control que parece pulsable y no hace nada cuesta
                        más que no tenerlo. Cuando la tienda exista, vuelve. */}

                    {/* Menú móvil. 44x44 reales: medía 40 con el relleno. */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        aria-label="Abrir el menú"
                        aria-expanded={isMobileMenuOpen}
                        className="flex h-11 w-11 items-center justify-center rounded-field text-ink-muted transition-colors duration-fast ease-snap hover:bg-white/5 hover:text-ink lg:hidden"
                    >
                        <Menu className="h-6 w-6" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Menú móvil a pantalla completa */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menú de navegación"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-modal flex flex-col overflow-y-auto bg-surface-sunken lg:hidden"
                    >
                        <div className="flex items-center justify-between border-b border-subtle px-6 py-6">
                            <img
                                src="/logo-dark-removebg-preview.png"
                                width={96}
                                height={32}
                                className="h-8 w-auto"
                                alt="Anvil Strength"
                            />
                            <button
                                onClick={() => setIsMobileMenuOpen(false)}
                                aria-label="Cerrar el menú"
                                className="flex h-11 w-11 items-center justify-center rounded-pill bg-white/5 text-ink transition-colors duration-fast ease-snap hover:bg-white/10"
                            >
                                <X className="h-6 w-6" aria-hidden="true" />
                            </button>
                        </div>

                        {/* `gap-2` y no `gap-8`: con nueve enlaces a 5xl y
                            separación de 32px la lista no cabía en una pantalla
                            de 812px y había que desplazarse dentro del menú,
                            que es justo lo que un menú no debe pedir. */}
                        <nav aria-label="Secciones del sitio" className="flex flex-1 flex-col justify-center gap-2 px-8 py-4">
                            {NAV_LINKS.map((link, index) => (
                                <motion.a
                                    key={link.name}
                                    href={link.href}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: Math.min(index, 8) * 0.04 }}
                                    onClick={(e) => handleNavClick(e, link.href)}
                                    aria-current={esActivo(link.href) ? 'page' : undefined}
                                    className={`flex min-h-[44px] items-center font-bebas text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase italic leading-none tracking-tighter transition-colors duration-fast ease-snap hover:text-brand ${
 esActivo(link.href) ? 'text-brand' : 'text-ink-muted'
 }`}
                                >
                                    {link.name}
                                </motion.a>
                            ))}
                        </nav>

                        {/* La zona segura: este bloque está pegado al borde
                            inferior y en un iPhone cae bajo la barra de gestos. */}
                        <div className="space-y-3 px-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4">
                            <SmartAuthButton
                                variant="primary"
                                onLoginClick={onLoginClick}
                                className="w-full !bg-brand hover:!bg-brand-hover !py-5"
                            />
                            {onSignupClick && !currentUser && (
                                <button
                                    onClick={() => { setIsMobileMenuOpen(false); onSignupClick(); }}
                                    className="w-full rounded-field border border-[var(--border-default)] py-4 font-bebas text-t-lg italic tracking-[0.1em] text-ink transition-colors duration-fast ease-snap hover:bg-white/5"
                                >
                                    Crear cuenta
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
