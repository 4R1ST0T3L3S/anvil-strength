import { Instagram, Mail, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTextosWeb } from '../../features/landing/textos';

export function PublicFooter() {
    // Textos en el idioma elegido en la cabecera: ver features/landing/textos.ts.
    // Las páginas legales NO están traducidas; en inglés el enlace lo avisa.
    const c = useTextosWeb().pie;

    return (
        <footer className="bg-black border-t border-line">
            {/* Main footer */}
            <div className="max-w-[1400px] mx-auto px-6 py-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Brand */}
                    <div>
                        <span className="font-black text-2xl tracking-tighter text-ink">ANVIL STRENGTH</span>
                        <p className="text-ink-subtle text-sm mt-3 leading-relaxed max-w-xs">
                            {c.lema}
                        </p>
                        <div className="flex items-center gap-3 mt-5">
                            <a
                                href="https://www.instagram.com/anvilstrength_"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-white/5 hover:bg-brand rounded-lg text-ink-muted hover:text-ink transition-colors"
                                aria-label={c.instagram}
                            >
                                <Instagram size={18} />
                            </a>
                            <a
                                href="mailto:anvilstrengthclub@gmail.com"
                                className="p-2 bg-white/5 hover:bg-brand rounded-lg text-ink-muted hover:text-ink transition-colors"
                                aria-label={c.email}
                            >
                                <Mail size={18} />
                            </a>
                            <a
                                href="https://wa.me/34640761674"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-white/5 hover:bg-brand rounded-lg text-ink-muted hover:text-ink transition-colors"
                                aria-label={c.whatsapp}
                            >
                                <MessageCircle size={18} />
                            </a>
                        </div>
                    </div>

                    {/* Navigation */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-5">{c.navegacion}</p>
                        <nav className="flex flex-col gap-3">
                            {[
                                { label: c.enlaces.filosofia, href: '#filosofia' },
                                { label: c.enlaces.staff, href: '#entrenadores' },
                                { label: c.enlaces.atletas, href: '#atletas' },
                                { label: c.enlaces.logros, href: '#logros' },
                                { label: c.enlaces.competiciones, href: '/competiciones' },
                                { label: c.enlaces.unete, href: '#afiliacion' },
                            ].map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="text-ink-subtle hover:text-ink text-sm font-medium transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    </div>

                    {/* Federations + Legal */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-5">{c.federaciones}</p>
                        <div className="flex items-center gap-4 mb-8">
                            <a href="https://www.powerlifting.sport/" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 opacity-50 hover:scale-105 transition-[opacity,transform]">
                                <img src="/Logo-ipf.png" alt="IPF — International Powerlifting Federation" className="h-10 w-auto object-contain" />
                            </a>
                            <a href="https://powerliftingspain.es/" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 opacity-50 hover:scale-105 transition-[opacity,transform]">
                                <img src="/logo-aep.png" alt="AEP — Asociación Española de Powerlifting" className="h-9 w-auto object-contain" />
                            </a>
                        </div>

                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-3">{c.legal}</p>
                        <div className="flex flex-col gap-2">
                            <Link to="/legal/aviso-legal" className="text-gray-600 hover:text-ink-muted text-xs transition-colors">
                                {c.avisoLegal}
                            </Link>
                            <Link to="/legal/privacidad" className="text-gray-600 hover:text-ink-muted text-xs transition-colors">
                                {c.privacidad}
                            </Link>
                            <Link to="/legal/cookies" className="text-gray-600 hover:text-ink-muted text-xs transition-colors">
                                {c.cookies}
                            </Link>
                            <Link to="/legal/terminos" className="text-gray-600 hover:text-ink-muted text-xs transition-colors">
                                {c.terminos}
                            </Link>
                            <a href="/normativa_equipo.pdf" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-ink-muted text-xs transition-colors">
                                {c.normativa}
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-subtle py-5">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3">
                    <p className="text-xs text-gray-700 font-medium uppercase tracking-widest">
                        {c.derechos}
                    </p>
                    <p className="text-xs text-gray-700">
                        {c.grupo}
                    </p>
                </div>
            </div>
        </footer>
    );
}
