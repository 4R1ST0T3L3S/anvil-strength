import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, User, Megaphone, MessageCircle, ChevronLeft, Loader, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../../hooks/useUser';
import { chatService, ChatMessage, ChatContact, Announcement } from '../../services/chatService';
import { isAdmin as isAdminUser, isCoach as isCoachUser } from '../../lib/roles';

type Tab = 'chat' | 'announcements';

export function ChatView({ user }: { user: UserProfile }) {
    const [tab, setTab] = useState<Tab>('chat');
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [activeContact, setActiveContact] = useState<ChatContact | null>(null);
    const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});
    const [loadingContacts, setLoadingContacts] = useState(true);

    const isCoach = isCoachUser(user);
    const isAdmin = isAdminUser(user);

    // Cargar contactos: el coach ve a sus atletas; el atleta a su coach
    useEffect(() => {
        const load = async () => {
            try {
                setLoadingContacts(true);
                if (isCoach) {
                    const athletes = await chatService.getMyAthletes(user.id);
                    setContacts(athletes);
                } else {
                    const coach = await chatService.getMyCoach(user.id);
                    setContacts(coach ? [coach] : []);
                    if (coach) setActiveContact(coach); // el atleta entra directo a su chat
                }
                const unread = await chatService.getUnreadBySender(user.id);
                setUnreadBySender(unread);
            } catch (e) {
                console.error('Error loading chat contacts:', e);
                toast.error('Error al cargar los contactos');
            } finally {
                setLoadingContacts(false);
            }
        };
        load();
    }, [user.id, isCoach]);

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col h-full">
            {/* Header + Tabs */}
            <div className="mb-6 shrink-0">
                <h1 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-white mb-4">
                    Mensajes
                </h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setTab('chat')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border ${
                            tab === 'chat' ? 'bg-anvil-red border-anvil-red text-white' : 'bg-[#252525] border-white/5 text-gray-400 hover:text-white'
                        }`}
                    >
                        <MessageCircle size={14} /> Chat
                    </button>
                    <button
                        onClick={() => setTab('announcements')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border ${
                            tab === 'announcements' ? 'bg-anvil-red border-anvil-red text-white' : 'bg-[#252525] border-white/5 text-gray-400 hover:text-white'
                        }`}
                    >
                        <Megaphone size={14} /> Anuncios del club
                    </button>
                </div>
            </div>

            {tab === 'announcements' ? (
                <AnnouncementsPanel user={user} isAdmin={isAdmin} />
            ) : loadingContacts ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader className="animate-spin text-anvil-red" size={28} />
                </div>
            ) : activeContact ? (
                <Conversation
                    user={user}
                    contact={activeContact}
                    showBack={isCoach}
                    onBack={() => setActiveContact(null)}
                />
            ) : contacts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 py-20">
                    <MessageCircle size={40} className="mb-4 opacity-30" />
                    <p className="font-bold">
                        {isCoach ? 'Aún no tienes atletas asignados.' : 'Aún no tienes entrenador asignado.'}
                    </p>
                    <p className="text-sm mt-1">El chat se activará automáticamente cuando se haga la asignación.</p>
                </div>
            ) : (
                /* Lista de contactos (coach) */
                <div className="space-y-2">
                    {contacts.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setActiveContact(c)}
                            className="w-full flex items-center gap-4 p-4 bg-[#252525] hover:bg-[#2d2d2d] border border-white/5 hover:border-anvil-red/30 rounded-2xl transition-all text-left"
                        >
                            {c.avatar_url ? (
                                <img src={c.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover bg-black/20" />
                            ) : (
                                <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-gray-400">
                                    <User size={18} />
                                </div>
                            )}
                            <span className="font-bold text-white flex-1 truncate">{c.full_name}</span>
                            {unreadBySender[c.id] > 0 && (
                                <span className="min-w-[22px] h-[22px] px-1.5 bg-anvil-red rounded-full text-[11px] font-black text-white flex items-center justify-center">
                                    {unreadBySender[c.id]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============ Conversación 1 a 1 ============

function Conversation({
    user,
    contact,
    showBack,
    onBack
}: {
    user: UserProfile;
    contact: ChatContact;
    showBack: boolean;
    onBack: () => void;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }, []);

    // Cargar conversación + marcar leída
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                const msgs = await chatService.getConversation(user.id, contact.id);
                if (cancelled) return;
                setMessages(msgs);
                await chatService.markConversationRead(user.id, contact.id);
            } catch (e) {
                console.error('Error loading conversation:', e);
                toast.error('Error al cargar la conversación');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [user.id, contact.id]);

    // Realtime: mensajes entrantes de este contacto
    useEffect(() => {
        const channel = chatService.subscribeToMessages(user.id, (msg) => {
            if (msg.sender_id === contact.id) {
                setMessages(prev => [...prev, msg]);
                chatService.markConversationRead(user.id, contact.id).catch(() => { /* best-effort */ });
            }
        });
        return () => { channel.unsubscribe(); };
    }, [user.id, contact.id]);

    useEffect(() => { scrollToBottom(messages.length <= 30); }, [messages, scrollToBottom]);

    const handleSend = async () => {
        const content = input.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            const msg = await chatService.sendMessage(user.id, contact.id, content);
            setMessages(prev => [...prev, msg]);
            setInput('');
        } catch (e) {
            console.error('Error sending message:', e);
            toast.error('No se pudo enviar el mensaje');
        } finally {
            setSending(false);
        }
    };

    const formatTime = (d: string) =>
        new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const formatDay = (d: string) =>
        new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    // Agrupar por día para separadores
    let lastDay = '';

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden">
            {/* Cabecera del chat */}
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-[#252525] shrink-0">
                {showBack && (
                    <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <ChevronLeft size={18} />
                    </button>
                )}
                {contact.avatar_url ? (
                    <img src={contact.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover bg-black/20" />
                ) : (
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-400">
                        <User size={16} />
                    </div>
                )}
                <span className="font-bold text-white truncate">{contact.full_name}</span>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[300px] max-h-[55vh]">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader className="animate-spin text-anvil-red" size={22} />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-16">
                        No hay mensajes todavía. ¡Rompe el hielo! 💬
                    </div>
                ) : (
                    messages.map(msg => {
                        const isMine = msg.sender_id === user.id;
                        const day = formatDay(msg.created_at);
                        const showDay = day !== lastDay;
                        lastDay = day;
                        return (
                            <div key={msg.id}>
                                {showDay && (
                                    <div className="text-center my-4">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 bg-white/5 px-3 py-1 rounded-full">
                                            {day}
                                        </span>
                                    </div>
                                )}
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                        isMine
                                            ? 'bg-anvil-red text-white rounded-br-md'
                                            : 'bg-[#2d2d2d] text-gray-200 rounded-bl-md'
                                    }`}>
                                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                        <p className={`text-[10px] mt-1 text-right ${isMine ? 'text-white/60' : 'text-gray-500'}`}>
                                            {formatTime(msg.created_at)}
                                        </p>
                                    </div>
                                </motion.div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/5 bg-[#252525] shrink-0 flex items-end gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors resize-none max-h-32"
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="p-3 bg-anvil-red hover:bg-red-700 rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    aria-label="Enviar mensaje"
                >
                    {sending ? <Loader className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
            </div>
        </div>
    );
}

// ============ Anuncios del club ============

function AnnouncementsPanel({ user, isAdmin }: { user: UserProfile; isAdmin: boolean }) {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        chatService.getAnnouncements()
            .then(setAnnouncements)
            .catch(e => {
                console.error('Error loading announcements:', e);
                toast.error('Error al cargar los anuncios');
            })
            .finally(() => setLoading(false));
    }, []);

    const handlePost = async () => {
        if (!title.trim() || !content.trim() || posting) return;
        setPosting(true);
        try {
            const created = await chatService.postAnnouncement(user.id, title.trim(), content.trim());
            setAnnouncements(prev => [created, ...prev]);
            setTitle('');
            setContent('');
            toast.success('Anuncio publicado. Todos los miembros recibirán la notificación.');
        } catch (e) {
            console.error('Error posting announcement:', e);
            toast.error('No se pudo publicar el anuncio');
        } finally {
            setPosting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await chatService.deleteAnnouncement(id);
            setAnnouncements(prev => prev.filter(a => a.id !== id));
            toast.success('Anuncio eliminado');
        } catch (e) {
            console.error('Error deleting announcement:', e);
            toast.error('No se pudo eliminar');
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
            {/* Formulario admin */}
            {isAdmin && (
                <div className="bg-[#1a1a1a] border border-anvil-red/20 rounded-2xl p-5 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-anvil-red flex items-center gap-2">
                        <Megaphone size={14} /> Publicar anuncio (llegará a todo el club)
                    </p>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={120}
                        placeholder="Título del anuncio"
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold focus:outline-none focus:border-anvil-red/50 transition-colors"
                    />
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={3}
                        maxLength={3000}
                        placeholder="Contenido del anuncio..."
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors resize-none"
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={handlePost}
                            disabled={!title.trim() || !content.trim() || posting}
                            className="px-5 py-2.5 rounded-lg bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-wider text-xs transition-colors disabled:opacity-40 flex items-center gap-2"
                        >
                            {posting ? <Loader className="animate-spin" size={14} /> : <Send size={14} />}
                            Publicar
                        </button>
                    </div>
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader className="animate-spin text-anvil-red" size={26} />
                </div>
            ) : announcements.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                    <Megaphone size={40} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold">No hay anuncios todavía.</p>
                </div>
            ) : (
                announcements.map(a => (
                    <motion.div
                        key={a.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-5 relative group"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="font-black text-white uppercase leading-tight">{a.title}</h3>
                                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mt-1">
                                    {new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={() => handleDelete(a.id)}
                                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    aria-label="Eliminar anuncio"
                                >
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mt-3 whitespace-pre-wrap">{a.content}</p>
                    </motion.div>
                ))
            )}
        </div>
    );
}
