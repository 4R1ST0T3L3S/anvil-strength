import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'framer-motion';
import { X, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Hilo } from './Hilo';
import type { UserProfile } from '../../../hooks/useUser';
import { IconButton } from '../../../components/ui/IconButton';
import { transition, DURATION } from '../../../lib/motion';
import { lockBodyScroll } from '../../../lib/scrollLock';

/**
 * EL CHAT FLOTANTE DEL ENTRENADOR
 * =====================================================================
 *
 * Se abre desde la ficha de un atleta o desde la bandeja sin salir de
 * donde se está: un panel lateral en escritorio, una hoja a pantalla
 * completa en móvil. Es el MISMO hilo que en «Mensajes» (misma caché,
 * mismo canal), solo cambia dónde se pinta.
 */
export function FloatingChat({
    isOpen,
    onClose,
    athlete,
    coach,
}: {
    isOpen: boolean;
    onClose: () => void;
    athlete: { id: string; full_name: string; avatar_url?: string } | null;
    coach: UserProfile;
}) {
    const navigate = useNavigate();
    const abierto = isOpen && !!athlete;

    useEffect(() => {
        if (!abierto) return;
        return lockBodyScroll();
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', alTeclear);
        return () => document.removeEventListener('keydown', alTeclear);
    }, [abierto, onClose]);

    return createPortal(
        <AnimatePresence>
            {abierto && athlete && (
                <div className="fixed inset-0 flex justify-end" style={{ zIndex: 'var(--z-modal)' }}>
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={transition(DURATION.fast)}
                        onClick={onClose}
                        className="absolute inset-0 bg-[var(--scrim)]"
                        aria-hidden="true"
                    />
                    <m.aside
                        role="dialog"
                        aria-label={`Chat con ${athlete.full_name}`}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={transition(DURATION.slow)}
                        className="relative flex h-full w-full flex-col bg-surface-canvas shadow-overlay sm:w-[440px] sm:border-l sm:border-[var(--separator)]"
                    >
                        <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                            <IconButton
                                size="sm"
                                tono="relleno"
                                aria-label="Abrir en Mensajes"
                                icon={<Maximize2 />}
                                onClick={() => { onClose(); navigate(`/coach-dashboard/mensajes/${athlete.id}`); }}
                            />
                            <IconButton size="sm" tono="relleno" aria-label="Cerrar" icon={<X />} onClick={onClose} />
                        </div>
                        <Hilo
                            me={coach.id}
                            otro={{ id: athlete.id, full_name: athlete.full_name, avatar_url: athlete.avatar_url, papel: 'athlete' }}
                            className="flex-1"
                        />
                    </m.aside>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
