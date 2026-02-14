import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { ArrowLeft, FileText, Trophy, Trash2, Calendar, MapPin } from 'lucide-react';
import { WorkoutBuilder } from '../../planning/components/WorkoutBuilder';
import { TrainingBlockList } from './TrainingBlockList';
import { TrainingBlock } from '../../../types/training';
import { competitionsService, CompetitionAssignment } from '../../../services/competitionsService';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';

interface CoachAthleteDetailsProps {
    athleteId: string;
    onBack: () => void;
}

type Tab = 'planning' | 'competitions';

export function CoachAthleteDetails({ athleteId, onBack }: CoachAthleteDetailsProps) {
    const [athlete, setAthlete] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('planning');
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [competitions, setCompetitions] = useState<CompetitionAssignment[]>([]);

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

    const fetchCompetitions = useCallback(async () => {
        if (!athleteId) return;
        try {
            const data = await competitionsService.getAthleteCompetitions(athleteId);
            setCompetitions(data || []);
        } catch (error) {
            console.error('Error fetching competitions:', error);
        }
    }, [athleteId]);

    const handleRemoveCompetition = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar Asignación',
            description: `¿Estás seguro de que quieres eliminar la asignación a "${name}"?`,
            onConfirm: async () => {
                try {
                    await competitionsService.removeAssignment(id);
                    setCompetitions(prev => prev.filter(c => c.id !== id));
                } catch (error) {
                    console.error('Error removing competition:', error);
                    // alert('Error al eliminar la competición');
                }
            }
        });
    };


    useEffect(() => {
        setSelectedBlockId(null);
        setActiveTab('planning');
    }, [athleteId]);

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
        fetchCompetitions();
    }, [athleteId, fetchCompetitions]);

    if (loading) return <div className="p-8 text-center">Cargando perfil...</div>;
    if (!athlete) return <div className="p-8 text-center text-red-500">Atleta no encontrado</div>;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 gap-4 border-b border-white/5 bg-[#1c1c1c] shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors shrink-0">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-4">
                        {athlete.avatar_url ? (
                            <img src={athlete.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold shrink-0">
                                {athlete.full_name?.[0]}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-lg md:text-xl font-black uppercase tracking-tight truncate">{athlete.full_name}</h2>
                            <p className="text-xs md:text-sm text-gray-400 flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap">{athlete.weight_category || '-'}</span>
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                <span className="whitespace-nowrap">{athlete.age_category || '-'}</span>
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                <span className="whitespace-nowrap">Total: {((athlete.squat_pr || 0) + (athlete.bench_pr || 0) + (athlete.deadlift_pr || 0))}kg</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="w-full md:w-auto pb-1 md:pb-0">
                    <div className="grid grid-cols-2 gap-1 md:flex bg-black/20 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('planning')}
                            className={`px-2 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'planning' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <FileText size={14} className="md:w-4 md:h-4" /> <span className="truncate">Planning</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('competitions')}
                            className={`px-2 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'competitions' ? 'bg-[#333] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <Trophy size={14} className="md:w-4 md:h-4" /> <span className="truncate">Competición</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 md:p-6 flex-1 overflow-y-auto bg-[#1c1c1c]">

                {/* 1. PLANIFICACIÓN */}
                {activeTab === 'planning' && (
                    <div className="max-w-7xl mx-auto w-full pb-6 px-4">
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

                {/* 3. COMPETICIONES */}
                {activeTab === 'competitions' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                                <Trophy className="text-anvil-red" />
                                Competiciones Asignadas
                            </h3>
                        </div>

                        {competitions.length === 0 ? (
                            <div className="text-center py-12 bg-[#252525] border border-white/5 rounded-xl">
                                <Trophy size={48} className="mx-auto text-gray-600 mb-4" />
                                <p className="text-gray-400 font-medium">No hay competiciones asignadas.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {competitions.map((comp) => {
                                    const level = comp.level || 'COMPETICIÓN';
                                    let meta: { color: string; border: string; bg: string };
                                    switch (level) {
                                        case 'AEP 3': meta = { color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' }; break;
                                        case 'AEP 2': meta = { color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' }; break;
                                        case 'AEP 1': meta = { color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' }; break;
                                        case 'NACIONAL': meta = { color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10' }; break;
                                        case 'EPF': meta = { color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' }; break;
                                        case 'IPF': meta = { color: 'text-[#e6c2a5]', border: 'border-[#e6c2a5]/50', bg: 'bg-[#e6c2a5]/10' }; break;
                                        default: meta = { color: 'text-anvil-red', border: 'border-anvil-red/50', bg: 'bg-anvil-red/10' }; break;
                                    }

                                    return (
                                        <div key={comp.id} className={`bg-[#1c1c1c] border ${meta.border} rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/20 transition-colors`}>
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {comp.level && (
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${meta.bg} ${meta.color} px-2 py-1 rounded`}>
                                                            {comp.level}
                                                        </span>
                                                    )}
                                                    <h4 className="text-lg font-bold text-white uppercase leading-tight">
                                                        {comp.name}
                                                    </h4>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar size={14} className={meta.color} />
                                                        <span>
                                                            {new Date(comp.date).toLocaleDateString('es-ES', {
                                                                year: 'numeric',
                                                                month: 'long',
                                                                day: 'numeric'
                                                            })}
                                                        </span>
                                                    </div>
                                                    {comp.location && (
                                                        <div className="flex items-center gap-1.5">
                                                            <MapPin size={14} className={meta.color} />
                                                            <span>{comp.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleRemoveCompetition(comp.id, comp.name)}
                                                className="self-end md:self-center flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm font-bold uppercase tracking-wide group"
                                            >
                                                <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                                                Eliminar
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

            </div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    );
}
