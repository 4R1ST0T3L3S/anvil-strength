import { useState } from 'react';
import { Activity, ArrowLeft } from 'lucide-react';
import { VideoTracker } from './VideoTracker';
import { MetricsDashboard } from './MetricsDashboard';
import { TrackingPoint } from '../../../../lib/cv/tracker';

export function PwrAnalysisTab() {
  const [trackingData, setTrackingData] = useState<{ path: TrackingPoint[], ratio: number } | null>(null);
  const [seekTime, setSeekTime] = useState<number | undefined>();
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [trackerVersion, setTrackerVersion] = useState(0);

  const handleTrackingComplete = (path: TrackingPoint[], ratio: number) => {
     setTrackingData({ path, ratio });
  };

  const handleReset = () => {
     setTrackingData(null);
     setSeekTime(undefined);
     setTrackerVersion(v => v + 1);
  };

  return (
    <div className={`mx-auto px-2 sm:px-4 py-4 animate-in fade-in duration-300 w-full ${trackingData ? 'max-w-[1800px] h-[calc(100vh-32px)] min-h-[600px] flex flex-col' : 'max-w-5xl space-y-6'}`}>
      <div className="flex items-center justify-between shrink-0 mb-6">
          <h3 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Activity className="text-orange-500" />
              PWR Análisis
              <span className="text-xs font-bold bg-orange-500/10 text-orange-500 px-2 py-1 rounded ml-2">BETA</span>
          </h3>
          
          {trackingData && (
              <button 
                onClick={handleReset}
                className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider bg-white/5 px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                 <ArrowLeft size={16} /> Analizar otro vídeo
              </button>
          )}
      </div>

      {!trackingData && (
          <div className="text-sm font-bold text-gray-400 bg-[#252525] border border-white/5 p-4 rounded-xl mb-6">
              PWR Análisis utiliza algoritmos de visión artificial para extraer métricas de VBT (Velocidad Basada en el Entrenamiento) y el Bar Path desde un vídeo normal, directamente en tu navegador. 
          </div>
      )}

      {/* Contenedor dinámico: se convierte en 2 columnas cuando hay resultados, pero mantiene el Video Tracker en el mismo nivel del DOM para no perder el estado. */}
      <div className={`flex flex-1 ${trackingData ? 'flex-col lg:flex-row gap-6 min-h-0 overflow-hidden' : 'flex-col'}`}>
          
          {/* Lado izquierdo (o Full width) */}
          <div className={`${trackingData ? 'w-full lg:w-5/12 xl:w-4/12 h-[40vh] lg:h-full flex flex-col shrink-0' : 'w-full'}`}>
              <VideoTracker 
                  key={trackerVersion}
                  onTrackingComplete={handleTrackingComplete} 
                  seekTime={seekTime}
                  isResultMode={!!trackingData}
                  onTimeUpdate={setCurrentVideoTime}
              />
          </div>

          {/* Lado derecho (Solo visible en resultados) */}
          {trackingData && (
              <div className="w-full lg:w-7/12 xl:w-8/12 h-full pr-2">
                  <div className="animate-in slide-in-from-right-8 duration-500 h-full">
                      <MetricsDashboard 
                          path={trackingData.path} 
                          pixelToMeterRatio={trackingData.ratio} 
                          onTimeHover={setSeekTime} 
                          currentVideoTime={currentVideoTime}
                      />
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
