import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Scissors } from 'lucide-react';
import type { TrimRange } from '../../../../lib/cv/frameSource';

/**
 * ANVIL STRENGTH — EL RECORTADOR
 * =====================================================================
 *
 * POR QUÉ HACE FALTA
 *
 * Un vídeo de gimnasio no es un levantamiento: es andar hasta la barra,
 * colocarse, respirar, levantar, dejar la barra y volver. Analizarlo entero
 * tiene tres consecuencias, y ninguna es de comodidad:
 *
 *   1. LAS MÉTRICAS SALEN MAL. El detector de repeticiones ve subir y bajar la
 *      marca mientras el atleta se coloca, y esos tramos compiten con el
 *      levantamiento de verdad. La "mejor repetición" puede acabar siendo el
 *      momento de sacar la barra del rack.
 *   2. TARDA DE MÁS. Cada fotograma se paga. Analizar 25 segundos para medir
 *      2 es diez veces más trabajo del necesario, en un móvil y con la pantalla
 *      encendida.
 *   3. EL SEGUIMIENTO SE PIERDE ANTES. Cuanto más largo el recorrido, más
 *      probabilidades de que algo cruce por delante del disco.
 *
 * Y había un cuarto motivo, este ya un fallo: sin recorte, el análisis empezaba
 * donde el detector de disco hubiera dejado el vídeo —hasta el 60% del fichero—
 * porque nadie rebobinaba antes de arrancar. Media serie no se miraba nunca.
 *
 *
 * CÓMO SE USA, Y POR QUÉ ASÍ
 *
 * Dos formas de fijar cada extremo, a propósito:
 *
 *   · ARRASTRANDO los tiradores de la barra, que es lo natural en un ratón;
 *   · o llevando el cursor al fotograma y pulsando "Inicio" / "Fin", que es lo
 *     único que funciona bien con el dedo en una pantalla de móvil. Arrastrar un
 *     tirador de 12 px con el pulgar es un ejercicio de puntería, y esta
 *     herramienta se usa en un gimnasio.
 *
 * Las miniaturas están porque encontrar la repetición mirando una barra gris es
 * imposible. Con la tira de imágenes se ve de un vistazo dónde baja la barra.
 */

const HANDLE_HIT_PX = 22;

interface VideoTrimmerProps {
    duration: number;
    /** Instante que se está viendo, en segundos. */
    currentTime: number;
    value: TrimRange;
    onChange: (range: TrimRange) => void;
    onSeek: (time: number) => void;
    /** Salto de un fotograma, en segundos. */
    frameIntervalS: number;
    /** Miniaturas equiespaciadas a lo largo del vídeo. */
    thumbnails?: string[];
    /** `true` mientras el vídeo se está reproduciendo. */
    playing?: boolean;
    onTogglePlay?: () => void;
}

/** `m:ss,cc` — con centésimas, porque una repetición dura poco más de un segundo. */
function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00,00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds - Math.floor(seconds)) * 100);
    return `${m}:${String(s).padStart(2, '0')},${String(Math.min(99, cs)).padStart(2, '0')}`;
}

