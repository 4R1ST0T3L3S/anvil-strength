import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useOpenCV, TrackingPoint, sendInitTracker, sendProcessFrame, sendDetectPlate, type PlateDetection } from '../../../../lib/cv/tracker';
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
import { Play, Target, RefreshCw, Upload, Loader, Check, ScanSearch, Crosshair } from 'lucide-react';

/**
 * ANVIL STRENGTH — EL ANALIZADOR DE VÍDEO
 * =====================================================================
 *
 * QUÉ CAMBIA RESPECTO DE LA VERSIÓN ANTERIOR, Y POR QUÉ IMPORTA
 *
 * Antes, la escala del vídeo se ponía así: el usuario tocaba el disco y
 * aparecía un aro de radio `alto_del_vídeo × 0.10` —una CONSTANTE, no una
 * medida— que se ajustaba con botones de ±5 px. La detección automática
 * existía en el worker pero no la llamaba nadie desde el commit c98564dc.
 *
 * El problema no es de comodidad. `pixelToMeterRatio` multiplica todo el
 * análisis: un aro puesto a ojo con un 20% de error da un 20% de error en la
 * velocidad, un 44% en la potencia y unos diez puntos en el %1RM estimado. Y
 * no se ve: los números siguen pareciendo razonables.
 *
 * Ahora hay tres escalones, y se dice en cuál se está:
 *
 *   1. AUTOMÁTICO — se busca el disco en tres fotogramas y se ajusta una
 *      ELIPSE (no un círculo: un disco solo sale redondo si la cámara está
 *      perfectamente perpendicular, y ninguna lo está). Ver cv.worker.js.
 *   2. ASISTIDO   — si no aparece, el usuario toca el disco y se busca ahí.
 *   3. A MANO     — si tampoco, queda el aro de siempre… pero marcado como lo
 *      que es, para que la puntuación de calidad lo penalice y quede escrito
 *      junto a la medición.
 *
 * Nunca se queda sin salida, y nunca finge una precisión que no tiene.
 *
 *
 * LO QUE ADEMÁS SE RECOGE AHORA
 *
 * Durante el seguimiento se cuenta cuántos fotogramas pierde el flujo óptico y
 * cuál es el mayor salto de la marca. Sin eso, un seguimiento que se va a la
 * pierna del atleta a mitad de serie produce exactamente los mismos números
 * bien formateados que uno correcto. Ver quality.ts.
 */

/** Tiempos donde se intenta la detección, en fracción de la duración. */
const DETECT_AT_SECONDS = (duration: number) => {
    const d = Number.isFinite(duration) && duration > 0 ? duration : 3;
    return [Math.min(0.4, d * 0.15), Math.min(1.2, d * 0.35), d * 0.6];
};

/** Con esta confianza ya no se buscan más fotogramas. */
const GOOD_ENOUGH_SCORE = 0.7;

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
    | 'detecting'
    | 'confirm'
    | 'tap'
    | 'ring'
    | 'select_point'
    | 'ready'
    | 'tracking'
    | 'done';

