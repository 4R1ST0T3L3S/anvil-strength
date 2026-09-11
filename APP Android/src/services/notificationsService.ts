import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CategoriaAviso } from './notificationPrefsService';

/**
 * AVISOS (la campana).
 *
 * Los escribe la base: disparadores de bloque nuevo, convocatoria,
 * check-in pendiente, entrenamiento para revisar, feedback recibido… Con
 * `category` desde septiembre de 2026 (database/NOTIFICACIONES_2026-09-11.sql)
 * y `link` a la pantalla que toca.
 */
export interface AppNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
    category?: CategoriaAviso | null;
    ref_id?: string | null;
}

export const notificationsService = {
    async getNotifications(userId: string, limit = 40): Promise<AppNotification[]> {
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
     * Suscripción en tiempo real a nuevos avisos del usuario.
     *
     * Topic con sufijo aleatorio: con un nombre fijo, `supabase.channel()`
     * devuelve el canal VIEJO si sigue registrado y `.on(...)` lanza
     * "cannot add callbacks … after subscribe()". Ver la nota histórica.
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
