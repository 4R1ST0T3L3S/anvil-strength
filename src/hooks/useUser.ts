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
    // 1. Get Session (Fast, Local)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
        return null; // No session, user is logged out
    }

    const userId = session.user.id;
    const meta = session.user.user_metadata;
    // user_metadata role fallback is critical for optimistic rendering
    // Assuming 'athlete' if undefined, which is safe default
    const sessionRole = (meta?.role as 'athlete' | 'coach' | 'admin') || 'athlete';

    // Construct Optimistic User from Session
    const optimisticUser: UserProfile = {
        id: userId,
        email: session.user.email,
        name: meta?.full_name || session.user.email?.split('@')[0] || 'Usuario',
        nickname: meta?.nickname,
        profile_image: meta?.avatar_url,
        role: sessionRole,
        user_metadata: meta
    };

    // 2. Fetch Profile from DB (Slow, Remote)
    // We wrap this in a short timeout (e.g. 5s). If it fails/times out, we return the Optimistic User.
    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        );

        const dbFetch = async () => {
            let { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            // Handle creation if missing
            if (error && error.code === 'PGRST116') {
                const { data: newProfile, error: createError } = await supabase
                    .from('profiles')
                    .insert([{
                        id: userId,
                        full_name: optimisticUser.name,
                        nickname: optimisticUser.nickname || 'Atleta',
                        role: 'athlete'
                    }])
                    .select()
                    .single();
                if (createError) throw createError;
                profile = newProfile;
            } else if (error) {
                throw error;
            }
            return profile;
        };

        const profile = await Promise.race([dbFetch(), timeout]) as any;

        // Return Merged User (DB data overwrites session data)
        return {
            ...optimisticUser,
            name: profile?.full_name || profile?.name || optimisticUser.name,
            nickname: profile?.nickname || optimisticUser.nickname,
            profile_image: profile?.avatar_url || profile?.profile_image || optimisticUser.profile_image,
            role: profile?.role || optimisticUser.role,
        };

    } catch (error) {
        console.warn('useUser: Profile fetch failed or timed out. Using session data.', error);
        // Fallback: Return Optimistic User instead of throwing error!
        return optimisticUser;
    }
};

export const useUser = () => {
    return useQuery({
        queryKey: ['user'],
        queryFn: fetchUser,
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 2
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
