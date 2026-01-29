import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Upload, FileText, TrendingUp, User } from 'lucide-react';

interface CoachAthleteDetailsProps {
    athleteId: string;
    onBack: () => void;
}

type Tab = 'planning' | 'progress' | 'profile';

export function CoachAthleteDetails({ athleteId, onBack }: CoachAthleteDetailsProps) {
    const [athlete, setAthlete] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('planning');

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
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#252525]">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-4">
                        {athlete.avatar_url ? (
                            <img src={athlete.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                {athlete.full_name?.[0]}
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight">{athlete.full_name}</h2>
                            <p className="text-sm text-gray-400 flex items-center gap-2">
                                {athlete.weight_category || '-'} • {athlete.age_category || '-'}
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                Total: {athlete.total_pr || 0}kg
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
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Import Excel Section */}
                        <div className="bg-[#252525] border border-white/10 border-dashed rounded-xl p-8 text-center hover:border-anvil-red/50 transition-colors group cursor-pointer">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-anvil-red/10 transition-colors">
                                <Upload className="text-gray-400 group-hover:text-anvil-red" size={32} />
                            </div>
                            <h3 className="text-lg font-bold mb-2">Importar Excel de Entrenamiento</h3>
                            <p className="text-gray-400 text-sm max-w-sm mx-auto mb-4">
                                Arrastra o selecciona el archivo Excel (.xlsx) con la planificación de {athlete.nickname}.
                            </p>
                            <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full text-sm font-bold transition-colors">
                                Seleccionar Archivo
                            </button>
                        </div>

                        {/* Current Week Placeholder */}
                        <div className="bg-[#252525] border border-white/5 rounded-xl p-6">
                            <h3 className="text-lg font-bold mb-4">Semana Actual</h3>
                            <div className="text-center py-12 text-gray-500 bg-black/20 rounded-lg border border-white/5">
                                No hay planificación cargada para esta semana.
                            </div>
                        </div>
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
                                <p className="text-blue-400">{athlete.username ? `@${athlete.username}` : '-'}</p>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
