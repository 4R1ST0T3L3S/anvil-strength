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

    /**
     * Suscripción en tiempo real a nuevas notificaciones del usuario.
     *
     * El topic lleva un sufijo aleatorio y no solo `userId` porque React
     * StrictMode (y cualquier remontado normal, como cambiar de panel)
     * monta el efecto dos veces. Con un topic fijo, `supabase.channel()`
     * devuelve el canal VIEJO si sigue registrado — y limpiar con
     * `.unsubscribe()` en vez de `supabase.removeChannel()` es justo lo que
     * lo dejaba registrado: `unsubscribe()` cierra el socket pero no saca el
     * canal de la lista interna, así que el siguiente `.channel()` con el
     * mismo nombre recupera ese canal todavía en estado `joined`, y
     * `.on('postgres_changes', …)` lanza "cannot add callbacks … after
     * subscribe()". Con nombre único cada montaje es un canal nuevo de
     * verdad, y `removeChannel` es lo que de verdad lo da de baja.
     */
    subscribe(userId: string, onNotification: (n: AppNotification) => void): RealtimeChannel {
        return supabase
            .channel(`notifications_${userId}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => onNotification(payload.new as AppNotification))
            .subscribe();
    }
};
