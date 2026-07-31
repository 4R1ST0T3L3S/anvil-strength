import { Instagram, Mail, MessageCircle } from 'lucide-react';

export function PublicFooter() {
    return (
        <footer className="bg-black border-t border-white/10">
            {/* Main footer */}
            <div className="max-w-[1400px] mx-auto px-6 py-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Brand */}
                    <div>
                        <span className="font-black text-2xl tracking-tighter text-white">ANVIL STRENGTH</span>
                        <p className="text-gray-500 text-sm mt-3 leading-relaxed max-w-xs">
                            Club de powerlifting digital de España. Afiliado AEP e IPF. Gratuito, para toda España.
                        </p>
                        <div className="flex items-center gap-3 mt-5">
                            <a
                                href="https://www.instagram.com/anvilstrength_"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-white/5 hover:bg-anvil-red rounded-lg text-gray-400 hover:text-white transition-all"
                                aria-label="Instagram de Anvil Strength"
                            >
                                <Instagram size={18} />
                            </a>
                            <a
                                href="mailto:anvilstrengthclub@gmail.com"
                                className="p-2 bg-white/5 hover:bg-anvil-red rounded-lg text-gray-400 hover:text-white transition-all"
                                aria-label="Email de Anvil Strength"
                            >
                                <Mail size={18} />
                            </a>
                            <a
                                href="https://wa.me/34640761674"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-white/5 hover:bg-anvil-red rounded-lg text-gray-400 hover:text-white transition-all"
                                aria-label="WhatsApp de Anvil Strength"
                            >
                                <MessageCircle size={18} />
                            </a>
                        </div>
                    </div>

                    {/* Navigation */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-5">Navegación</p>
                        <nav className="flex flex-col gap-3">
                            {[
                                { label: 'Filosofía', href: '#filosofia' },
                                { label: 'Staff Técnico', href: '#entrenadores' },
                                { label: 'Nuestros Atletas', href: '#atletas' },
                                { label: 'Logros del Club', href: '#logros' },
                                { label: 'Competiciones', href: '/competiciones' },
                                { label: 'Únete al equipo', href: '#afiliacion' },
                            ].map((link) => (
                                <a
                                    key={link.label}
                                    href={link.href}
                                    className="text-gray-500 hover:text-white text-sm font-medium transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    </div>

                    {/* Federations + Legal */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-5">Federaciones</p>
                        <div className="flex items-center gap-4 mb-8">
                            <a href="https://www.powerlifting.sport/" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 opacity-50 hover:scale-105 transition-all">
                                <img src="/Logo-ipf.png" alt="IPF — International Powerlifting Federation" className="h-10 w-auto object-contain" />
                            </a>
                            <a href="https://powerliftingspain.es/" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 opacity-50 hover:scale-105 transition-all">
                                <img src="/logo-aep.png" alt="AEP — Asociación Española de Powerlifting" className="h-9 w-auto object-contain" />
                            </a>
                        </div>

                        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 mb-3">Legal</p>
                        <div className="flex flex-col gap-2">
                            <a href="/legal/aviso-legal" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">
                                Aviso Legal
                            </a>
                            <a href="/legal/privacidad" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">
                                Política de Privacidad
                            </a>
                            <a href="/legal/cookies" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">
                                Política de Cookies
                            </a>
                            <a href="/normativa_equipo.pdf" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-400 text-xs transition-colors">
                                Normativa del Equipo
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-white/5 py-5">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3">
                    <p className="text-xs text-gray-700 font-medium uppercase tracking-widest">
                        © 2026 Anvil Strength Powerlifting Club. Todos los derechos reservados.
                    </p>
                    <p className="text-xs text-gray-700">
                        Grupo de Recreación Deportiva · Afiliado AEP + IPF
                    </p>
                </div>
            </div>
        </footer>
    );
}
