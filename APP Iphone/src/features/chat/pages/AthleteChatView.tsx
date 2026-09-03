import { useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { UserProfile } from '../../../hooks/useUser';
import { ChatBubble, ChatInput } from '../components/ChatComponents';
import { ChevronLeft, ShieldCheck, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AthleteChatView({ user, onBack }: { user: UserProfile; onBack?: () => void }) {
    const navigate = useNavigate();
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const { messages, loading, sendMessage, markAsRead, hayMas, cargarMas } = useChat(user.id, user.coach_id || null);

    /**
     * Alto del hilo justo ANTES de pedir mensajes viejos.
     *
     * Sin esto, ampliar la ventana antepone mensajes, el efecto de abajo ve
     * que `messages` ha cambiado y baja del todo — es decir, pides ver lo de
     * antes y te manda al final. Guardando el alto previo, la diferencia es
     * exactamente cuánto ha crecido por arriba, y dejar ahí el scroll mantiene
     * la vista clavada donde estaba.
     *
     * Es un `ref` y no un `state` porque no pinta nada: si fuese estado,
     * escribirlo provocaría un render de más en cada pulsación.
     */
    const altoPrevioRef = useRef<number | null>(null);

    const verMasAntiguos = () => {
        altoPrevioRef.current = chatContainerRef.current?.scrollHeight ?? null;
        cargarMas();
    };

    useEffect(() => {
        const hilo = chatContainerRef.current;
        if (hilo) {
            if (altoPrevioRef.current !== null) {
                hilo.scrollTop = hilo.scrollHeight - altoPrevioRef.current;
                altoPrevioRef.current = null;
            } else {
                hilo.scrollTop = hilo.scrollHeight;
            }
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
                        {/* El principio del hilo. Con `hayMas` no es el
                            principio de verdad: es donde llega la ventana que
                            se ha pedido, y por eso ahí va el botón en vez del
                            sello. */}
                        {hayMas ? (
                            <div className="flex justify-center mb-10">
                                <button
                                    onClick={verMasAntiguos}
                                    className="px-5 py-2.5 rounded-full border border-line bg-surface-raised text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle hover:text-ink hover:border-strong transition-colors"
                                >
                                    Ver mensajes anteriores
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center mb-10 opacity-30">
                                <ShieldCheck size={32} className="text-ink-subtle mb-2" />
                                <p className="text-t-2xs font-black uppercase tracking-[0.4em] text-ink-subtle">Conexión Segura de Punto a Punto</p>
                            </div>
                        )}
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
