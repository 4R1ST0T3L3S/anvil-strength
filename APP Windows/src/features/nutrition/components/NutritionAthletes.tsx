import { useState } from 'react';
import { UserProfile } from '../../../hooks/useUser';
import { Users, Search, ChevronRight } from 'lucide-react';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { supabase } from '../../../lib/supabase';
import { useQuery } from '@tanstack/react-query';

interface NutritionAthletesProps {
    user: UserProfile;
}

export function NutritionAthletes({ user }: NutritionAthletesProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch athletes assigned to this coach/nutritionist
    const consulta = useQuery({
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
    const athletes = consulta.data;

    const filteredAthletes = athletes?.filter(a => 
        a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (a.nickname && a.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
    ) || [];

    // Distinguir "no hay nada" de "el filtro lo esconde todo": son estados
    // distintos con salidas distintas.
    const busqueda = searchTerm.trim().length > 0;

    return (
        <div className="space-y-8 animate-fade p-10">
            <div className="flex justify-between gap-4 flex-row items-center">
                <div>
                    <h1 className="text-3xl font-black text-ink uppercase italic tracking-wider mb-2 flex items-center gap-3">
                        <Users className="text-brand-text" size={32} />
                        MIS ATLETAS (NUTRICIÓN)
                    </h1>
                    <p className="text-ink-muted">
                        Selecciona un atleta para gestionar su plan nutricional.
                    </p>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle" size={20} />
                <input
                    type="text"
                    placeholder="Buscar atleta por nombre o apodo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-surface-raised text-ink pl-12 pr-4 py-4 rounded-xl border border-line focus:border-brand focus:ring-1 focus:ring-brand transition-[border-color,box-shadow]"
                />
            </div>

            {/* Los cuatro estados. Antes eran dos, y faltaba el que importa:
                si la consulta fallaba, `athletes` venía vacío y esto decía "No
                se encontraron atletas" — o sea, culpaba al buscador de una
                caída de red.

                Y el vacío tampoco distinguía "no tienes atletas" de "el filtro
                no encuentra ninguno", que se arreglan de formas opuestas: uno
                pidiendo que te asignen atletas, el otro borrando lo escrito. */}
            <EstadoDeDatos
                consulta={consulta}
                queEs="que.atletas"
                vacio={filteredAthletes.length === 0}
                esqueleto={<SkeletonList filas={6} />}
                vacioIcono={<Users size={20} aria-hidden="true" />}
                vacioTitulo={busqueda ? 'Ningún atleta coincide' : 'Todavía no tienes atletas'}
                vacioCuerpo={
                    busqueda
                        ? `No hay nadie que se llame o se apode «${searchTerm}».`
                        : 'Cuando te asignen atletas para llevarles la nutrición, aparecerán aquí.'
                }
                vacioAccion={
                    busqueda && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="rounded-field border border-[var(--border-default)] px-4 py-2.5 text-t-xs font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                        >
                            Quitar el filtro
                        </button>
                    )
                }
            >
                <div className="grid gap-4 grid-cols-3">
                    {filteredAthletes.map((athlete) => (
                        <div 
                            key={athlete.id}
                            className="bg-surface-raised border border-line rounded-xl p-5 hover:border-brand transition-colors cursor-pointer group"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-surface-raised overflow-hidden border border-strong">
                                        {athlete.avatar_url ? (
                                            <img src={athlete.avatar_url} alt={athlete.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-ink-subtle font-bold">
                                                {athlete.full_name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-ink font-bold group-hover:text-brand-text transition-colors">
                                            {athlete.full_name}
                                        </h3>
                                        {athlete.nickname && (
                                            <p className="text-sm text-ink-subtle">"{athlete.nickname}"</p>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="text-zinc-600 group-hover:text-brand-text transition-colors" />
                            </div>
                            
                            <div className="flex justify-between items-center pt-4 border-t border-line">
                                <span className="text-xs text-ink-subtle uppercase tracking-wider">Plan Nutricional</span>
                                {/* This will eventually show if they have an active plan */}
                                <span className="text-xs bg-surface-raised text-ink px-2 py-1 rounded-md">
                                    Ver Plan
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </EstadoDeDatos>
        </div>
    );
}
