import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '../../../hooks/useUser';
import { competitionsService } from '../../../services/competitionsService';
import { Trophy, Calendar, MapPin, Medal, Clock, AlertCircle } from 'lucide-react';
import { getDaysRemaining } from '../../../utils/dateUtils';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

interface AthleteCompetitionsViewProps {
    user: UserProfile;
}

export function AthleteCompetitionsView({ user }: AthleteCompetitionsViewProps) {
    const { data: competitions, isLoading, isError } = useQuery({
        queryKey: ['athlete-competitions', user.id],
        queryFn: () => competitionsService.getAthleteCompetitions(user.id)
    });

    if (isLoading) return <LoadingSpinner message="Cargando competiciones..." />;

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-anvil-red">
                    <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-white">Error al cargar</h3>
                <p className="text-gray-400 max-w-md">
                    No pudimos obtener tu lista de competiciones. Por favor, intenta de nuevo más tarde.
                </p>
            </div>
        );
    }

    if (!competitions || competitions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 max-w-lg mx-auto mt-12 bg-[#1c1c1c] border border-white/5 rounded-3xl">
                <div className="w-24 h-24 bg-anvil-red/10 rounded-full flex items-center justify-center text-anvil-red mb-4">
                    <Trophy size={48} />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Sin Competiciones</h3>
                <p className="text-gray-400 text-lg leading-relaxed">
                    Aún no tienes competiciones asignadas. Tu entrenador te asignará una cuando sea el momento.
                </p>
            </div>
        );
    }

    // Split competitions into Upcoming and Past
    const today = new Date().toISOString().split('T')[0];
    const upcoming = competitions.filter(c => c.date >= today).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const past = competitions.filter(c => c.date < today).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-12">
            <header>
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white flex items-center gap-4">
                    <Trophy className="text-anvil-red" size={40} />
                    Mis Competiciones
                </h1>
                <p className="text-gray-400 text-lg">Visualiza tus próximos objetivos y tu historial competitivo.</p>
            </header>

            {/* Upcoming Competitions */}
            {upcoming.length > 0 && (
                <section className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-anvil-red border-l-2 border-anvil-red pl-3">
                        Próximos Eventos
                    </h2>
                    <div className="grid grid-cols-1 gap-6">
                        {upcoming.map((comp) => {
                            const daysRemaining = getDaysRemaining(comp.date);
                            return (
                                <div key={comp.id} className="relative group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-anvil-red/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl -z-10 blur-xl"></div>
                                    <div className="bg-[#252525] border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center justify-between transition-all hover:border-anvil-red/30 hover:shadow-2xl hover:shadow-anvil-red/5">
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="bg-anvil-red text-white text-xs font-black px-3 py-1 rounded uppercase tracking-wider">
                                                    Próximamente
                                                </span>
                                                {comp.level && (
                                                    <span className="bg-white/5 text-gray-300 text-xs font-bold px-3 py-1 rounded uppercase tracking-wider border border-white/10">
                                                        {comp.level}
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mb-2">
                                                    {comp.name}
                                                </h3>
                                                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 text-gray-400">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar size={18} className="text-anvil-red" />
                                                        <span className="font-semibold">
                                                            {new Date(comp.date).toLocaleDateString('es-ES', {
                                                                weekday: 'long',
                                                                year: 'numeric',
                                                                month: 'long',
                                                                day: 'numeric'
                                                            })}
                                                        </span>
                                                    </div>
                                                    {comp.location && (
                                                        <div className="flex items-center gap-2">
                                                            <MapPin size={18} className="text-anvil-red" />
                                                            <span className="font-semibold">{comp.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-[#1c1c1c] p-6 rounded-2xl border border-white/5 flex items-center justify-center min-w-[180px]">
                                            <div className="text-center space-y-1">
                                                <div className="text-4xl md:text-5xl font-black text-white tabular-nums tracking-tighter">
                                                    {daysRemaining}
                                                </div>
                                                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center justify-center gap-2">
                                                    <Clock size={12} />
                                                    Días Restantes
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Past Competitions */}
            {past.length > 0 && (
                <section className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 border-l-2 border-gray-600 pl-3">
                        Historial
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {past.map((comp) => (
                            <div key={comp.id} className="bg-[#1c1c1c] border border-white/5 rounded-2xl p-6 flex items-start gap-4 hover:bg-[#252525] transition-colors">
                                <div className="mt-1 bg-gray-800/50 p-3 rounded-xl text-gray-500">
                                    <Medal size={24} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-gray-300 uppercase tracking-tight">
                                        {comp.name}
                                    </h3>
                                    <div className="space-y-1 text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} />
                                            <span>
                                                {new Date(comp.date).toLocaleDateString('es-ES', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                        {comp.location && (
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} />
                                                <span>{comp.location}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-2">
                                        <span className="text-xs font-bold text-gray-600 uppercase bg-white/5 px-2 py-1 rounded">
                                            Finalizado
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
