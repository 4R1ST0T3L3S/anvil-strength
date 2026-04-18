import { useState, useEffect } from 'react';

// Augmented Window interface for OpenCV
declare global {
  interface Window {
    cv: any;
    onOpenCvReady: () => void;
  }
}

let cvWorker: Worker | null = null;
let initDoneCallback: ((snappedX?: number, snappedY?: number) => void) | null = null;
let trackDoneCallback: ((status: number, x: number, y: number) => void) | null = null;
let autoCalibrateDoneCallback: ((circle: {x: number, y: number, r: number} | null) => void) | null = null;

export const useOpenCV = () => {
  const [cvReady, setCvReady] = useState<boolean>(false);
  const [cvError, setCvError] = useState<string | null>(null);

  useEffect(() => {
    if (!cvWorker) {
      try {
        // Inicialización Clásica del Worker (imprescindible NO poner { type: 'module' } para que importScripts funcione)
        cvWorker = new Worker(new URL('./cv.worker.js', import.meta.url));
        
        // Timeout robusto: Si a los 8 segundos la variable cvReady externa no está montada, forzamos error.
        const failureTimeout = setTimeout(() => {
             // Si pasados 8 seg no responde a nada, el worker murió o no carga el CDN local
             setCvError("El worker de IA no responde. Revisa si /opencv.js está accesible.");
        }, 8000);

        cvWorker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'READY') {
                clearTimeout(failureTimeout);
                setCvReady(true);
            } else if (data.type === 'ERROR') {
                setCvError(data.message);
            } else if (data.type === 'INIT_DONE' && initDoneCallback) {
                initDoneCallback(data.x, data.y);
                initDoneCallback = null;
            } else if (data.type === 'TRACK_DONE' && trackDoneCallback) {
                trackDoneCallback(data.status, data.x, data.y);
                trackDoneCallback = null; // Unregister for next frame
            } else if (data.type === 'AUTO_CALIBRATE_DONE' && autoCalibrateDoneCallback) {
                autoCalibrateDoneCallback(data.circle);
                autoCalibrateDoneCallback = null;
            }
        };

        // Pedir status inicial
        cvWorker.postMessage({ type: 'PING' });
        
      } catch (err: any) {
        setCvError("Fallo al inicializar Worker: " + err.message);
      }
    } else {
       setCvReady(true);
    }
  }, []);

  return { cvReady, cvError, worker: cvWorker };
};

// ... Mantenemos calculateVelocityMetrics igual
export const sendInitTracker = (worker: Worker, x: number, y: number, buffer: ArrayBuffer, width: number, height: number, onDone: (sx?: number, sy?: number) => void) => {
    initDoneCallback = onDone;
    worker.postMessage({ type: 'INIT', x, y, buffer, width, height }, [buffer]);
}

export const sendProcessFrame = (worker: Worker, buffer: ArrayBuffer, width: number, height: number, lastX: number, lastY: number, onDone: (status: number, x: number, y: number) => void) => {
    trackDoneCallback = onDone;
    // We send a copy so we do not detach the original buffer from the UI canvas
    const bufCopy = buffer.slice(0);
    worker.postMessage({ type: 'TRACK', buffer: bufCopy, width, height, lastX, lastY }, [bufCopy]);
}

export const sendAutoCalibrate = (worker: Worker, buffer: ArrayBuffer, width: number, height: number, onDone: (circle: {x: number, y: number, r: number} | null) => void) => {
    autoCalibrateDoneCallback = onDone;
    const bufCopy = buffer.slice(0);
    worker.postMessage({ type: 'AUTO_CALIBRATE', buffer: bufCopy, width, height }, [bufCopy]);
}

export const sendAssistCalibrate = (worker: Worker, buffer: ArrayBuffer, width: number, height: number, x: number, y: number, onDone: (circle: {x: number, y: number, r: number} | null) => void) => {
    autoCalibrateDoneCallback = onDone;
    const bufCopy = buffer.slice(0);
    worker.postMessage({ type: 'ASSIST_CALIBRATE', buffer: bufCopy, width, height, x, y }, [bufCopy]);
}

// Types for tracking
export interface TrackingPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface TrackingResult {
  path: TrackingPoint[];
  fps: number;
  pixelToMeterRatio: number; // e.g. 0.45 meters / 100 pixels
}

// Utility to calculate velocity safely
export const calculateVelocityMetrics = (path: TrackingPoint[], pixelToMeterRatio: number) => {
  if (path.length < 3) return [];

  // Paso 1: Suavizado posicional (Movil) para amortiguar la inestabilidad de píxeles estáticos del IA
  const smoothedPath = [];
  const posWindow = 5; 
  const halfPos = Math.floor(posWindow / 2);
  
  for (let i = 0; i < path.length; i++) {
     let sumY = 0;
     let count = 0;
     for (let j = Math.max(0, i - halfPos); j <= Math.min(path.length - 1, i + halfPos); j++) {
         sumY += path[j].y;
         count++;
     }
     smoothedPath.push({
         ...path[i],
         y: sumY / count
     });
  }

  const rawVelocities = [];
  // Paso 2: Calculo de Diferencia Central (Theorem limits: dx/dt | centered ~ no phase lag)
  for (let i = 1; i < smoothedPath.length - 1; i++) {
    const prev = smoothedPath[i - 1];
    const next = smoothedPath[i + 1];
    const curr = smoothedPath[i];
    
    // In Canvas: ir arriba (levantar) reduce Y (positivo en contexto físico)
    const distanceYPx = prev.y - next.y; 
    const distanceM = distanceYPx * pixelToMeterRatio;
    const dt = (next.timestamp - prev.timestamp) / 1000; 
    
    let vel = 0;
    if (dt > 0.001) vel = distanceM / dt;
    
    rawVelocities.push({
      time: curr.timestamp,
      rawVelocity: vel, 
      x: curr.x,
      y: curr.y 
    });
  }
  
  // Copiar contornos para evitar encogimiento del array temporal
  if (rawVelocities.length > 0) {
      rawVelocities.unshift({ ...rawVelocities[0], time: smoothedPath[0].timestamp });
      rawVelocities.push({ ...rawVelocities[rawVelocities.length - 1], time: smoothedPath[smoothedPath.length - 1].timestamp });
  }
  
  // Paso 3: Zero-Phase Exponential Moving Average (Filtro Bidireccional)
  // Biomecánicamente retiene la altitud (pico max) eliminando saltos.
  const smoothedVelocities = [];
  let ema = rawVelocities[0]?.rawVelocity || 0;
  const alpha = 0.35; // 35% de agilidad

  // Pase Forward ->
  for (let i = 0; i < rawVelocities.length; i++) {
     const currRaw = rawVelocities[i].rawVelocity;
     ema = (currRaw * alpha) + (ema * (1 - alpha));
     let vel = ema;
     
     // Auto-cero físico si la barra casi no se mueve
     if (Math.abs(vel) < 0.03 && Math.abs(currRaw) < 0.05) vel = 0;

     smoothedVelocities.push({
         time: rawVelocities[i].time,
         velocity: vel, 
         x: rawVelocities[i].x,
         y: rawVelocities[i].y
     });
  }

  // Pase Backward <- (Anula el desfase de tiempo - lag introducido en el forward)
  let bEma = smoothedVelocities[smoothedVelocities.length - 1]?.velocity || 0;
  for (let i = smoothedVelocities.length - 1; i >= 0; i--) {
     bEma = (smoothedVelocities[i].velocity * alpha) + (bEma * (1 - alpha));
     smoothedVelocities[i].velocity = bEma;
  }

  return smoothedVelocities;
};
