import { useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { UserProfile } from '../../../hooks/useUser';
import { ChatBubble, ChatInput } from '../components/ChatComponents';
import { ChevronLeft, ShieldCheck, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AthleteChatView({ user, onBack }: { user: UserProfile; onBack?: () => void }) {
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
            <div className="min-h-[100dvh] bg-surface-sunken flex flex-col items-center justify-center p-8 text-center">
                <div className="p-6 bg-brand/10 rounded-full text-brand-text mb-6">
                    <ShieldCheck size={48} />
                </div>
                <h2 className="text-2xl font-black uppercase italic text-ink mb-2">Sin Entrenador Asignado</h2>
                <p className="text-ink-subtle font-bold uppercase text-t-2xs tracking-widest max-w-xs">
                    Contacta con la administración para que se te asigne un técnico de Anvil Strength.
                </p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] bg-surface-sunken flex flex-col">
            {/* Header */}
            <header className="p-6 bg-black/60 backdrop-blur-xl border-b border-subtle flex items-center gap-4">
                {/* `navigate(-1)` se quedaba sin sitio al que volver cuando no
                    había una entrada previa en el historial (recarga, enlace
                    directo, o embebido dentro de otra vista) y dejaba al
                    usuario atrapado en el chat. Con destino explícito, como
                    hace el resto de la app. */}
                <button onClick={() => (onBack ? onBack() : navigate('/dashboard'))} className="p-2 hover:bg-white/10 rounded-full text-ink-subtle hover:text-ink transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black uppercase italic text-ink leading-none">Canal de Comunicación</h1>
                    <p className="text-t-2xs font-bold text-brand-text uppercase tracking-widest mt-1">
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
                        <Loader className="animate-spin text-brand-text" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col items-center mb-10 opacity-30">
                            <ShieldCheck size={32} className="text-ink-subtle mb-2" />
                            <p className="text-t-2xs font-black uppercase tracking-[0.4em] text-ink-subtle">Conexión Segura de Punto a Punto</p>
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
