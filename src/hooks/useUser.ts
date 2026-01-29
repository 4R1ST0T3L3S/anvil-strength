import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

import { Profile, Role } from '../types/database';

export interface UserProfile {
    id: string;
    email?: string;
    name: string;
    nickname?: string;
    profile_image?: string;
    role: Role;
    age_category?: string;
    weight_category?: string;
    biography?: string;
    squat_pr?: number;
    bench_pr?: number;
    deadlift_pr?: number;
    user_metadata?: Record<string, unknown>;
}

const fetchUser = async (): Promise<UserProfile | null> => {
    // 1. Get Session with Strict Timeout
    try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }; error: Error }>((_, reject) =>
            setTimeout(() => reject(new Error('Session check timeout')), 4000)
        );

        // Safe Promise.race typing
        const result = await Promise.race([sessionPromise, timeoutPromise]);

        // Type guard or check structure
        const session = 'data' in result ? result.data.session : null;
        const sessionError = 'error' in result ? result.error : null;

        if (sessionError || !session?.user) {
            return null;
        }

        const userId = session.user.id;
        const meta = session.user.user_metadata;
        const sessionRole = (meta?.role as Role) || 'athlete';

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
        try {
            const dbTimeout = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
            );

            const dbFetch = async (): Promise<Profile | null> => {
                const { data, error } = await supabase
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
                    return newProfile as Profile;
                }
                return data as Profile;
            };

            const profile = await Promise.race([dbFetch(), dbTimeout]);

            if (profile) {
                return {
                    ...optimisticUser,
                    name: profile.full_name || optimisticUser.name,
                    nickname: profile.nickname || optimisticUser.nickname,
                    role: profile.role || optimisticUser.role,
                    profile_image: profile.avatar_url || optimisticUser.profile_image,
                    age_category: profile.age_category,
                    weight_category: profile.weight_category,
                    biography: profile.biography,
                    squat_pr: profile.squat_pr,
                    bench_pr: profile.bench_pr,
                    deadlift_pr: profile.deadlift_pr
                };
            }
        } catch {
            console.warn('Profile sync failed, using session data');
        }

        return optimisticUser;

    } catch {
        return null;
    }
};

export const useUser = () => {
    return useQuery({
        queryKey: ['user'],
        queryFn: fetchUser,
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1
    });
};
