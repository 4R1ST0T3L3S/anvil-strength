import { Modal } from './Modal';
import { detectVideo } from '../../lib/richText';
import { ExternalLink } from 'lucide-react';

/**
 * Reproductor para los vídeos que el coach enlaza en el calentamiento.
 *
 * POR QUÉ SE REPRODUCE DENTRO Y NO SE ABRE YOUTUBE
 * El atleta está a mitad de sesión, con repeticiones y kilos escritos en la
 * pantalla. Mandarlo al navegador —o peor, a la app de YouTube— es sacarlo
 * del entrenamiento y devolverlo, si vuelve, a una pantalla que ha tenido
 * que recargarse. Ver cómo se hace un ejercicio no puede costar eso.
 *
 * El enlace externo sigue estando, abajo y en pequeño: si el vídeo tiene la
 * incrustación desactivada, el iframe se queda en negro y hace falta una
 * salida que no sea cerrar y rendirse.
 */
export function VideoModal({
    open,
    onClose,
    url,
    title,
}: {
    open: boolean;
    onClose: () => void;
    url: string | null;
    title?: string;
}) {
    const video = url ? detectVideo(url) : null;

    return (
        <Modal open={open} onClose={onClose} title={title || 'Vídeo'} size="lg">
            <div className="space-y-3">
                {/* 16:9 con `aspect-video` y no con el truco del padding: el
                    contenedor tiene que reservar su hueco ANTES de que cargue
                    el iframe, o la hoja salta de alto a mitad de apertura. */}
                <div className="overflow-hidden rounded-card bg-black">
                    {video?.kind === 'youtube' && (
                        <iframe
                            src={video.embedUrl}
                            title={title || 'Vídeo'}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}

                    {video?.kind === 'file' && (
                        // `playsInline` es lo que impide que iOS se lo lleve a
                        // pantalla completa nada más darle al play, tapando la
                        // sesión entera.
                        <video
                            src={video.url}
                            controls
                            playsInline
                            preload="metadata"
                            className="aspect-video w-full"
                        />
                    )}

                    {!video && (
                        <div className="flex aspect-video items-center justify-center p-6 text-center text-t-sm text-ink-subtle">
                            Este enlace no es un vídeo que se pueda reproducir aquí.
                        </div>
                    )}
                </div>

                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-t-xs text-ink-subtle transition-colors duration-fast hover:text-ink"
                    >
                        <ExternalLink size={12} aria-hidden="true" />
                        Abrir en una pestaña nueva
                    </a>
                )}
            </div>
        </Modal>
    );
}
