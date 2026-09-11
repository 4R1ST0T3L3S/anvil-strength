import { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, ImageOff, Mic, Pause, Play, RotateCcw, Trash2, VideoOff } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { hora } from '../../../lib/tiempo';
import { formatearDuracion, formatearTamano } from '../../../lib/media/limites';
import { adjuntoCaducado } from '../../../services/chatService';
import { useAdjuntoUrl, type MensajeEnPantalla } from '../hooks/useChat';
import { Modal } from '../../../components/ui/Modal';

/**
 * UNA BURBUJA
 * =====================================================================
 *
 * Las mías a la derecha en rojo Anvil; las suyas a la izquierda sobre la
 * superficie de tarjeta. Esquinas de 18px con la de «cola» a 6: es lo que
 * hace que una fila de burbujas se lea como conversación y no como lista.
 *
 * ESTADOS QUE VE QUIEN ENVÍA — y solo esos dos:
 *   ✓   enviado    (existe en el servidor)
 *   ✓✓  entregado  (llegó a un dispositivo del otro)
 * No hay «leído». El reloj es «enviando»; el aviso rojo, «no se pudo».
 *
 * Los adjuntos se firman al pintarse (URL de una hora, con caché). Uno
 * caducado o borrado por el servidor deja su hueco con un texto: nunca un
 * enlace roto ni una imagen rota.
 */

