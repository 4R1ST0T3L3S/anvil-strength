import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
    useOpenCV, cleanupTracker, detectPlate, initTracker, trackFrame,
    type TrackingPoint, type PlateDetection,
} from '../../../../lib/cv/tracker';
import {
    createFrameReader, type FrameReader, type TrimRange,
} from '../../../../lib/cv/frameSource';
import { maxNormalisedJumpPx } from '../../../../lib/cv/signal';
import {
    type Calibration,
    type PlateEllipse,
    COMPETITION_PLATE_M,
    PLATE_PRESETS,
    calibrationFromEllipse,
    calibrationFromRing,
    withPlateDiameter,
    obliquityDeg,
} from '../../../../lib/cv/plateGeometry';
import type { TrackingStats } from '../../../../lib/cv/quality';
import { VideoTrimmer } from './VideoTrimmer';
import { Play, Target, RefreshCw, Upload, Loader, Check, ScanSearch, Crosshair, Scissors } from 'lucide-react';

/**
 * ANVIL STRENGTH — EL ANALIZADOR DE VÍDEO
 * =====================================================================
 *
 * TRES ESCALONES PARA LA ESCALA
 *
 *   1. AUTOMÁTICO — se busca el disco en varios fotogramas DEL RECORTE y se
 *      ajusta una ELIPSE (no un círculo: un disco solo sale redondo si la
 *      cámara está perfectamente perpendicular, y ninguna lo está).
 *   2. ASISTIDO   — si no aparece, el usuario toca el disco y se busca ahí.
 *   3. A MANO     — si tampoco, queda el aro… pero marcado como lo que es, para
 *      que la puntuación de calidad lo penalice y quede escrito junto a la
 *      medición.
 *
 * Nunca se queda sin salida, y nunca finge una precisión que no tiene.
 *
 *
 * QUÉ CAMBIÓ EN EL RECORRIDO DE FOTOGRAMAS, Y POR QUÉ ERA LO IMPORTANTE
 *
 * La versión anterior reproducía el vídeo y muestreaba con
 * `requestAnimationFrame`. Eso significa que el bucle iba al ritmo de la
 * PANTALLA mientras el vídeo iba al suyo: si procesar un fotograma tardaba más
 * que un fotograma de vídeo —y a 1080p tardaba—, esos fotogramas no se miraban
 * nunca. Un vídeo a 30 Hz se analizaba a 12 ó 15, y la concéntrica de una
 * sentadilla pesada se resolvía con diez muestras.
 *
 * Y había un fallo peor, de esos que no se ven: **el análisis empezaba donde el
 * detector hubiera dejado el vídeo**. El detector busca el disco hasta el 60% de
 * la duración y nadie rebobinaba antes de `play()`, así que en muchos vídeos
 * media serie no se analizaba. El primer punto del recorrido, además, se
 * guardaba con `timestamp: 0` mientras los demás llevaban el instante real, con
 * lo que la primera velocidad calculada era siempre basura.
 *
 * Ahora manda el recorte: se lee fotograma a fotograma entre las dos marcas que
 * pone el usuario, con el instante EXACTO que da el descodificador, y no se
 * pierde ninguno por lento que vaya el dispositivo. Ver `lib/cv/frameSource.ts`.
 *
 *
 * ESPACIOS DE COORDENADAS
 *
 * El lector entrega fotogramas reducidos (`reader.scale` dice cuánto). Todo lo
 * que sale de este componente —la elipse de la calibración y el recorrido— está
 * en píxeles del VÍDEO ORIGINAL, porque es donde se mide el disco y mezclar los
 * dos espacios sería un error de escala silencioso. La conversión ocurre en los
 * dos únicos sitios donde se cruza la frontera: al guardar la detección y al
 * apuntar cada punto del recorrido.
 */

/** Instantes donde se intenta la detección, en fracción del RECORTE. */
const DETECT_AT_FRACTIONS = [0.15, 0.5, 0.8];

/** Con esta confianza ya no se buscan más fotogramas. */
const GOOD_ENOUGH_SCORE = 0.7;

/** Miniaturas de la tira del recortador. */
const THUMBNAIL_COUNT = 12;

/** Radio de siembra cuando no hay disco detectado, en píxeles de trabajo. */
const FALLBACK_SEED_RADIUS = 34;

interface VideoTrackerProps {
    /** Se entrega el recorrido, CÓMO se calibró y cómo fue el seguimiento. */
    onTrackingComplete: (path: TrackingPoint[], calibration: Calibration, stats: TrackingStats) => void;
    seekTime?: number;
    isResultMode?: boolean;
    onTimeUpdate?: (time: number) => void;
}

