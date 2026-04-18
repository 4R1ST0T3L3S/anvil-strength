import { useRef, useState, useEffect } from 'react';
import { useOpenCV, TrackingPoint, sendInitTracker, sendProcessFrame, sendAutoCalibrate, sendAssistCalibrate } from '../../../../lib/cv/tracker';
import { Play, Ruler, Target, RefreshCw, Upload, Loader } from 'lucide-react';

interface VideoTrackerProps {
  onTrackingComplete: (path: TrackingPoint[], pixelToMeterRatio: number) => void;
  seekTime?: number;
  isResultMode?: boolean;
  onTimeUpdate?: (time: number) => void;
}

type TrackerState = 'upload' | 'auto_detecting' | 'assist_detect' | 'confirm_plate' | 'calibrate' | 'select_point' | 'ready' | 'tracking' | 'done';

export function VideoTracker({ onTrackingComplete, seekTime, isResultMode, onTimeUpdate }: VideoTrackerProps) {
  const { cvReady, cvError, worker } = useOpenCV();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [state, setState] = useState<TrackerState>('upload');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // Calibration
  const [calibrationPoints, setCalibrationPoints] = useState<{x: number, y: number}[]>([]);
  const [pixelToMeterRatio, setPixelToMeterRatio] = useState<number>(0);
  const STANDARD_PLATE_METERS = 0.45; // 45 cm
  const [autoCircle, setAutoCircle] = useState<{x: number, y: number, r: number} | null>(null);
  
  // Tracking
  const [anchorPoint, setAnchorPoint] = useState<{x: number, y: number} | null>(null);
  const [path, setPath] = useState<TrackingPoint[]>([]);
  
  // OpenCV objects
  const cvContext = useRef<any>({});

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (worker) {
         worker.postMessage({ type: 'CLEANUP' });
      }
    };
  }, [worker]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setState('auto_detecting');
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale factors if canvas CSS size differs from intrinsic size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (state === 'assist_detect') {
       if (cvReady && videoRef.current && worker) {
          const video = videoRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          setState('auto_detecting'); // Muestra loader
          // Forzamos dibujo de frame original
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          sendAssistCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, x, y, (circle) => {
              if (circle) {
                  setAutoCircle(circle);
                  setState('confirm_plate');
              } else {
                  // Si con ayuda sigue fallando, al modo ultra-manual
                  setState('calibrate');
              }
          });
       }
       return;
    } else if (state === 'calibrate') {
      const newPoints = [...calibrationPoints, { x, y }];
      setCalibrationPoints(newPoints);
      if (newPoints.length === 2) {
        const dx = newPoints[1].x - newPoints[0].x;
        const dy = newPoints[1].y - newPoints[0].y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        setPixelToMeterRatio(STANDARD_PLATE_METERS / distPx);
        setState('select_point');
      }
    } else if (state === 'select_point') {
      setAnchorPoint({ x, y });
      
      // Init OpenCV tracking matrices on the worker
      if (cvReady && videoRef.current && worker) {
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Pass ownership of the buffer to the worker
        sendInitTracker(worker, x, y, imgData.data.buffer, canvas.width, canvas.height, (sx, sy) => {
           if (sx !== undefined && sy !== undefined) {
               setAnchorPoint({x: sx, y: sy});
           }
           setState('ready');
        });
      }
    }
  };

  const startTracking = () => {
    if (!cvReady || !videoRef.current || !canvasRef.current || !anchorPoint || !worker) return;
    
    setState('tracking');
    setPath([{ x: anchorPoint.x, y: anchorPoint.y, timestamp: 0 }]); // initial node
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    cvContext.current.lastX = anchorPoint.x;
    cvContext.current.lastY = anchorPoint.y;

    let lastTime = video.currentTime;
    
    const processFrame = () => {
      if (video.paused || video.ended) {
        // tracking complete
        setState('done');
        return;
      }
      
      // Ensure time advanced slightly (prevent freezing tracking loop)
      if (video.currentTime === lastTime) {
         requestAnimationFrame(processFrame);
         return;
      }
      lastTime = video.currentTime;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw video frame to track
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Asynchronously process via Web Worker instead of blocking thread!
        sendProcessFrame(
            worker, 
            imgData.data.buffer, 
            canvas.width, 
            canvas.height, 
            cvContext.current.lastX, 
            cvContext.current.lastY, 
            (status, newX, newY) => {
                if (status === 1) { // 1 means found
                    const oldX = cvContext.current.lastX;
                    const oldY = cvContext.current.lastY;
                    
                    cvContext.current.lastX = newX;
                    cvContext.current.lastY = newY;
                    
                    setPath(prev => {
                       const updated = [...prev, { x: newX, y: newY, timestamp: video.currentTime * 1000 }];
                       return updated;
                    });
                    
                    // Trace the barpath in realtime
                    ctx.beginPath();
                    ctx.moveTo(oldX, oldY);
                    ctx.lineTo(newX, newY);
                    ctx.strokeStyle = '#22c55e'; // Green barpath
                    ctx.lineWidth = 6;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.stroke();
                    
                    // Draw the tracking point
                    ctx.beginPath();
                    ctx.arc(newX, newY, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = '#dc2626'; // anvil-red
                    ctx.fill();
                }
                
                requestAnimationFrame(processFrame);
            }
        );
      } else {
        requestAnimationFrame(processFrame);
      }
    };

    video.play();
    processFrame();
  };

  const handleVideoLoad = () => {
     const video = videoRef.current;
     const canvas = canvasRef.current;
     if (video && canvas && worker) {
        // Avanzamos ligeramente el video (0.1s) porque el frame 0.0 en muchos móviles/Edge está en negro
        // o es un keyframe vacío, lo que causa Canvas negro -> IA ciega -> 0 discos encontrados -> Modo manual.
        video.currentTime = 0.1;
        video.onseeked = () => {
             // Match canvas logical size to video intrinsic resolution
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
             
             const ctx = canvas.getContext('2d');
             if (ctx) {
                // Dibujar forzadamente el fotograma en pantalla
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                if (state === 'auto_detecting') {
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    sendAutoCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, (circle) => {
                        if (circle) {
                            setAutoCircle(circle);
                            setState('confirm_plate');
                        } else {
                            // IA no encontró disco en automático global, pedimos Ayuda Inteligente
                            setState('assist_detect');
                        }
                    });
                }
             }
         };
     }
  };
  
  // Escuchar eventos del video (seeked, timeupdate) para repintar el canvas en modo estático
  useEffect(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || state === 'tracking') return;

      const drawFrame = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             
          // Draw Calibration
          if (calibrationPoints.length > 0) {
              ctx.beginPath();
              ctx.arc(calibrationPoints[0].x, calibrationPoints[0].y, 4, 0, 2*Math.PI);
              ctx.fillStyle = 'blue';
              ctx.fill();
              if (calibrationPoints.length === 2) {
                  ctx.arc(calibrationPoints[1].x, calibrationPoints[1].y, 4, 0, 2*Math.PI);
                  ctx.fill();
                  ctx.beginPath();
                  ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
                  ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
                  ctx.strokeStyle = 'blue';
                  ctx.lineWidth = 2;
                  ctx.stroke();
              }
          }

          // Draw Auto-Detected Plate
          if (!isResultMode && state === 'confirm_plate' && autoCircle) {
              ctx.beginPath();
              ctx.arc(autoCircle.x, autoCircle.y, autoCircle.r, 0, 2*Math.PI);
              ctx.strokeStyle = '#00ffaa'; // Neon green
              ctx.lineWidth = 4;
              ctx.stroke();
                 
              ctx.beginPath();
              ctx.arc(autoCircle.x, autoCircle.y, 6, 0, 2*Math.PI);
              ctx.fillStyle = '#00ffaa';
              ctx.fill();
          }

          // Draw Anchor
          if (anchorPoint && state !== 'done') {
              ctx.beginPath();
              ctx.arc(anchorPoint.x, anchorPoint.y, 6, 0, 2*Math.PI);
              ctx.fillStyle = '#dc2626';
              ctx.fill();
          }
             
          // Draw Path (Bar Path)
          if (path.length > 1) {
              ctx.beginPath();
              ctx.moveTo(path[0].x, path[0].y);
              for (let i = 1; i < path.length; i++) {
                  ctx.lineTo(path[i].x, path[i].y);
              }
              ctx.strokeStyle = '#22c55e'; // Green barpath
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = 6;
              ctx.stroke();
          }

          // Si estamos en resultados o playback, pintar el punto rojo en el momento exacto
          if (state === 'done' && path.length > 0) {
              const targetTime = video.currentTime * 1000;
              let closestPoint = path[0];
              let minDiff = Infinity;
              for (const p of path) {
                  const diff = Math.abs(p.timestamp - targetTime);
                  if (diff < minDiff) {
                      minDiff = diff;
                      closestPoint = p;
                  }
                  if (diff > minDiff) break; // Optimization, assuming sequential timestamps
              }
              
              if (closestPoint) {
                  ctx.beginPath();
                  ctx.arc(closestPoint.x, closestPoint.y, 8, 0, 2*Math.PI);
                  ctx.fillStyle = '#dc2626';
                  ctx.fill();
                  ctx.strokeStyle = 'white';
                  ctx.lineWidth = 2;
                  ctx.stroke();
              }
              
              if (onTimeUpdate) {
                  onTimeUpdate(video.currentTime);
              }
          }
      };

      video.addEventListener('seeked', drawFrame);
      video.addEventListener('timeupdate', drawFrame);
      
      // Dibujado inicial
      drawFrame();

      return () => {
          video.removeEventListener('seeked', drawFrame);
          video.removeEventListener('timeupdate', drawFrame);
      };
  }, [state, anchorPoint, calibrationPoints, path, autoCircle, onTimeUpdate, isResultMode]);

  // Sincronizar el video con el dashboard de métricas exterior
  useEffect(() => {
      if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
          // Previene loops infinitos si el ratón solicita moverse a donde el vídeo ya está (tolerancia 15ms)
          if (Math.abs(videoRef.current.currentTime - seekTime) > 0.015) {
              videoRef.current.currentTime = seekTime;
          }
      }
  }, [seekTime]);

  return (
    <div className={`flex flex-col gap-4 ${isResultMode ? 'h-full' : ''}`}>
      
      {!cvReady && !cvError && (
        <div className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 p-4 rounded-xl flex items-center gap-3">
            <Loader className="animate-spin" size={20} />
            <span className="text-sm font-bold">Cargando motor de IA (OpenCV.js)... (Puede tardar unos segundos la primera vez)</span>
        </div>
      )}

      {cvError && (
        <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
            <span className="text-sm font-bold">Error: {cvError}</span>
            <button onClick={() => window.location.reload()} className="ml-auto text-xs font-bold underline">Reintentar</button>
        </div>
      )}

      {/* Toolbar Status - Lo ocultamos en modo resultado */}
      {!isResultMode && (
          <div className="bg-[#252525] border border-white/5 p-4 rounded-xl flex items-center justify-between">
             <div className="flex items-center gap-3">
                 {state === 'upload' && <><Upload size={20} className="text-gray-400" /><span className="text-sm font-bold text-white">Sube un vídeo frontal/lateral</span></>}
                 {state === 'auto_detecting' && <><RefreshCw size={20} className="text-blue-500 animate-spin" /><span className="text-sm font-bold text-white">IA: Analizando entorno e iluminando discos...</span></>}
                 {state === 'assist_detect' && <><Target size={20} className="text-[#00ffaa]" /><span className="text-sm font-bold text-white">1 Click Inteligente: Haz click sobre el disco de 25kg</span></>}
                 {state === 'confirm_plate' && <><Target size={20} className="text-[#00ffaa]" /><span className="text-sm font-bold text-white">¡Disco detectado! Ajusta el anillo si es necesario.</span></>}
                 {state === 'calibrate' && <><Ruler size={20} className="text-blue-500" /><span className="text-sm font-bold text-white">1. Haz 2 clicks extremosos en los bordes del disco (45cm) para calibrar</span></>}
                 {state === 'select_point' && <><Target size={20} className="text-orange-500" /><span className="text-sm font-bold text-white">2. Haz click en el centro de la barra</span></>}
                 {state === 'ready' && <><Play size={20} className="text-green-500" /><span className="text-sm font-bold text-white">IA lista para analizar repetición.</span></>}
                 {state === 'tracking' && <><RefreshCw size={20} className="text-anvil-red animate-spin" /><span className="text-sm font-bold text-white">Analizando el levantamiento...</span></>}
                 {state === 'done' && <><Target size={20} className="text-green-500" /><span className="text-sm font-bold text-white">Procesamiento completado.</span></>}
             </div>
    
             <div className="flex gap-2">
                {state === 'confirm_plate' && (
                    <>
                        <button onClick={() => {
                            // Confirm calibration and auto-snap to the bar!
                            if (autoCircle) {
                                setPixelToMeterRatio(STANDARD_PLATE_METERS / (autoCircle.r * 2));
                                setAnchorPoint({x: autoCircle.x, y: autoCircle.y});
                                
                                if (videoRef.current && canvasRef.current && worker) {
                                    const video = videoRef.current;
                                    const canvas = canvasRef.current;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                      sendInitTracker(worker, autoCircle.x, autoCircle.y, imgData.data.buffer, canvas.width, canvas.height, (sx, sy) => {
                                          if (sx !== undefined && sy !== undefined) {
                                              setAnchorPoint({x: sx, y: sy}); // Mover UI pto rojo al ancla magnetizada
                                          }
                                          setState('ready');
                                      });
                                    }
                                }
                            }
                        }} className="bg-[#00ffaa] text-black font-black uppercase text-xs px-4 py-2 rounded flex items-center gap-2 hover:bg-[#00cc88] transition-colors shadow-[0_0_15px_rgba(0,255,170,0.4)]">
                            👍🏽 SÍ, ES CORRECTO
                        </button>
                        <div className="flex bg-white/5 rounded mx-2 overflow-hidden">
                            <button onClick={() => setAutoCircle(prev => prev ? {...prev, r: prev.r + 2.5} : prev)} className="px-3 py-2 hover:bg-white/10 text-white font-extrabold" title="Expandir Anillo">+</button>
                            <button onClick={() => setAutoCircle(prev => prev ? {...prev, r: Math.max(5, prev.r - 2.5)} : prev)} className="px-3 py-2 hover:bg-white/10 text-white font-extrabold" title="Encoger Anillo">-</button>
                        </div>
                        <button onClick={() => {
                            setAutoCircle(null);
                            setState('calibrate');
                        }} className="bg-white/10 text-white font-bold text-xs px-4 py-2 rounded hover:bg-white/20 transition-colors">
                            Calibrar manual
                        </button>
                    </>
                )}
                {state === 'ready' && (
                    <button onClick={startTracking} className="bg-anvil-red text-black font-black uppercase text-xs px-4 py-2 rounded flex items-center gap-2 hover:bg-red-600 transition-colors">
                        <Play size={14} /> Iniciar
                    </button>
                )}
                {state === 'done' && (
                    <button onClick={() => onTrackingComplete(path, pixelToMeterRatio)} className="bg-green-500 text-black font-black uppercase text-xs px-4 py-2 rounded flex items-center gap-2 hover:bg-green-600 transition-colors">
                        Ver Resultados Gráficos
                    </button>
                )}
                {(state === 'calibrate' || state === 'select_point' || state === 'ready' || state === 'done') && (
                    <button onClick={() => {
                        setState('calibrate');
                        setCalibrationPoints([]);
                        setAnchorPoint(null);
                        setPath([]);
                    }} className="bg-white/10 text-white font-bold text-xs px-4 py-2 rounded hover:bg-white/20 transition-colors">
                        Reiniciar
                    </button>
                )}
             </div>
          </div>
      )}

      {state === 'upload' ? (
         <div className="border-2 border-dashed border-white/10 hover:border-anvil-red/50 transition-colors rounded-2xl p-16 flex flex-col items-center justify-center text-center relative cursor-pointer" onClick={() => document.getElementById('video-upload')?.click()}>
             <Upload size={48} className="text-gray-500 mb-4" />
             <h3 className="text-xl font-bold text-white mb-2">Selecciona un vídeo (.mp4)</h3>
             <p className="text-gray-400 text-sm">Procesamiento seguro directo en tu navegador.</p>
             <input id="video-upload" type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleFileUpload} />
         </div>
      ) : (
         <div className={`relative bg-black flex items-center justify-center ${isResultMode ? 'flex-1 h-full w-full rounded-2xl border border-white/10 overflow-hidden' : 'rounded-2xl border border-white/10 aspect-video max-h-[70vh] overflow-hidden'}`}>
             {/* Hidden native video element used as source */}
             <video 
                ref={videoRef} 
                src={videoUrl || undefined}
                className="hidden" 
                muted 
                playsInline
                preload="auto"
                onLoadedMetadata={handleVideoLoad}
             />
             
             {/* Canvas used for display and interaction */}
             <canvas 
                ref={canvasRef} 
                className={`max-w-full max-h-full object-contain ${state !== 'tracking' && state !== 'done' ? 'cursor-crosshair' : ''}`}
                onClick={handleCanvasClick}
             />
             
             {/* Video Controls (custom basic) - Mostrar siempre excepto trazando, así podemos verlo en resutlados */}
             {state !== 'tracking' && (
                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur border border-white/10 rounded-full px-4 py-2 flex items-center gap-4">
                     <button onClick={() => { if(videoRef.current) videoRef.current.currentTime -= 0.1; }}>-0.1s</button>
                     <button onClick={() => { 
                         if(videoRef.current) {
                             if(videoRef.current.paused) videoRef.current.play();
                             else videoRef.current.pause();
                         }
                     }}>
                         <Play size={16} />
                     </button>
                     <button onClick={() => { if(videoRef.current) videoRef.current.currentTime += 0.1; }}>+0.1s</button>
                 </div>
             )}
         </div>
      )}
    </div>
  );
}
