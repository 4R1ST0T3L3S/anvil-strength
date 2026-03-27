import { useEffect, useState } from 'react';
import { Download, Activity, Loader, Check } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { SessionExercise, TrainingBlock, TrainingSession } from '../../../types/training';
import { VbtChartModal } from './VbtChartModal';
import { VbtCompareModal } from './VbtCompareModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CoachVbtTabProps {
    athleteId: string;
}

type VbtExerciseData = SessionExercise & { session: TrainingSession; block: TrainingBlock };

export default function CoachVbtTab({ athleteId }: CoachVbtTabProps) {
    const [exercises, setExercises] = useState<VbtExerciseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVbt, setSelectedVbt] = useState<VbtExerciseData | null>(null);
    const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
    const [showCompareModal, setShowCompareModal] = useState(false);

    useEffect(() => {
        loadVbtExercises();
    }, [athleteId]);

    const loadVbtExercises = async () => {
        setLoading(true);
        try {
            const data = await trainingService.getVbtExercisesByAthlete(athleteId);
            setExercises(data);
        } catch (error) {
            console.error("Error loading VBT exercises:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader className="animate-spin text-anvil-red w-8 h-8" />
            </div>
        );
    }

    if (exercises.length === 0) {
        return (
            <div className="text-center py-16 bg-[#252525] border border-white/5 rounded-xl max-w-4xl mx-auto mt-6">
                <Activity size={48} className="mx-auto text-gray-600 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Sin datos VBT</h3>
                <p className="text-gray-400">Este atleta aún no ha subido ningún archivo de encoder.</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <Activity className="text-anvil-red" />
                    Registro VBT
                </h3>
            </div>

            <div className="bg-[#1c1c1c] border border-white/10 rounded-xl overflow-hidden shadow-xl mb-24">
                <div className="grid grid-cols-[auto_1fr_2fr_1fr_1fr_auto] gap-4 p-4 border-b border-white/10 bg-[#252525] text-xs font-bold text-gray-500 uppercase tracking-wider items-center">
                    <div className="w-6"></div> {/* Checkbox spacer */}
                    <div>Fecha</div>
                    <div>Ejercicio</div>
                    <div>Prescripción</div>
                    <div>Bloque</div>
                    <div className="text-right">Acciones</div>
                </div>

                <div className="divide-y divide-white/5">
                    {exercises.map((ex) => {
                        // Create a fake date using block creation date + session day number (approximate)
                        // In a real app with exact session dates, we'd use that. Here we fallback.
                        const dateFallback = new Date(ex.block.created_at || Date.now());
                        dateFallback.setDate(dateFallback.getDate() + (ex.session.day_number - 1));

                        return (
                            <div key={ex.id} className="grid grid-cols-[auto_1fr_2fr_1fr_1fr_auto] gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                                <div className="flex items-center justify-center">
                                    <button
                                        onClick={() => {
                                            setSelectedForCompare(prev => 
                                                prev.includes(ex.id) ? prev.filter(id => id !== ex.id) : [...prev, ex.id]
                                            );
                                        }}
                                        className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                                            selectedForCompare.includes(ex.id) 
                                                ? 'bg-anvil-red text-black border-anvil-red border shadow-[0_0_10px_rgba(255,51,51,0.3)]' 
                                                : 'bg-[#1c1c1c] border border-white/20 hover:border-white/50'
                                        }`}
                                    >
                                        {selectedForCompare.includes(ex.id) && <Check size={14} strokeWidth={4} />}
                                    </button>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-white">
                                        {format(dateFallback, "d MMM", { locale: es })}
                                    </span>
                                    <span className="text-[10px] text-gray-500 uppercase">Día {ex.session.day_number}</span>
                                </div>
                                
                                <div>
                                    <span className="text-sm font-bold text-white">
                                        {(ex as any).exercise?.name || 'Ejercicio desconocido'}
                                    </span>
                                </div>

                                <div className="text-sm text-gray-300">
                                    <span className="font-mono bg-black/30 px-2 py-0.5 rounded text-xs truncate max-w-[120px] inline-block">
                                        RPE: {ex.rpe || '-'} | Vel: {ex.velocity_avg || '-'}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded truncate max-w-[120px] block">
                                        {ex.block.name}
                                    </span>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                    {ex.vbt_file_url && (
                                        <>
                                            <a 
                                                href={ex.vbt_file_url}
                                                download
                                                target="_blank"
                                                rel="noopener noreferrer" 
                                                className="p-2 text-gray-400 hover:text-white bg-[#333] hover:bg-[#444] rounded transition-colors"
                                                title="Descargar CSV"
                                            >
                                                <Download size={16} />
                                            </a>
                                            <button 
                                                onClick={() => setSelectedVbt(ex)}
                                                className="px-3 py-1.5 text-xs font-bold text-black bg-anvil-red hover:bg-red-600 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Activity size={14} />
                                                Ver Gráfica
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedVbt && selectedVbt.vbt_file_url && (
                <VbtChartModal 
                    isOpen={!!selectedVbt}
                    vbtFileUrl={selectedVbt.vbt_file_url} 
                    exerciseName={(selectedVbt as any).exercise?.name || 'Ejercicio'}
                    onClose={() => setSelectedVbt(null)} 
                />
            )}

            {/* Float Compare Bar */}
            {selectedForCompare.length > 1 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <div className="bg-[#252525] border border-white/10 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6">
                        <span className="text-sm font-bold text-white">
                            <span className="text-anvil-red">{selectedForCompare.length}</span> sesiones seleccionadas
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedForCompare([])}
                                className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => setShowCompareModal(true)}
                                className="px-4 py-2 text-sm font-black uppercase tracking-wider bg-anvil-red hover:bg-red-600 text-black rounded-full transition-all shadow-[0_0_15px_rgba(255,51,51,0.4)]"
                            >
                                Comparar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Compare Modal */}
            {showCompareModal && (
                <VbtCompareModal 
                    isOpen={showCompareModal}
                    onClose={() => setShowCompareModal(false)}
                    sessionsToCompare={exercises.filter(ex => selectedForCompare.includes(ex.id))}
                />
            )}
        </div>
    );
}