export const Burbuja = memo(function Burbuja({
    mensaje,
    propia,
    seguida,
    onReintentar,
    onDescartar,
}: {
    mensaje: MensajeEnPantalla;
    propia: boolean;
    /** Va justo detrás de otra del mismo remitente: menos separación y esquina completa. */
    seguida: boolean;
    onReintentar?: () => void;
    onDescartar?: () => void;
}) {
    const fallido = mensaje.estadoLocal === 'fallido';
    const conAdjunto = mensaje.type !== 'text';
    const esMedia = mensaje.type === 'image' || mensaje.type === 'video';

    return (
        <div className={cn('flex w-full', propia ? 'justify-end' : 'justify-start', seguida ? 'mt-[3px]' : 'mt-2.5')}>
            <div className={cn('flex max-w-[82%] flex-col sm:max-w-[70%]', propia ? 'items-end' : 'items-start')}>
                <div
                    className={cn(
                        'relative overflow-hidden text-t-base leading-snug',
                        esMedia ? 'rounded-[16px]' : 'rounded-[18px] px-3.5 py-2',
                        propia
                            ? cn('bg-brand text-brand-ink', !seguida && !esMedia && 'rounded-br-[6px]')
                            : cn('bg-surface-raised text-ink shadow-card', !seguida && !esMedia && 'rounded-bl-[6px]'),
                        fallido && 'opacity-70'
                    )}
                >
                    {conAdjunto && <Adjunto mensaje={mensaje} propia={propia} />}

                    {mensaje.content && (
                        <p className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', esMedia && 'px-3.5 pb-2 pt-1.5')}>
                            {mensaje.content}
                        </p>
                    )}

                    {/* Hora y estado, dentro de la burbuja abajo a la derecha. */}
                    <span
                        className={cn(
                            'flex items-center justify-end gap-1 text-t-2xs leading-none',
                            esMedia && !mensaje.content ? 'absolute bottom-1.5 right-2 rounded-pill bg-black/45 px-1.5 py-1 text-white' : cn('mt-1 -mb-0.5', propia ? 'text-brand-ink/75' : 'text-ink-subtle')
                        )}
                    >
                        {hora(mensaje.created_at)}
                        {propia && <Estado mensaje={mensaje} />}
                    </span>
                </div>

                {fallido && (
                    <div className="mt-1 flex items-center gap-2 text-t-xs text-danger-text">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{mensaje.error ?? 'No se pudo enviar'}</span>
                        {onReintentar && mensaje.type === 'text' && (
                            <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reintentar
                            </button>
                        )}
                        {onDescartar && (
                            <button type="button" onClick={onDescartar} aria-label="Descartar" className="inline-flex items-center hover:text-ink">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

function Estado({ mensaje }: { mensaje: MensajeEnPantalla }) {
    if (mensaje.estadoLocal === 'enviando' || mensaje.estadoLocal === 'subiendo') {
        return <Clock className="h-3 w-3" aria-label="Enviando" />;
    }
    if (mensaje.estadoLocal === 'fallido') return null;
    if (mensaje.delivered_at) return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregado" />;
    return <Check className="h-3.5 w-3.5" aria-label="Enviado" />;
}

// =====================================================================
// ADJUNTOS
// =====================================================================

function Adjunto({ mensaje, propia }: { mensaje: MensajeEnPantalla; propia: boolean }) {
    const a = mensaje.attachment;
    const local = mensaje.estadoLocal === 'subiendo' || mensaje.estadoLocal === 'enviando';
    const caducado = !local && adjuntoCaducado(mensaje);

    if (caducado) {
        return (
            <div className={cn('flex items-center gap-2.5 px-3.5 py-3 text-t-sm', propia ? 'text-brand-ink/85' : 'text-ink-muted')}>
                {mensaje.type === 'video' ? <VideoOff className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ImageOff className="h-5 w-5 shrink-0" aria-hidden="true" />}
                <span>{mensaje.type === 'video' ? 'Vídeo eliminado por antigüedad' : 'Foto eliminada por antigüedad'}</span>
            </div>
        );
    }

    switch (mensaje.type) {
        case 'image': return <Imagen mensaje={mensaje} />;
        case 'video': return <Video mensaje={mensaje} />;
        case 'audio': return <Audio mensaje={mensaje} propia={propia} />;
        default: return <Archivo mensaje={mensaje} propia={propia} nombre={a?.name} />;
    }
}

function Progreso({ fraccion, etiqueta }: { fraccion: number; etiqueta: string }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--scrim)] text-white">
            <div className="h-1 w-24 overflow-hidden rounded-pill bg-white/30">
                <div className="h-full rounded-pill bg-white transition-[width] duration-fast" style={{ width: `${Math.round(fraccion * 100)}%` }} />
            </div>
            <span className="text-t-2xs font-medium">{etiqueta}</span>
        </div>
    );
}

/** Ancho/alto de la caja del medio: proporción real, tope 280×320 sin agrandar. */
function cajaMedia(w?: number, h?: number) {
    if (!w || !h) return { width: 260, height: 195 };
    const escala = Math.min(280 / w, 320 / h, 1);
    return { width: Math.max(140, Math.round(w * escala)), height: Math.max(100, Math.round(h * escala)) };
}

function Imagen({ mensaje }: { mensaje: MensajeEnPantalla }) {
    const a = mensaje.attachment!;
    const subiendo = mensaje.estadoLocal === 'subiendo';
    const url = useAdjuntoUrl(a.path, !mensaje.previewUrl && !!a.path);
    const src = mensaje.previewUrl ?? url.data ?? null;
    const [abierta, setAbierta] = useState(false);
    const caja = cajaMedia(a.width, a.height);

    return (
        <>
            <button
                type="button"
                onClick={() => src && setAbierta(true)}
                data-no-press
                className="relative block bg-black/20"
                style={caja}
                aria-label="Ver la foto"
            >
                {src ? (
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : url.isError ? (
                    <span className="flex h-full items-center justify-center text-t-xs text-ink">No se pudo cargar</span>
                ) : (
                    <span className="block h-full w-full animate-pulse bg-[var(--fill-hover)]" />
                )}
                {subiendo && <Progreso fraccion={mensaje.progreso ?? 0} etiqueta="Enviando foto…" />}
            </button>
            <Modal open={abierta} onClose={() => setAbierta(false)} size="xl" className="!bg-black">
                {src && <img src={src} alt="" className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain" />}
            </Modal>
        </>
    );
}

function Video({ mensaje }: { mensaje: MensajeEnPantalla }) {
    const a = mensaje.attachment!;
    const subiendo = mensaje.estadoLocal === 'subiendo';
    const poster = useAdjuntoUrl(a.poster_path, !!a.poster_path && !mensaje.previewUrl);
    const [abierto, setAbierto] = useState(false);
    const video = useAdjuntoUrl(a.path, abierto && !!a.path);
    const caja = cajaMedia(a.width, a.height);
    const fondo = mensaje.previewUrl ?? poster.data ?? null;

    return (
        <>
            <button
                type="button"
                onClick={() => !subiendo && setAbierto(true)}
                data-no-press
                className="relative block bg-black"
                style={caja}
                aria-label="Reproducir el vídeo"
            >
                {fondo && <img src={fondo} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" decoding="async" />}
                {!subiendo && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-white/90 text-black shadow-float">
                            <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
                        </span>
                    </span>
                )}
                {a.duration_s != null && !subiendo && (
                    <span className="absolute left-2 top-2 rounded-pill bg-black/55 px-1.5 py-0.5 text-t-2xs font-medium text-white">
                        {formatearDuracion(a.duration_s)}
                    </span>
                )}
                {subiendo && <Progreso fraccion={mensaje.progreso ?? 0} etiqueta={`Enviando vídeo · ${Math.round((mensaje.progreso ?? 0) * 100)}%`} />}
            </button>
            <Modal open={abierto} onClose={() => setAbierto(false)} size="xl" className="!bg-black">
                {video.data ? (
                    <video src={video.data} controls autoPlay playsInline preload="metadata" className="mx-auto max-h-[80dvh] w-auto max-w-full rounded-[10px]" />
                ) : video.isError ? (
                    <p className="py-10 text-center text-t-sm text-ink">No se pudo cargar el vídeo.</p>
                ) : (
                    <div className="flex aspect-video items-center justify-center"><span className="h-8 w-8 animate-spin rounded-pill border-2 border-white/30 border-t-white" /></div>
                )}
            </Modal>
        </>
    );
}

function Audio({ mensaje, propia }: { mensaje: MensajeEnPantalla; propia: boolean }) {
    const a = mensaje.attachment!;
    const subiendo = mensaje.estadoLocal === 'subiendo';
    const firmada = useAdjuntoUrl(a.path, !!a.path && !mensaje.previewUrl);
    const src = mensaje.previewUrl ?? firmada.data ?? null;
    const audioRef = useRef<HTMLAudioElement>(null);
    const [tocando, setTocando] = useState(false);
    const [t, setT] = useState(0);
    const [dur, setDur] = useState(a.duration_s ?? 0);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const alTiempo = () => setT(el.currentTime);
        const alDur = () => { if (Number.isFinite(el.duration)) setDur(el.duration); };
        const alFin = () => { setTocando(false); setT(0); };
        el.addEventListener('timeupdate', alTiempo);
        el.addEventListener('loadedmetadata', alDur);
        el.addEventListener('ended', alFin);
        el.addEventListener('pause', () => setTocando(false));
        el.addEventListener('play', () => setTocando(true));
        return () => {
            el.removeEventListener('timeupdate', alTiempo);
            el.removeEventListener('loadedmetadata', alDur);
            el.removeEventListener('ended', alFin);
        };
    }, [src]);

    const alternar = () => {
        const el = audioRef.current;
        if (!el || !src) return;
        if (el.paused) void el.play(); else el.pause();
    };

    const fraccion = dur > 0 ? Math.min(1, t / dur) : 0;
    const tinta = propia ? 'text-brand-ink' : 'text-ink';
    const pista = propia ? 'bg-brand-ink/30' : 'bg-[var(--fill-strong)]';
    const relleno = propia ? 'bg-brand-ink' : 'bg-brand';

    return (
        <div className="flex w-[236px] items-center gap-2.5 px-3 py-2.5">
            {src && <audio ref={audioRef} src={src} preload="metadata" />}
            <button
                type="button"
                onClick={alternar}
                disabled={!src || subiendo}
                aria-label={tocando ? 'Pausar' : 'Reproducir nota de voz'}
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-pill', propia ? 'bg-brand-ink/20' : 'bg-[var(--fill-muted)]', tinta)}
            >
                {subiendo ? <Mic className="h-4 w-4 animate-pulse" aria-hidden="true" /> : tocando ? <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden="true" />}
            </button>
            <div className="min-w-0 flex-1">
                <div
                    className={cn('relative h-1.5 w-full cursor-pointer overflow-hidden rounded-pill', pista)}
                    onClick={(e) => {
                        const el = audioRef.current;
                        if (!el || !dur) return;
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        el.currentTime = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
                    }}
                >
                    <div className={cn('h-full rounded-pill', relleno)} style={{ width: `${fraccion * 100}%` }} />
                </div>
                <p className={cn('mt-1 text-t-2xs tabular-nums', propia ? 'text-brand-ink/75' : 'text-ink-subtle')}>
                    {subiendo ? 'Enviando…' : `${formatearDuracion(tocando ? t : dur)}`}
                </p>
            </div>
        </div>
    );
}

function Archivo({ mensaje, propia, nombre }: { mensaje: MensajeEnPantalla; propia: boolean; nombre?: string }) {
    const a = mensaje.attachment!;
    const subiendo = mensaje.estadoLocal === 'subiendo';
    const url = useAdjuntoUrl(a.path, !!a.path);
    const ext = (nombre ?? '').split('.').pop()?.toUpperCase().slice(0, 4);

    return (
        <a
            href={url.data ?? undefined}
            target="_blank"
            rel="noreferrer"
            download={nombre}
            aria-disabled={!url.data || subiendo}
            className={cn('flex w-[240px] items-center gap-3 px-3 py-2.5', (!url.data || subiendo) && 'pointer-events-none')}
        >
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', propia ? 'bg-brand-ink/20 text-brand-ink' : 'bg-[var(--fill-muted)] text-ink-muted')}>
                <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-t-sm font-medium', propia ? 'text-brand-ink' : 'text-ink')}>{nombre ?? 'Archivo'}</span>
                <span className={cn('block text-t-2xs', propia ? 'text-brand-ink/75' : 'text-ink-subtle')}>
                    {subiendo ? `Enviando · ${Math.round((mensaje.progreso ?? 0) * 100)}%` : [ext, formatearTamano(a.size)].filter(Boolean).join(' · ')}
                </span>
            </span>
            {!subiendo && <Download className={cn('h-4 w-4 shrink-0', propia ? 'text-brand-ink/80' : 'text-ink-subtle')} aria-hidden="true" />}
        </a>
    );
}
