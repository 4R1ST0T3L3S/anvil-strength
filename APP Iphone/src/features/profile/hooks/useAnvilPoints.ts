import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { UserPoints } from '../../../types/database';
import { useEffect } from 'react';

export const useAnvilPoints = (userId: string | undefined) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['anvil_points', userId],
        queryFn: async (): Promise<UserPoints | null> => {
            if (!userId) return null;

            const { data, error } = await supabase
                .from('user_points')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // Points entry doesn't exist yet, return default
                    return {
                        user_id: userId,
                        balance: 0,
                        total_earned: 0,
                        last_updated: new Date().toISOString()
                    };
                }
                console.error('Error fetching Anvil Points:', error);
                throw error;
            }

            return data as UserPoints;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    // Real-time subscription
    useEffect(() => {
        if (!userId) return;

        const channelId = `user_points_${userId}_${Math.random().toString(36).substring(7)}`;
        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_points',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('Real-time points update:', payload);
                    queryClient.setQueryData(['anvil_points', userId], payload.new);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, queryClient]);

    return query;
};
