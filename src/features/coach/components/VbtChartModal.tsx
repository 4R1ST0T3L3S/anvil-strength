import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, Download, Loader, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { mapRowToVbt, isValidVbtRow } from '../utils/vbtParser';

interface VbtChartModalProps {
    isOpen: boolean;
    onClose: () => void;
    vbtFileUrl: string;
    exerciseName: string;
}

interface VbtDataPoint {
    name: string;      // Label for X-Axis (e.g., "S1 R1")
    Vm: number;        // Mean Velocity
    Vmp: number;       // Propulsive Mean Velocity
    Vmax: number;      // Max Velocity 
    Potencia: number;  // Power
    Carga: number;     // Load used
    Fatiga: number;    // Fatigue
    ROM: number;       // Range of motion
}

export function VbtChartModal({ isOpen, onClose, vbtFileUrl, exerciseName }: VbtChartModalProps) {
    const [data, setData] = useState<VbtDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMetrics, setActiveMetrics] = useState({
        Vm: true,
        Vmp: false,
        Vmax: false,
        Potencia: false,
        Fatiga: false,
        ROM: false
    });

    useEffect(() => {
        if (!isOpen || !vbtFileUrl) return;

        let isMounted = true;
        setLoading(true);

        // Fetch and parse the CSV from the URL
        Papa.parse(vbtFileUrl, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (!isMounted) return;

                try {
                    const parsedData = (results.data as Record<string, unknown>[]).map(mapRowToVbt);

                    // Filter out rows that might be completely empty or invalid
                    const validData = parsedData.filter(isValidVbtRow);
                    
                    setData(validData);
                } catch (err) {
                    console.error("Error parsing VBT CSV:", err);
                    toast.error("El formato del archivo VBT no es compatible o está corrupto.");
                } finally {
                    setLoading(false);
                }
            },
            error: (err) => {
                console.error("Error downloading VBT data:", err);
                if (isMounted) {
                    toast.error("Error al descargar los datos del VBT.");
                    setLoading(false);
                }
            }
        });

        return () => {
            isMounted = false;
        };
    }, [isOpen, vbtFileUrl]);

    if (!isOpen) return null;

    const toggleMetric = (key: keyof typeof activeMetrics) => {
        setActiveMetrics(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-8 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1c1c1c] max-w-7xl w-full h-full sm:h-auto sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-white/5 bg-[#252525] gap-4 sm:gap-0 flex-shrink-0">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
                            <Activity size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">Análisis VBT</h2>
                            <p className="text-sm text-gray-400 font-medium truncate">{exerciseName}</p>
                        </div>
                        {/* Close button for strictly mobile at the top right */}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors sm:hidden ml-auto"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <a 
                            href={vbtFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 sm:py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition-colors uppercase tracking-wider"
                        >
                            <Download size={16} />
                            CSV Original
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2.5 sm:p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors hidden sm:block"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 pb-12 sm:pb-16 flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20">
                            <Loader size={48} className="animate-spin mb-4 text-anvil-red" />
                            <p className="font-bold uppercase tracking-widest text-sm">Procesando datos...</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-center py-20">
                            <div>
                                <h3 className="text-white text-lg font-bold mb-2">No hay datos válidos</h3>
                                <p className="text-gray-500 text-sm">El archivo CSV no contiene las columnas necesarias o está vacío.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Metric Toggles */}
                            <div className="flex flex-wrap items-center gap-2 mb-6 bg-black/20 p-2 sm:p-3 rounded-xl border border-white/5 w-full sm:w-fit sm:mx-auto">
                                <span className="text-xs uppercase font-bold text-gray-600 px-2 hidden sm:inline-block">Métricas:</span>
                                <MetricToggle
                                    label="Vm"
                                    color="#10b981" // emerald-500
                                    isActive={activeMetrics.Vm}
                                    onClick={() => toggleMetric('Vm')}
                                />
                                <MetricToggle
                                    label="Vmp"
                                    color="#0ea5e9" // sky-500
                                    isActive={activeMetrics.Vmp}
                                    onClick={() => toggleMetric('Vmp')}
                                />
                                <MetricToggle
                                    label="Vmax"
                                    color="#3b82f6" // blue-500
                                    isActive={activeMetrics.Vmax}
                                    onClick={() => toggleMetric('Vmax')}
                                />
                                <MetricToggle
                                    label="Potencia"
                                    color="#f59e0b" // amber-500
                                    isActive={activeMetrics.Potencia}
                                    onClick={() => toggleMetric('Potencia')}
                                />
                                <MetricToggle
                                    label="Fatiga"
                                    color="#ef4444" // red-500
                                    isActive={activeMetrics.Fatiga}
                                    onClick={() => toggleMetric('Fatiga')}
                                />
                                <MetricToggle
                                    label="ROM"
                                    color="#8b5cf6" // violet-500
                                    isActive={activeMetrics.ROM}
                                    onClick={() => toggleMetric('ROM')}
                                />
                            </div>

                            {/* Main Chart */}
                            <div className="w-full h-[350px] sm:h-[450px] min-h-[350px] sm:min-h-[450px] mt-2 mb-8">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={data}
                                        margin={{ top: 20, right: 10, left: -20, bottom: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                                        <XAxis 
                                            dataKey="name" 
                                            stroke="#888888" 
                                            tick={{ fill: '#888888', fontSize: 12, fontWeight: 600 }}
                                            axisLine={{ stroke: '#ffffff30' }}
                                            tickLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            yAxisId="velocity"
                                            stroke="#888888"
                                            tick={{ fill: '#888888', fontSize: 12, fontWeight: 600 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dx={-10}
                                            domain={['auto', 'auto']}
                                        />
                                        {(activeMetrics.Potencia || activeMetrics.Fatiga || activeMetrics.ROM) && (
                                            <YAxis
                                                yAxisId="secondary"
                                                orientation="right"
                                                stroke="#888888"
                                                tick={{ fill: '#888888', fontSize: 12, fontWeight: 600 }}
                                                axisLine={false}
                                                tickLine={false}
                                                dx={10}
                                            />
                                        )}
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: '#1c1c1c', 
                                                borderColor: '#ffffff20',
                                                borderRadius: '12px',
                                                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                                                color: '#fff',
                                                fontWeight: 600
                                            }}
                                            itemStyle={{ fontSize: '13px' }}
                                        />
                                        <Legend 
                                            wrapperStyle={{ paddingTop: '20px' }}
                                            iconType="circle"
                                        />

                                        {activeMetrics.Vm && (
                                            <Line 
                                                yAxisId="velocity"
                                                type="monotone" 
                                                dataKey="Vm" 
                                                name="Vm (m/s)" 
                                                stroke="#10b981" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#10b981' }}
                                            />
                                        )}
                                        {activeMetrics.Vmp && (
                                            <Line 
                                                yAxisId="velocity"
                                                type="monotone" 
                                                dataKey="Vmp" 
                                                name="Vmp (m/s)" 
                                                stroke="#0ea5e9" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#0ea5e9', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#0ea5e9' }}
                                            />
                                        )}
                                        {activeMetrics.Vmax && (
                                            <Line 
                                                yAxisId="velocity"
                                                type="monotone" 
                                                dataKey="Vmax" 
                                                name="Vmax (m/s)" 
                                                stroke="#3b82f6" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#3b82f6' }}
                                            />
                                        )}
                                        {activeMetrics.Potencia && (
                                            <Line 
                                                yAxisId="secondary"
                                                type="monotone" 
                                                dataKey="Potencia" 
                                                name="Potencia (W)" 
                                                stroke="#f59e0b" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#f59e0b' }}
                                            />
                                        )}
                                        {activeMetrics.Fatiga && (
                                            <Line 
                                                yAxisId="secondary"
                                                type="monotone" 
                                                dataKey="Fatiga" 
                                                name="Fatiga (%)" 
                                                stroke="#ef4444" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#ef4444' }}
                                            />
                                        )}
                                        {activeMetrics.ROM && (
                                            <Line 
                                                yAxisId="secondary"
                                                type="monotone" 
                                                dataKey="ROM" 
                                                name="ROM (mm/cm)" 
                                                stroke="#8b5cf6" 
                                                strokeWidth={3} 
                                                dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: '#8b5cf6' }}
                                            />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Data Summary Table */}
                            <div className="sm:mt-8 bg-black/20 sm:rounded-xl border-y sm:border border-white/5 -mx-4 sm:mx-0 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 bg-[#252525]">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300">Resumen de Series</h4>
                                </div>
                                <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto overflow-x-auto">
                                    <table className="w-full text-left text-xs sm:text-sm text-gray-400 relative">
                                        <thead className="sticky top-0 z-10 text-[10px] sm:text-xs uppercase bg-[#1c1c1c] text-gray-500 font-bold border-b border-white/5 shadow-sm">
                                            <tr>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">S/R</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Carga</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold hidden sm:table-cell">ROM</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Vm</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Vmp</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold hidden sm:table-cell">Vmax</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold hidden lg:table-cell">Potencia</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Fatiga</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((row, i) => (
                                                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 font-bold text-white whitespace-nowrap">{row.name.replace('S', '').replace(' R', '/')}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-300">{row.Carga || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#8b5cf6] hidden sm:table-cell">{row.ROM || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#10b981] font-medium">{row.Vm?.toFixed(2) || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#0ea5e9] font-medium">{row.Vmp?.toFixed(2) || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#3b82f6] hidden sm:table-cell">{row.Vmax?.toFixed(2) || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#f59e0b] hidden lg:table-cell">{row.Potencia || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#ef4444]">{row.Fatiga?.toFixed(1) || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricToggle({ label, color, isActive, onClick }: { label: string, color: string, isActive: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold uppercase tracking-widest"
            style={{
                borderColor: isActive ? color : 'transparent',
                backgroundColor: isActive ? `${color}15` : '#ffffff05',
                color: isActive ? '#fff' : '#666'
            }}
        >
            <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: isActive ? color : '#333' }}
            />
            {label}
        </button>
    );
}
