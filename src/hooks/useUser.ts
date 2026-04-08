import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

import { Profile, Role } from '../types/database';

export interface UserProfile {
    id: string;
    email?: string;
    full_name: string; // Changed from 'name' to match database schema
    nickname?: string;
    avatar_url?: string; // Changed from 'profile_image' to match database schema
    role: Role;
    has_access: boolean;
    gender?: 'male' | 'female';
    age_category?: string;
    weight_category?: string;
    biography?: string;
    squat_pr?: number;
    bench_pr?: number;
    deadlift_pr?: number;
    user_metadata?: Record<string, unknown>;
    brand_color?: string | null;
    logo_url?: string | null;
    coach_id?: string | null;
    coach_name?: string | null;
    coach_brand_color?: string | null;
    coach_logo_url?: string | null;
    nutritionist_id?: string | null;
    nutritionist_name?: string | null;
    // Backward compatibility aliases (deprecated)
    name?: string; // Alias for full_name
    profile_image?: string; // Alias for avatar_url
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
            full_name: meta?.full_name || session.user.email?.split('@')[0] || 'Usuario',
            nickname: meta?.nickname,
            avatar_url: meta?.avatar_url,
            role: sessionRole,
            has_access: false, // Default to false until profile loads
            gender: meta?.gender,
            user_metadata: meta,
            // Backward compatibility aliases
            name: meta?.full_name || session.user.email?.split('@')[0] || 'Usuario',
            profile_image: meta?.avatar_url
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
                            role: 'athlete',
                            has_access: false
                        }])
                        .select()
                        .single();
                    return newProfile as Profile;
                }
                return data as Profile;
            };

            const profile = await Promise.race([dbFetch(), dbTimeout]);

            if (profile) {
                // Fetch coach name if athlete has a coach assigned
                // Fetch coach name and branding if athlete has a coach assigned
                let coachName: string | null = null;
                let coachBrandColor: string | null = null;
                let coachLogoUrl: string | null = null;
                if (profile.coach_id) {
                    const { data: coachData } = await supabase
                        .from('profiles')
                        .select('full_name, brand_color, logo_url')
                        .eq('id', profile.coach_id)
                        .single();
                    coachName = coachData?.full_name ?? null;
                    coachBrandColor = coachData?.brand_color ?? null;
                    coachLogoUrl = coachData?.logo_url ?? null;
                }

                // Fetch nutritionist name if athlete has a nutritionist assigned
                let nutritionistName: string | null = null;
                if (profile.nutritionist_id) {
                    const { data: nutData } = await supabase
                        .from('profiles')
                        .select('full_name')
                        .eq('id', profile.nutritionist_id)
                        .single();
                    nutritionistName = nutData?.full_name ?? null;
                }

                return {
                    ...optimisticUser,
                    full_name: profile.full_name || optimisticUser.full_name,
                    nickname: profile.nickname || optimisticUser.nickname,
                    role: profile.role || optimisticUser.role,
                    has_access: profile.has_access ?? false,
                    avatar_url: profile.avatar_url || optimisticUser.avatar_url,
                    gender: profile.gender || optimisticUser.gender,
                    age_category: profile.age_category,
                    weight_category: profile.weight_category,
                    biography: profile.biography,
                    squat_pr: profile.squat_pr,
                    bench_pr: profile.bench_pr,
                    deadlift_pr: profile.deadlift_pr,
                    brand_color: profile.brand_color,
                    logo_url: profile.logo_url,
                    coach_id: profile.coach_id ?? null,
                    coach_name: coachName,
                    coach_brand_color: coachBrandColor,
                    coach_logo_url: coachLogoUrl,
                    nutritionist_id: profile.nutritionist_id ?? null,
                    nutritionist_name: nutritionistName,
                    // Backward compatibility
                    name: profile.full_name || optimisticUser.full_name,
                    profile_image: profile.avatar_url || optimisticUser.avatar_url
                };
            }
        } catch {
            console.warn('Profile sync failed, using session data');
        }

        return optimisticUser;

    } catch (error) {
        // If it's a timeout or specific error, rethrow so useQuery sees it as an error
        if (error instanceof Error && error.message.includes('timeout')) {
            throw error;
        }
        // If it's a generic auth error (e.g., weird Supabase state), returning null is safer (logs out)
        // But for network issues, we want Error state, not Logout state.
        // Let's rely on standard error handling for everything except explicit "No Session".
        return null;
    }
};

export const useUser = () => {
    return useQuery({
        queryKey: ['user'],
        queryFn: fetchUser,
        staleTime: 1000 * 60, // 1 minute
        retry: 2,
        placeholderData: (previousData) => previousData, // Keep user during refetch
    });
};
