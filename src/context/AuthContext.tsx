import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Loader } from 'lucide-react';

interface AuthContextType {
    session: Session | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ session: null, loading: true });

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const queryClient = useQueryClient();

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                // 1. Check active session on mount
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('Error getting session:', error);
                    // If error (e.g. refresh token missing), ensure we are signed out
                    if (mounted) {
                        setSession(null);
                        setLoading(false);
                    }
                    return;
                }

                if (mounted) {
                    setSession(session);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Auth initialization exception:", err);
                if (mounted) {
                    setSession(null);
                    setLoading(false);
                }
            }
        };

        initializeAuth();

        // 2. Listen for auth changes (including token refresh)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth event:', event); // Debug logging

            if (!mounted) return;

            if (event === 'TOKEN_REFRESHED') {
                setSession(session);
            } else if (event === 'SIGNED_OUT') {
                setSession(null);
                queryClient.clear(); // Clear all cache on logout
                // Force local storage clear just in case
                if (typeof window !== 'undefined') {
                    window.localStorage.removeItem('anvil-auth-token');
                }
            } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
                setSession(session);
                await queryClient.invalidateQueries({ queryKey: ['user'] });
            } else {
                setSession(session);
            }
            setLoading(false);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [queryClient]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white">
                <Loader className="w-12 h-12 text-anvil-red animate-spin mb-4" />
                <h2 className="text-xl font-bold tracking-widest uppercase">Anvil Strength</h2>
                <p className="text-gray-500 text-sm mt-2">Verificando sesión...</p>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ session, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
