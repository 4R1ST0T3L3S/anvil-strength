import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Loader, BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { notificationsService, AppNotification } from '../../services/notificationsService';
import { usePushNotifications } from '../../hooks/usePushNotifications';

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'ahora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days} d`;
    return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Campana de notificaciones en tiempo real.
 * - Badge con nº de no leídas.
 * - Al entrar en la app, muestra un toast con las notificaciones pendientes.
 * - Nuevas notificaciones llegan por Supabase Realtime y disparan toast.
 */
export function NotificationBell({ userId }: { userId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const welcomeShown = useRef(false);
    const push = usePushNotifications();

    const handleTogglePush = async () => {
        if (push.isSubscribed) {
            const ok = await push.unsubscribe();
            if (ok) toast('Notificaciones push desactivadas');
        } else {
            const ok = await push.subscribeToPush();
            if (ok) toast.success('¡Push activadas! Te avisaremos aunque la app esté cerrada.');
            else if (push.permission === 'denied') toast.error('Las notificaciones están bloqueadas en los ajustes del navegador.');
            else toast.error('No se pudieron activar las push.');
        }
    };

    const refresh = useCallback(async () => {
        try {
            const [items, count] = await Promise.all([
                notificationsService.getNotifications(userId),
                notificationsService.getUnreadCount(userId)
            ]);
            setNotifications(items);
            setUnreadCount(count);
            return count;
        } catch (e) {
            console.error('Error loading notifications:', e);
            return 0;
        }
    }, [userId]);

    // Carga inicial + aviso de bienvenida
    useEffect(() => {
        refresh().then(count => {
            if (count > 0 && !welcomeShown.current) {
                welcomeShown.current = true;
                toast(`🔔 Tienes ${count} ${count === 1 ? 'aviso nuevo' : 'avisos nuevos'}`, {
                    description: 'Pulsa la campana para verlos.',
                    duration: 5000,
                });
            }
        });
    }, [refresh]);

    // Realtime: nuevas notificaciones
    useEffect(() => {
        const channel = notificationsService.subscribe(userId, (n) => {
            setNotifications(prev => [n, ...prev]);
            setUnreadCount(prev => prev + 1);
            toast(n.title, { description: n.message, duration: 6000 });
        });
        return () => { channel.unsubscribe(); };
    }, [userId]);

    // Cerrar al hacer click fuera
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const handleOpen = async () => {
        setIsOpen(prev => !prev);
        if (!isOpen && notifications.length === 0) {
            setLoading(true);
            await refresh();
            setLoading(false);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationsService.markAllRead(userId);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (e) {
            console.error('Error marking notifications read:', e);
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={handleOpen}
                className="relative p-2 text-gray-400 hover:text-white transition-colors"
                aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-anvil-red rounded-full text-[10px] font-black text-white flex items-center justify-center border-2 border-[#1c1c1c]">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[150]"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-white/5">
                            <h3 className="font-black uppercase text-white text-sm tracking-wider">Notificaciones</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-anvil-red uppercase tracking-wide transition-colors"
                                >
                                    <CheckCheck size={14} /> Marcar leídas
                                </button>
                            )}
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <Loader className="animate-spin text-anvil-red" size={22} />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="py-12 text-center text-gray-500 text-sm">
                                    <Bell size={28} className="mx-auto mb-3 opacity-30" />
                                    No tienes notificaciones.
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div
                                        key={n.id}
                                        className={`p-4 border-b border-white/5 last:border-b-0 transition-colors ${
                                            n.is_read ? 'opacity-60' : 'bg-anvil-red/5'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {!n.is_read && <span className="w-2 h-2 bg-anvil-red rounded-full mt-1.5 shrink-0" />}
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white leading-tight">{n.title}</p>
                                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                                                <p className="text-[10px] text-gray-600 font-bold uppercase mt-1.5">{timeAgo(n.created_at)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Push toggle */}
                        {push.isSupported && (
                            <div className="p-3 border-t border-white/5 bg-black/20">
                                <button
                                    onClick={handleTogglePush}
                                    disabled={push.isLoading}
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
                                        push.isSubscribed
                                            ? 'bg-white/5 text-gray-400 hover:text-white'
                                            : 'bg-anvil-red hover:bg-red-700 text-white'
                                    }`}
                                >
                                    {push.isLoading ? <Loader className="animate-spin" size={13} /> : push.isSubscribed ? <BellOff size={13} /> : <BellRing size={13} />}
                                    {push.isSubscribed ? 'Desactivar avisos push' : 'Activar avisos push (app cerrada)'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
