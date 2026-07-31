import { useState } from 'react';
import { UserProfile } from '../../../hooks/useUser';
import { Users, Search, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useQuery } from '@tanstack/react-query';

interface NutritionAthletesProps {
    user: UserProfile;
}

export function NutritionAthletes({ user }: NutritionAthletesProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch athletes assigned to this coach/nutritionist
    const { data: athletes, isLoading } = useQuery({
        queryKey: ['nutrition-athletes', user.id],
        queryFn: async () => {
            const field = user.role === 'coach' ? 'coach_id' : 'nutritionist_id';
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq(field, user.id)
                .eq('role', 'athlete');

            if (error) throw error;
            return data as UserProfile[];
        }
    });

    const filteredAthletes = athletes?.filter(a => 
        a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (a.nickname && a.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
    ) || [];

    return (
        <div className="p-6 md:p-10 space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-wider mb-2 flex items-center gap-3">
                        <Users className="text-anvil-red" size={32} />
                        MIS ATLETAS (NUTRICIÓN)
                    </h1>
                    <p className="text-zinc-400">
                        Selecciona un atleta para gestionar su plan nutricional.
                    </p>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                <input
                    type="text"
                    placeholder="Buscar atleta por nombre o apodo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#111111] text-white pl-12 pr-4 py-4 rounded-xl border border-zinc-800 focus:border-anvil-red focus:ring-1 focus:ring-anvil-red transition-all"
                />
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="w-10 h-10 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : filteredAthletes.length === 0 ? (
                <div className="bg-[#111111] border border-zinc-800 rounded-xl p-8 text-center">
                    <p className="text-zinc-400">No se encontraron atletas.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAthletes.map((athlete) => (
                        <div 
                            key={athlete.id}
                            className="bg-[#111111] border border-zinc-800 rounded-xl p-5 hover:border-anvil-red transition-colors cursor-pointer group"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
                                        {athlete.avatar_url ? (
                                            <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                                                {athlete.full_name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold group-hover:text-anvil-red transition-colors">
                                            {athlete.full_name}
                                        </h3>
                                        {athlete.nickname && (
                                            <p className="text-sm text-zinc-500">"{athlete.nickname}"</p>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="text-zinc-600 group-hover:text-anvil-red transition-colors" />
                            </div>
                            
                            <div className="flex justify-between items-center pt-4 border-t border-zinc-800/50">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider">Plan Nutricional</span>
                                {/* This will eventually show if they have an active plan */}
                                <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md">
                                    Ver Plan
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
