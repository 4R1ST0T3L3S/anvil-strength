import { useRef, useState, useEffect, useCallback } from 'react';
import { useOpenCV, TrackingPoint, sendInitTracker, sendProcessFrame, sendAssistCalibrate } from '../../../../lib/cv/tracker';
import { Play, Target, RefreshCw, Upload, Loader, MousePointerClick } from 'lucide-react';

interface VideoTrackerProps {
  onTrackingComplete: (path: TrackingPoint[], pixelToMeterRatio: number) => void;
  seekTime?: number;
  isResultMode?: boolean;
  onTimeUpdate?: (time: number) => void;
}

// States simplificados: sin auto_detecting
type TrackerState = 'upload' | 'click_disc' | 'processing_click' | 'confirm_plate' | 'calibrate' | 'select_point' | 'ready' | 'tracking' | 'done';

const STANDARD_PLATE_METERS = 0.45; // 45 cm diámetro disco olímpico

export function VideoTracker({ onTrackingComplete, seekTime, isResultMode, onTimeUpdate }: VideoTrackerProps) {
  const { cvReady, cvError, worker } = useOpenCV();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [state, setState] = useState<TrackerState>('upload');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // Calibration
  const [calibrationPoints, setCalibrationPoints] = useState<{x: number, y: number}[]>([]);
  const [pixelToMeterRatio, setPixelToMeterRatio] = useState<number>(0);
  const [autoCircle, setAutoCircle] = useState<{x: number, y: number, r: number} | null>(null);
  
  // Tracking
  const [anchorPoint, setAnchorPoint] = useState<{x: number, y: number} | null>(null);
  const [path, setPath] = useState<TrackingPoint[]>([]);
  
  const cvContext = useRef<any>({});

  useEffect(() => {
    return () => {
      if (worker) worker.postMessage({ type: 'CLEANUP' });
    };
  }, [worker]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      // Iremos a click_disc una vez que el vídeo esté listo (en handleVideoLoad)
    }
  };

  // Cuando los metadatos del vídeo están listos: dibujamos el frame y pedimos el click
  const handleVideoLoad = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Ajustamos el canvas al tamaño del vídeo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Ir a frame 0.5s para evitar frames negros de keyframe
    video.currentTime = 0.5;
    video.onseeked = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      // Instantáneo: pedimos el click del usuario
      setState('click_disc');
    };
  }, []);

  // Coordenadas del click en el canvas (ajustadas a escala intrínseca)  
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current;

    if (state === 'click_disc') {
      // El usuario ha señalado el disco. Procesamos SÓLO la zona alrededor del click.
      if (cvReady && videoRef.current && worker && canvas) {
        setState('processing_click');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        sendAssistCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, x, y, (circle) => {
          if (circle) {
            setAutoCircle(circle);
            setState('confirm_plate');
          } else {
            // Fallback: modo calibración manual si no detectó nada
            setState('calibrate');
          }
        });
      }
      return;
    }

    if (state === 'calibrate') {
      const newPoints = [...calibrationPoints, { x, y }];
      setCalibrationPoints(newPoints);
      if (newPoints.length === 2) {
        const dx = newPoints[1].x - newPoints[0].x;
        const dy = newPoints[1].y - newPoints[0].y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        setPixelToMeterRatio(STANDARD_PLATE_METERS / distPx);
        setState('select_point');
      }
      return;
    }

    if (state === 'select_point') {
      setAnchorPoint({ x, y });
      if (cvReady && videoRef.current && worker && canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sendInitTracker(worker, x, y, imgData.data.buffer, canvas.width, canvas.height, (sx, sy) => {
          if (sx !== undefined && sy !== undefined) setAnchorPoint({ x: sx, y: sy });
          setState('ready');
        });
      }
    }
  };

  const confirmDisc = () => {
    if (!autoCircle || !videoRef.current || !canvasRef.current || !worker) return;
    setPixelToMeterRatio(STANDARD_PLATE_METERS / (autoCircle.r * 2));
    setAnchorPoint({ x: autoCircle.x, y: autoCircle.y });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      sendInitTracker(worker, autoCircle.x, autoCircle.y, imgData.data.buffer, canvas.width, canvas.height, (sx, sy) => {
        if (sx !== undefined && sy !== undefined) setAnchorPoint({ x: sx, y: sy });
        setState('ready');
      });
    }
  };

  const startTracking = () => {
    if (!cvReady || !videoRef.current || !canvasRef.current || !anchorPoint || !worker) return;
    setState('tracking');
    setPath([{ x: anchorPoint.x, y: anchorPoint.y, timestamp: 0 }]);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    cvContext.current.lastX = anchorPoint.x;
    cvContext.current.lastY = anchorPoint.y;
    let lastTime = video.currentTime;

    const processFrame = () => {
      if (video.paused || video.ended) { setState('done'); return; }
      if (video.currentTime === lastTime) { requestAnimationFrame(processFrame); return; }
      lastTime = video.currentTime;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sendProcessFrame(worker, imgData.data.buffer, canvas.width, canvas.height,
          cvContext.current.lastX, cvContext.current.lastY,
          (status, newX, newY) => {
            if (status === 1) {
              const oldX = cvContext.current.lastX;
              const oldY = cvContext.current.lastY;
              cvContext.current.lastX = newX;
              cvContext.current.lastY = newY;
              setPath(prev => [...prev, { x: newX, y: newY, timestamp: video.currentTime * 1000 }]);
              ctx.beginPath(); ctx.moveTo(oldX, oldY); ctx.lineTo(newX, newY);
              ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 6;
              ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
              ctx.beginPath(); ctx.arc(newX, newY, 4, 0, 2 * Math.PI);
              ctx.fillStyle = '#dc2626'; ctx.fill();
            }
            requestAnimationFrame(processFrame);
          }
        );
      } else requestAnimationFrame(processFrame);
    };
    video.play();
    processFrame();
  };

  // Repintado del canvas en estados estáticos (no tracking)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || state === 'tracking') return;

    const drawFrame = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Puntos de calibración manual
      if (calibrationPoints.length > 0) {
        ctx.beginPath(); ctx.arc(calibrationPoints[0].x, calibrationPoints[0].y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#3b82f6'; ctx.fill();
        if (calibrationPoints.length === 2) {
          ctx.beginPath(); ctx.arc(calibrationPoints[1].x, calibrationPoints[1].y, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath(); ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
          ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      // Anillo detectado
      if (!isResultMode && state === 'confirm_plate' && autoCircle) {
        // Outer glow
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(autoCircle.x, autoCircle.y, autoCircle.r, 0, 2 * Math.PI);
        ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(autoCircle.x, autoCircle.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#00ffaa'; ctx.fill();
      }

      // Punto ancla
      if (anchorPoint && state !== 'done') {
        ctx.beginPath(); ctx.arc(anchorPoint.x, anchorPoint.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#dc2626'; ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
      }
      
      // Bar path
      if (path.length > 1) {
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.strokeStyle = '#22c55e'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 6; ctx.stroke();
      }

      // Punto de resultado en playback
      if (state === 'done' && path.length > 0) {
        const targetTime = video.currentTime * 1000;
        let closestPoint = path[0];
        let minDiff = Infinity;
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
  }, [state, anchorPoint, calibrationPoints, path, autoCircle, onTimeUpdate, isResultMode]);

  // Sync seekTime from dashboard
  useEffect(() => {
    if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - seekTime) > 0.015) {
        videoRef.current.currentTime = seekTime;
      }
    }
  }, [seekTime]);

  const resetAll = () => {
    setState('click_disc');
    setCalibrationPoints([]);
    setAnchorPoint(null);
    setPath([]);
    setAutoCircle(null);
    // Redibujar el frame original
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${isResultMode ? 'h-full' : ''}`}>
      
      {/* OpenCV status banners */}
      {!cvReady && !cvError && (
        <div className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 p-4 rounded-xl flex items-center gap-3">
          <Loader className="animate-spin shrink-0" size={20} />
          <span className="text-sm font-bold">Cargando motor IA (primera vez puede tardar unos segundos)...</span>
        </div>
      )}
      {cvError && (
        <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
          <span className="text-sm font-bold">Error: {cvError}</span>
          <button onClick={() => window.location.reload()} className="ml-auto text-xs font-bold underline">Reintentar</button>
        </div>
      )}

      {/* Status bar */}
      {!isResultMode && (
        <div className="bg-[#252525] border border-white/5 p-3 md:p-4 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {state === 'upload' && <><Upload size={20} className="text-gray-400 shrink-0" /><span className="text-sm font-bold text-white truncate">Sube un vídeo frontal o lateral del levantamiento</span></>}
            {state === 'click_disc' && <><MousePointerClick size={20} className="text-[#00ffaa] shrink-0 animate-pulse" /><span className="text-sm font-bold text-white truncate">Haz click sobre el centro del disco más grande visible</span></>}
            {state === 'processing_click' && <><RefreshCw size={20} className="text-blue-500 animate-spin shrink-0" /><span className="text-sm font-bold text-white truncate">Detectando disco...</span></>}
            {state === 'confirm_plate' && <><Target size={20} className="text-[#00ffaa] shrink-0" /><span className="text-sm font-bold text-white truncate">¿Es correcto el anillo verde?</span></>}
            {state === 'calibrate' && <><Target size={20} className="text-blue-500 shrink-0" /><span className="text-sm font-bold text-white truncate">Calibración manual: 2 clicks en los bordes del disco (45cm)</span></>}
            {state === 'select_point' && <><Target size={20} className="text-orange-500 shrink-0" /><span className="text-sm font-bold text-white truncate">Haz click en el centro del disco / barra para anclar el tracker</span></>}
            {state === 'ready' && <><Play size={20} className="text-green-500 shrink-0" /><span className="text-sm font-bold text-white truncate">¡Listo! Pulsa Iniciar para analizar el levantamiento</span></>}
            {state === 'tracking' && <><RefreshCw size={20} className="text-anvil-red animate-spin shrink-0" /><span className="text-sm font-bold text-white truncate">Analizando movimiento...</span></>}
            {state === 'done' && <><Target size={20} className="text-green-500 shrink-0" /><span className="text-sm font-bold text-white truncate">¡Análisis completado!</span></>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Confirm disc button */}
            {state === 'confirm_plate' && (
              <>
                <button onClick={confirmDisc} className="bg-[#00ffaa] text-black font-black uppercase text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-[#00cc88] transition-colors shadow-[0_0_15px_rgba(0,255,170,0.3)]">
                  ✅ Confirmar
                </button>
                <div className="flex bg-white/5 rounded-lg overflow-hidden border border-white/10">
                  <button onClick={() => setAutoCircle(prev => prev ? {...prev, r: prev.r + 3} : prev)} className="px-3 py-2 hover:bg-white/10 text-white font-extrabold text-sm">+</button>
                  <button onClick={() => setAutoCircle(prev => prev ? {...prev, r: Math.max(5, prev.r - 3)} : prev)} className="px-3 py-2 hover:bg-white/10 text-white font-extrabold text-sm border-l border-white/10">-</button>
                </div>
                <button onClick={() => setState('calibrate')} className="bg-white/10 text-white font-bold text-xs px-3 py-2 rounded-lg hover:bg-white/20 transition-colors">
                  Manual
                </button>
              </>
            )}

            {state === 'ready' && (
              <button onClick={startTracking} className="bg-anvil-red text-white font-black uppercase text-xs px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 transition-colors">
                <Play size={14} /> Iniciar
              </button>
            )}

            {state === 'done' && (
              <button onClick={() => onTrackingComplete(path, pixelToMeterRatio)} className="bg-green-500 text-black font-black uppercase text-xs px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-600 transition-colors">
                Ver Resultados
              </button>
            )}

            {(state === 'click_disc' || state === 'calibrate' || state === 'select_point' || state === 'ready' || state === 'done') && (
              <button onClick={resetAll} className="bg-white/10 text-white font-bold text-xs px-3 py-2 rounded-lg hover:bg-white/20 transition-colors">
                ↺
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main view */}
      {state === 'upload' ? (
        <div
          className="border-2 border-dashed border-white/10 hover:border-[#00ffaa]/50 transition-colors rounded-2xl p-16 flex flex-col items-center justify-center text-center cursor-pointer"
          onClick={() => document.getElementById('video-upload')?.click()}
        >
          <Upload size={48} className="text-gray-500 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Selecciona un vídeo (.mp4)</h3>
          <p className="text-gray-400 text-sm">Procesamiento seguro directo en tu navegador. Sin subir nada a servidores.</p>
          <input id="video-upload" type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleFileUpload} />
        </div>
      ) : (
        <div className={`relative bg-black flex items-center justify-center ${isResultMode ? 'flex-1 h-full w-full rounded-2xl border border-white/10 overflow-hidden' : 'rounded-2xl border border-white/10 aspect-video max-h-[70vh] overflow-hidden'}`}>
          <video
            ref={videoRef}
            src={videoUrl || undefined}
            className="hidden"
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={handleVideoLoad}
          />
          <canvas
            ref={canvasRef}
            className={`max-w-full max-h-full object-contain ${['click_disc', 'calibrate', 'select_point'].includes(state) ? 'cursor-crosshair' : ''}`}
            onClick={handleCanvasClick}
          />

          {/* Crosshair overlay hint when waiting for disc click */}
          {state === 'click_disc' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="border-2 border-[#00ffaa]/30 rounded-full w-24 h-24 animate-ping opacity-20" />
            </div>
          )}

          {/* Video scrub controls */}
          {state !== 'tracking' && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 text-white text-sm font-bold">
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 0.1; }}>-0.1s</button>
              <button onClick={() => {
                if (videoRef.current) {
                  if (videoRef.current.paused) videoRef.current.play();
                  else videoRef.current.pause();
                }
              }}>
                <Play size={16} />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 0.1; }}>+0.1s</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
