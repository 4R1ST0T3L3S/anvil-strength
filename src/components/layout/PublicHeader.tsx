import React, { useState, useEffect } from 'react';
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
        { name: 'ENTRENADORES', href: '#entrenadores' },
        { name: 'ATLETAS', href: '#atletas' },
        { name: 'OPINIONES', href: '#reviews' },
        { name: 'LOGROS', href: '#logros' },
        { name: 'AFILIATE', href: '#afiliacion' },
        { name: 'CONTACTO', href: '#contacto' },
        { name: 'ROPA', href: '/ropa' }, // NEW LINK
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
                            src="/logo.svg"
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

                {/* Mobile Menu Button */}
                <div className="md:hidden">
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="text-white p-2"
                    >
                        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Navigation */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-[#1c1c1c] border-t border-white/10 absolute w-full rounded-b-xl shadow-2xl">
                    <div className="px-4 pt-2 pb-4 space-y-1">
                        {navLinks.map((link) => (
                            <a
                                key={link.name}
                                href={link.href}
                                className={`block px-3 py-4 text-base font-bold hover:text-white hover:bg-white/5 border-b border-white/5 ${location.pathname === link.href ? 'text-anvil-red' : 'text-gray-300'
                                    }`}
                                onClick={(e) => handleNavClick(e, link.href)}
                            >
                                {link.name}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </header>
    );
}
