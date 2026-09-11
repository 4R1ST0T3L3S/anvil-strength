import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Scissors, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { controlBase } from '../../../components/ui/Field';
import { VideoTrimmer } from '../../coach/components/pwr/VideoTrimmer';
import { prepararImagen } from '../../../lib/media/imagen';
import { leerMetadatosVideo, miniaturas, puedeRecodificar, recodificarVideo, prepararSinRecodificar, type VideoMeta } from '../../../lib/media/video';
import {
    VIDEO_MAX_SEGUNDOS, VIDEO_SUBIR_TAL_CUAL_BYTES, formatearDuracion, formatearTamano, normalizarRecorte, pesoEstimadoVideo,
    recorteInicial, tipoDeAdjunto, videoSeSubeTalCual, mimeBase,
} from '../../../lib/media/limites';
import type { EnvioDeAdjunto } from '../hooks/useChat';
import { cn } from '../../../lib/utils';

/**
 * ANTES DE ENVIAR
 * =====================================================================
 *
 * Todo adjunto pasa por aquí y se ve ANTES de subir nada:
 *
 *   FOTO      se comprime nada más abrir (2048 px, ~82 %) y se enseña ya
 *             comprimida con su peso, más un pie opcional.
 *   VÍDEO     se enseña con el recortador (tiradores, miniaturas, «inicio /
 *             fin aquí» para el dedo). Como máximo se envían 2 minutos: un
 *             vídeo más largo obliga a elegir el tramo. Al enviar se
 *             recodifica a 720p / 30 fps con progreso, o se sube tal cual
 *             si ya es ligero y MP4 y no hay recorte.
 *   ARCHIVO   nombre y peso, y enviar.
 *
 * Nunca se sube el original además del comprimido: solo lo que sale de aquí.
 */

type Fase = 'preparando' | 'lista' | 'codificando' | 'enviando';

export function PreparadorDeAdjunto({
    file,
    onCancelar,
    onEnviar,
}: {
    file: File | null;
    onCancelar: () => void;
    onEnviar: (envio: EnvioDeAdjunto) => void | Promise<void>;
}) {
    const tipo = file ? tipoDeAdjunto(file.type, file.name) : 'file';

    return (
        <Modal
            open={!!file}
            onClose={onCancelar}
            title={tipo === 'image' ? 'Enviar foto' : tipo === 'video' ? 'Enviar vídeo' : 'Enviar archivo'}
            size={tipo === 'video' ? 'lg' : 'md'}
        >
            {file && tipo === 'image' && <PrepararFoto key={file.name + file.size} file={file} onCancelar={onCancelar} onEnviar={onEnviar} />}
            {file && tipo === 'video' && <PrepararVideo key={file.name + file.size} file={file} onCancelar={onCancelar} onEnviar={onEnviar} />}
            {file && tipo !== 'image' && tipo !== 'video' && <PrepararArchivo file={file} onCancelar={onCancelar} onEnviar={onEnviar} />}
        </Modal>
    );
}

// =====================================================================
// FOTO
// =====================================================================

function PrepararFoto({ file, onCancelar, onEnviar }: { file: File; onCancelar: () => void; onEnviar: (e: EnvioDeAdjunto) => void | Promise<void> }) {
    const [fase, setFase] = useState<Fase>('preparando');
    const [lista, setLista] = useState<{ file: File; width: number; height: number; previewUrl: string } | null>(null);
    const [pie, setPie] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let viva = true;
        prepararImagen(file)
            .then(r => { if (viva) { setLista(r); setFase('lista'); } })
            .catch(err => { if (viva) setError(err instanceof Error ? err.message : 'No se pudo preparar la foto.'); });
        return () => { viva = false; };
    }, [file]);

    useEffect(() => () => { if (lista) URL.revokeObjectURL(lista.previewUrl); }, [lista]);

    const enviar = async () => {
        if (!lista) return;
        setFase('enviando');
        await onEnviar({ file: lista.file, kind: 'image', caption: pie.trim() || undefined, width: lista.width, height: lista.height, previewUrl: lista.previewUrl });
    };

    return (
        <div className="space-y-4">
            <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-[12px] bg-surface-sunken">
                {lista ? (
                    <img src={lista.previewUrl} alt="" className="max-h-[52dvh] w-auto max-w-full object-contain" />
                ) : error ? (
                    <p className="max-w-sm px-6 py-10 text-center text-t-sm text-danger-text">{error}</p>
                ) : (
                    <span className="h-7 w-7 animate-spin rounded-pill border-2 border-[var(--border-strong)] border-t-ink" aria-label="Preparando la foto" />
                )}
            </div>
            {lista && (
                <p className="text-t-xs text-ink-subtle">
                    {lista.width}×{lista.height} · {formatearTamano(lista.file.size)}
                    {lista.file.size < file.size && <> · antes {formatearTamano(file.size)}</>}
                </p>
            )}
            <input
                value={pie}
                onChange={e => setPie(e.target.value)}
                maxLength={500}
                placeholder="Añade un texto… (opcional)"
                className={cn(controlBase(false), 'min-h-[40px]')}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
                <Button variant="primary" icon={<Send className="h-4 w-4" aria-hidden="true" />} onClick={enviar} disabled={!lista} loading={fase === 'enviando'}>
                    Enviar
                </Button>
            </div>
        </div>
    );
}

