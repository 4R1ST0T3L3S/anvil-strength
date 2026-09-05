import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, Loader, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { SessionExercise, TrainingSession, TrainingBlock } from '../../../types/training';
import { mapRowToVbt, isValidVbtRow, VbtRow } from '../utils/vbtParser';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type VbtExerciseData = SessionExercise & { session: TrainingSession; block: TrainingBlock };

interface SummaryRow {
    id: string;
    label: string;
    color: string;
    avgVm: string;
    avgVmax: string;
    maxPotencia: string;
    maxFatiga: string;
}

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

type Metrica = 'Vm' | 'Vmp' | 'Vmax' | 'Potencia' | 'Fatiga' | 'ROM';

/**
 * Botón de métrica.
 *
 * POR QUÉ VIVE AQUÍ FUERA Y NO DENTRO DEL MODAL, QUE ES DONDE ESTABA.
 *
 * Un componente declarado dentro de otro es un TIPO NUEVO en cada render del
 * padre. React no puede saber que es "el mismo de antes", así que en vez de
 * actualizarlo lo DESMONTA y lo vuelve a montar entero: se pierde el estado
 * interno, se pierde el foco y cualquier animación arranca de cero.
 *
 * Aquí eran seis botones remontándose cada vez que se movía el ratón por la
 * gráfica de comparación. Sacándolo fuera, el tipo es estable y React se
 * limita a actualizar lo que cambia.
 */
function MetricRadio({ value, label, activa, onSelect }: {
    value: Metrica;
    label: string;
    activa: Metrica;
    onSelect: (m: Metrica) => void;
}) {
    const isActive = activa === value;
    return (
        <button
            onClick={() => onSelect(value)}
            className={`flex items-center gap-2 rounded-field border px-4 py-2 text-t-xs font-bold uppercase tracking-widest transition-colors duration-fast ease-snap ${isActive
                ? 'border-brand bg-brand text-brand-ink'
                : 'border-[var(--border-default)] bg-surface-raised text-ink-muted hover:bg-surface-overlay hover:text-ink'
                }`}
        >
            {label}
        </button>
    );
}

