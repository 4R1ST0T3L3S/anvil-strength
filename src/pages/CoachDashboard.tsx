import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Search, User, Shield, AlertCircle } from 'lucide-react';

interface CoachDashboardProps {
    user: any;
    onBack: () => void;
}

export function CoachDashboard({ user, onBack }: CoachDashboardProps) {
    const [athletes, setAthletes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchAthletes = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('full_name', { ascending: true });

                if (error) throw error;
                setAthletes(data || []);
            } catch (err: any) {
                console.error('Error fetching athletes:', err);
                setError(err.message || 'Error al cargar los atletas');
            } finally {
                setLoading(false);
            }
        };

        fetchAthletes();
    }, []);

    const filteredAthletes = athletes.filter(athlete =>
        (athlete.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (athlete.nickname?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (athlete.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#1c1c1c] text-white p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 bg-[#252525] hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">Panel de Entrenador</h1>
                            <p className="text-gray-400 text-sm">Gestiona tus atletas y sus progresos</p>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="mb-6 relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar atleta por nombre..."
                        className="w-full bg-[#252525] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-anvil-red transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-anvil-red"></div>
                    </div>
                ) : error ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-center gap-4 text-red-500">
                        <AlertCircle size={24} />
                        <div>
                            <p className="font-bold">Error de acceso</p>
                            <p className="text-sm opacity-80">{error}</p>
                            <p className="text-xs mt-2 text-gray-400">Asegúrate de tener el rol de 'coach' asignado en la base de datos.</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-[#252525] rounded-xl border border-white/5 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-black/20 text-gray-400 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Atleta</th>
                                        <th className="px-6 py-4">Categoría</th>
                                        <th className="px-6 py-4">Rol</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredAthletes.map((athlete) => (
                                        <tr key={athlete.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {athlete.avatar_url ? (
                                                        <img src={athlete.avatar_url} alt={athlete.full_name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-anvil-red/20 flex items-center justify-center text-anvil-red font-bold">
                                                            {athlete.full_name?.[0] || 'U'}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-bold text-white">{athlete.full_name || 'Desconocido'}</p>
                                                        <p className="text-xs text-gray-400">{athlete.nickname}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-300">
                                                    {athlete.age_category || '-'} / {athlete.weight_category || '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold uppercase ${athlete.role === 'coach' ? 'bg-anvil-red text-white' :
                                                        athlete.role === 'admin' ? 'bg-purple-600 text-white' :
                                                            'bg-gray-700 text-gray-300'
                                                    }`}>
                                                    {athlete.role === 'coach' && <Shield size={10} />}
                                                    {athlete.role === 'admin' ? 'ADMIN' : athlete.role === 'coach' ? 'COACH' : 'ATLETA'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-anvil-red hover:text-white text-sm font-bold uppercase transition-colors">
                                                    Ver Perfil
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {filteredAthletes.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                                No se encontraron atletas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
