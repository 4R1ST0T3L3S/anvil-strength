import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShoppingBag } from 'lucide-react';
import { SmartAuthButton } from '../ui/SmartAuthButton';
import { useNavigate, useLocation } from 'react-router-dom';

interface PublicHeaderProps {
    onLoginClick: () => void;
}

export function PublicHeader({ onLoginClick }: PublicHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const isHome = location.pathname === '/';

    const isTransparentPage = location.pathname === '/' || location.pathname === '/ropa';

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
            navigate('/ropa');
            setIsMobileMenuOpen(false);
            window.scrollTo(0, 0);
            return;
        }

        // Logic for "COMPETICIONES" link
        if (href === '/competiciones') {
            navigate('/competiciones');
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
            }
        } else {
            // If not on home, navigate to home + hash
            navigate(`/${href}`); // href already includes #
            setIsMobileMenuOpen(false);
        }
    };

    const navLinks = [
        { name: 'FILOSOFÍA', href: '#filosofia' },
        { name: 'EQUIPO', href: '#entrenadores' },
        { name: 'ATLETAS', href: '#atletas' },
        { name: 'OPINIONES', href: '#reviews' },
        { name: 'LOGROS', href: '#logros' },
        { name: 'AFILIATE', href: '#afiliacion' },
        { name: 'CONTACTO', href: '#contacto' },
        { name: 'ROPA', href: '/ropa' },
        { name: 'COMPETICIONES', href: '/competiciones' }, // NEW LINK // NEW LINK
    ];

    return (
        <header
            className={`fixed w-full z-50 transition-all duration-300 ${isScrolled || !isTransparentPage ? 'bg-[#1c1c1c] shadow-lg py-2' : 'bg-transparent py-6'}`}
        >
            <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between md:justify-center md:gap-12">
                {/* Logo */}
                <div className="flex-shrink-0">
                    <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); window.scrollTo(0, 0); }} className="block hover:opacity-80 transition-opacity">
                        <img
                            src="/logo-dark-removebg-preview.png"
                            alt="Anvil Strength Logo"
                            className="h-10 md:h-12 w-auto object-contain"
                        />
                    </a>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center space-x-8">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            className={`text-sm font-bold tracking-wider hover:text-white transition-colors uppercase ${location.pathname === link.href ? 'text-anvil-red' : 'text-gray-300'
                                }`}
                        >
                            {link.name}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center space-x-4 md:space-x-6">
                    <SmartAuthButton variant="ghost" onLoginClick={onLoginClick} />
                    <button className="hidden md:block text-gray-300 hover:text-white relative">
                        <ShoppingBag className="h-5 w-5" />
                        <span className="absolute -top-2 -right-2 bg-anvil-red text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">0</span>
                    </button>
                </div>

                {/* Mobile Menu Button - Only show if menu is CLOSED. When open, the menu has its own close button.*/}
                <div className="md:hidden">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="text-white p-2"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Overlay - FULL SCREEN */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[100] bg-[#1c1c1c]/95 backdrop-blur-xl flex flex-col md:hidden"
                    >
                        {/* Internal Header for the Menu */}
                        <div className="flex items-center justify-between px-6 py-6 border-b border-white/5">
                            {/* Logo inside menu */}
                            <div className="flex-shrink-0">
                                <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); setIsMobileMenuOpen(false); }} className="block">
                                    <img
                                        src="/logo-dark-removebg-preview.png"
                                        alt="Anvil Strength Logo"
                                        className="h-10 w-auto object-contain grayscale brightness-150"
                                    />
                                </a>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="text-white p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Menu Content */}
                        <div className="flex-1 flex flex-col items-center justify-center relative">
                            {/* Background Watermark */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                                <img src="/logo-dark-removebg-preview.png" className="w-[120%] max-w-lg" alt="" />
                            </div>

                            <nav className="flex flex-col items-center space-y-8 relative z-10 w-full px-6 text-center">
                                {navLinks.map((link, index) => (
                                    <motion.a
                                        key={link.name}
                                        href={link.href}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        transition={{ delay: 0.1 + index * 0.05 }}
                                        onClick={(e) => handleNavClick(e, link.href)}
                                        className={`text-3xl font-black uppercase tracking-tighter transition-all duration-300 ${location.pathname === link.href
                                            ? 'text-anvil-red scale-110'
                                            : 'text-white/80 hover:text-white hover:scale-105'
                                            }`}
                                    >
                                        {link.name}
                                    </motion.a>
                                ))}
                            </nav>
                        </div>

                        {/* Footer / Extra Info in Menu */}
                        <div className="p-8 text-center text-white/20 text-xs font-bold tracking-widest uppercase">
                            Anvil Strength System
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
