import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="fixed top-6 right-6 z-[10000] space-y-4 pointer-events-none w-full max-w-[320px] md:max-w-[400px]">
            <AnimatePresence mode="popLayout">
                {notifications.map((notif) => (
                    <motion.div
                        key={notif.id}
                        layout
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className="pointer-events-auto relative group overflow-hidden"
                    >
                        <div className={`
                            relative flex gap-4 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all
                            ${notif.type === 'success' ? 'bg-green-500/10 border-green-500/20' : 
                              notif.type === 'error' ? 'bg-anvil-red/10 border-anvil-red/20' :
                              notif.type === 'reward' ? 'bg-yellow-500/10 border-yellow-500/20' :
                              'bg-white/5 border-white/10'}
                        `}>
                            {/* Icon */}
                            <div className={`
                                shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg
                                ${notif.type === 'success' ? 'bg-green-500 text-white' : 
                                  notif.type === 'error' ? 'bg-anvil-red text-white' :
                                  notif.type === 'reward' ? 'bg-yellow-500 text-black' :
                                  'bg-white/10 text-white'}
                            `}>
                                {notif.type === 'success' && <CheckCircle size={24} />}
                                {notif.type === 'error' && <XCircle size={24} />}
                                {notif.type === 'reward' && <Coins size={24} className="animate-bounce" />}
                                {notif.type === 'info' && <Bell size={24} />}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-6">
                                <h4 className="text-sm font-black uppercase italic text-white leading-tight mb-1 truncate">
                                    {notif.title}
                                </h4>
                                <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight tracking-wider">
                                    {notif.message}
                                </p>
                            </div>

                            {/* Close Button */}
                            <button 
                                onClick={() => removeNotification(notif.id)}
                                className="absolute top-2 right-2 p-1 text-gray-600 hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>

                            {/* Progress bar */}
                            <motion.div 
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: 5, ease: "linear" }}
                                className={`absolute bottom-0 left-0 h-1 ${
                                    notif.type === 'success' ? 'bg-green-500' : 
                                    notif.type === 'error' ? 'bg-anvil-red' :
                                    notif.type === 'reward' ? 'bg-yellow-500' :
                                    'bg-white/20'
                                }`}
                            />
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
