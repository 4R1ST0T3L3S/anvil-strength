import { m, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle, XCircle, Coins, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'reward';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
}

interface AnvilToastProps {
    notifications: Notification[];
    removeNotification: (id: string) => void;
}

export function AnvilToast({ notifications, removeNotification }: AnvilToastProps) {
    return (
        <div className="fixed top-6 right-6 z-[10000] space-y-4 pointer-events-none w-full max-w-[400px]">
            <AnimatePresence mode="popLayout">
                {notifications.map((notif) => (
                    <m.div
                        key={notif.id}
                        layout
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className="pointer-events-auto relative group overflow-hidden"
                    >
                        <div className={`
 relative flex gap-4 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-[background-color,border-color,box-shadow]
 ${notif.type === 'success' ? 'bg-success-quiet border-success/20' : 
 notif.type === 'error' ? 'bg-brand/10 border-brand/20' :
 notif.type === 'reward' ? 'bg-warning-quiet border-warning/20' :
 'bg-white/5 border-line'}
`}>
                            {/* Icon */}
                            <div className={`
 shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg
 ${notif.type === 'success' ? 'bg-green-500 text-ink' : 
 notif.type === 'error' ? 'bg-brand text-ink' :
 notif.type === 'reward' ? 'bg-yellow-500 text-black' :
 'bg-white/10 text-ink'}
`}>
                                {notif.type === 'success' && <CheckCircle size={24} />}
                                {notif.type === 'error' && <XCircle size={24} />}
                                {notif.type === 'reward' && <Coins size={24} className="animate-bounce" />}
                                {notif.type === 'info' && <Bell size={24} />}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-6">
                                <h4 className="text-sm font-black uppercase italic text-ink leading-tight mb-1 truncate">
                                    {notif.title}
                                </h4>
                                <p className="text-t-2xs font-bold text-ink-muted uppercase leading-tight tracking-wider">
                                    {notif.message}
                                </p>
                            </div>

                            {/* Close Button */}
                            <button 
                                onClick={() => removeNotification(notif.id)}
                                className="absolute top-2 right-2 p-1 text-gray-600 hover:text-ink transition-colors"
                            >
                                <X size={14} />
                            </button>

                            {/* Progress bar */}
                            <m.div 
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: 5, ease: "linear" }}
                                className={`absolute bottom-0 left-0 h-1 ${
 notif.type === 'success' ? 'bg-green-500' : 
 notif.type === 'error' ? 'bg-brand' :
 notif.type === 'reward' ? 'bg-yellow-500' :
 'bg-white/20'
 }`}
                            />
                        </div>
                    </m.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