export function VideoTracker({ onTrackingComplete, seekTime, isResultMode, onTimeUpdate }: VideoTrackerProps) {
    const { cvReady, cvError, worker } = useOpenCV();

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [state, setState] = useState<TrackerState>('upload');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);

    /** La elipse del disco y de dónde salió. `null` mientras no hay escala. */
    const [detection, setDetection] = useState<PlateDetection | null>(null);
    /**
     * Si el usuario tuvo que señalar el disco.
     *
     * Se guarda aparte del resultado del detector porque cambia lo que se
     * puede AFIRMAR de la medición: un ajuste de elipse es igual de bueno le
     * hayan señalado el sitio o no, pero decir "detectado automáticamente"
     * cuando alguien tuvo que tocar la pantalla es falso, y todo el sentido de
     * guardar el método es que se pueda auditar después.
     */
    const [wasHinted, setWasHinted] = useState(false);
    /** El aro manual, para el tercer escalón. */
    const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);
    const [plateDiameterM, setPlateDiameterM] = useState<number>(COMPETITION_PLATE_M);

    const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
    const [path, setPath] = useState<TrackingPoint[]>([]);

    const cvContext = useRef<Record<string, number>>({});
    const detectionStarted = useRef(false);
    /** Contadores del seguimiento. En una ref: cambian por fotograma. */
    const stats = useRef({ framesProcessed: 0, framesLost: 0, maxJumpPx: 0 });

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

    useEffect(() => {
        return () => { if (worker) worker.postMessage({ type: 'CLEANUP' }); };
    }, [worker]);

    const ctx2d = useCallback(
        () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null,
        []
    );

    // =================================================================
    // DETECCIÓN
    // =================================================================

    /** Coloca el vídeo en un instante y devuelve ese fotograma en píxeles. */
    const grabFrame = useCallback((time: number): Promise<ImageData | null> => {
        return new Promise(resolve => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return resolve(null);

            const draw = () => {
                const ctx = ctx2d();
                if (!ctx) return resolve(null);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
            };

            const target = Math.max(0, Math.min(time, (video.duration || 1) - 0.05));

            // Si ya está en ese punto no habrá evento `seeked` y la promesa se
            // quedaría colgada para siempre, con la interfaz en "Buscando…".
            if (Math.abs(video.currentTime - target) < 0.02) return draw();

            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                clearTimeout(timer);
                draw();
            };
            // Y si el vídeo no puede posicionarse (códec raro, fichero corto),
            // se sigue adelante con lo que haya pintado en vez de bloquearse.
            const timer = setTimeout(() => {
                video.removeEventListener('seeked', onSeeked);
                draw();
            }, 1500);

            video.addEventListener('seeked', onSeeked);
            video.currentTime = target;
        });
    }, [ctx2d]);

    const detectOn = useCallback(
        (img: ImageData, hint: { x: number; y: number } | null): Promise<PlateDetection> => {
            return new Promise(resolve => {
                const canvas = canvasRef.current;
                if (!worker || !canvas) return resolve({ ellipse: null, score: 0, method: null });
                sendDetectPlate(worker, img.data.buffer, canvas.width, canvas.height, hint, resolve);
            });
        },
        [worker]
    );

    /**
     * Buscar el disco solo, en varios fotogramas.
     *
     * En varios y no en uno porque el primero puede pillar al atleta tapando
     * el disco o la barra en movimiento, y un solo intento fallido mandaría al
     * usuario al modo manual sin necesidad. Se corta en cuanto uno sale bien.
     */
    const autoDetect = useCallback(async () => {
        setState('detecting');
        setWasHinted(false);
        const video = videoRef.current;
        let best: PlateDetection = { ellipse: null, score: 0, method: null };

        for (const t of DETECT_AT_SECONDS(video?.duration ?? 0)) {
            const img = await grabFrame(t);
            if (!img) continue;
            const found = await detectOn(img, null);
            if (found.ellipse && found.score > best.score) best = found;
            if (best.score >= GOOD_ENOUGH_SCORE) break;
        }

        if (best.ellipse) {
            setDetection(best);
            setState('confirm');
        } else {
            // Ni rastro. Se pide ayuda en vez de inventar un tamaño.
            setState('tap');
        }
    }, [grabFrame, detectOn]);

    const handleVideoLoad = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setVideoReady(true);
    };

    /**
     * Detectar cuando estén listas LAS DOS COSAS: el vídeo y OpenCV.
     *
     * Es una carrera real y no un caso raro: el vídeo es un fichero local y se
     * abre al instante, mientras que el motor de visión son 670 KB que hay que
     * descargar y compilar. Lanzar la detección al cargar el vídeo hacía que,
     * en el primer análisis de la sesión, el worker no existiera todavía, los
     * tres intentos devolvieran vacío y el usuario acabara en el aro manual
     * —con la penalización de fiabilidad correspondiente— por un problema de
     * tiempos que no tiene nada que ver con su vídeo.
     */
    useEffect(() => {
        if (!videoReady || !cvReady || detectionStarted.current) return;
        detectionStarted.current = true;
        void autoDetect();
    }, [videoReady, cvReady, autoDetect]);

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

    /** Fija la marca de seguimiento en un punto y prepara el flujo óptico. */
    const armTracker = useCallback((x: number, y: number) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = ctx2d();
        if (!canvas || !video || !ctx || !worker) return;
        setAnchorPoint({ x, y });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sendInitTracker(worker, x, y, img.data.buffer, canvas.width, canvas.height, (sx, sy) => {
            if (sx !== undefined && sy !== undefined) setAnchorPoint({ x: sx, y: sy });
            setState('ready');
        });
    }, [ctx2d, worker]);

    const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        const p = canvasPoint(e);
        const canvas = canvasRef.current;
        if (!p || !canvas) return;

        if (state === 'tap') {
            // Segundo escalón: buscar el disco DONDE lo han señalado. Con la
            // pista, la detección deja de competir con todo lo redondo del
            // gimnasio y solo tiene que decidir dónde está el borde.
            setState('detecting');
            const ctx = ctx2d();
            const video = videoRef.current;
            if (!ctx || !video) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = await detectOn(img, p);

            if (found.ellipse) {
                setWasHinted(true);
                setDetection(found);
                setState('confirm');
            } else {
                // Tercer escalón. El radio de partida sigue siendo una
                // suposición, pero ahora se dice y se puede ajustar viendo el
                // número que produce.
                setRing({ x: p.x, y: p.y, r: Math.round(canvas.height * 0.1) });
                setState('ring');
            }
            return;
        }

        if (state === 'ring') {
            setRing(prev => (prev ? { ...prev, x: p.x, y: p.y } : { x: p.x, y: p.y, r: Math.round(canvas.height * 0.1) }));
            return;
        }

        if (state === 'select_point') {
            armTracker(p.x, p.y);
        }
    };

    // =================================================================
    // SEGUIMIENTO
    // =================================================================

    const startTracking = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!cvReady || !video || !canvas || !anchorPoint || !worker) return;

        setState('tracking');
        setPath([{ x: anchorPoint.x, y: anchorPoint.y, timestamp: 0 }]);
        cvContext.current.lastX = anchorPoint.x;
        cvContext.current.lastY = anchorPoint.y;
        stats.current = { framesProcessed: 0, framesLost: 0, maxJumpPx: 0 };

        let lastTime = video.currentTime;

        const processFrame = () => {
            if (video.paused || video.ended) { setState('done'); return; }
            if (video.currentTime === lastTime) { requestAnimationFrame(processFrame); return; }

            const dt = video.currentTime - lastTime;
            lastTime = video.currentTime;

            const ctx = ctx2d();
            if (!ctx) { requestAnimationFrame(processFrame); return; }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            sendProcessFrame(worker, imgData.data.buffer, canvas.width, canvas.height,
                cvContext.current.lastX, cvContext.current.lastY,
                (status, newX, newY) => {
                    stats.current.framesProcessed++;

                    if (status === 1) {
                        const oldX = cvContext.current.lastX;
                        const oldY = cvContext.current.lastY;

                        // El salto se normaliza a 30 Hz. Sin normalizar, un
                        // fotograma que tarda el triple en procesarse produce
                        // un desplazamiento triple y parecería un fallo del
                        // seguimiento cuando solo es que el móvil va justo.
                        const jump = Math.hypot(newX - oldX, newY - oldY);
                        const normalised = dt > 0 ? jump * (1 / 30) / dt : jump;
                        if (normalised > stats.current.maxJumpPx) stats.current.maxJumpPx = normalised;

                        cvContext.current.lastX = newX;
                        cvContext.current.lastY = newY;
                        setPath(prev => [...prev, { x: newX, y: newY, timestamp: video.currentTime * 1000 }]);

                        ctx.beginPath(); ctx.moveTo(oldX, oldY); ctx.lineTo(newX, newY);
                        ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 6;
                        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
                        ctx.beginPath(); ctx.arc(newX, newY, 4, 0, 2 * Math.PI);
                        ctx.fillStyle = '#dc2626'; ctx.fill();
                    } else {
                        stats.current.framesLost++;
                    }
                    requestAnimationFrame(processFrame);
                }
            );
        };

        void video.play();
        processFrame();
    };

    /** Lo que se entrega al panel de métricas junto con el recorrido. */
    const buildStats = (): TrackingStats => {
        const first = path[0]?.timestamp ?? 0;
        const last = path[path.length - 1]?.timestamp ?? 0;
        return {
            framesProcessed: stats.current.framesProcessed,
            framesLost: stats.current.framesLost,
            maxJumpPx: stats.current.maxJumpPx,
            durationS: Math.max(0, (last - first) / 1000),
            frameHeightPx: canvasRef.current?.height ?? 0,
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

        // La línea vertical que de verdad fija la escala. Se dibuja porque es
        // lo que hay que mirar para decidir si el ajuste es bueno: si esa
        // línea no va de borde a borde del disco, la medición está mal.
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
        if (!video || !canvas || state === 'tracking') return;

        const drawFrame = () => {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (!isResultMode && (state === 'confirm' || state === 'select_point') && detection?.ellipse) {
                drawEllipse(ctx, detection.ellipse, '#00ffaa');
            }

            if (!isResultMode && (state === 'ring' || state === 'select_point') && ring) {
                drawEllipse(ctx, { cx: ring.x, cy: ring.y, width: ring.r * 2, height: ring.r * 2, angleDeg: 0 }, '#fbbf24');
            }

            if (anchorPoint && state !== 'done') {
                ctx.beginPath();
                ctx.arc(anchorPoint.x, anchorPoint.y, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#dc2626'; ctx.fill();
            }

            if (path.length > 1) {
                ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
                for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
                ctx.strokeStyle = '#22c55e'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.lineWidth = 6; ctx.stroke();
            }

            if (state === 'done' && path.length > 0) {
                const targetTime = video.currentTime * 1000;
                let closestPoint = path[0]; let minDiff = Infinity;
                for (const p of path) {
                    const diff = Math.abs(p.timestamp - targetTime);
                    if (diff < minDiff) { minDiff = diff; closestPoint = p; }
                    if (diff > minDiff) break;
                }
                ctx.beginPath(); ctx.arc(closestPoint.x, closestPoint.y, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#dc2626'; ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
                if (onTimeUpdate) onTimeUpdate(video.currentTime);
            }
        };

        video.addEventListener('seeked', drawFrame);
        video.addEventListener('timeupdate', drawFrame);
        drawFrame();
        return () => {
            video.removeEventListener('seeked', drawFrame);
            video.removeEventListener('timeupdate', drawFrame);
        };
    }, [state, anchorPoint, ring, detection, path, onTimeUpdate, isResultMode]);

    useEffect(() => {
        if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
            if (Math.abs(videoRef.current.currentTime - seekTime) > 0.015) {
                videoRef.current.currentTime = seekTime;
            }
        }
    }, [seekTime]);

    // =================================================================
    // ACCIONES
    // =================================================================

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setVideoUrl(URL.createObjectURL(file));
        detectionStarted.current = false;
        setVideoReady(false);
        setDetection(null);
        setWasHinted(false);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        setState('loading_video');
    };

    const restartCalibration = () => {
        setDetection(null);
        setWasHinted(false);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        setState('tap');
    };

    const retryAutoDetect = () => {
        setDetection(null);
        setRing(null);
        setAnchorPoint(null);
        setPath([]);
        void autoDetect();
    };

    const nudgeRing = (delta: number) => {
        setRing(prev => (prev ? { ...prev, r: Math.max(12, prev.r + delta) } : prev));
    };

    /** Aceptar la escala y dejar la marca lista sobre el centro del disco. */
    const acceptCalibration = () => {
        const centre = detection?.ellipse
            ? { x: detection.ellipse.cx, y: detection.ellipse.cy }
            : ring
                ? { x: ring.x, y: ring.y }
                : null;
        if (!centre) return;
        armTracker(centre.x, centre.y);
    };

    // =================================================================
    // INTERFAZ
    // =================================================================

    const ratioLabel = calibration && calibration.pixelToMeterRatio > 0
        ? `${(calibration.pixelToMeterRatio * 1000).toFixed(2)} mm/px`
        : '—';

    const angle = detection?.ellipse ? obliquityDeg(detection.ellipse) : null;

    return (
        <div className={`flex flex-col gap-3 ${isResultMode ? 'h-full' : ''}`}>

            {!cvReady && !cvError && (
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

            {!isResultMode && state !== 'upload' && (
                <div className="flex flex-col gap-2.5 rounded-card border border-subtle bg-surface-raised p-3">

                    {/* Qué toca hacer ahora. Una línea, sin adornos. */}
                    <div className="flex min-w-0 items-center gap-2">
                        {state === 'loading_video' && <><Loader size={16} className="shrink-0 animate-spin text-info" /><span className="truncate text-t-xs font-semibold text-ink">Cargando el vídeo…</span></>}
                        {state === 'detecting' && <><ScanSearch size={16} className="shrink-0 animate-pulse text-info" /><span className="truncate text-t-xs font-semibold text-ink">Buscando el disco…</span></>}
                        {state === 'confirm' && <><Check size={16} className="shrink-0 text-success" /><span className="truncate text-t-xs font-semibold text-ink">Disco encontrado. ¿El contorno encaja?</span></>}
                        {state === 'tap' && <><Crosshair size={16} className="shrink-0 text-warning" /><span className="truncate text-t-xs font-semibold text-ink">No lo encuentro: toca el disco</span></>}
                        {state === 'ring' && <><Target size={16} className="shrink-0 text-warning" /><span className="truncate text-t-xs font-semibold text-ink">Ajusta el aro al borde del disco</span></>}
                        {state === 'select_point' && <><Target size={16} className="shrink-0 text-brand" /><span className="truncate text-t-xs font-semibold text-ink">Toca el centro de la barra</span></>}
                        {state === 'ready' && <><Play size={16} className="shrink-0 text-success" /><span className="truncate text-t-xs font-semibold text-ink">Listo para analizar</span></>}
                        {state === 'done' && <><Check size={16} className="shrink-0 text-success" /><span className="truncate text-t-xs font-semibold text-ink">Análisis terminado</span></>}
                    </div>

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
                                onClick={startTracking}
                                className="flex flex-1 items-center justify-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-ink transition-transform duration-fast active:scale-95"
                            >
                                <Play size={14} /> Iniciar análisis
                            </button>
                            <button
                                onClick={() => setState('select_point')}
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                Otro punto
                            </button>
                            <button
                                onClick={restartCalibration}
                                aria-label="Reiniciar la calibración"
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                ↺
                            </button>
                        </div>
                    )}

                    {state === 'tracking' && (
                        <div className="flex items-center gap-2">
                            <RefreshCw size={16} className="shrink-0 animate-spin text-brand" />
                            <span className="text-t-xs font-semibold text-ink">Analizando… mantén la pantalla encendida</span>
                        </div>
                    )}

                    {state === 'done' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => calibration && onTrackingComplete(path, calibration, buildStats())}
                                disabled={!calibration}
                                className="flex-1 rounded-field bg-success px-5 py-2.5 text-t-2xs font-bold uppercase tracking-wide text-ink-inverse transition-transform duration-fast active:scale-95 disabled:opacity-40"
                            >
                                Ver resultados
                            </button>
                            <button
                                onClick={restartCalibration}
                                aria-label="Volver a calibrar"
                                className="rounded-field bg-surface-overlay px-3 py-2.5 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:text-ink"
                            >
                                ↺
                            </button>
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
                    <input id="video-upload" type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleFileUpload} />
                </div>
            ) : (
                <div className={`relative flex items-center justify-center bg-black ${isResultMode ? 'h-full w-full flex-1 overflow-hidden rounded-sheet border border-subtle' : 'aspect-video max-h-[55vh] overflow-hidden rounded-sheet border border-subtle md:max-h-[70vh]'}`}>
                    <video ref={videoRef} src={videoUrl || undefined} className="hidden" muted playsInline preload="auto" onLoadedMetadata={handleVideoLoad} />
                    <canvas
                        ref={canvasRef}
                        className={`max-h-full max-w-full object-contain ${state === 'tap' || state === 'ring' || state === 'select_point' ? 'cursor-crosshair' : ''}`}
                        onClick={handleCanvasClick}
                    />
                    {state !== 'tracking' && (
                        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-pill border border-subtle bg-black/80 px-3 py-1.5 text-t-2xs font-semibold text-white backdrop-blur md:bottom-4">
                            <button className="p-1" onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 0.1; }}>-0.1s</button>
                            <button className="p-1" onClick={() => { if (videoRef.current) { if (videoRef.current.paused) void videoRef.current.play(); else videoRef.current.pause(); } }}><Play size={14} /></button>
                            <button className="p-1" onClick={() => { if (videoRef.current) videoRef.current.currentTime += 0.1; }}>+0.1s</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
