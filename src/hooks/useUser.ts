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
    console.log('useUser: Starting fetchUser');

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000)
    );

    const fetchLogic = async () => {
        // 1. Get Session
        console.log('useUser: Getting session...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error('useUser: Session error', sessionError);
            throw sessionError;
        }

        if (!session?.user) {
            console.log('useUser: No session found');
            return null;
        }

        const userId = session.user.id;
        const meta = session.user.user_metadata;
        console.log('useUser: Session found for', userId);

        // 2. Fetch Profile from DB
        console.log('useUser: Fetching profile...');
        let { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // 3. Handle missing profile (Create if needed)
        if (error && error.code === 'PGRST116') {
            console.log('useUser: Profile not found, creating...');
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

            if (createError) {
                console.error('useUser: Error creating profile', createError);
                throw createError;
            }
            profile = newProfile;
        } else if (error) {
            console.error('useUser: Profile fetch error', error);
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

    return Promise.race([fetchLogic(), timeout]) as Promise<UserProfile | null>;
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
