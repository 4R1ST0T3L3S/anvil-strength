import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { ArrowLeft, TrendingUp, User, FileText } from 'lucide-react';
import { WorkoutBuilder } from '../../planning/components/WorkoutBuilder';
import { TrainingBlockList } from './TrainingBlockList';
import { TrainingBlock } from '../../../types/training';

interface CoachAthleteDetailsProps {
    athleteId: string;
    onBack: () => void;
}

type Tab = 'planning' | 'progress' | 'profile';

export function CoachAthleteDetails({ athleteId, onBack }: CoachAthleteDetailsProps) {
    const [athlete, setAthlete] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('planning');
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);


    useEffect(() => {
        const fetchAthlete = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', athleteId)
                    .single();

                if (error) throw error;
                setAthlete(data);
            } catch (err) {
                console.error('Error fetching athlete details:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAthlete();
    }, [athleteId]);

    if (loading) return <div className="p-8 text-center">Cargando perfil...</div>;
    if (!athlete) return <div className="p-8 text-center text-red-500">Atleta no encontrado</div>;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-4">
                        {athlete.avatar_url ? (
                            <img src={athlete.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                {athlete.full_name?.[0]}
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight">{athlete.full_name}</h2>
                            <p className="text-sm text-gray-400 flex items-center gap-2">
                                {athlete.weight_category || '-'} • {athlete.age_category || '-'}
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                Total: {((athlete.squat_pr || 0) + (athlete.bench_pr || 0) + (athlete.deadlift_pr || 0))}kg
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="flex bg-black/20 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('planning')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'planning' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        <FileText size={16} /> Planificación
                    </button>
                    <button
                        onClick={() => setActiveTab('progress')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'progress' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        <TrendingUp size={16} /> Progreso
                    </button>
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'profile' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        <User size={16} /> Perfil
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-6 flex-1 overflow-y-auto bg-[#1c1c1c]">

                {/* 1. PLANIFICACIÓN */}
                {activeTab === 'planning' && (
                    <div className="max-w-6xl mx-auto h-full pb-6">
                        {selectedBlockId ? (
                            <div className="h-full flex flex-col">
                                <button
                                    onClick={() => setSelectedBlockId(null)}
                                    className="self-start mb-2 text-sm text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    &larr; Ver todos los bloques
                                </button>
                                <WorkoutBuilder
                                    athleteId={athleteId}
                                    blockId={selectedBlockId}
                                />
                            </div>
                        ) : (
                            <TrainingBlockList
                                athleteId={athleteId}
                                onSelectBlock={(block: TrainingBlock) => setSelectedBlockId(block.id)}
                            />
                        )}
                    </div>
                )}

                {/* 2. PROGRESO */}
                {activeTab === 'progress' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-[#252525] border border-white/5 rounded-xl p-8 text-center">
                            <TrendingUp size={48} className="mx-auto text-gray-600 mb-4" />
                            <h3 className="text-xl font-bold text-gray-300">Gráficas de Progreso</h3>
                            <p className="text-gray-500 mt-2">Próximamente: Histórico de SBD y Volumen.</p>
                        </div>
                    </div>
                )}

                {/* 3. PERFIL */}
                {activeTab === 'profile' && (
                    <div className="max-w-2xl mx-auto bg-[#252525] border border-white/5 rounded-xl p-8">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Nombre Completo</label>
                                <p className="text-lg">{athlete.full_name}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Email</label>
                                <p className="text-lg">{athlete.email || 'Email privado'}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Biografía</label>
                                <p className="text-gray-300">{athlete.biography || 'Sin biografía'}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Instagram</label>
                                <p className="text-blue-400">{athlete.nickname ? `@${athlete.nickname}` : '-'}</p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
