import { useRef, useState, useEffect } from 'react';
import { useOpenCV, TrackingPoint, sendInitTracker, sendProcessFrame, sendAutoCalibrate, sendAssistCalibrate } from '../../../../lib/cv/tracker';
import { Play, Ruler, Target, RefreshCw, Upload, Loader } from 'lucide-react';

interface VideoTrackerProps {
  onTrackingComplete: (path: TrackingPoint[], pixelToMeterRatio: number) => void;
  seekTime?: number;
  isResultMode?: boolean;
  onTimeUpdate?: (time: number) => void;
}

type TrackerState = 'upload' | 'loading_video' | 'auto_detecting' | 'assist_detect' | 'confirm_plate' | 'calibrate' | 'select_point' | 'ready' | 'tracking' | 'done';

export function VideoTracker({ onTrackingComplete, seekTime, isResultMode, onTimeUpdate }: VideoTrackerProps) {
  const { cvReady, cvError, worker } = useOpenCV();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [state, setState] = useState<TrackerState>('upload');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const [calibrationPoints, setCalibrationPoints] = useState<{x: number, y: number}[]>([]);
  const [pixelToMeterRatio, setPixelToMeterRatio] = useState<number>(0);
  const STANDARD_PLATE_METERS = 0.45;
  const [autoCircle, setAutoCircle] = useState<{x: number, y: number, r: number} | null>(null);
  
  const [anchorPoint, setAnchorPoint] = useState<{x: number, y: number} | null>(null);
  const [path, setPath] = useState<TrackingPoint[]>([]);
  
  const cvContext = useRef<any>({});
  const detectionDone = useRef(false);

  useEffect(() => {
    return () => { if (worker) worker.postMessage({ type: 'CLEANUP' }); };
  }, [worker]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      detectionDone.current = false;
      setState('loading_video');
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (state === 'assist_detect') {
       // INSTANT: Place circle at tap point with default radius (no processing)
       // Default radius = ~10% of video height (typical plate-to-frame ratio)
       const defaultRadius = Math.round(canvas.height * 0.10);
       setAutoCircle({ x, y, r: defaultRadius });
       setState('confirm_plate');
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
      if (cvReady && videoRef.current && worker) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sendInitTracker(worker, x, y, imgData.data.buffer, canvas.width, canvas.height, (sx, sy) => {
           if (sx !== undefined && sy !== undefined) setAnchorPoint({x: sx, y: sy});
           setState('ready');
        });
      }
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

  const handleVideoLoad = () => {
     const video = videoRef.current;
     const canvas = canvasRef.current;
     if (video && canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        video.currentTime = 0.5;
        video.onseeked = () => {
             if (detectionDone.current) return;
             detectionDone.current = true;
             const ctx = canvas.getContext('2d');
             if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                if (cvReady && worker) {
                    setState('auto_detecting');
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    sendAutoCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, (circle) => {
                        if (circle) { setAutoCircle(circle); setState('confirm_plate'); }
                        else setState('assist_detect');
                    });
                } else {
                    setState('auto_detecting');
                }
             }
         };
     }
  };
  
  // Race condition handler: CV loads after video
  useEffect(() => {
      if (cvReady && worker && state === 'auto_detecting' && !autoCircle) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  sendAutoCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, (circle) => {
                      if (circle) { setAutoCircle(circle); setState('confirm_plate'); }
                      else setState('assist_detect');
                  });
              }
          }
      }
  }, [cvReady, worker, state, autoCircle]);

  // Repaint canvas
  useEffect(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || state === 'tracking') return;

      const drawFrame = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             
          if (calibrationPoints.length > 0) {
              ctx.beginPath();
              ctx.arc(calibrationPoints[0].x, calibrationPoints[0].y, 4, 0, 2*Math.PI);
              ctx.fillStyle = 'blue'; ctx.fill();
              if (calibrationPoints.length === 2) {
                  ctx.arc(calibrationPoints[1].x, calibrationPoints[1].y, 4, 0, 2*Math.PI); ctx.fill();
                  ctx.beginPath();
                  ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
                  ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
                  ctx.strokeStyle = 'blue'; ctx.lineWidth = 2; ctx.stroke();
              }
          }

          if (!isResultMode && state === 'confirm_plate' && autoCircle) {
              ctx.beginPath();
              ctx.arc(autoCircle.x, autoCircle.y, autoCircle.r, 0, 2*Math.PI);
              ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 4; ctx.stroke();
              ctx.beginPath();
              ctx.arc(autoCircle.x, autoCircle.y, 6, 0, 2*Math.PI);
              ctx.fillStyle = '#00ffaa'; ctx.fill();
          }

          if (anchorPoint && state !== 'done') {
              ctx.beginPath();
              ctx.arc(anchorPoint.x, anchorPoint.y, 6, 0, 2*Math.PI);
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
              ctx.beginPath(); ctx.arc(closestPoint.x, closestPoint.y, 8, 0, 2*Math.PI);
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

  useEffect(() => {
      if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
          if (Math.abs(videoRef.current.currentTime - seekTime) > 0.015) {
              videoRef.current.currentTime = seekTime;
          }
      }
  }, [seekTime]);

  const triggerReset = () => {
      setState('loading_video');
      setCalibrationPoints([]);
      setAnchorPoint(null);
      setPath([]);
      setAutoCircle(null);
      detectionDone.current = false;
      setTimeout(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  if (cvReady && worker) {
                      setState('auto_detecting');
                      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                      sendAutoCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, (circle) => {
                          if (circle) { setAutoCircle(circle); setState('confirm_plate'); }
                          else setState('assist_detect');
                      });
                  }
              }
          }
      }, 50);
  };

  return (
    <div className={`flex flex-col gap-3 ${isResultMode ? 'h-full' : ''}`}>
      
      {!cvReady && !cvError && (
        <div className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 p-3 rounded-xl flex items-center gap-3">
            <Loader className="animate-spin shrink-0" size={18} />
            <span className="text-xs md:text-sm font-bold">Cargando motor IA (OpenCV.js)...</span>
        </div>
      )}

      {cvError && (
        <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-3 rounded-xl flex items-center gap-3">
            <span className="text-xs md:text-sm font-bold flex-1">Error: {cvError}</span>
            <button onClick={() => window.location.reload()} className="text-xs font-bold underline shrink-0">Reintentar</button>
        </div>
      )}

      {/* Toolbar - stacks vertically, mobile-first */}
      {!isResultMode && (
          <div className="bg-[#252525] border border-white/5 p-3 rounded-xl flex flex-col gap-2.5">
             {/* Status line */}
             <div className="flex items-center gap-2 min-w-0">
                 {state === 'upload' && <><Upload size={18} className="text-gray-400 shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">Sube un vídeo frontal/lateral</span></>}
                 {state === 'loading_video' && <><Loader size={18} className="text-blue-500 animate-spin shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">Cargando vídeo...</span></>}
                 {state === 'auto_detecting' && <><RefreshCw size={18} className="text-blue-500 animate-spin shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">IA: Detectando discos...</span></>}
                 {state === 'assist_detect' && <><Target size={18} className="text-[#00ffaa] shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">Toca sobre el disco grande</span></>}
                 {state === 'confirm_plate' && <><Target size={18} className="text-[#00ffaa] shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">¿Es correcto el anillo verde?</span></>}
                 {state === 'calibrate' && <><Ruler size={18} className="text-blue-500 shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">2 clicks en bordes del disco (45cm)</span></>}
                 {state === 'select_point' && <><Target size={18} className="text-orange-500 shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">Toca el centro de la barra</span></>}
                 {state === 'ready' && <><Play size={18} className="text-green-500 shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">IA lista. Pulsa Iniciar.</span></>}
                 {state === 'tracking' && <><RefreshCw size={18} className="text-anvil-red animate-spin shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">Analizando...</span></>}
                 {state === 'done' && <><Target size={18} className="text-green-500 shrink-0" /><span className="text-xs md:text-sm font-bold text-white truncate">¡Completado!</span></>}
             </div>
    
             {/* Confirm disc buttons */}
             {state === 'confirm_plate' && (
                 <div className="flex flex-wrap items-center gap-2">
                     <button onClick={() => {
                         if (autoCircle) {
                             setPixelToMeterRatio(STANDARD_PLATE_METERS / (autoCircle.r * 2));
                             setAnchorPoint({x: autoCircle.x, y: autoCircle.y});
                             if (videoRef.current && canvasRef.current && worker) {
                                 const ctx = canvasRef.current.getContext('2d');
                                 if (ctx) {
                                   ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                                   const imgData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
                                   sendInitTracker(worker, autoCircle.x, autoCircle.y, imgData.data.buffer, canvasRef.current.width, canvasRef.current.height, (sx, sy) => {
                                       if (sx !== undefined && sy !== undefined) setAnchorPoint({x: sx, y: sy});
                                       setState('ready');
                                   });
                                 }
                             }
                         }
                     }} className="bg-[#00ffaa] text-black font-black uppercase text-xs px-4 py-2.5 rounded-lg active:scale-95 transition-all shadow-[0_0_12px_rgba(0,255,170,0.3)]">
                         ✅ Confirmar
                     </button>
                     
                     <div className="flex bg-white/5 rounded-lg overflow-hidden border border-white/10">
                         <button 
                           onClick={(e) => { e.stopPropagation(); setAutoCircle(prev => prev ? {...prev, r: prev.r + 5} : prev); }}
                           className="w-11 h-11 flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white font-black text-lg"
                         >+</button>
                         <div className="w-px bg-white/10" />
                         <button 
                           onClick={(e) => { e.stopPropagation(); setAutoCircle(prev => prev ? {...prev, r: Math.max(10, prev.r - 5)} : prev); }}
                           className="w-11 h-11 flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white font-black text-lg"
                         >−</button>
                     </div>

                     <button onClick={() => { setAutoCircle(null); setState('calibrate'); }} 
                       className="bg-white/10 text-white font-bold text-xs px-3 py-2.5 rounded-lg active:scale-95 transition-all">
                         Manual
                     </button>
                 </div>
             )}

             {state === 'ready' && (
                 <div className="flex gap-2">
                     <button onClick={startTracking} className="bg-anvil-red text-white font-black uppercase text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 active:scale-95 transition-all flex-1 justify-center">
                         <Play size={14} /> Iniciar Análisis
                     </button>
                     <button onClick={triggerReset} className="bg-white/10 text-white font-bold text-xs px-3 py-2.5 rounded-lg active:scale-95 transition-all">↺</button>
                 </div>
             )}

             {state === 'done' && (
                 <div className="flex gap-2">
                     <button onClick={() => onTrackingComplete(path, pixelToMeterRatio)} className="bg-green-500 text-black font-black uppercase text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 active:scale-95 transition-all flex-1 justify-center">
                         Ver Resultados
                     </button>
                     <button onClick={triggerReset} className="bg-white/10 text-white font-bold text-xs px-3 py-2.5 rounded-lg active:scale-95 transition-all">↺</button>
                 </div>
             )}

             {(state === 'calibrate' || state === 'select_point') && (
                 <button onClick={triggerReset} className="bg-white/10 text-white font-bold text-xs px-4 py-2.5 rounded-lg active:scale-95 transition-all self-start">
                     ↺ Reiniciar
                 </button>
             )}
          </div>
      )}

      {/* Main area */}
      {state === 'upload' ? (
         <div className="border-2 border-dashed border-white/10 hover:border-anvil-red/50 transition-colors rounded-2xl p-8 md:p-16 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => document.getElementById('video-upload')?.click()}>
             <Upload size={40} className="text-gray-500 mb-3" />
             <h3 className="text-base md:text-xl font-bold text-white mb-1">Selecciona un vídeo (.mp4)</h3>
             <p className="text-gray-400 text-xs md:text-sm">Procesamiento seguro en tu navegador.</p>
             <input id="video-upload" type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={handleFileUpload} />
         </div>
      ) : (
         <div className={`relative bg-black flex items-center justify-center ${isResultMode ? 'flex-1 h-full w-full rounded-2xl border border-white/10 overflow-hidden' : 'rounded-2xl border border-white/10 aspect-video max-h-[55vh] md:max-h-[70vh] overflow-hidden'}`}>
             <video ref={videoRef} src={videoUrl || undefined} className="hidden" muted playsInline preload="auto" onLoadedMetadata={handleVideoLoad} />
             <canvas 
                ref={canvasRef} 
                className={`max-w-full max-h-full object-contain ${state !== 'tracking' && state !== 'done' && state !== 'loading_video' && state !== 'auto_detecting' ? 'cursor-crosshair' : ''}`}
                onClick={handleCanvasClick}
             />
             {state !== 'tracking' && (
                 <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-3 text-white text-xs font-bold">
                     <button className="p-1" onClick={() => { if(videoRef.current) videoRef.current.currentTime -= 0.1; }}>-0.1s</button>
                     <button className="p-1" onClick={() => { if(videoRef.current) { if(videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause(); } }}><Play size={14} /></button>
                     <button className="p-1" onClick={() => { if(videoRef.current) videoRef.current.currentTime += 0.1; }}>+0.1s</button>
                 </div>
             )}
         </div>
      )}
    </div>
  );
}
