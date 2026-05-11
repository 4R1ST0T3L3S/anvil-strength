import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AppNotification } from '../types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const useNotifications = (userId: string | undefined) => {
    const queryClient = useQueryClient();

    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ['notifications', userId],
        queryFn: async (): Promise<AppNotification[]> => {
            if (!userId) return [];
            const { data, error } = await supabase
                .from('app_notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as AppNotification[];
        },
        enabled: !!userId,
    });

    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`notifications_${userId}_${Math.random().toString(36).substring(7)}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'app_notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const newNotification = payload.new as AppNotification;
                    queryClient.setQueryData(['notifications', userId], (old: AppNotification[] = []) => {
                        return [newNotification, ...old];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, queryClient]);

    const markAsRead = async (notificationId: string) => {
        const { error } = await supabase
            .from('app_notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    };

    const markAllAsRead = async () => {
        if (!userId) return;
        const { error } = await supabase
            .from('app_notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return {
        notifications,
        isLoading,
        unreadCount,
        markAsRead,
        markAllAsRead
    };
};
