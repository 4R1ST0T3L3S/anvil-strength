import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AnvilToast, NotificationType } from './AnvilToast';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../hooks/useUser';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
}

interface NotificationContextType {
    addNotification: (title: string, message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children, user }: { children: React.ReactNode, user: UserProfile | null }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = useCallback((title: string, message: string, type: NotificationType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setNotifications(prev => [...prev, { id, title, message, type }]);

        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Listen for Real-time events
    useEffect(() => {
        if (!user) return;

        // 1. Listen for new messages
        const chatChannel = supabase.channel(`global_chat_notifs_${user.id}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'chat_messages',
                filter: `receiver_id=eq.${user.id}`
            }, (_payload) => {
                // If the user is NOT on the chat page, show notification
                if (window.location.pathname !== '/dashboard/chat') {
                    addNotification('Nuevo Mensaje', 'Has recibido un mensaje del staff.', 'info');
                }
            })
            .subscribe();

        // 2. Listen for resolved bets (this requires a specific broadcast or watching user_points)
        const pointsChannel = supabase.channel(`points_notifs_${user.id}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_points',
                filter: `user_id=eq.${user.id}`
            }, (payload: any) => {
                const oldBalance = payload.old.balance;
                const newBalance = payload.new.balance;
                
                if (newBalance > oldBalance) {
                    addNotification('¡Puntos Ganados!', `Has recibido ${newBalance - oldBalance} AC.`, 'reward');
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(chatChannel);
            supabase.removeChannel(pointsChannel);
        };
    }, [user, addNotification]);

    return (
        <NotificationContext.Provider value={{ addNotification }}>
            {children}
            <AnvilToast notifications={notifications} removeNotification={removeNotification} />
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
