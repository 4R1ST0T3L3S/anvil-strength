
export function PublicFooter() {
    return (
        <footer className="bg-black py-16 border-t border-white/10">
            <div className="max-w-[1400px] mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2">
                        {/* Footer Logo */}
                        <span className="font-black text-2xl tracking-tighter text-white">ANVIL STRENGTH</span>
                    </div>
                    <div className="flex gap-8 text-sm font-bold text-gray-500 uppercase tracking-wider">
                        <a href="https://www.instagram.com/anvilstrength_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
                        <a href="mailto:anvilstrengthclub@gmail.com" className="hover:text-white transition-colors">Email</a>
                        <a href="#" className="hover:text-white transition-colors">Aviso Legal</a>
                    </div>
                </div>
                <div className="mt-8 text-center md:text-left text-xs text-gray-700 font-medium uppercase tracking-widest">
                    © 2026 Anvil Strength Powerlifting Club. Todos los derechos reservados.
                </div>
            </div>
        </footer>
    );
}
