import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Dumbbell } from 'lucide-react';

interface CoachAthletesProps {
    onSelectAthlete: (id: string) => void;
}

export function CoachAthletes({ onSelectAthlete }: CoachAthletesProps) {
    const [athletes, setAthletes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchAthletes = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('full_name', { ascending: true });

                if (error) throw error;
                setAthletes(data || []);
            } catch (err) {
                console.error('Error fetching athletes:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAthletes();
    }, []);

    const filteredAthletes = athletes.filter(athlete =>
        (athlete.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (athlete.nickname?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-anvil-red"></div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Mis Atletas</h1>
                    <p className="text-gray-400">Selecciona un atleta para ver su ficha</p>
                </div>

                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full bg-[#252525] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-anvil-red transition-colors text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredAthletes.map((athlete) => (
                    <div
                        key={athlete.id}
                        onClick={() => onSelectAthlete(athlete.id)}
                        className="bg-[#252525] rounded-xl border border-white/5 p-6 hover:border-anvil-red/50 hover:bg-[#2a2a2a] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-4 mb-4">
                            {athlete.avatar_url ? (
                                <img src={athlete.avatar_url} alt={athlete.full_name} className="w-16 h-16 rounded-full object-cover border-2 border-white/10 group-hover:border-anvil-red transition-colors" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-xl font-bold border-2 border-white/10 group-hover:border-anvil-red transition-colors">
                                    {athlete.full_name?.[0] || 'A'}
                                </div>
                            )}
                            <div>
                                <h3 className="font-bold text-lg leading-tight truncate">{athlete.full_name}</h3>
                                <p className="text-sm text-gray-400">{athlete.nickname || 'Atleta'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 py-3 border-t border-white/5 mb-3">
                            <div className="text-center">
                                <p className="text-xs text-gray-500 uppercase">SQ</p>
                                <p className="font-bold">{athlete.squat_pr || '-'}</p>
                            </div>
                            <div className="text-center border-l border-white/5">
                                <p className="text-xs text-gray-500 uppercase">BP</p>
                                <p className="font-bold">{athlete.bench_pr || '-'}</p>
                            </div>
                            <div className="text-center border-l border-white/5">
                                <p className="text-xs text-gray-500 uppercase">DL</p>
                                <p className="font-bold">{athlete.deadlift_pr || '-'}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                                <Dumbbell size={12} />
                                {athlete.weight_category || 'N/A'}
                            </span>
                            <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded uppercase font-bold text-[10px]">
                                Activo
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {filteredAthletes.length === 0 && (
                <div className="text-center py-20 text-gray-500">
                    No se encontraron atletas.
                </div>
            )}
        </div>
    );
}
