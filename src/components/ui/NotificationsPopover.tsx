import React, { useState } from 'react';
import { Bell, Check, MessageSquare, Trophy, Dumbbell, Apple, Info, X } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppNotification } from '../../types/database';

interface NotificationsPopoverProps {
    userId: string;
}

const getIcon = (type: AppNotification['type']) => {
    switch (type) {
        case 'chat': return <MessageSquare className="text-blue-400" size={16} />;
        case 'arena': return <Trophy className="text-yellow-400" size={16} />;
        case 'training': return <Dumbbell className="text-anvil-red" size={16} />;
        case 'nutrition': return <Apple className="text-green-400" size={16} />;
        case 'points': return <Trophy className="text-yellow-500" size={16} />;
        default: return <Info className="text-gray-400" size={16} />;
    }
};

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({ userId }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(userId);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
                <Bell size={20} className={unreadCount > 0 ? "text-anvil-red animate-pulse" : "text-gray-400 group-hover:text-white"} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-anvil-red text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#1a1a1a]">
                        {unreadCount > 9 ? '+9' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 max-h-[480px] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-[110] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#252525]">
                            <h3 className="font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                <Bell size={14} className="text-anvil-red" /> Notificaciones
                            </h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-[10px] font-bold text-gray-500 hover:text-white uppercase transition-colors"
                                >
                                    Marcar todo leído
                                </button>
                            )}
                        </div>

                        <div className="overflow-y-auto max-h-[400px] scrollbar-hide">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <Bell size={32} className="mx-auto text-gray-700 mb-2 opacity-20" />
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">No hay notificaciones</p>
                                </div>
                            ) : (
                                notifications.map((notif) => (
                                    <div
                                        key={notif.id}
                                        onClick={() => markAsRead(notif.id)}
                                        className={`p-4 border-b border-white/5 cursor-pointer transition-colors ${notif.is_read ? 'opacity-60 bg-transparent' : 'bg-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-1 shrink-0 p-2 rounded-lg bg-black/20">
                                                {getIcon(notif.type)}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="text-xs font-black uppercase tracking-tight text-white">{notif.title}</h4>
                                                    {!notif.is_read && <div className="w-2 h-2 bg-anvil-red rounded-full shadow-[0_0_8px_rgba(220,38,38,0.5)]" />}
                                                </div>
                                                <p className="text-xs text-gray-400 leading-relaxed mb-2">{notif.content}</p>
                                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">
                                                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: es })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
