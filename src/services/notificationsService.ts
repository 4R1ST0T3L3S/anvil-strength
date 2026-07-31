import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface AppNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
}

export const notificationsService = {
    async getNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as AppNotification[];
    },

    async getUnreadCount(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        return count || 0;
    },

    async markAllRead(userId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;
    },

    async markRead(notificationId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) throw error;
    },

    /** Suscripción en tiempo real a nuevas notificaciones del usuario. */
    subscribe(userId: string, onNotification: (n: AppNotification) => void): RealtimeChannel {
        return supabase
            .channel(`notifications_${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => onNotification(payload.new as AppNotification))
            .subscribe();
    }
};