export function VideoTrimmer({
    duration,
    currentTime,
    value,
    onChange,
    onSeek,
    frameIntervalS,
    thumbnails,
    playing,
    onTogglePlay,
}: VideoTrimmerProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<'from' | 'to' | 'playhead' | null>(null);

    const safeDuration = duration > 0 ? duration : 1;
    const pct = (t: number) => Math.max(0, Math.min(100, (t / safeDuration) * 100));

    /** Segundos correspondientes a una coordenada X de pantalla. */
    const timeAt = useCallback((clientX: number): number => {
        const track = trackRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        const ratio = (clientX - rect.left) / Math.max(1, rect.width);
        return Math.max(0, Math.min(safeDuration, ratio * safeDuration));
    }, [safeDuration]);

    /**
     * El recorte nunca puede quedar por debajo de tres fotogramas.
     *
     * No es un capricho de interfaz: con menos de tres muestras no se puede
     * ajustar la parábola con la que se deriva la velocidad, y el análisis
     * devolvería una lista vacía sin decir por qué.
     */
    const minSpan = Math.max(frameIntervalS * 3, 0.1);

    const setFrom = useCallback((t: number) => {
        onChange({ from: Math.max(0, Math.min(t, value.to - minSpan)), to: value.to });
    }, [onChange, value.to, minSpan]);

    const setTo = useCallback((t: number) => {
        onChange({ from: value.from, to: Math.min(safeDuration, Math.max(t, value.from + minSpan)) });
    }, [onChange, value.from, safeDuration, minSpan]);

    // El arrastre se escucha en la ventana y no en el tirador: si el puntero se
    // sale del elemento —y con el dedo se sale siempre— los eventos dejan de
    // llegar y el tirador se queda pegado a mitad de camino.
    useEffect(() => {
        if (!dragging) return;

        const move = (e: PointerEvent) => {
            const t = timeAt(e.clientX);
            if (dragging === 'from') { setFrom(t); onSeek(Math.min(t, value.to - minSpan)); }
            else if (dragging === 'to') { setTo(t); onSeek(Math.max(t, value.from + minSpan)); }
            else onSeek(t);
        };
        const up = () => setDragging(null);

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    }, [dragging, timeAt, setFrom, setTo, onSeek, value.from, value.to, minSpan]);

    /** Un toque en la barra lleva el cursor ahí, o coge el tirador más cercano. */
    const handleTrackPointerDown = (e: React.PointerEvent) => {
        const t = timeAt(e.clientX);
        const track = trackRef.current;
        if (!track) return;
        const pxPerSecond = track.getBoundingClientRect().width / safeDuration;

        const dFrom = Math.abs(t - value.from) * pxPerSecond;
        const dTo = Math.abs(t - value.to) * pxPerSecond;

        if (dFrom < HANDLE_HIT_PX && dFrom <= dTo) setDragging('from');
        else if (dTo < HANDLE_HIT_PX) setDragging('to');
        else { setDragging('playhead'); onSeek(t); }
    };

    const step = (frames: number) => {
        onSeek(Math.max(0, Math.min(safeDuration, currentTime + frames * frameIntervalS)));
    };

    const selectedS = Math.max(0, value.to - value.from);

    return (
        <div className="flex flex-col gap-2.5 rounded-card border border-subtle bg-surface-raised p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-t-xs font-semibold text-ink">
                    <Scissors size={14} className="shrink-0 text-brand" aria-hidden="true" />
                    Acota la repetición
                </span>
                <span className="text-t-2xs text-ink-subtle">
                    Deja fuera la salida del rack y el descargue.
                </span>
                <span className="ml-auto font-mono text-t-2xs font-bold text-ink">
                    {formatTime(selectedS)}
                </span>
            </div>

            {/* LA BARRA ------------------------------------------------ */}
            <div
                ref={trackRef}
                onPointerDown={handleTrackPointerDown}
                className="relative h-14 cursor-pointer touch-none select-none overflow-hidden rounded-field bg-surface-sunken"
                role="group"
                aria-label="Recorte del vídeo"
            >
                {/* Miniaturas: sin ellas hay que ir a ciegas. */}
                {thumbnails && thumbnails.length > 0 && (
                    <div className="pointer-events-none absolute inset-0 flex">
                        {thumbnails.map((src, i) => (
                            <img
                                key={i}
                                src={src}
                                alt=""
                                aria-hidden="true"
                                className="h-full min-w-0 flex-1 object-cover opacity-70"
                                draggable={false}
                            />
                        ))}
                    </div>
                )}

                {/* Lo que queda fuera se atenúa: es lo que NO se va a analizar. */}
                <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-black/65"
                    style={{ width: `${pct(value.from)}%` }}
                />
                <div
                    className="pointer-events-none absolute inset-y-0 right-0 bg-black/65"
                    style={{ width: `${100 - pct(value.to)}%` }}
                />

                <div
                    className="pointer-events-none absolute inset-y-0 border-y-2 border-brand"
                    style={{ left: `${pct(value.from)}%`, width: `${Math.max(0, pct(value.to) - pct(value.from))}%` }}
                />

                {/* Tiradores. Ancho generoso: se cogen con el pulgar. */}
                {(['from', 'to'] as const).map(edge => (
                    <div
                        key={edge}
                        onPointerDown={e => { e.stopPropagation(); setDragging(edge); }}
                        role="slider"
                        tabIndex={0}
                        aria-label={edge === 'from' ? 'Inicio del recorte' : 'Fin del recorte'}
                        aria-valuemin={0}
                        aria-valuemax={safeDuration}
                        aria-valuenow={value[edge]}
                        aria-valuetext={formatTime(value[edge])}
                        onKeyDown={e => {
                            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                            e.preventDefault();
                            const delta = (e.key === 'ArrowLeft' ? -1 : 1) * frameIntervalS;
                            if (edge === 'from') setFrom(value.from + delta);
                            else setTo(value.to + delta);
                        }}
                        className="absolute inset-y-0 z-10 flex w-5 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus:outline-none"
                        style={{ left: `${pct(value[edge])}%` }}
                    >
                        <span className={`h-full w-1.5 rounded-pill bg-brand shadow-[0_0_0_1px_rgba(0,0,0,0.4)] ${dragging === edge ? 'w-2' : ''}`} />
                    </div>
                ))}

                {/* Cursor de reproducción. */}
                <div
                    className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
                    style={{ left: `${pct(currentTime)}%` }}
                />
            </div>

            {/* CONTROLES ------------------------------------------------ */}
            <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex overflow-hidden rounded-field border border-subtle bg-surface-overlay">
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label="Fotograma anterior"
                        className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {onTogglePlay && (
                        <>
                            <span className="w-px bg-[var(--border-subtle)]" />
                            <button
                                type="button"
                                onClick={onTogglePlay}
                                aria-label={playing ? 'Pausa' : 'Reproducir la selección'}
                                className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
                            >
                                {playing ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                        </>
                    )}
                    <span className="w-px bg-[var(--border-subtle)]" />
                    <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label="Fotograma siguiente"
                        className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                <span className="font-mono text-t-2xs tabular-nums text-ink-subtle">
                    {formatTime(currentTime)}
                </span>

                {/* La vía que de verdad se usa en móvil. */}
                <button
                    type="button"
                    onClick={() => setFrom(currentTime)}
                    className="ml-auto rounded-field bg-surface-overlay px-3 py-2 text-t-2xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast hover:text-ink"
                >
                    Inicio aquí
                </button>
                <button
                    type="button"
                    onClick={() => setTo(currentTime)}
                    className="rounded-field bg-surface-overlay px-3 py-2 text-t-2xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast hover:text-ink"
                >
                    Fin aquí
                </button>
            </div>

            <p className="text-t-2xs leading-relaxed text-ink-subtle">
                De <span className="font-mono font-semibold text-ink-muted">{formatTime(value.from)}</span> a{' '}
                <span className="font-mono font-semibold text-ink-muted">{formatTime(value.to)}</span>.
                Cuanto más ajustado, más rápido y más fiable: fuera del recorte no se mira nada.
            </p>
        </div>
    );
}
