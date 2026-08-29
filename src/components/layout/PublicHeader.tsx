import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShoppingBag } from 'lucide-react';
import { SmartAuthButton } from '../ui/SmartAuthButton';
import { useUser } from '../../hooks/useUser';
import { useNavigate, useLocation } from 'react-router-dom';

interface PublicHeaderProps {
    onLoginClick: () => void;
    /** Abre el modal directamente en la pestaña de alta. */
    onSignupClick?: () => void;
}

export function PublicHeader({ onLoginClick, onSignupClick }: PublicHeaderProps) {
    const { data: currentUser } = useUser();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const isHome = location.pathname === '/' || location.pathname === '/web';

    const isTransparentPage = location.pathname === '/' || location.pathname === '/web' || location.pathname === '/ropa' || location.pathname === '/competiciones';

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();

        // Logic for "ROPA" link
        if (href === '/ropa') {
            navigate(`/ropa${location.search}`);
            setIsMobileMenuOpen(false);
            window.scrollTo(0, 0);
            return;
        }

        // Logic for "COMPETICIONES" link
        if (href === '/competiciones') {
            navigate(`/competiciones${location.search}`);
            setIsMobileMenuOpen(false);
            window.scrollTo(0, 0);
            return;
        }

        // Logic for anchor links
        if (isHome) {
            // If on home, scroll to section
            const element = document.querySelector(href);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setIsMobileMenuOpen(false);
                // Opcional: actualizar el hash en la URL sin recargar
                window.history.pushState({}, '', `${location.pathname}${location.search}${href}`);
            }
        } else {
            // If not on home, navigate to home + hash (preservando search params para local)
            const basePath = location.search.includes('env=web') ? '/web' : '/';
            navigate(`${basePath}${location.search}${href}`);
            setIsMobileMenuOpen(false);
        }
    };

    // El orden es el mismo en el que aparecen las secciones en la portada:
    // así la barra se lee como un índice de la página y no como una lista suelta.
    const navLinks = [
        { name: 'FILOSOFÍA', href: '#filosofia' },
        { name: 'SOFTWARE', href: '#software' },
        { name: 'EQUIPO', href: '#entrenadores' },
        { name: 'ATLETAS', href: '#atletas' },
        { name: 'LOGROS', href: '#logros' },
        { name: 'OPINIONES', href: '#reviews' },
        { name: 'AFÍLIATE', href: '#afiliacion' },
        { name: 'CONTACTO', href: '#contacto' },
        { name: 'COMPETICIONES', href: '/competiciones' },
    ];

    return (
        <>
        <header
            className={`fixed w-full z-50 transition-all duration-300 ease-in-out border-b ${isScrolled || !isTransparentPage 
                ? 'bg-[#050505]/90 backdrop-blur-md border-white/5 py-3 shadow-2xl' 
                : 'bg-transparent border-transparent py-6'}`}
        >
            {/* Más ancho que el contenido de la página (1400) porque el menú
                centrado necesita hueco a los lados sin comerse los botones. */}
            <div className="max-w-[1560px] mx-auto px-6 flex items-center justify-between relative min-h-[80px]">
                {/* Logo Area */}
                <div className="flex-shrink-0 flex items-center">
                    <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); window.scrollTo(0, 0); }} className="block group">
                        <img
                            src="/logo-dark-removebg-preview.png"
                            alt="Anvil Strength Logo"
                            className="h-12 md:h-16 w-auto object-contain group-hover:scale-110 transition-transform duration-500"
                        />
                    </a>
                </div>

                {/* Navegación de escritorio. Va posicionada en absoluto y
                    centrada respecto a la cabecera entera: con `flex-1` se
                    centraba en el hueco que dejaban logo y botones, que no
                    miden lo mismo, y por eso el menú aparecía desplazado a la
                    derecha. */}
                <nav className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center gap-x-2 2xl:gap-x-3 whitespace-nowrap xl:flex">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            className={`pointer-events-auto text-[12px] 2xl:text-[13px] font-bold uppercase leading-none tracking-[0.06em] transition-colors duration-fast ease-snap hover:text-white ${
                                location.pathname === link.href ? 'text-anvil-red' : 'text-gray-400'
                            }`}
                        >
                            {link.name}
                        </a>
                    ))}
                </nav>

                {/* Right Actions */}
                <div className="flex-shrink-0 flex items-center space-x-3">
                    <div className="hidden sm:block">
                        <SmartAuthButton 
                            variant="ghost" 
                            onLoginClick={onLoginClick} 
                            className="!font-bebas !italic !tracking-[0.08em] !text-sm !py-1.5 !px-4 hover:!text-white hover:!border-white hover:!bg-white/5 transition-all duration-300 border border-white/20 rounded-lg"
                        />
                    </div>
                    
                    {onSignupClick && !currentUser && (
                        <button
                            onClick={onSignupClick}
                            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-anvil-red px-4 py-1.5 font-bebas text-sm italic tracking-[0.08em] text-white transition-all duration-300 hover:bg-red-700"
                        >
                            Crear cuenta
                        </button>
                    )}

                    <button className="text-gray-400 hover:text-white relative group transition-colors">
                        <ShoppingBag className="h-6 w-6 group-hover:scale-110 transition-transform" />
                        <span className="absolute -top-2 -right-2 bg-anvil-red text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]">0</span>
                    </button>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="xl:hidden text-gray-400 p-2 hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>
            </div>

        </header>

        {/* Mobile Navigation Overlay - Mover fuera del header para que backdrop-filter no restrinja su fixed inset-0 */}
        <AnimatePresence>
            {isMobileMenuOpen && (
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-[600] bg-[#050505] flex flex-col overflow-y-auto xl:hidden"
                >
                    <div className="flex items-center justify-between px-6 py-8 border-b border-white/5">
                        <img src="/logo-dark-removebg-preview.png" className="h-8 w-auto" alt="Logo" />
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-white p-3 bg-white/5 rounded-full"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <nav className="flex-1 flex flex-col justify-center px-10 gap-8">
                        {navLinks.map((link, index) => (
                            <motion.a
                                key={link.name}
                                href={link.href}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={(e) => handleNavClick(e, link.href)}
                                className="text-5xl font-black uppercase font-bebas italic tracking-normal text-[#666] hover:text-brand transition-all"
                            >
                                {link.name}
                            </motion.a>
                        ))}
                    </nav>
                    
                    <div className="space-y-3 p-10">
                        <SmartAuthButton variant="primary" onLoginClick={onLoginClick} className="w-full bg-brand py-6 font-bebas text-xl italic tracking-wider text-white" />
                        {onSignupClick && !currentUser && (
                            <button
                                onClick={() => { setIsMobileMenuOpen(false); onSignupClick(); }}
                                className="w-full rounded-lg border border-white/20 py-4 font-bebas text-lg italic tracking-[0.1em] text-white transition-colors hover:bg-white/5"
                            >
                                Crear cuenta
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}
