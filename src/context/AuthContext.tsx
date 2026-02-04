import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

    useEffect(() => {
        // 1. Check active session on mount
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.error('Error getting session:', error);
            }
            setSession(session);
            setLoading(false);
        });

        // 2. Listen for auth changes (including token refresh)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event); // Debug logging

            if (event === 'TOKEN_REFRESHED') {
                // Token was refreshed, update session
                setSession(session);
            } else if (event === 'SIGNED_OUT') {
                setSession(null);
            } else {
                setSession(session);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

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
