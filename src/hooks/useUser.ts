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
    // 1. Get Session with Strict Timeout (Prevent hanging on "Verifying session...")
    try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Session check timeout')), 4000)
        );

        // This ensures we never wait more than 4s for Supabase to tell us the session
        const { data: { session }, error: sessionError } = await Promise.race([
            sessionPromise,
            timeoutPromise
        ]) as any;

        if (sessionError || !session?.user) {
            return null;
        }

        const userId = session.user.id;
        const meta = session.user.user_metadata;
        const sessionRole = (meta?.role as 'athlete' | 'coach' | 'admin') || 'athlete';

        const optimisticUser: UserProfile = {
            id: userId,
            email: session.user.email,
            name: meta?.full_name || session.user.email?.split('@')[0] || 'Usuario',
            nickname: meta?.nickname,
            profile_image: meta?.avatar_url,
            role: sessionRole,
            user_metadata: meta
        };

        // 2. Fetch Profile (Background Update)
        // If this fails/timesout, we just return the Optimistic User
        try {
            const dbTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
            );

            const dbFetch = async () => {
                let { data: profile, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error && error.code === 'PGRST116') {
                    // Create if missing
                    const { data: newProfile } = await supabase
                        .from('profiles')
                        .insert([{
                            id: userId,
                            full_name: optimisticUser.name,
                            nickname: optimisticUser.nickname || 'Atleta',
                            role: 'athlete'
                        }])
                        .select()
                        .single();
                    profile = newProfile;
                }
                return profile;
            };

            const profile = await Promise.race([dbFetch(), dbTimeout]) as any;

            if (profile) {
                return {
                    ...optimisticUser,
                    name: profile.full_name || profile.name || optimisticUser.name,
                    nickname: profile.nickname || optimisticUser.nickname,
                    role: profile.role || optimisticUser.role,
                    profile_image: profile.avatar_url || profile.profile_image || optimisticUser.profile_image
                };
            }
        } catch (e) {
            console.warn('Profile sync failed, using session data');
        }

        return optimisticUser;

    } catch (e) {
        console.error('Session check failed or timed out', e);
        return null; // Fail safe to logged out state
    }
};

export const useUser = () => {
    return useQuery({
        queryKey: ['user'],
        queryFn: fetchUser,
        staleTime: 1000 * 60 * 5,
        retry: 0, // Fail fast now that we handle timeouts internally
        refetchOnWindowFocus: false // Prevent inconsistent reloading
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
