import { useState, useEffect } from 'react';
import { X, Search, User, Check, Trophy, Save, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { useAuth } from '../../../context/AuthContext';
import { competitionsService } from '../../../services/competitionsService';
import { Competition } from '../../../services/aepService';

interface AssignCompetitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    competition: Competition | null;
}

export function AssignCompetitionModal({ isOpen, onClose, competition }: AssignCompetitionModalProps) {
    const { session } = useAuth();
    const [athletes, setAthletes] = useState<UserProfile[]>([]);
    const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && session?.user.id) {
            fetchAthletes();
        }
    }, [isOpen, session?.user.id]);

    const fetchAthletes = async () => {
        try {
            setLoading(true);
            // 1. Get athlete IDs assigned to this coach
            const { data: links, error: linksError } = await supabase
                .from('coach_athletes')
                .select('athlete_id')
                .eq('coach_id', session?.user.id);

            if (linksError) throw linksError;

            const athleteIds = links?.map(l => l.athlete_id) || [];

            if (athleteIds.length === 0) {
                setAthletes([]);
                return;
            }

            // 2. Fetch profiles
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .in('id', athleteIds)
                .order('full_name', { ascending: true });

            if (error) throw error;
            setAthletes(data || []);
        } catch (err) {
            console.error('Error fetching athletes:', err);
            toast.error('Error al cargar atletas');
        } finally {
            setLoading(false);
        }
    };

    const toggleAthlete = (id: string) => {
        const newSelected = new Set(selectedAthletes);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedAthletes(newSelected);
    };

    const handleAssign = async () => {
        if (!competition || selectedAthletes.size === 0 || !session?.user.id) return;

        setSubmitting(true);
        try {
            // Determine date: use ISO if available, otherwise try to parse or default to today
            // Postgres DATE accepts YYYY-MM-DD.
            let finalDate = competition.dateIso;

            if (!finalDate) {
                // Should not happen with new logic, but fallback just in case
                console.warn('Missing dateIso, falling back to today');
                finalDate = new Date().toISOString().split('T')[0];
            }

            await competitionsService.assignCompetition(
                {
                    name: competition.campeonato,
                    date: finalDate,
                    location: competition.sede
                },
                Array.from(selectedAthletes),
                session.user.id
            );

            toast.success(`Competición asignada a ${selectedAthletes.size} atletas`);
            onClose();
            setSelectedAthletes(new Set()); // Reset selection
        } catch (error: any) {
            console.error('Error assigning competition:', error);
            // Show more specific error
            const msg = error.message || 'Error desconocido';
            toast.error(`Error: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    // Filter athletes
    const filteredAthletes = athletes.filter(a =>
        (a.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-[#1c1c1c] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#252525] shrink-0">
                        <div>
                            <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
                                <Trophy className="text-anvil-red" size={20} />
                                Asignar Competición
                            </h2>
                            {competition && (
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
                                    {competition.campeonato}
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar atleta..."
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-anvil-red/50 transition-colors"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Athletes Grid */}
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <Loader className="animate-spin text-anvil-red" size={32} />
                            </div>
                        ) : filteredAthletes.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {filteredAthletes.map(athlete => {
                                    const isSelected = selectedAthletes.has(athlete.id);
                                    return (
                                        <div
                                            key={athlete.id}
                                            onClick={() => toggleAthlete(athlete.id)}
                                            className={`
                                                flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all active:scale-[0.98]
                                                ${isSelected
                                                    ? 'bg-anvil-red/10 border-anvil-red text-white'
                                                    : 'bg-[#252525] border-white/5 text-gray-400 hover:border-white/20 hover:text-white'}
                                            `}
                                        >
                                            <div className={`
                                                w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors
                                                ${isSelected ? 'bg-anvil-red border-anvil-red' : 'border-gray-600'}
                                            `}>
                                                {isSelected && <Check size={12} className="text-white" />}
                                            </div>

                                            <div className="flex items-center gap-3 min-w-0">
                                                {athlete.avatar_url ? (
                                                    <img src={athlete.avatar_url} alt="" className="w-8 h-8 rounded-full bg-black/20 object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                        <User size={14} />
                                                    </div>
                                                )}
                                                <span className="font-bold text-sm truncate">{athlete.full_name}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-500">
                                No se encontraron atletas.
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/5 bg-[#252525] shrink-0 flex items-center justify-between gap-4">
                        <div className="text-sm text-gray-400">
                            <span className="text-white font-bold">{selectedAthletes.size}</span> atletas seleccionados
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-bold uppercase tracking-wider text-xs transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAssign}
                                disabled={submitting || selectedAthletes.size === 0}
                                className="px-6 py-2 rounded-lg bg-white text-black hover:bg-gray-200 font-black uppercase tracking-wider text-xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? <Loader className="animate-spin" size={14} /> : <Save size={14} />}
                                Asignar
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
