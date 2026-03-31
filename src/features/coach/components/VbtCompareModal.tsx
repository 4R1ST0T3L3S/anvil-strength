import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, Loader, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { SessionExercise, TrainingSession, TrainingBlock } from '../../../types/training';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type VbtExerciseData = SessionExercise & { session: TrainingSession; block: TrainingBlock };

interface VbtCompareModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionsToCompare: VbtExerciseData[];
}

const COLORS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
];

// Helper to format session name
const getSessionLabel = (ex: VbtExerciseData) => {
    const dateFallback = new Date(ex.block.created_at || Date.now());
    dateFallback.setDate(dateFallback.getDate() + (ex.session.day_number - 1));
    return `${format(dateFallback, "d MMM", { locale: es })} (Día ${ex.session.day_number})`;
};

export function VbtCompareModal({ isOpen, onClose, sessionsToCompare }: VbtCompareModalProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // En comparativa, es mejor ver una métrica a la vez para no saturar 
    const [activeMetric, setActiveMetric] = useState<'Vm' | 'Vmp' | 'Vmax' | 'Potencia' | 'Fatiga' | 'ROM'>('Vm');
    const [summaryData, setSummaryData] = useState<any[]>([]);

    useEffect(() => {
        if (!isOpen || sessionsToCompare.length === 0) return;

        let isMounted = true;
        setLoading(true);

        const fetchAndParse = async () => {
            try {
                const allParsedSessions = await Promise.all(
                    sessionsToCompare.map(ex => {
                        return new Promise<{ session: VbtExerciseData, parsedRows: any[] }>((resolve, reject) => {
                            if (!ex.vbt_file_url) {
                                resolve({ session: ex, parsedRows: [] });
                                return;
                            }
                            Papa.parse(ex.vbt_file_url, {
                                download: true,
                                header: true,
                                skipEmptyLines: true,
                                complete: (results) => {
                                    const parseNum = (val: string | undefined) => {
                                        if (!val) return 0;
                                        return parseFloat(val.toString().replace(',', '.'));
                                    };

                                    const rows = results.data.map((row: any) => {
                                        const serieRaw = String(row['Serie'] || '?');
                                        const repRaw = String(row['Rep'] || '?');
                                        const serieMatch = serieRaw.match(/\d+/);
                                        const repMatch = repRaw.match(/\d+/);
                                        const serie = serieMatch ? serieMatch[0] : serieRaw;
                                        const rep = repMatch ? repMatch[0] : repRaw;

                                        return {
                                            name: `S${serie} R${rep}`,
                                            Vm: parseNum(row['Vm']),
                                            Vmp: parseNum(row['Vmp']),
                                            Vmax: parseNum(row['Vmax']),
                                            Potencia: parseNum(row['Potencia']),
                                            Carga: parseNum(row['Carga']),
                                            Fatiga: parseNum(row['Fatiga']),
                                            ROM: parseNum(row['ROM'])
                                        };
                                    }).filter(d => d.Vm > 0 || d.Vmax > 0 || d.Potencia > 0);

                                    resolve({ session: ex, parsedRows: rows });
                                },
                                error: (err) => reject(err)
                            });
                        });
                    })
                );

                if (!isMounted) return;

                // Unify data by 'name' (S/R)
                const pointMap = new Map<string, any>();
                
                // Calculate summaries
                const newSummaryData = allParsedSessions.map(({ session, parsedRows }, i) => {
                    const label = getSessionLabel(session);
                    let sumVm = 0, sumVmax = 0, maxPotencia = 0, maxFatiga = 0;

                    parsedRows.forEach(row => {
                        // Merge into unified point map
                        const point = pointMap.get(row.name) || { name: row.name };
                        point[`${session.id}_Vm`] = row.Vm;
                        point[`${session.id}_Vmp`] = row.Vmp;
                        point[`${session.id}_Vmax`] = row.Vmax;
                        point[`${session.id}_Potencia`] = row.Potencia;
                        point[`${session.id}_Fatiga`] = row.Fatiga;
                        point[`${session.id}_ROM`] = row.ROM;
                        pointMap.set(row.name, point);

                        // Accumulate for summary
                        sumVm += row.Vm;
                        sumVmax += row.Vmax;
                        if (row.Potencia > maxPotencia) maxPotencia = row.Potencia;
                        if (row.Fatiga > maxFatiga) maxFatiga = row.Fatiga;
                    });

                    return {
                        id: session.id,
                        label,
                        color: COLORS[i % COLORS.length],
                        avgVm: parsedRows.length ? (sumVm / parsedRows.length).toFixed(2) : '-',
                        avgVmax: parsedRows.length ? (sumVmax / parsedRows.length).toFixed(2) : '-',
                        maxPotencia: maxPotencia.toFixed(0),
                        maxFatiga: maxFatiga.toFixed(1)
                    };
                });

                // Convert map to array and sort by logical rep 
                // Simple sort by assuming format S{x} R{y}
                const unifiedData = Array.from(pointMap.values()).sort((a, b) => {
                    const matchA = a.name.match(/S(\d+) R(\d+)/);
                    const matchB = b.name.match(/S(\d+) R(\d+)/);
                    if (matchA && matchB) {
                        const sA = parseInt(matchA[1], 10);
                        const sB = parseInt(matchB[1], 10);
                        if (sA !== sB) return sA - sB;
                        return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
                    }
                    return a.name.localeCompare(b.name);
                });

                setData(unifiedData);
                setSummaryData(newSummaryData);

            } catch (err) {
                console.error("Error comparativa VBT:", err);
                if (isMounted) toast.error("Error al procesar la comparativa.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchAndParse();

        return () => {
            isMounted = false;
        };
    }, [isOpen, sessionsToCompare]);

    if (!isOpen) return null;

    const MetricRadio = ({ value, label }: { value: string, label: string }) => {
        const isActive = activeMetric === value;
        return (
            <button
                onClick={() => setActiveMetric(value as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-widest ${
                    isActive 
                        ? 'bg-anvil-red text-black border-anvil-red shadow-lg' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
            >
                {label}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 md:p-8 bg-black/95 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#1c1c1c] max-w-7xl w-full h-full sm:h-auto sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-white/5 bg-[#252525] gap-4 sm:gap-0 flex-shrink-0">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="p-2 bg-red-500/10 rounded-lg text-anvil-red border border-red-500/20">
                            <Activity size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">Comparativa VBT</h2>
                            <p className="text-sm text-gray-400 font-medium truncate">
                                {sessionsToCompare.length} Sesiones analizadas
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors sm:hidden ml-auto"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                         {/* Optional actions */}
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
                            <p className="font-bold uppercase tracking-widest text-sm">Cruzando datos...</p>
                        </div>
                    ) : (
                        <>
                            {/* Metric Selector */}
                            <div className="flex flex-wrap items-center justify-center gap-2 mb-8 w-full p-2">
                                <span className="text-xs uppercase font-bold text-gray-600 px-2 mr-2">Analizar:</span>
                                <MetricRadio value="Vm" label="Vm" />
                                <MetricRadio value="Vmp" label="Vmp" />
                                <MetricRadio value="Vmax" label="Vmax" />
                                <MetricRadio value="Potencia" label="Potencia" />
                                <MetricRadio value="Fatiga" label="Fatiga" />
                                <MetricRadio value="ROM" label="ROM" />
                            </div>

                            {/* Main Chart */}
                            <div className="w-full h-[350px] sm:h-[450px] min-h-[350px] sm:min-h-[450px] mt-2 mb-8 bg-black/20 rounded-xl p-4 border border-white/5 shadow-inner">
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
                                            stroke="#888888"
                                            tick={{ fill: '#888888', fontSize: 12, fontWeight: 600 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dx={-10}
                                            domain={['auto', 'auto']}
                                        />
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

                                        {sessionsToCompare.map((session, i) => (
                                            <Line 
                                                key={session.id}
                                                type="monotone" 
                                                dataKey={`${session.id}_${activeMetric}`} 
                                                name={getSessionLabel(session)} 
                                                stroke={COLORS[i % COLORS.length]} 
                                                strokeWidth={3} 
                                                dot={{ fill: COLORS[i % COLORS.length], strokeWidth: 2, r: 4 }} 
                                                activeDot={{ r: 6, fill: '#fff', stroke: COLORS[i % COLORS.length] }}
                                                connectNulls={true}
                                            />
                                        ))}

                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Session Summary Table */}
                            <div className="sm:mt-8 bg-black/20 sm:rounded-xl border-y sm:border border-white/5 -mx-4 sm:mx-0 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 bg-[#252525]">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300">Medias Acumuladas</h4>
                                </div>
                                <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto overflow-x-auto">
                                    <table className="w-full text-left text-xs sm:text-sm text-gray-400 relative">
                                        <thead className="sticky top-0 z-10 text-[10px] sm:text-xs uppercase bg-[#1c1c1c] text-gray-500 font-bold border-b border-white/5 shadow-sm">
                                            <tr>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Sesión</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Med. Vm</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Med. Vmax</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Pico Potencia</th>
                                                <th className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">Max Fatiga</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {summaryData.map((row) => (
                                                <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 font-bold text-white whitespace-nowrap flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: row.color }} />
                                                        {row.label}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#10b981] font-medium">{row.avgVm}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#3b82f6] font-medium">{row.avgVmax}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#f59e0b] font-medium">{row.maxPotencia} W</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-[#ef4444] font-medium">{row.maxFatiga} %</td>
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
