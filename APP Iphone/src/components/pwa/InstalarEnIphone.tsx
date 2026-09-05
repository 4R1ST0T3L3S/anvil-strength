import { useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { useIdioma } from '../../hooks/useIdioma';

/**
 * AVISO DE INSTALACIÓN PARA IPHONE.
 *
 * En Android y en escritorio el navegador ofrece él solo "instalar" la PWA
 * (`beforeinstallprompt`). En iOS ese evento NO EXISTE: la única manera de
 * instalar es el menú Compartir → "Añadir a pantalla de inicio", y nadie lo
 * encuentra sin que se le diga. Y no es cosmética: en iPhone las
 * notificaciones Web Push SOLO funcionan con la app instalada, y abrirla desde
 * la pantalla de inicio es lo que quita la barra de Safari.
 *
 * Se enseña únicamente cuando se cumplen las tres: es un iPhone/iPad, NO
 * está ya corriendo instalada (`display-mode: standalone`), y no se ha
 * cerrado antes. El cierre se recuerda en `localStorage`; la app instalada
 * tiene su propio almacén, así que allí nunca aparece.
 */

const CLAVE_CERRADO = 'anvil_pwa_aviso_instalar';
const PARAM_INSTALAR = 'instalar';

function esIphoneSinInstalar(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    // iPadOS se presenta como Mac; se distingue por los puntos de contacto.
    const esIos = /iPhone|iPad|iPod/.test(ua)
        || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!esIos) return false;

    const instalada = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (instalada) return false;

    // Viniendo del botón «iPhone» de la landing (`?instalar=1`) se enseña
    // SIEMPRE, aunque se hubiera cerrado antes: el usuario acaba de pedir
    // instalar. `start_url` es `/`, así que el parámetro no llega a la app
    // instalada.
    let pedido = false;
    try {
        pedido = new URLSearchParams(window.location.search).has(PARAM_INSTALAR);
    } catch {
        /* URL rara: se sigue con la lógica normal */
    }
    if (pedido) {
        try {
            localStorage.removeItem(CLAVE_CERRADO);
        } catch {
            /* sin localStorage no hay nada que borrar */
        }
        return true;
    }

    try {
        return localStorage.getItem(CLAVE_CERRADO) !== '1';
    } catch {
        return true;
    }
}

export function InstalarEnIphone() {
    const { t } = useIdioma();
    const [visible, setVisible] = useState(esIphoneSinInstalar);

    if (!visible) return null;

    const cerrar = () => {
        setVisible(false);
        try {
            localStorage.setItem(CLAVE_CERRADO, '1');
        } catch {
            /* modo privado: se volverá a enseñar, y no pasa nada */
        }
    };

    return (
        <div
            role="status"
            className="fixed inset-x-0 top-0 z-50 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]"
        >
            <div className="mx-auto flex max-w-md items-start gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-ink shadow-lg">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-brand-quiet text-brand-text">
                    <Share size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-t-sm font-bold leading-tight">{t('pwa.instalarTitulo')}</p>
                    <p className="mt-1 flex items-start gap-1 text-t-xs text-ink-muted">
                        <SquarePlus size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                        <span>{t('pwa.instalarPasos')}</span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={cerrar}
                    aria-label={t('pwa.instalarCerrar')}
                    className="-m-1 shrink-0 rounded-field p-1 text-ink-subtle active:bg-surface-overlay"
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
