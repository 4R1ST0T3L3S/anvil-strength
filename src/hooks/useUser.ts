import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface UserProfile {
    id: string;
    email?: string;
    name: string;
    nickname?: string;
    profile_image?: string;
    role: 'athlete' | 'coach' | 'admin';
    user_metadata?: any;
}

const fetchUser = async (): Promise<UserProfile | null> => {
    // 1. Get Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const userId = session.user.id;
    const meta = session.user.user_metadata;

    // 2. Fetch Profile from DB
    let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    // 3. Handle missing profile (Create if needed)
    if (error && error.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
                id: userId,
                full_name: meta?.full_name || session.user.email?.split('@')[0],
                nickname: meta?.nickname || 'Atleta',
                role: 'athlete'
            }])
            .select()
            .single();

        if (createError) throw createError;
        profile = newProfile;
    } else if (error) {
        throw error;
    }

    // 4. Transform to application User object
    return {
        id: userId,
        email: session.user.email,
        name: profile?.full_name || profile?.name || meta?.full_name,
        nickname: profile?.nickname,
        profile_image: profile?.avatar_url || profile?.profile_image || meta?.avatar_url,
        role: profile?.role || 'athlete',
        user_metadata: meta
    };
};

export const useUser = () => {
    return useQuery({
        queryKey: ['user'],
        queryFn: fetchUser,
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1
    });
};

export const useLogout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            await supabase.auth.signOut();
        },
        onSuccess: () => {
            queryClient.setQueryData(['user'], null);
            queryClient.clear();
            localStorage.removeItem('user'); // Cleanup legacy local storage
        }
    });
};
