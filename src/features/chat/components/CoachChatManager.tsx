import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Search, MessageSquare, Loader, ChevronLeft } from 'lucide-react';
import { AthleteChatView } from '../pages/AthleteChatView';
import { useNavigate } from 'react-router-dom';

export function CoachChatManager({ coach }: { coach: UserProfile }) {
    const navigate = useNavigate();
    const [athletes, setAthletes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAthlete, setSelectedAthlete] = useState<any | null>(null);

    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        fetchAthletes();
    }, [coach.id, showAll]);

    const fetchAthletes = async () => {
        try {
            setLoading(true);
            let query = supabase.from('profiles').select('*');
            
            if (!showAll) {
                query = query.eq('coach_id', coach.id);
            } else {
                query = query.eq('role', 'athlete');
            }

            const { data: athletesData, error: athletesError } = await query;
            if (athletesError) throw athletesError;

            // Obtener últimos mensajes
            const { data: messages, error: msgsError } = await supabase
                .from('chat_messages')
                .select('*')
                .or(`sender_id.eq.${coach.id},receiver_id.eq.${coach.id}`)
                .order('created_at', { ascending: false });

            if (msgsError) throw msgsError;

            const enrichedAthletes = (athletesData || []).map(athlete => {
                const lastMsg = messages?.find(m => m.sender_id === athlete.id || m.receiver_id === athlete.id);
                const unreadCount = messages?.filter(m => m.sender_id === athlete.id && m.receiver_id === coach.id && !m.is_read).length;
                
                return {
                    ...athlete,
                    lastMessage: lastMsg,
                    unreadCount
                };
            });

            setAthletes(enrichedAthletes);
        } catch (error) {
            console.error('Error fetching athletes for chat:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredAthletes = athletes.filter(a => 
        a.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedAthlete) {
        return (
            <div className="fixed inset-0 z-[70] bg-[#0a0a0a]">
                <button 
                    onClick={() => {
                        setSelectedAthlete(null);
                        fetchAthletes();
                    }}
                    className="absolute top-6 left-6 z-[80] p-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full text-white hover:bg-white/10 transition-all"
                >
                    <ChevronLeft size={24} />
                </button>
                <AthleteChatView user={{ ...coach, coach_id: selectedAthlete.id, coach_name: selectedAthlete.full_name }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] p-6 md:p-12">
            <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/dashboard')}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black uppercase italic text-white leading-none">Mensajería</h1>
                        <p className="text-[10px] font-bold text-anvil-red uppercase tracking-[0.3em] mt-1">Gestión de Atletas Anvil Strength</p>
                    </div>
                </div>
                
                {(coach as any).is_developer && (
                    <button 
                        onClick={() => setShowAll(!showAll)}
                        className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                            showAll 
                            ? 'bg-anvil-red border-anvil-red text-white' 
                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                        }`}
                    >
                        {showAll ? 'VIENDO TODOS LOS ATLETAS' : 'VER SOLO MIS ATLETAS'}
                    </button>
                )}
            </header>

            <div className="max-w-4xl mx-auto space-y-6">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input 
                        type="text"
                        placeholder="BUSCAR POR NOMBRE..."
                        className="w-full bg-[#1a1a1a] border border-white/5 rounded-2xl py-4 pl-12 pr-6 text-white font-bold uppercase text-xs outline-none focus:border-anvil-red/50 transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Athlete List */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-20"><Loader className="animate-spin text-anvil-red" /></div>
                    ) : filteredAthletes.length === 0 ? (
                        <div className="text-center py-20 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10 px-8">
                            <MessageSquare className="mx-auto text-gray-700 mb-4" size={48} />
                            <h4 className="text-white font-black uppercase italic mb-2">No hay atletas disponibles</h4>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                                {showAll 
                                    ? "No se han encontrado perfiles con el rol de atleta en la base de datos."
                                    : "No tienes atletas asignados a tu cuenta. Activa 'Ver todos' para buscar a cualquier atleta."}
                            </p>
                        </div>
                    ) : (
                        filteredAthletes.map(athlete => (
                            <button
                                key={athlete.id}
                                onClick={() => setSelectedAthlete(athlete)}
                                className="w-full bg-[#1a1a1a] border border-white/5 p-6 rounded-3xl flex items-center justify-between group hover:border-anvil-red/30 hover:bg-[#202020] transition-all active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-14 h-14 bg-gradient-to-br from-anvil-red to-red-900 rounded-2xl flex items-center justify-center text-white font-black text-xl italic uppercase">
                                            {athlete.full_name?.substring(0, 1)}
                                        </div>
                                        {athlete.unreadCount > 0 && (
                                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-anvil-red text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#0a0a0a]">
                                                {athlete.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-black text-white uppercase italic text-lg leading-none mb-1 group-hover:text-anvil-red transition-colors">{athlete.full_name}</h4>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase truncate max-w-[200px]">
                                            {athlete.lastMessage ? athlete.lastMessage.content : 'Sin mensajes previos'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {athlete.lastMessage && (
                                        <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">
                                            {new Date(athlete.lastMessage.created_at).toLocaleDateString()}
                                        </span>
                                    )}
                                    <MessageSquare size={20} className="text-gray-700 group-hover:text-anvil-red transition-colors" />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
