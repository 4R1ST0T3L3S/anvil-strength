import { useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { UserProfile } from '../../../hooks/useUser';
import { ChatBubble, ChatInput } from '../components/ChatComponents';
import { ChevronLeft, ShieldCheck, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AthleteChatView({ user }: { user: UserProfile }) {
    const navigate = useNavigate();
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const { messages, loading, sendMessage, markAsRead } = useChat(user.id, user.coach_id || null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
        if (messages.length > 0) {
            markAsRead();
        }
    }, [messages]);

    if (!user.coach_id) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
                <div className="p-6 bg-anvil-red/10 rounded-full text-anvil-red mb-6">
                    <ShieldCheck size={48} />
                </div>
                <h2 className="text-2xl font-black uppercase italic text-white mb-2">Sin Entrenador Asignado</h2>
                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest max-w-xs">
                    Contacta con la administración para que se te asigne un técnico de Anvil Strength.
                </p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] bg-[#0a0a0a] flex flex-col">
            {/* Header */}
            <header className="p-6 bg-black/60 backdrop-blur-xl border-b border-white/5 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black uppercase italic text-white leading-none">Canal de Comunicación</h1>
                    <p className="text-[9px] font-bold text-anvil-red uppercase tracking-widest mt-1">
                        Coach: {user.coach_name || 'Staff Técnico'}
                    </p>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
            </header>

            {/* Messages */}
            <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-6 scrollbar-hide custom-scrollbar"
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader className="animate-spin text-anvil-red" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col items-center mb-10 opacity-30">
                            <ShieldCheck size={32} className="text-gray-500 mb-2" />
                            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-gray-500">Conexión Segura de Punto a Punto</p>
                        </div>
                        {messages.map(msg => (
                            <ChatBubble key={msg.id} message={msg} isOwn={msg.sender_id === user.id} />
                        ))}
                    </>
                )}
            </div>

            {/* Input */}
            <ChatInput onSend={(val) => sendMessage(val)} />
        </div>
    );
}
