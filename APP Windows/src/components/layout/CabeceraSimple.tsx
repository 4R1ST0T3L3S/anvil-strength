import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Cabecera mínima para las páginas sueltas que quedan fuera del panel
 * (textos legales). Sustituye a la antigua `PublicHeader` de la web
 * publicitaria, que ya no forma parte de esta aplicación.
 */
export function CabeceraSimple() {
    return (
        <header className="sticky top-0 z-sticky border-b border-subtle bg-surface-sunken/90 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
                <img
                    src="/logo-dark-removebg-preview.png"
                    alt="Anvil Strength"
                    width={120}
                    height={48}
                    className="h-10 w-auto object-contain"
                />
                <Link
                    to="/"
                    className="flex h-11 items-center gap-1.5 rounded-field px-3 text-t-xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast ease-snap hover:bg-white/5 hover:text-ink"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Volver a la app
                </Link>
            </div>
        </header>
    );
}
