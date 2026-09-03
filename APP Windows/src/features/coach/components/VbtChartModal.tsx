import { useState } from 'react';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, Download, Loader, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { mapRowToVbt, isValidVbtRow } from '../utils/vbtParser';
import { useQuery } from '@tanstack/react-query';

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

    const [activeMetrics, setActiveMetrics] = useState({
        Vm: true,
        Vmp: false,
        Vmax: false,
        Potencia: false,
        Fatiga: false,
        ROM: false
    });

    /**
     * El CSV del encoder, descargado y convertido a puntos.
     *
     * Por consulta y no por efecto. El fichero es INMUTABLE —es una medicion
     * que ya ocurrio— y sin embargo se volvia a descargar y a parsear en cada
     * apertura del modal. El entrenador abre y cierra estas graficas media
     * docena de veces seguidas cuando compara series.
     *
     * Papa.parse es de devolucion de llamada, asi que se envuelve en una
     * promesa para poder esperarla.
     */
    const { data = [], isPending: loading } = useQuery({
        queryKey: ['vbt-csv', vbtFileUrl],
        queryFn: () => new Promise<VbtDataPoint[]>((resolver, rechazar) => {
            Papa.parse(vbtFileUrl!, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    try {
                        const filas = (results.data as Record<string, unknown>[]).map(mapRowToVbt);
                        resolver(filas.filter(isValidVbtRow));
                    } catch (err) {
                        console.error('Error parsing VBT CSV:', err);
                        toast.error('El formato del archivo VBT no es compatible o esta corrupto.');
                        rechazar(err);
                    }
                },
                error: (err) => {
                    console.error('Error downloading VBT data:', err);
                    toast.error('Error al descargar los datos del VBT.');
                    rechazar(err);
                },
            });
        }),
        enabled: isOpen && !!vbtFileUrl,
        // El fichero no cambia nunca: una vez descargado, vale para siempre.
        staleTime: Infinity,
        // Un CSV corrupto seguira corrupto: reintentar solo hace esperar mas.
        retry: false,
    });

    if (!isOpen) return null;

    const toggleMetric = (key: keyof typeof activeMetrics) => {
        setActiveMetrics(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade p-8">
            <div className="bg-surface-sunken max-w-7xl w-full border-line shadow-2xl overflow-hidden flex flex-col h-auto rounded-2xl border max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between border-b border-subtle bg-surface-sunken flex-shrink-0 flex-row items-center p-6 gap-0">
                    <div className="flex items-center gap-3 w-auto">
                        <div className="p-2 bg-success-quiet rounded-lg text-success">
                            <Activity size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black text-ink uppercase tracking-tight truncate">Análisis VBT</h2>
                            <p className="text-sm text-ink-muted font-medium truncate">{exerciseName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-auto">
                        <a 
                            href={vbtFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="justify-center flex items-center gap-2 px-4 bg-white/5 hover:bg-white/10 text-ink rounded-lg text-sm font-bold transition-colors uppercase tracking-wider flex-none py-2"
                        >
                            <Download size={16} />
                            CSV Original
                        </a>
                        <button
                            onClick={onClose}
                            className="text-ink-muted hover:text-ink bg-white/5 hover:bg-white/10 rounded-lg transition-colors p-2 block"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0 flex flex-col p-6 pb-16">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-ink-subtle py-20">
                            <Loader size={48} className="animate-spin mb-4 text-brand-text" />
                            <p className="font-bold uppercase tracking-widest text-sm">Procesando datos...</p>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-center py-20">
                            <div>
                                <h3 className="text-ink text-lg font-bold mb-2">No hay datos válidos</h3>
                                <p className="text-ink-subtle text-sm">El archivo CSV no contiene las columnas necesarias o está vacío.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Metric Toggles */}
                            <div className="flex flex-wrap items-center gap-2 mb-6 bg-black/20 rounded-xl border border-subtle p-3 w-fit mx-auto">
                                <span className="text-xs uppercase font-bold text-gray-600 px-2 inline-block">Métricas:</span>
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
                            <div className="w-full mt-2 mb-8 h-[450px] min-h-[450px]">
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
                            <div className="bg-black/20 border-subtle overflow-hidden mt-8 rounded-xl border mx-0">
                                <div className="px-4 py-3 border-b border-subtle bg-surface-sunken">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-ink">Resumen de Series</h4>
                                </div>
                                <div className="overflow-y-auto overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-left text-ink-muted relative text-sm">
                                        <thead className="sticky top-0 z-10 uppercase bg-surface-sunken text-ink-subtle font-bold border-b border-subtle shadow-sm text-xs">
                                            <tr>
                                                <th className="font-semibold px-4 py-3">S/R</th>
                                                <th className="font-semibold px-4 py-3">Carga</th>
                                                <th className="font-semibold px-4 py-3 table-cell">ROM</th>
                                                <th className="font-semibold px-4 py-3">Vm</th>
                                                <th className="font-semibold px-4 py-3">Vmp</th>
                                                <th className="font-semibold px-4 py-3 table-cell">Vmax</th>
                                                <th className="font-semibold px-4 py-3 table-cell">Potencia</th>
                                                <th className="font-semibold px-4 py-3">Fatiga</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((row, i) => (
                                                <tr key={i} className="border-b border-subtle hover:bg-white/5 transition-colors">
                                                    <td className="font-bold text-ink whitespace-nowrap px-4 py-3">{row.name.replace('S', '').replace(' R', '/')}</td>
                                                    <td className="text-ink px-4 py-3">{row.Carga || '-'}</td>
                                                    <td className="text-[#8b5cf6] px-4 py-3 table-cell">{row.ROM || '-'}</td>
                                                    <td className="text-success font-medium px-4 py-3">{row.Vm?.toFixed(2) || '-'}</td>
                                                    <td className="text-[#0ea5e9] font-medium px-4 py-3">{row.Vmp?.toFixed(2) || '-'}</td>
                                                    <td className="text-info px-4 py-3 table-cell">{row.Vmax?.toFixed(2) || '-'}</td>
                                                    <td className="text-warning px-4 py-3 table-cell">{row.Potencia || '-'}</td>
                                                    <td className="text-danger-text px-4 py-3">{row.Fatiga?.toFixed(1) || '-'}</td>
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-xs font-bold uppercase tracking-widest"
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
