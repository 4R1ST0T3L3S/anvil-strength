import { useState, useMemo } from 'react';
import { TrackingPoint, calculateVelocityMetrics } from '../../../../lib/cv/tracker';
import { extractLiftingPhases, calculateDynamics, estimate1RM } from '../../../../lib/cv/pwrMath';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts';
import { Activity, Gauge, ArrowDownUp, Target, Zap, Flame, TrendingUp, AlertTriangle, MoveHorizontal, Clock, Percent, Award, Dumbbell } from 'lucide-react';

interface MetricsDashboardProps {
  path: TrackingPoint[];
  pixelToMeterRatio: number;
  onTimeHover?: (time: number) => void;
  currentVideoTime?: number;
}

export function MetricsDashboard({ path, pixelToMeterRatio, onTimeHover, currentVideoTime }: MetricsDashboardProps) {
  const [loadKg, setLoadKg] = useState<number>(100);
  const [exerciseType, setExerciseType] = useState<'squat'|'bench'|'deadlift'>('squat');
  const [isHovering, setIsHovering] = useState(false);

  const metricsData = useMemo(() => {
    return calculateVelocityMetrics(path, pixelToMeterRatio);
  }, [path, pixelToMeterRatio]);

  const advMetrics = useMemo(() => {
      if (metricsData.length === 0) return null;
      
      const { eccentrics, concentrics } = extractLiftingPhases(metricsData, pixelToMeterRatio, 0.15);
      
      if (concentrics.length === 0) return null;

      // Calcular todo usando la mejor repetición (basado en Peak Velocity)
      const bestRep = concentrics.reduce((prev, current) => (prev.peakVelocity > current.peakVelocity) ? prev : current);
      // Encontrar la excéntrica correspondiente (la que ocurrió justo antes)
      const mainEccentric = eccentrics.find(e => e.endTime <= bestRep.startTime) || eccentrics[0];

      const dyn = calculateDynamics(bestRep.dataPoints, loadKg);
      const oneRmObj = estimate1RM(loadKg, bestRep.meanVelocity, exerciseType);

      let velLoss = 0;
      if (concentrics.length > 1) {
          const firstVel = concentrics[0].meanVelocity;
          const lastVel = concentrics[concentrics.length - 1].meanVelocity;
          velLoss = ((firstVel - lastVel) / firstVel) * 100;
      }

      return {
          concentric: bestRep,
          eccentric: mainEccentric,
          fatigue: velLoss,
          dynamics: dyn,
          rm: oneRmObj,
          totalReps: concentrics.length
      };
  }, [metricsData, pixelToMeterRatio, loadKg, exerciseType]);

  // Format data for Scatter Chart (Bar Path)
  const barPathData = useMemo(() => {
      // Invert Y axis for Scatter by using negative values, or configuring YAxis appropriately
      return path.map(p => ({ x: p.x, y: -p.y }));
  }, [path]);

  // Format data for Line Chart (Velocity Time Series)
  const chartData = useMemo(() => {
      // Normalize time to start at 0
      const startTime = metricsData.length > 0 ? metricsData[0].time : 0;
      return metricsData.map((d: any) => ({
          time: Number(((d.time - startTime) / 1000).toFixed(2)),
          videoTime: d.time / 1000,
          velocity: Number(d.velocity.toFixed(3))
      }));
  }, [metricsData]);

  // Calcular dominios 1:1 para evitar que Recharts estire los ejes y deforme el bar path
  const { xDomain, yDomain } = useMemo(() => {
      if (barPathData.length === 0) return { xDomain: [0, 100], yDomain: [0, 100] };
      
      let minX = barPathData[0].x, maxX = barPathData[0].x;
      let minY = barPathData[0].y, maxY = barPathData[0].y;
      
      barPathData.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
      });

      const xSpan = maxX - minX;
      const ySpan = maxY - minY;
      const maxSpan = Math.max(xSpan, ySpan) * 1.1; // 10% padding
      
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      return {
          xDomain: [Math.floor(midX - maxSpan / 2), Math.ceil(midX + maxSpan / 2)],
          yDomain: [Math.floor(midY - maxSpan / 2), Math.ceil(midY + maxSpan / 2)]
      };
  }, [barPathData]);

  const activePoint = useMemo(() => {
      if (currentVideoTime === undefined || chartData.length === 0) return null;
      let closest = chartData[0];
      let minDiff = Infinity;
      for (const p of chartData) {
          const diff = Math.abs(p.videoTime - currentVideoTime);
          if (diff < minDiff) { 
              minDiff = diff; 
              closest = p; 
          }
      }
      return minDiff < 0.2 ? closest : null; // Si nos salimos del data range por mucho, ocultamos.
  }, [currentVideoTime, chartData]);

  if (path.length === 0 || !advMetrics) return null;

  return (
    <div className="flex flex-col h-full gap-3 pb-2 w-full">
      
      {/* Controles Dinámicos Superiores */}
      <div className="bg-[#1c1c1c] border border-white/5 p-2 px-4 rounded-xl flex items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                  <Dumbbell size={16} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-300">Carga:</span>
              </div>
              <div className="flex bg-white/5 rounded-md overflow-hidden">
                  <button onClick={() => setLoadKg(v => Math.max(0, v - 5))} className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white font-black transition">-</button>
                  <input 
                      type="number" 
                      value={loadKg} 
                      onChange={(e) => setLoadKg(Number(e.target.value))}
                      className="w-12 bg-transparent text-center font-black text-white text-sm focus:outline-none" 
                  />
                  <button onClick={() => setLoadKg(v => v + 5)} className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-white font-black transition">+</button>
              </div>

              <div className="w-px h-4 bg-white/10 mx-1"></div>

              <select 
                  value={exerciseType}
                  onChange={(e) => setExerciseType(e.target.value as any)}
                  className="bg-white/5 text-white font-bold text-xs px-2 py-1 rounded-md focus:outline-none focus:ring-1 ring-white/20 border-none appearance-none cursor-pointer"
              >
                  <option value="squat">Sentadilla (0.3m/s)</option>
                  <option value="bench">Banca (0.15m/s)</option>
                  <option value="deadlift">P.Muerto (0.2m/s)</option>
              </select>
          </div>
          {advMetrics.totalReps > 1 && (
             <div className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-md border border-green-500/20">
                 {advMetrics.totalReps} repeticiones
             </div>
          )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
         <div className="bg-[#241b1b] border border-[#ff3333]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(255,51,51,0.05)]">
             <div className="p-2 bg-anvil-red/10 rounded-lg text-anvil-red shrink-0">
                 <Activity size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mb-0.5 truncate">Velocidad Media</p>
                 <p className="text-lg font-black text-white truncate">{advMetrics.concentric.meanVelocity.toFixed(2)} <span className="text-xs text-gray-500">m/s</span></p>
             </div>
         </div>

         <div className="bg-[#1b2024] border border-[#3399ff]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(51,153,255,0.05)]">
             <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 shrink-0">
                 <Gauge size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mb-0.5 truncate">Velocidad Pico</p>
                 <p className="text-lg font-black text-white truncate">{advMetrics.concentric.peakVelocity.toFixed(2)} <span className="text-xs text-gray-500">m/s</span></p>
             </div>
         </div>

         <div className="bg-[#1b241e] border border-[#33ff99]/10 p-3 rounded-xl flex items-center gap-2 overflow-hidden shadow-[0_4px_20px_rgba(51,255,153,0.05)]">
             <div className="p-2 bg-green-500/10 rounded-lg text-green-500 shrink-0">
                 <ArrowDownUp size={18} />
             </div>
             <div className="min-w-0">
                 <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mb-0.5 truncate">Recorrido (ROM)</p>
                 <p className="text-lg font-black text-white truncate">{advMetrics.concentric.rom.toFixed(2)} <span className="text-xs text-gray-500">m</span></p>
             </div>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {/* Velocity Line Chart */}
          <div className="bg-[#1c1c1c] border border-white/5 p-3 rounded-xl flex flex-col h-full overflow-hidden">
              <h3 className="text-white text-xs font-bold mb-2 flex items-center gap-1 shrink-0">
                  <Activity className="text-anvil-red" size={14} />
                  Topología de Velocidad
              </h3>
              <div className="flex-1 min-h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                        data={chartData} 
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseMove={(e) => {
                            if (e && e.activePayload && e.activePayload.length > 0) {
                                onTimeHover?.(e.activePayload[0].payload.videoTime);
                            }
                        }}
                        onMouseLeave={() => {
                            setIsHovering(false);
                            onTimeHover?.(-1);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            dataKey="time" 
                            stroke="#666" 
                            tick={{ fill: '#666', fontSize: 10 }} 
                            tickMargin={5}
                        />
                        <YAxis 
                            stroke="#666" 
                            tick={{ fill: '#666', fontSize: 10 }} 
                            width={30}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid #333', borderRadius: '6px', fontSize: '10px' }}
                            itemStyle={{ color: '#dc2626', fontWeight: 'bold' }}
                            labelStyle={{ color: '#999' }}
                        />
                        <Line type="monotone" dataKey="velocity" stroke="#dc2626" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        {!isHovering && activePoint && (
                            <ReferenceLine 
                                x={activePoint.time} 
                                stroke="#00ffaa" 
                                strokeWidth={2} 
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* Bar Path Scatter Chart */}
          <div className="bg-[#1c1c1c] border border-white/5 p-3 rounded-xl flex flex-col items-center h-full overflow-hidden">
              <h3 className="text-white text-xs font-bold mb-2 flex items-center gap-1 w-full shrink-0">
                  <Target className="text-green-500" size={14} />
                  Trayectoria (1:1)
              </h3>
              
              <div className="flex-1 min-h-[100px] w-full max-w-[200px] xl:max-w-[300px] aspect-square bg-[#1c1c1c] rounded-xl flex items-center justify-center border border-white/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis type="number" dataKey="x" stroke="#666" tick={false} domain={xDomain} />
                        <YAxis type="number" dataKey="y" stroke="#666" tick={false} domain={yDomain} />
                        <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }} 
                            contentStyle={{ backgroundColor: '#1c1c1c', border: '1px solid #333', borderRadius: '6px', fontSize: '10px' }}
                            formatter={(value: number, name: string) => [value.toFixed(1), name]}
                        />
                        <Scatter name="Bar Path" data={barPathData} fill="#22c55e" line={{ stroke: '#22c55e', strokeWidth: 2 }} shape="circle" />
                    </ScatterChart>
                </ResponsiveContainer>
              </div>
          </div>
      </div>

      {/* Grid de Métricas Avanzadas (La "Magia Físico-Matemática") */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
          {/* Potencia */}
          <div className="bg-[#1c1c1c] border border-yellow-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(234,179,8,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Zap size={12} className="text-yellow-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Potencia</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{Math.round(advMetrics.dynamics.meanPower)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">/ {Math.round(advMetrics.dynamics.peakPower)} W</span>
              </div>
          </div>

          {/* Fuerza N */}
          <div className="bg-[#1c1c1c] border border-orange-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(249,115,22,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Flame size={12} className="text-orange-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Fuerza Suelo</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{Math.round(advMetrics.dynamics.peakForce)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">N</span>
              </div>
          </div>

          {/* RFD */}
          <div className="bg-[#1c1c1c] border border-blue-400/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(96,165,250,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <TrendingUp size={12} className="text-blue-400" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">RFD</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{Math.round(advMetrics.dynamics.rfd)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">N/s</span>
              </div>
          </div>

          {/* Sticking Point */}
          <div className="bg-[#1c1c1c] border border-red-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(239,68,68,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <AlertTriangle size={12} className="text-red-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Sticking Point</p>
              </div>
              <div className="flex flex-col">
                 <p className="text-lg xl:text-xl font-black text-white">{advMetrics.concentric.minVelocity.toFixed(2)}<span className="text-[10px] xl:text-xs font-bold text-gray-400 ml-1">m/s</span></p>
                 <p className="text-[9px] font-bold text-red-500 mt-0.5 uppercase">A {advMetrics.concentric.stickingHeight.toFixed(2)}m</p>
              </div>
          </div>

          {/* Desviacion X */}
          <div className="bg-[#1c1c1c] border border-purple-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(168,85,247,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <MoveHorizontal size={12} className="text-purple-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Desviación X</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{advMetrics.concentric.horizontalDeviationCm.toFixed(1)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">cm</span>
              </div>
          </div>

          {/* Tiempos Fase */}
          <div className="bg-[#1c1c1c] border border-teal-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(20,184,166,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Clock size={12} className="text-teal-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Tiempo Exc / Con</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{advMetrics.eccentric?.duration.toFixed(2)}<span className="text-[10px] text-gray-500 ml-0.5">s</span></p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">/ {advMetrics.concentric.duration.toFixed(2)}s</span>
              </div>
          </div>

          {/* Pérdida de Vel */}
          <div className="bg-[#1c1c1c] border border-pink-500/20 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgba(236,72,153,0.03)]">
              <div className="flex items-center gap-1 mb-1">
                 <Percent size={12} className="text-pink-500" />
                 <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase truncate">Fatiga</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-lg xl:text-xl font-black text-white">{Math.max(0, advMetrics.fatigue).toFixed(1)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-gray-500">%</span>
              </div>
          </div>

          {/* 1RM Estimado */}
          <div className="bg-gradient-to-br from-anvil-red/20 to-orange-500/20 border-2 border-anvil-red/40 py-2 px-3 rounded-xl flex flex-col justify-center shadow-[0_0_30px_rgba(220,38,38,0.1)]">
              <div className="flex items-center gap-1 mb-1">
                 <Award size={12} className="text-white" />
                 <p className="text-[10px] font-bold text-white tracking-widest uppercase truncate">1RM Est.</p>
              </div>
              <div className="flex items-baseline gap-1">
                 <p className="text-xl xl:text-2xl font-black text-white drop-shadow-md">{Math.round(advMetrics.rm.rm)}</p>
                 <span className="text-[10px] xl:text-xs font-bold text-white/70">Kg ({Math.round(advMetrics.rm.percent)}%)</span>
              </div>
          </div>
      </div>

    </div>
  );
}
