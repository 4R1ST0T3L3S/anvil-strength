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
  const detectionDone = useRef(false);

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
      detectionDone.current = false;
      setState('loading_video'); // <-- Esto permite que el <video> se renderice
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
       if (cvReady && videoRef.current && worker) {
          const video = videoRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          setState('auto_detecting');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          sendAssistCalibrate(worker, imgData.data.buffer, canvas.width, canvas.height, x, y, (circle) => {
              if (circle) {
                  setAutoCircle(circle);
                  setState('confirm_plate');
              } else {
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
      if (cvReady && videoRef.current && worker) {
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      if (video.paused || video.ended) {
        setState('done');
        return;
      }
      if (video.currentTime === lastTime) {
         requestAnimationFrame(processFrame);
         return;
      }
      lastTime = video.currentTime;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        sendProcessFrame(
            worker, imgData.data.buffer, canvas.width, canvas.height,
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
      } else {
        requestAnimationFrame(processFrame);
      }
    };
    video.play();
    processFrame();
  };

  // When video metadata loads: seek to a frame, draw it, run auto-detection
  const handleVideoLoad = () => {
     const video = videoRef.current;
     const canvas = canvasRef.current;
     if (video && canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        // Seek to 0.5s to avoid black keyframes
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
                        if (circle) {
                            setAutoCircle(circle);
                            setState('confirm_plate');
                        } else {
                            setState('assist_detect');
                        }
                    });
                } else {
                    // OpenCV not ready yet - wait for it, then auto-detect
                    setState('auto_detecting');
                }
             }
         };
     }
  };
  
  // If CV becomes ready while we're in auto_detecting (race condition), trigger detection
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
                      if (circle) {
                          setAutoCircle(circle);
                          setState('confirm_plate');
                      } else {
                          setState('assist_detect');
                      }
                  });
              }
          }
      }
  }, [cvReady, worker, state, autoCircle]);

  // Repaint canvas during static states
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
              ctx.strokeStyle = '#00ffaa';
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
             
          // Draw Path
          if (path.length > 1) {
              ctx.beginPath();
              ctx.moveTo(path[0].x, path[0].y);
              for (let i = 1; i < path.length; i++) {
                  ctx.lineTo(path[i].x, path[i].y);
              }
              ctx.strokeStyle = '#22c55e';
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = 6;
              ctx.stroke();
          }

          // Playback dot
          if (state === 'done' && path.length > 0) {
              const targetTime = video.currentTime * 1000;
              let closestPoint = path[0];
              let minDiff = Infinity;
              for (const p of path) {
                  const diff = Math.abs(p.timestamp - targetTime);
                  if (diff < minDiff) { minDiff = diff; closestPoint = p; }
                  if (diff > minDiff) break;
              }
              ctx.beginPath();
              ctx.arc(closestPoint.x, closestPoint.y, 8, 0, 2*Math.PI);
              ctx.fillStyle = '#dc2626';
              ctx.fill();
              ctx.strokeStyle = 'white';
              ctx.lineWidth = 2;
              ctx.stroke();
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

  // Sync video with external dashboard
  useEffect(() => {
      if (seekTime !== undefined && seekTime >= 0 && videoRef.current) {
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

      {/* Toolbar Status */}
      {!isResultMode && (
          <div className="bg-[#252525] border border-white/5 p-4 rounded-xl flex items-center justify-between">
             <div className="flex items-center gap-3">
                 {state === 'upload' && <><Upload size={20} className="text-gray-400" /><span className="text-sm font-bold text-white">Sube un vídeo frontal/lateral</span></>}
                 {state === 'loading_video' && <><Loader size={20} className="text-blue-500 animate-spin" /><span className="text-sm font-bold text-white">Cargando vídeo...</span></>}
                 {state === 'auto_detecting' && <><RefreshCw size={20} className="text-blue-500 animate-spin" /><span className="text-sm font-bold text-white">IA: Detectando discos automáticamente...</span></>}
                 {state === 'assist_detect' && <><Target size={20} className="text-[#00ffaa]" /><span className="text-sm font-bold text-white">Haz click sobre el disco de 25kg</span></>}
                 {state === 'confirm_plate' && <><Target size={20} className="text-[#00ffaa]" /><span className="text-sm font-bold text-white">¡Disco detectado! Confirma el anillo verde.</span></>}
                 {state === 'calibrate' && <><Ruler size={20} className="text-blue-500" /><span className="text-sm font-bold text-white">Calibración manual: 2 clicks en los bordes del disco (45cm)</span></>}
                 {state === 'select_point' && <><Target size={20} className="text-orange-500" /><span className="text-sm font-bold text-white">Haz click en el centro de la barra</span></>}
                 {state === 'ready' && <><Play size={20} className="text-green-500" /><span className="text-sm font-bold text-white">IA lista para analizar repetición.</span></>}
                 {state === 'tracking' && <><RefreshCw size={20} className="text-anvil-red animate-spin" /><span className="text-sm font-bold text-white">Analizando el levantamiento...</span></>}
                 {state === 'done' && <><Target size={20} className="text-green-500" /><span className="text-sm font-bold text-white">Procesamiento completado.</span></>}
             </div>
    
             <div className="flex gap-2">
                {state === 'confirm_plate' && (
                    <>
                        <button onClick={() => {
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
                                          if (sx !== undefined && sy !== undefined) setAnchorPoint({x: sx, y: sy});
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
                        setState('loading_video');
                        setCalibrationPoints([]);
                        setAnchorPoint(null);
                        setPath([]);
                        setAutoCircle(null);
                        detectionDone.current = false;
                        // Re-trigger detection
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
                                            if (circle) {
                                                setAutoCircle(circle);
                                                setState('confirm_plate');
                                            } else {
                                                setState('assist_detect');
                                            }
                                        });
                                    }
                                }
                            }
                        }, 50);
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
                className={`max-w-full max-h-full object-contain ${state !== 'tracking' && state !== 'done' && state !== 'loading_video' && state !== 'auto_detecting' ? 'cursor-crosshair' : ''}`}
                onClick={handleCanvasClick}
             />
             
             {/* Video Controls */}
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