type TrackerState =
    | 'upload'
    | 'loading_video'
    | 'preparing'
    | 'trim'
    | 'detecting'
    | 'confirm'
    | 'tap'
    | 'ring'
    | 'select_point'
    | 'ready'
    | 'tracking'
    | 'done';

export function VideoTracker({ onTrackingComplete, seekTime, isResultMode, onTimeUpdate }: VideoTrackerProps) {
    const { cvReady, cvError } = useOpenCV();

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [state, setState] = useState<TrackerState>('upload');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [fatal, setFatal] = useState<string | null>(null);

    /** El lector de fotogramas. Vive mientras viva el vídeo. */
    const readerRef = useRef<FrameReader | null>(null);
    const [readerInfo, setReaderInfo] = useState<{ scale: number; fps: number; exact: boolean } | null>(null);

    const [duration, setDuration] = useState(0);
    const [trim, setTrim] = useState<TrimRange>({ from: 0, to: 0 });
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [playhead, setPlayhead] = useState(0);
    const [playing, setPlaying] = useState(false);

    /** La elipse del disco y de dónde salió, en píxeles del vídeo original. */
    const [detection, setDetection] = useState<PlateDetection | null>(null);
    /**
     * Si el usuario tuvo que señalar el disco.
     *
     * Se guarda aparte del resultado del detector porque cambia lo que se puede
     * AFIRMAR de la medición: decir "detectado automáticamente" cuando alguien
     * tuvo que tocar la pantalla es falso, y todo el sentido de guardar el
     * método es que se pueda auditar después.
     */
    const [wasHinted, setWasHinted] = useState(false);
    const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);
    const [plateDiameterM, setPlateDiameterM] = useState<number>(COMPETITION_PLATE_M);

    const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
    const [path, setPath] = useState<TrackingPoint[]>([]);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    /**
     * El recorrido en curso. En una ref y no en el estado: durante el
     * seguimiento se añade un punto por fotograma, y `setPath(prev => [...prev,
     * p])` re-renderizaba el componente entero —y volvía a suscribir los
     * oyentes del `<video>`— cientos de veces. Además de ser cuadrático en
     * memoria, competía por el hilo con el propio análisis y lo hacía más lento.
     */
    const livePath = useRef<TrackingPoint[]>([]);
    const trackingStats = useRef({ framesProcessed: 0, framesLost: 0, trackedCounts: [] as number[] });

    const scale = readerInfo?.scale ?? 1;

    // =================================================================
    // CALIBRACIÓN
    // =================================================================

    /**
     * La escala, recalculada cuando cambia el diámetro del disco.
     *
     * Elegir "32 cm" en vez de "45 cm" no vuelve a detectar nada: la elipse
     * medida sigue valiendo, lo que cambia es cuántos metros representa.
     */
    const calibration: Calibration | null = useMemo(() => {
        if (detection?.ellipse) {
            const base = calibrationFromEllipse(
                detection.ellipse,
                COMPETITION_PLATE_M,
                wasHinted || detection.method === 'hough' ? 'assisted' : 'auto',
                detection.score
            );
            return withPlateDiameter(base, plateDiameterM);
        }
        if (ring) return calibrationFromRing(ring.x, ring.y, ring.r, plateDiameterM);
        return null;
    }, [detection, ring, plateDiameterM, wasHinted]);

    // =================================================================
    // CICLO DE VIDA
    // =================================================================

    useEffect(() => {
        return () => {
            readerRef.current?.dispose();
            cleanupTracker();
        };
    }, []);

    // El `blob:` de un vídeo de móvil son decenas de megas. Sin revocarlo, cada
    // vídeo que se abría en la sesión se quedaba en memoria hasta recargar.
    useEffect(() => {
        if (!videoUrl) return;
        return () => URL.revokeObjectURL(videoUrl);
    }, [videoUrl]);

    const handleVideoLoad = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        // Algunos ficheros emiten `loadedmetadata` sin dimensiones todavía. Sin
        // esta guarda el lienzo se quedaba en 0×0 y todo fallaba en silencio.
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        setDuration(d);
        setTrim({ from: 0, to: d });
        setVideoReady(true);
    };

    /**
     * Preparar el lector y la tira de miniaturas.
     *
     * Se hace una sola vez por vídeo. Medir la cadencia real cuesta poco más de
     * un segundo y es lo que permite pedir exactamente un fotograma cada vez en
     * vez de adivinar el paso.
     */
    useEffect(() => {
        if (!videoReady || readerRef.current) return;
        const video = videoRef.current;
        if (!video) return;

        let alive = true;
        setState('preparing');

        (async () => {
            try {
                const reader = await createFrameReader(video);
                if (!alive) { reader.dispose(); return; }
                readerRef.current = reader;
                setReaderInfo({ scale: reader.scale, fps: reader.fps, exact: reader.exactTimestamps });

                // Tira de miniaturas. Sin ella hay que buscar la repetición
                // moviendo el cursor a ciegas por una barra gris.
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 96;
                thumbCanvas.height = Math.max(1, Math.round((96 * reader.height) / reader.width));
                const thumbCtx = thumbCanvas.getContext('2d');
                const shots: string[] = [];

                if (thumbCtx && duration > 0) {
                    for (let i = 0; i < THUMBNAIL_COUNT && alive; i++) {
                        const t = (duration * (i + 0.5)) / THUMBNAIL_COUNT;
                        await reader.grab(t);
                        thumbCtx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
                        shots.push(thumbCanvas.toDataURL('image/jpeg', 0.5));
                    }
                }

                if (!alive) return;
                setThumbnails(shots);
                await reader.grab(0);
                setPlayhead(0);
                setState('trim');
            } catch (err) {
                if (!alive) return;
                setFatal(err instanceof Error ? err.message : 'No se ha podido preparar el vídeo.');
                setState('upload');
            }
        })();

        return () => { alive = false; };
    }, [videoReady, duration]);

    // =================================================================
    // DETECCIÓN
    // =================================================================

    /** Píxeles de trabajo → píxeles del vídeo original. */
    const ellipseToOriginal = useCallback((e: PlateEllipse): PlateEllipse => ({
        cx: e.cx * scale,
        cy: e.cy * scale,
        width: e.width * scale,
        height: e.height * scale,
        angleDeg: e.angleDeg,
    }), [scale]);

    /**
     * Buscar el disco solo, en varios fotogramas DEL RECORTE.
     *
     * Dentro del recorte y no a lo largo del vídeo entero: ahí es donde el disco
     * está en cuadro y en movimiento controlado. Buscarlo mientras el atleta
     * camina hacia la barra encontraba a menudo otra cosa.
     */
    const autoDetect = useCallback(async () => {
        const reader = readerRef.current;
        if (!reader) return;

        setState('detecting');
        setWasHinted(false);

        let best: PlateDetection = { ellipse: null, score: 0, method: null };
        const span = Math.max(0, trim.to - trim.from);

        for (const f of DETECT_AT_FRACTIONS) {
            try {
                const frame = await reader.grab(trim.from + span * f);
                const found = await detectPlate(frame.image, null);
                if (found.ellipse && found.score > best.score) best = found;
                if (best.score >= GOOD_ENOUGH_SCORE) break;
            } catch {
                // Un fotograma ilegible no invalida la búsqueda: se prueba el
                // siguiente en vez de mandar al usuario al modo manual.
            }
        }

        if (best.ellipse) {
            setDetection({ ...best, ellipse: ellipseToOriginal(best.ellipse) });
            setState('confirm');
        } else {
            // Ni rastro. Se pide ayuda en vez de inventar un tamaño.
            setState('tap');
        }
    }, [trim.from, trim.to, ellipseToOriginal]);

    // =================================================================
    // INTERACCIÓN SOBRE EL LIENZO
    // =================================================================

    const canvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    /**
     * Siembra la nube de puntos y deja el seguimiento listo.
     *
     * `x`, `y` y la elipse llegan en píxeles del vídeo original y se convierten
     * aquí al espacio de trabajo, que es donde vive el worker.
     */
    const armTracker = useCallback(async (x: number, y: number, ellipse: PlateEllipse | null) => {
        const reader = readerRef.current;
        if (!reader) return;

        setAnchorPoint({ x, y });
        try {
            const frame = await reader.grab(trim.from);
            const workEllipse = ellipse
                ? { ...ellipse, cx: ellipse.cx / scale, cy: ellipse.cy / scale, width: ellipse.width / scale, height: ellipse.height / scale }
                : null;
            const radius = workEllipse
                ? Math.min(workEllipse.width, workEllipse.height) / 2
                : FALLBACK_SEED_RADIUS;

            const init = await initTracker(frame.image, x / scale, y / scale, radius, workEllipse);

            if (!init.ok) {
                setFatal(
                    'No hay suficiente textura donde has marcado para poder seguirla. ' +
                    'Prueba a marcar el borde del disco o un punto con más contraste.'
                );
                setState('select_point');
                return;
            }

            setFatal(null);
            setAnchorPoint({ x: init.x * scale, y: init.y * scale });
            setState('ready');
        } catch (err) {
            setFatal(err instanceof Error ? err.message : 'No se ha podido preparar el seguimiento.');
            setState('select_point');
        }
    }, [scale, trim.from]);

    const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        const p = canvasPoint(e);
        const canvas = canvasRef.current;
        const reader = readerRef.current;
        if (!p || !canvas || !reader) return;

        if (state === 'tap') {
            // Segundo escalón: buscar el disco DONDE lo han señalado. Con la
            // pista, la detección deja de competir con todo lo redondo del
            // gimnasio y solo tiene que decidir dónde está el borde.
            setState('detecting');
            try {
                const frame = await reader.grab(videoRef.current?.currentTime ?? trim.from);
                const found = await detectPlate(frame.image, { x: p.x / scale, y: p.y / scale });

                if (found.ellipse) {
                    setWasHinted(true);
                    setDetection({ ...found, ellipse: ellipseToOriginal(found.ellipse) });
                    setState('confirm');
                    return;
                }
            } catch {
                // Se cae al aro manual, igual que si no hubiera encontrado nada.
            }
            // Tercer escalón. El radio de partida sigue siendo una suposición,
            // pero ahora se dice y se puede ajustar viendo el número que produce.
            setRing({ x: p.x, y: p.y, r: Math.round(canvas.height * 0.1) });
            setState('ring');
            return;
        }

        if (state === 'ring') {
            setRing(prev => (prev ? { ...prev, x: p.x, y: p.y } : { x: p.x, y: p.y, r: Math.round(canvas.height * 0.1) }));
            return;
        }

        if (state === 'select_point') {
            void armTracker(p.x, p.y, detection?.ellipse ?? null);
        }
    };

    // =================================================================
    // SEGUIMIENTO
    // =================================================================

    const startTracking = async () => {
        const reader = readerRef.current;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!reader || !video || !canvas || !anchorPoint || !calibration) return;

        setState('tracking');
        setFatal(null);
        livePath.current = [];
        trackingStats.current = { framesProcessed: 0, framesLost: 0, trackedCounts: [] };

        const total = reader.estimateFrames(trim.from, trim.to);
        setProgress({ done: 0, total });

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const workEllipse = detection?.ellipse
            ? {
                ...detection.ellipse,
                cx: detection.ellipse.cx / scale,
                cy: detection.ellipse.cy / scale,
                width: detection.ellipse.width / scale,
                height: detection.ellipse.height / scale,
            }
            : null;

        try {
            /**
             * VOLVER A EMPEZAR CUANDO EL LECTOR CAMBIA DE ESTRATEGIA.
             *
             * El lector analiza reproduciendo el vídeo, que es unas nueve veces
             * más rápido que posicionarlo fotograma a fotograma. Si el
             * compositor se come demasiados fotogramas, abandona y repite por
             * `seek`, que es lento pero exacto.
             *
             * Cuando eso pasa hay que TIRAR lo acumulado: el recorrido a medias
             * y la nube de puntos, que ya no está donde el primer fotograma la
             * dejó. Sin esto, el segundo intento arrancaría con el seguimiento
             * apuntando a la mitad del levantamiento y el recorrido saldría con
             * los puntos de los dos intentos pegados uno detrás de otro.
             */
            const restart = async () => {
                livePath.current = [];
                trackingStats.current = { framesProcessed: 0, framesLost: 0, trackedCounts: [] };
                setProgress({ done: 0, total });

                const first = await reader.grab(trim.from);
                const radius = workEllipse
                    ? Math.min(workEllipse.width, workEllipse.height) / 2
                    : FALLBACK_SEED_RADIUS;
                await initTracker(
                    first.image,
                    anchorPoint.x / scale,
                    anchorPoint.y / scale,
                    radius,
                    workEllipse
                );
            };

            const report = await reader.read({ from: trim.from, to: trim.to }, async frame => {
                const step = await trackFrame(frame.image, workEllipse);
                trackingStats.current.framesProcessed++;

                if (step.status === 1) {
                    const point = {
                        x: step.x * scale,
                        y: step.y * scale,
                        // El instante REAL del fotograma, no el del reloj de
                        // reproducción ni un cero inventado para el primero.
                        timestamp: frame.time * 1000,
                    };
                    livePath.current.push(point);
                    trackingStats.current.trackedCounts.push(step.tracked);

                    if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const trail = livePath.current;
                        ctx.beginPath();
                        ctx.moveTo(trail[0].x, trail[0].y);
                        for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
                        ctx.strokeStyle = '#22c55e';
                        ctx.lineWidth = 6;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
                        ctx.fillStyle = '#dc2626';
                        ctx.fill();
                    }
                } else {
                    trackingStats.current.framesLost++;
                }

                // El total es una ESTIMACIÓN a partir de la cadencia medida, y
                // un fichero con cadencia irregular puede tener más fotogramas
                // de los previstos en un tramo concreto. Sin este `max` se veía
                // "fotograma 53 de 42", que parece un fallo cuando en realidad
                // es que se han encontrado más fotogramas de los esperados —y
                // encontrarlos todos es justamente lo que se quiere.
                setProgress(p => ({
                    done: frame.index + 1,
                    total: Math.max(p?.total ?? total, frame.index + 1),
                }));
            }, { onRestart: restart });

            // Los fotogramas que el compositor se comió NO son fotogramas
            // perdidos por el seguimiento —el disco se veía perfectamente, es
            // que no llegaron—, pero bajan el muestreo igual, y el muestreo es
            // lo que sostiene el pico de velocidad. Se suman para que la nota de
            // calidad los tenga en cuenta en vez de premiar un análisis rápido
            // con menos muestras.
            if (report.droppedByDecoder > 0) {
                trackingStats.current.framesLost += report.droppedByDecoder;
                trackingStats.current.framesProcessed += report.droppedByDecoder;
            }
        } catch (err) {
            setFatal(err instanceof Error ? err.message : 'El análisis se ha interrumpido.');
        }

        setPath(livePath.current);
        setProgress(null);
        setState('done');
    };

    /** Lo que se entrega al panel de métricas junto con el recorrido. */
    const buildStats = (): TrackingStats => {
        const points = livePath.current.length ? livePath.current : path;
        const first = points[0]?.timestamp ?? 0;
        const last = points[points.length - 1]?.timestamp ?? 0;
        const counts = [...trackingStats.current.trackedCounts].sort((a, b) => a - b);

        return {
            framesProcessed: trackingStats.current.framesProcessed,
            framesLost: trackingStats.current.framesLost,
            // Se mide sobre el recorrido crudo y en un solo sitio, no acumulando
            // dentro del bucle: allí dependía de lo que tardara en procesarse
            // cada fotograma, que no tiene nada que ver con lo que se quiere
            // saber. Ver `maxNormalisedJumpPx`.
            maxJumpPx: maxNormalisedJumpPx(points),
            durationS: Math.max(0, (last - first) / 1000),
            frameHeightPx: canvasRef.current?.height ?? 0,
            exactTimestamps: readerInfo?.exact ?? false,
            medianTrackedPoints: counts.length ? counts[counts.length >> 1] : 0,
        };
    };

    // =================================================================
    // PINTADO
    // =================================================================

    const drawEllipse = (ctx: CanvasRenderingContext2D, e: PlateEllipse, colour: string) => {
        ctx.beginPath();
        ctx.ellipse(e.cx, e.cy, e.width / 2, e.height / 2, (e.angleDeg * Math.PI) / 180, 0, 2 * Math.PI);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 4;
        ctx.stroke();

        // La línea vertical que de verdad fija la escala. Se dibuja porque es lo
        // que hay que mirar para decidir si el ajuste es bueno: si esa línea no
        // va de borde a borde del disco, la medición está mal.
        const halfV = Math.sqrt(
            (e.width / 2) ** 2 * Math.sin((e.angleDeg * Math.PI) / 180) ** 2 +
            (e.height / 2) ** 2 * Math.cos((e.angleDeg * Math.PI) / 180) ** 2
        );
        ctx.beginPath();
        ctx.moveTo(e.cx, e.cy - halfV);
        ctx.lineTo(e.cx, e.cy + halfV);
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(e.cx, e.cy, 5, 0, 2 * Math.PI);
        ctx.fillStyle = colour;
        ctx.fill();
    };

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || state === 'tracking' || state === 'upload') return;

        const drawFrame = () => {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !canvas.width) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (!isResultMode && (state === 'confirm' || state === 'select_point' || state === 'ready') && detection?.ellipse) {
                drawEllipse(ctx, detection.ellipse, '#00ffaa');
            }

            if (!isResultMode && (state === 'ring' || state === 'select_point' || state === 'ready') && ring) {
                drawEllipse(ctx, { cx: ring.x, cy: ring.y, width: ring.r * 2, height: ring.r * 2, angleDeg: 0 }, '#fbbf24');
            }

            if (anchorPoint && state !== 'done') {
                ctx.beginPath();
                ctx.arc(anchorPoint.x, anchorPoint.y, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#dc2626';
                ctx.fill();
            }

            if (path.length > 1) {
                ctx.beginPath();
                ctx.moveTo(path[0].x, path[0].y);
                for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
                ctx.strokeStyle = '#22c55e';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 6;
                ctx.stroke();
            }

            if (state === 'done' && path.length > 0) {
                const targetTime = video.currentTime * 1000;
                let closest = path[0];
                let minDiff = Infinity;
                for (const p of path) {
                    const diff = Math.abs(p.timestamp - targetTime);
                    if (diff < minDiff) { minDiff = diff; closest = p; }
                }
                ctx.beginPath();
                ctx.arc(closest.x, closest.y, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#dc2626';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        };

        const onTime = () => {
            drawFrame();
            setPlayhead(video.currentTime);
            onTimeUpdate?.(video.currentTime);
        };

        video.addEventListener('seeked', onTime);
        video.addEventListener('timeupdate', onTime);
        drawFrame();
        return () => {
            video.removeEventListener('seeked', onTime);
            video.removeEventListener('timeupdate', onTime);
        };
    }, [state, anchorPoint, ring, detection, path, onTimeUpdate, isResultMode]);

    useEffect(() => {
        if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
            if (Math.abs(videoRef.current.currentTime - seekTime) > 0.015) {
                videoRef.current.currentTime = seekTime;
            }
        }
    }, [seekTime]);

    /** La previsualización del recorte se para sola al llegar al final. */
    useEffect(() => {
        const video = videoRef.current;
        if (!video || state !== 'trim') return;
        const check = () => {
            if (video.currentTime >= trim.to && !video.paused) {
                video.pause();
                setPlaying(false);
            }
        };
        video.addEventListener('timeupdate', check);
        return () => video.removeEventListener('timeupdate', check);
    }, [state, trim.to]);

    // =================================================================
    // ACCIONES
    // =================================================================

    const resetForNewVideo = () => {
        readerRef.current?.dispose();
        readerRef.current = null;
        cleanupTracker();
        setReaderInfo(null);
        setVideoReady(false);
        setDetection(null);
        setWasHinted(false);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        livePath.current = [];
        setThumbnails([]);
        setProgress(null);
        setFatal(null);
        setPlaying(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        resetForNewVideo();
        setVideoUrl(URL.createObjectURL(file));
        setState('loading_video');
    };

    const restartCalibration = () => {
        setDetection(null);
        setWasHinted(false);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        livePath.current = [];
        setFatal(null);
        setState('tap');
    };

    const backToTrim = () => {
        setDetection(null);
        setWasHinted(false);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        livePath.current = [];
        setFatal(null);
        setState('trim');
    };

    const retryAutoDetect = () => {
        setDetection(null);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        livePath.current = [];
        void autoDetect();
    };

    const nudgeRing = (delta: number) => {
        setRing(prev => (prev ? { ...prev, r: Math.max(12, prev.r + delta) } : prev));
    };

    /** Aceptar la escala y sembrar la nube sobre el centro del disco. */
    const acceptCalibration = () => {
        if (detection?.ellipse) {
            void armTracker(detection.ellipse.cx, detection.ellipse.cy, detection.ellipse);
        } else if (ring) {
            void armTracker(ring.x, ring.y, {
                cx: ring.x, cy: ring.y, width: ring.r * 2, height: ring.r * 2, angleDeg: 0,
            });
        }
    };

    /** Confirmar el recorte y empezar a buscar el disco. */
    const confirmTrim = () => {
        if (!cvReady) return;
        void autoDetect();
    };

    const togglePreview = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (video.currentTime < trim.from || video.currentTime >= trim.to) video.currentTime = trim.from;
            void video.play();
            setPlaying(true);
        } else {
            video.pause();
            setPlaying(false);
        }
    };

    const seekPreview = (t: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        setPlaying(false);
        video.currentTime = t;
        setPlayhead(t);
    };

    // =================================================================
    // INTERFAZ
    // =================================================================

    const ratioLabel = calibration && calibration.pixelToMeterRatio > 0
        ? `${(calibration.pixelToMeterRatio * 1000).toFixed(2)} mm/px`
        : '—';

    const angle = detection?.ellipse ? obliquityDeg(detection.ellipse) : null;

    const STATUS: Partial<Record<TrackerState, { icon: React.ReactNode; text: string }>> = {
        loading_video: { icon: <Loader size={16} className="shrink-0 animate-spin text-info" />, text: 'Cargando el vídeo…' },
        preparing: { icon: <Loader size={16} className="shrink-0 animate-spin text-info" />, text: 'Midiendo la cadencia del vídeo…' },
        trim: { icon: <Scissors size={16} className="shrink-0 text-brand" />, text: 'Acota la repetición y continúa' },
        detecting: { icon: <ScanSearch size={16} className="shrink-0 animate-pulse text-info" />, text: 'Buscando el disco…' },
        confirm: { icon: <Check size={16} className="shrink-0 text-success" />, text: 'Disco encontrado. ¿El contorno encaja?' },
        tap: { icon: <Crosshair size={16} className="shrink-0 text-warning" />, text: 'No lo encuentro: toca el disco' },
        ring: { icon: <Target size={16} className="shrink-0 text-warning" />, text: 'Ajusta el aro al borde del disco' },
        select_point: { icon: <Target size={16} className="shrink-0 text-brand" />, text: 'Toca el punto que quieres seguir' },
        ready: { icon: <Play size={16} className="shrink-0 text-success" />, text: 'Listo para analizar' },
        done: { icon: <Check size={16} className="shrink-0 text-success" />, text: 'Análisis terminado' },
    };

    const status = STATUS[state];

    return (
        <div className={`flex flex-col gap-3 ${isResultMode ? 'h-full' : ''}`}>

            {!cvReady && !cvError && state !== 'upload' && (
                <div className="flex items-center gap-3 rounded-card border border-warning/25 bg-warning/10 p-3 text-warning">
                    <Loader className="shrink-0 animate-spin" size={18} />
                    <span className="text-t-xs font-semibold">Cargando el motor de visión…</span>
                </div>
            )}

            {cvError && (
                <div className="flex items-center gap-3 rounded-card border border-danger/30 bg-danger/10 p-3 text-danger">
                    <span className="flex-1 text-t-xs font-semibold">{cvError}</span>
                    <button onClick={() => window.location.reload()} className="shrink-0 text-t-2xs font-bold underline">
                        Reintentar
                    </button>
                </div>
            )}

            {fatal && (
                <div className="rounded-card border border-danger/30 bg-danger/10 p-3">
                    <p className="text-t-xs leading-relaxed text-danger">{fatal}</p>
                </div>
            )}

            {!isResultMode && state !== 'upload' && (
                <div className="flex flex-col gap-2.5 rounded-card border border-subtle bg-surface-raised p-3">

                    {status && (
                        <div className="flex min-w-0 items-center gap-2">
                            {status.icon}
                            <span className="truncate text-t-xs font-semibold text-ink">{status.text}</span>
                            {readerInfo && (state === 'trim' || state === 'ready') && (
                                <span className="ml-auto shrink-0 font-mono text-t-2xs text-ink-subtle">
                                    {readerInfo.fps.toFixed(readerInfo.fps % 1 ? 2 : 0)} fps
                                </span>
                            )}
                        </div>
                    )}

                    {/* LA ESCALA, ESCRITA.
                        Se enseña siempre que exista porque es el número del que
                        depende todo lo demás, y porque un usuario que ve
                        "1,48 mm/px" con el aro mal puesto tiene alguna
                        posibilidad de notarlo. Con el aro solo, ninguna. */}
                    {calibration && (state === 'confirm' || state === 'ring' || state === 'select_point' || state === 'ready') && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-field bg-surface-sunken px-2.5 py-2">
                            <span className="text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">Escala</span>
                            <span className="font-mono text-t-xs font-bold text-ink">{ratioLabel}</span>
                            <span className="text-t-2xs text-ink-faint">·</span>
                            <span className="text-t-2xs text-ink-subtle">
                                disco de {Math.round(calibration.verticalExtentPx)} px de alto
                            </span>
                            {angle !== null && (
                                <>
                                    <span className="text-t-2xs text-ink-faint">·</span>
                                    <span className={`text-t-2xs font-semibold ${angle > 25 ? 'text-warning' : 'text-success'}`}>
                                        cámara a {angle.toFixed(0)}°
                                    </span>
                                </>
                            )}

                            <select
                                value={plateDiameterM}
                                onChange={e => setPlateDiameterM(Number(e.target.value))}
                                aria-label="Diámetro real del disco"
                                className="ml-auto cursor-pointer rounded-chip border border-subtle bg-surface-overlay px-2 py-1 text-t-2xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                            >
                                {PLATE_PRESETS.map(p => (
                                    <option key={p.meters} value={p.meters}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {state === 'trim' && (
                        <button
                            onClick={confirmTrim}
                            disabled={!cvReady}
                            className="rounded-field bg-brand px-4 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-ink transition-transform duration-fast active:scale-95 disabled:opacity-40"
                        >
                            Buscar el disco en este tramo
                        </button>
                    )}

                    {state === 'confirm' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={acceptCalibration}
                                className="flex-1 rounded-field bg-brand px-4 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-ink transition-transform duration-fast active:scale-95"
                            >
                                Sí, es ese disco
                            </button>
                            <button
                                onClick={retryAutoDetect}
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                Buscar otra vez
                            </button>
                            <button
                                onClick={restartCalibration}
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                Lo señalo yo
                            </button>
                        </div>
                    )}

                    {state === 'ring' && (
                        <div className="flex flex-col gap-2">
                            {/* La salvedad se escribe donde se toma la decisión,
                                no en un pie de página que nadie lee. */}
                            <p className="rounded-field bg-warning/10 px-2.5 py-2 text-t-2xs leading-relaxed text-warning">
                                Escala puesta a mano: el análisis se marcará con menor fiabilidad.
                                Ajusta el aro hasta que toque los bordes del disco por arriba y por abajo.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex overflow-hidden rounded-field border border-subtle bg-surface-overlay">
                                    <button onClick={() => nudgeRing(-2)} className="h-11 w-11 text-t-base font-bold text-ink transition-colors duration-fast hover:bg-surface-sunken" aria-label="Reducir el aro">−</button>
                                    <div className="w-px bg-[var(--border-subtle)]" />
                                    <button onClick={() => nudgeRing(2)} className="h-11 w-11 text-t-base font-bold text-ink transition-colors duration-fast hover:bg-surface-sunken" aria-label="Aumentar el aro">+</button>
                                </div>
                                <button
                                    onClick={acceptCalibration}
                                    className="flex-1 rounded-field bg-brand px-4 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-ink transition-transform duration-fast active:scale-95"
                                >
                                    Usar esta escala
                                </button>
                                <button
                                    onClick={retryAutoDetect}
                                    className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                                >
                                    Detectar
                                </button>
                            </div>
                        </div>
                    )}

                    {state === 'ready' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => void startTracking()}
                                className="flex flex-1 items-center justify-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-ink transition-transform duration-fast active:scale-95"
                            >
                                <Play size={14} /> Analizar el tramo
                            </button>
                            <button
                                onClick={() => setState('select_point')}
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                Otro punto
                            </button>
                            <button
                                onClick={backToTrim}
                                aria-label="Volver al recorte"
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                <Scissors size={14} />
                            </button>
                        </div>
                    )}

                    {state === 'tracking' && progress && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <RefreshCw size={16} className="shrink-0 animate-spin text-brand" />
                                <span className="text-t-xs font-semibold text-ink">
                                    Analizando fotograma {progress.done} de {progress.total}
                                </span>
                                <button
                                    onClick={() => readerRef.current?.abort()}
                                    className="ml-auto shrink-0 rounded-field px-2 py-1 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                                >
                                    Detener
                                </button>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                                <div
                                    className="h-full rounded-pill bg-brand transition-[width] duration-fast"
                                    style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {state === 'done' && (
                        <div className="flex flex-col gap-2">
                            {path.length < 5 && (
                                <p className="rounded-field bg-danger/10 px-2.5 py-2 text-t-2xs leading-relaxed text-danger">
                                    Solo se han podido seguir {path.length} fotogramas. Con tan pocos no salen
                                    métricas: vuelve a calibrar marcando un punto con más contraste, o amplía el recorte.
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => calibration && onTrackingComplete(path, calibration, buildStats())}
                                    disabled={!calibration || path.length < 3}
                                    className="flex-1 rounded-field bg-success px-5 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-ink-inverse transition-transform duration-fast active:scale-95 disabled:opacity-40"
                                >
                                    Ver resultados
                                </button>
                                <button
                                    onClick={backToTrim}
                                    aria-label="Volver al recorte"
                                    className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                                >
                                    <Scissors size={14} />
                                </button>
                                <button
                                    onClick={restartCalibration}
                                    aria-label="Volver a calibrar"
                                    className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                                >
                                    ↺
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {state === 'upload' ? (
                <div
                    className="flex cursor-pointer flex-col items-center justify-center rounded-sheet border-2 border-dashed border-subtle p-8 text-center transition-colors duration-fast hover:border-brand/50 md:p-16"
                    onClick={() => document.getElementById('video-upload')?.click()}
                >
                    <Upload size={40} className="mb-3 text-ink-faint" />
                    <h3 className="mb-1 text-t-base font-bold text-ink md:text-t-lg">Selecciona un vídeo</h3>
                    <p className="text-t-xs text-ink-subtle">Se procesa en este dispositivo. El vídeo no se sube a ningún sitio.</p>
                    <input id="video-upload" type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                </div>
            ) : (
                <>
                    <div className={`relative flex items-center justify-center bg-black ${isResultMode ? 'h-full w-full flex-1 overflow-hidden rounded-sheet border border-subtle' : 'aspect-video max-h-[55vh] overflow-hidden rounded-sheet border border-subtle md:max-h-[70vh]'}`}>
                        <video ref={videoRef} src={videoUrl || undefined} className="hidden" muted playsInline preload="auto" onLoadedMetadata={handleVideoLoad} />
                        <canvas
                            ref={canvasRef}
                            className={`max-h-full max-w-full object-contain ${state === 'tap' || state === 'ring' || state === 'select_point' ? 'cursor-crosshair' : ''}`}
                            onClick={handleCanvasClick}
                        />
                    </div>

                    {/* EL RECORTE.
                        Va debajo del vídeo y no en una pantalla aparte porque
                        hay que ver el fotograma para decidir dónde cortar. */}
                    {!isResultMode && state === 'trim' && readerInfo && (
                        <VideoTrimmer
                            duration={duration}
                            currentTime={playhead}
                            value={trim}
                            onChange={setTrim}
                            onSeek={seekPreview}
                            frameIntervalS={1 / readerInfo.fps}
                            thumbnails={thumbnails}
                            playing={playing}
                            onTogglePlay={togglePreview}
                        />
                    )}
                </>
            )}
        </div>
    );
}
