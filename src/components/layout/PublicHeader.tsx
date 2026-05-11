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

    const isTransparentPage = location.pathname === '/' || location.pathname === '/ropa' || location.pathname === '/competiciones';

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
        { name: 'SOFTWARE', href: '#software' },
        { name: 'EQUIPO', href: '#entrenadores' },
        { name: 'ATLETAS', href: '#atletas' },
        { name: 'OPINIONES', href: '#reviews' },
        { name: 'LOGROS', href: '#logros' },
        { name: 'AFILIATE', href: '#afiliacion' },
        { name: 'CONTACTO', href: '#contacto' },
        { name: 'COMPETICIONES', href: '/competiciones' },
    ];

    return (
        <header
            className={`fixed w-full z-50 transition-all duration-500 ${isScrolled || !isTransparentPage 
                ? 'bg-[#050505]/90 backdrop-blur-md border-b border-white/5 py-3 shadow-2xl' 
                : 'bg-transparent py-8'}`}
        >
            <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
                {/* Logo */}
                <div className="flex-shrink-0">
                    <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); window.scrollTo(0, 0); }} className="block group">
                        <img
                            src="/logo-dark-removebg-preview.png"
                            alt="Anvil Strength Logo"
                            className="h-8 md:h-10 w-auto object-contain group-hover:scale-110 transition-transform duration-500"
                        />
                    </a>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden lg:flex items-center space-x-10">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            className={`text-xs font-black tracking-[0.2em] hover:text-anvil-red transition-all duration-300 uppercase font-bebas italic ${
                                location.pathname === link.href ? 'text-anvil-red' : 'text-white/70'
                            }`}
                        >
                            {link.name}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center space-x-4">
                    <div className="hidden sm:block">
                        <SmartAuthButton variant="ghost" onLoginClick={onLoginClick} className="text-white hover:text-anvil-red transition-colors" />
                    </div>
                    
                    <button className="text-white hover:text-anvil-red relative group transition-colors">
                        <ShoppingBag className="h-5 w-5 group-hover:scale-110 transition-transform" />
                        <span className="absolute -top-2 -right-2 bg-anvil-red text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]">0</span>
                    </button>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="lg:hidden text-white p-2 hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-[100] bg-[#050505] flex flex-col lg:hidden"
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
                                    className="text-5xl font-black uppercase font-bebas italic tracking-tighter text-white/40 hover:text-anvil-red transition-all"
                                >
                                    {link.name}
                                </motion.a>
                            ))}
                        </nav>
                        
                        <div className="p-10">
                            <SmartAuthButton variant="primary" onLoginClick={onLoginClick} className="w-full bg-anvil-red py-6" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
