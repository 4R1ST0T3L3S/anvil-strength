import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'anvil:aviso-cookies-visto';

/**
 * AVISO DE COOKIES — informativo, no un muro de consentimiento falso.
 * =====================================================================
 * Esta web usa EXCLUSIVAMENTE cookies técnicas estrictamente necesarias
 * (la sesión de Supabase y una caché de calendario en localStorage) — ver
 * src/features/legal/pages/PoliticaCookies.tsx. Bajo el artículo 22.2 de
 * la LSSI-CE, ese tipo de cookies no requiere consentimiento previo.
 *
 * Por eso este NO es un banner de "aceptar / rechazar / configurar": no
 * hay nada opcional que aceptar o rechazar, y fingir que lo hay sería tan
 * engañoso como no avisar. Es una notificación transparente que se
 * recuerda una vez vista, con enlace a la política completa.
 *
 * Si algún día se añade una cookie no esencial (analítica de verdad,
 * publicidad), este componente deja de ser suficiente y hace falta un
 * gestor de consentimiento real con opción de rechazar.
 */
export function CookieNotice() {
    // Inicializador perezoso y no un efecto: es una SPA sin SSR, así que
    // `localStorage` ya está disponible en el primer render, y leerlo ahí
    // evita el parpadeo de "aparece un instante después de pintar la
    // página" que tendría hacerlo en un `useEffect`.
    const [visible, setVisible] = useState(() => {
        try {
            return !localStorage.getItem(STORAGE_KEY);
        } catch {
            // Almacenamiento no disponible (modo privado estricto): se
            // enseña igual, sin recordar la elección entre visitas.
            return true;
        }
    });

    const dismiss = () => {
        setVisible(false);
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            // Nada que hacer: se volverá a enseñar en la próxima visita.
        }
    };

    if (!visible) return null;

    return (
        <div
            role="region"
            aria-label="Aviso de cookies"
            className="fixed inset-x-0 bottom-0 z-sticky border-t border-subtle bg-surface-sunken/95 px-4 py-4 backdrop-blur-md transition-transform duration-base ease-snap sm:px-6"
            style={{
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
            }}
        >
            <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex items-start gap-3">
                    <Cookie size={18} className="mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
                    <p className="text-t-xs leading-relaxed text-ink-muted sm:text-t-sm">
                        Usamos solo las cookies técnicas necesarias para que la sesión funcione —
                        ninguna de seguimiento ni publicidad.{' '}
                        <Link to="/legal/cookies" className="text-brand-text hover:underline">
                            Más información
                        </Link>
                    </p>
                </div>
                {/* 44px de alto: este aviso aparece en la portada, en móvil y
                    encima de todo lo demás. A los 32 que medía, el pulgar falla
                    y el aviso no se va, que es la peor combinación posible para
                    algo que tapa el pie de la página. */}
                <button
                    onClick={dismiss}
                    className="flex min-h-[44px] w-full shrink-0 items-center justify-center rounded-field bg-ink px-5 text-t-xs font-black uppercase tracking-wide text-ink-inverse transition-colors duration-fast ease-snap hover:bg-ink-muted sm:w-auto"
                >
                    Entendido
                </button>
            </div>
        </div>
    );
}