export function VbtCompareModal({ isOpen, onClose, sessionsToCompare }: VbtCompareModalProps) {
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(true);
    // En comparativa, es mejor ver una métrica a la vez para no saturar 
    const [activeMetric, setActiveMetric] = useState<'Vm' | 'Vmp' | 'Vmax' | 'Potencia' | 'Fatiga' | 'ROM'>('Vm');
    const [summaryData, setSummaryData] = useState<SummaryRow[]>();

    /*
     * Igual que en VbtChartModal: los CSV del encoder son inmutables y sin
     * embargo se descargaban y parseaban enteros en cada apertura. Aqui el
     * coste es mayor porque se comparan VARIAS sesiones a la vez.
     *
     * Se conserva el efecto —la logica de union de puntos es larga y no se
     * toca en esta fase— pero `setLoading(true)` sale del cuerpo: el estado
     * arranca ya en true, que es lo que de verdad ocurre al abrir el modal.
     */
    useEffect(() => {
        if (!isOpen || sessionsToCompare.length === 0) return;

        let isMounted = true;

        const fetchAndParse = async () => {
            try {
                const allParsedSessions = await Promise.all(
                    sessionsToCompare.map(ex => {
                        return new Promise<{ session: VbtExerciseData, parsedRows: VbtRow[] }>((resolve, reject) => {
                            if (!ex.vbt_file_url) {
                                resolve({ session: ex, parsedRows: [] });
                                return;
                            }
                            Papa.parse(ex.vbt_file_url, {
                                download: true,
                                header: true,
                                skipEmptyLines: true,
                                complete: (results) => {
                                    const rows = (results.data as Record<string, unknown>[])
                                        .map(mapRowToVbt)
                                        .filter(isValidVbtRow);

                                    resolve({ session: ex, parsedRows: rows });
                                },
                                error: (err) => reject(err)
                            });
                        });
                    })
                );

                if (!isMounted) return;

                // Unify data by 'name' (S/R)
                const pointMap = new Map<string, Record<string, unknown>>();
                
                // Calculate summaries
                const newSummaryData = allParsedSessions.map(({ session, parsedRows }, i) => {
                    const label = getSessionLabel(session);
                    let sumVm = 0, sumVmax = 0, maxPotencia = 0, maxFatiga = 0;

                    parsedRows.forEach(row => {
                        // Merge into unified point map
                        const rowName = String(row.name);
                        const point = pointMap.get(rowName) || { name: rowName };
                        point[`${session.id}_Vm`] = row.Vm;
                        point[`${session.id}_Vmp`] = row.Vmp;
                        point[`${session.id}_Vmax`] = row.Vmax;
                        point[`${session.id}_Potencia`] = row.Potencia;
                        point[`${session.id}_Fatiga`] = row.Fatiga;
                        point[`${session.id}_ROM`] = row.ROM;
                        pointMap.set(rowName, point);

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
                    const aName = String(a.name);
                    const bName = String(b.name);
                    const matchA = aName.match(/S(\d+) R(\d+)/);
                    const matchB = bName.match(/S(\d+) R(\d+)/);
                    if (matchA && matchB) {
                        const sA = parseInt(matchA[1], 10);
                        const sB = parseInt(matchB[1], 10);
                        if (sA !== sB) return sA - sB;
                        return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
                    }
                    return aName.localeCompare(bName);
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


    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade p-8">
            <div className="bg-surface-sunken max-w-7xl w-full border-line shadow-2xl overflow-hidden flex flex-col h-auto rounded-2xl border max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between border-b border-subtle bg-surface-sunken flex-shrink-0 flex-row items-center p-6 gap-0">
                    <div className="flex items-center gap-3 w-auto">
                        <div className="p-2 bg-danger-quiet rounded-lg text-brand-text border border-danger/20">
                            <Activity size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black text-ink uppercase tracking-tight truncate">Comparativa VBT</h2>
                            <p className="text-sm text-ink-muted font-medium truncate">
                                {sessionsToCompare.length} Sesiones analizadas
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                         {/* Optional actions */}
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
                            <p className="font-bold uppercase tracking-widest text-sm">Cruzando datos...</p>
                        </div>
                    ) : (
                        <>
                            {/* Metric Selector */}
                            <div className="flex flex-wrap items-center justify-center gap-2 mb-8 w-full p-2">
                                <span className="text-xs uppercase font-bold text-gray-600 px-2 mr-2">Analizar:</span>
                                <MetricRadio value="Vm" label="Vm" activa={activeMetric} onSelect={setActiveMetric} />
                                <MetricRadio value="Vmp" label="Vmp" activa={activeMetric} onSelect={setActiveMetric} />
                                <MetricRadio value="Vmax" label="Vmax" activa={activeMetric} onSelect={setActiveMetric} />
                                <MetricRadio value="Potencia" label="Potencia" activa={activeMetric} onSelect={setActiveMetric} />
                                <MetricRadio value="Fatiga" label="Fatiga" activa={activeMetric} onSelect={setActiveMetric} />
                                <MetricRadio value="ROM" label="ROM" activa={activeMetric} onSelect={setActiveMetric} />
                            </div>

                            {/* Main Chart */}
                            <div className="w-full mt-2 mb-8 bg-black/20 rounded-xl p-4 border border-subtle shadow-inner h-[450px] min-h-[450px]">
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
                            <div className="bg-black/20 border-subtle overflow-hidden mt-8 rounded-xl border mx-0">
                                <div className="px-4 py-3 border-b border-subtle bg-surface-sunken">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-ink">Medias Acumuladas</h4>
                                </div>
                                <div className="overflow-y-auto overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-left text-ink-muted relative text-sm">
                                        <thead className="sticky top-0 z-10 uppercase bg-surface-sunken text-ink-subtle font-bold border-b border-subtle shadow-sm text-xs">
                                            <tr>
                                                <th className="font-semibold px-4 py-3">Sesión</th>
                                                <th className="font-semibold px-4 py-3">Med. Vm</th>
                                                <th className="font-semibold px-4 py-3">Med. Vmax</th>
                                                <th className="font-semibold px-4 py-3">Pico Potencia</th>
                                                <th className="font-semibold px-4 py-3">Max Fatiga</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(summaryData ?? []).map((row) => (
                                                <tr key={row.id} className="border-b border-subtle hover:bg-white/5 transition-colors">
                                                    <td className="font-bold text-ink whitespace-nowrap flex items-center gap-2 px-4 py-3">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: row.color }} />
                                                        {row.label}
                                                    </td>
                                                    <td className="text-success font-medium px-4 py-3">{row.avgVm}</td>
                                                    <td className="text-info font-medium px-4 py-3">{row.avgVmax}</td>
                                                    <td className="text-warning font-medium px-4 py-3">{row.maxPotencia} W</td>
                                                    <td className="text-danger-text font-medium px-4 py-3">{row.maxFatiga} %</td>
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