// =====================================================================
// VÍDEO
// =====================================================================

function PrepararVideo({ file, onCancelar, onEnviar }: { file: File; onCancelar: () => void; onEnviar: (e: EnvioDeAdjunto) => void | Promise<void> }) {
    const [fase, setFase] = useState<Fase>('preparando');
    const [meta, setMeta] = useState<VideoMeta | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recorte, setRecorte] = useState({ desde: 0, hasta: VIDEO_MAX_SEGUNDOS });
    const [tiempo, setTiempo] = useState(0);
    const [tocando, setTocando] = useState(false);
    const [tira, setTira] = useState<string[]>([]);
    const [progreso, setProgreso] = useState(0);
    const [pie, setPie] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    // La URL del vídeo se crea UNA vez por archivo y se libera al desmontar.
    const [url] = useState(() => URL.createObjectURL(file));
    const abortRef = useRef<AbortController | null>(null);
    const recodificable = puedeRecodificar();

    useEffect(() => {
        let viva = true;
        leerMetadatosVideo(file)
            .then(m => {
                if (!viva) return;
                setMeta(m);
                setRecorte(recorteInicial(m.duration));
                setFase('lista');
            })
            .catch(err => { if (viva) setError(err instanceof Error ? err.message : 'No se pudo leer el vídeo.'); });
        miniaturas(file, 8).then(t => { if (viva) setTira(t); }).catch(() => { /* sin tira */ });
        return () => { viva = false; URL.revokeObjectURL(url); abortRef.current?.abort(); };
    }, [file, url]);

    // El reproductor de la vista previa sigue al recorte: al llegar al fin
    // se para, y al buscar fuera del tramo se lleva dentro.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const alTiempo = () => {
            setTiempo(v.currentTime);
            if (v.currentTime >= recorte.hasta - 0.03) { v.pause(); v.currentTime = recorte.desde; }
        };
        const alPlay = () => setTocando(true);
        const alPausa = () => setTocando(false);
        v.addEventListener('timeupdate', alTiempo);
        v.addEventListener('play', alPlay);
        v.addEventListener('pause', alPausa);
        return () => { v.removeEventListener('timeupdate', alTiempo); v.removeEventListener('play', alPlay); v.removeEventListener('pause', alPausa); };
    }, [recorte.desde, recorte.hasta]);

    const buscar = useCallback((t: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = t;
        setTiempo(t);
    }, []);

    const alternar = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
            if (v.currentTime < recorte.desde || v.currentTime >= recorte.hasta - 0.05) v.currentTime = recorte.desde;
            void v.play();
        } else v.pause();
    };

    const cambiarRecorte = (r: { from: number; to: number }) => {
        if (!meta) return;
        setRecorte(normalizarRecorte({ desde: r.from, hasta: r.to }, meta.duration));
    };

    const duracionSeleccion = Math.max(0, recorte.hasta - recorte.desde);
    const talCual = meta ? videoSeSubeTalCual({ mime: mimeBase(file.type), size: file.size, ancho: meta.width, alto: meta.height, duracion: meta.duration }, recorte) : false;
    const pesoPrevisto = talCual ? file.size : pesoEstimadoVideo(duracionSeleccion);

    const enviar = async () => {
        if (!meta) return;
        videoRef.current?.pause();
        try {
            let preparado;
            if (talCual) {
                setFase('enviando');
                preparado = await prepararSinRecodificar(file);
            } else if (recodificable) {
                setFase('codificando');
                abortRef.current = new AbortController();
                preparado = await recodificarVideo(file, { recorte, onProgreso: setProgreso, signal: abortRef.current.signal });
                setFase('enviando');
            } else if (file.size <= VIDEO_SUBIR_TAL_CUAL_BYTES * 3 && duracionSeleccion >= meta.duration - 0.1) {
                // Navegador sin recodificación y vídeo que cabe: se sube el original.
                setFase('enviando');
                preparado = await prepararSinRecodificar(file);
            } else {
                toast.error('Este navegador no puede comprimir vídeo. Prueba desde el móvil o con un vídeo más corto.');
                setFase('lista');
                return;
            }
            const previewUrl = preparado.poster ? URL.createObjectURL(preparado.poster) : undefined;
            await onEnviar({
                file: preparado.file,
                kind: 'video',
                caption: pie.trim() || undefined,
                duration_s: preparado.duration,
                width: preparado.width,
                height: preparado.height,
                poster: preparado.poster,
                previewUrl,
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') { setFase('lista'); return; }
            toast.error(err instanceof Error ? err.message : 'No se pudo preparar el vídeo.');
            setFase('lista');
        }
    };

    if (error) {
        return (
            <div className="space-y-4">
                <p className="rounded-[10px] bg-[var(--danger-quiet)] px-3.5 py-3 text-t-sm text-danger-text">{error}</p>
                <div className="flex justify-end"><Button variant="secondary" onClick={onCancelar}>Cerrar</Button></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[12px] bg-black">
                <video
                    ref={videoRef}
                    src={url}
                    playsInline
                    muted={fase === 'codificando'}
                    preload="auto"
                    onClick={alternar}
                    className="mx-auto max-h-[42dvh] w-auto max-w-full"
                />
                {fase === 'codificando' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--scrim)] px-6 text-center text-white">
                        <div className="h-1.5 w-56 max-w-full overflow-hidden rounded-pill bg-white/25">
                            <div className="h-full rounded-pill bg-white transition-[width] duration-fast" style={{ width: `${Math.round(progreso * 100)}%` }} />
                        </div>
                        <p className="text-t-sm font-medium">Comprimiendo a 720p · {Math.round(progreso * 100)}%</p>
                        <p className="text-t-xs text-ink-muted">Tarda lo que dura el tramo. No cierres esta pantalla.</p>
                        <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>Cancelar</Button>
                    </div>
                )}
            </div>

            {meta && fase !== 'codificando' && (
                <>
                    {meta.duration > VIDEO_MAX_SEGUNDOS && (
                        <p className="flex items-start gap-2 rounded-[10px] bg-warning-quiet px-3.5 py-2.5 text-t-sm text-warning">
                            <Scissors className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            El vídeo dura {formatearDuracion(meta.duration)}. Se envían como máximo 2 minutos: elige el tramo.
                        </p>
                    )}
                    <VideoTrimmer
                        duration={meta.duration}
                        currentTime={tiempo}
                        value={{ from: recorte.desde, to: recorte.hasta }}
                        onChange={cambiarRecorte}
                        onSeek={buscar}
                        frameIntervalS={1 / 30}
                        thumbnails={tira}
                        playing={tocando}
                        onTogglePlay={alternar}
                    />
                    <p className="text-t-xs text-ink-subtle">
                        Se enviarán {formatearDuracion(duracionSeleccion)}
                        {talCual ? ` · ${formatearTamano(file.size)}, sin recomprimir` : recodificable ? ` a 720p · unos ${formatearTamano(pesoPrevisto)}` : ''}
                        {!recodificable && ' · este navegador no puede comprimir'}
                    </p>
                    <input
                        value={pie}
                        onChange={e => setPie(e.target.value)}
                        maxLength={500}
                        placeholder="Añade un texto… (opcional)"
                        className={cn(controlBase(false), 'min-h-[40px]')}
                    />
                </>
            )}

            {fase !== 'codificando' && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
                    <Button variant="primary" icon={<Send className="h-4 w-4" aria-hidden="true" />} onClick={enviar} disabled={!meta} loading={fase === 'enviando'}>
                        Enviar
                    </Button>
                </div>
            )}
        </div>
    );
}

// =====================================================================
// ARCHIVO
// =====================================================================

function PrepararArchivo({ file, onCancelar, onEnviar }: { file: File; onCancelar: () => void; onEnviar: (e: EnvioDeAdjunto) => void | Promise<void> }) {
    const [enviando, setEnviando] = useState(false);
    const ext = file.name.split('.').pop()?.toUpperCase().slice(0, 4);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[12px] bg-[var(--fill-muted)] px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised text-ink-muted shadow-card">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-t-base font-medium text-ink">{file.name}</span>
                    <span className="block text-t-xs text-ink-subtle">{[ext, formatearTamano(file.size)].filter(Boolean).join(' · ')}</span>
                </span>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
                <Button
                    variant="primary"
                    icon={<Send className="h-4 w-4" aria-hidden="true" />}
                    loading={enviando}
                    onClick={async () => { setEnviando(true); await onEnviar({ file, kind: 'file', name: file.name }); }}
                >
                    Enviar
                </Button>
            </div>
        </div>
    );
}
