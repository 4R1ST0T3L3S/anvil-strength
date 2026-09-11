import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { vigilarRestauracionDeHistorial } from '../lib/sesion';
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

        // Use onAuthStateChange as the SINGLE source of truth for session
        // This handles both initial session restoration and subsequent changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, currentSession) => {


            if (!mounted) return;

            switch (event) {
                case 'INITIAL_SESSION':
                    // This fires on page load with the persisted session (if any)
                    setSession(currentSession);
                    setLoading(false);
                    break;
                case 'SIGNED_IN':
                case 'TOKEN_REFRESHED':
                case 'USER_UPDATED':
                    setSession(currentSession);
                    // Use setTimeout to avoid Supabase deadlock warning
                    setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['user'] });
                    }, 0);
                    break;
                case 'SIGNED_OUT':
                    setSession(null);
                    queryClient.clear();
                    break;
                default:
                    // Handle any other events
                    setSession(currentSession);
            }
        });

        // Fallback timeout in case INITIAL_SESSION doesn't fire (edge case)
        const fallbackTimeout = setTimeout(() => {
            if (mounted && loading) {
                console.warn('Auth INITIAL_SESSION timeout, checking session manually');
                supabase.auth.getSession().then(({ data: { session: fallbackSession } }) => {
                    if (mounted) {
                        setSession(fallbackSession);
                        setLoading(false);
                    }
                });
            }
        }, 3000);

        return () => {
            mounted = false;
            clearTimeout(fallbackTimeout);
            subscription.unsubscribe();
        };
    }, [queryClient, loading]);

    /**
     * EL BOTÓN ATRÁS DESPUÉS DE CERRAR SESIÓN.
     *
     * Salir hace una navegación completa, así que este documento se guarda
     * en la caché de retroceso del navegador con el panel pintado y el
     * objeto `session` vivo en memoria. Pulsar atrás lo restaura tal cual,
     * sin ejecutar nada: se ve el panel del usuario que acaba de salir.
     *
     * Va en un efecto aparte y no en el de arriba a propósito: aquel se
     * vuelve a montar cada vez que cambia `loading`, y esta suscripción no
     * tiene por qué seguir ese ciclo.
     */
    useEffect(() => vigilarRestauracionDeHistorial(() => session !== null), [session]);

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-surface-sunken flex flex-col items-center justify-center text-ink">
                <Loader className="w-12 h-12 text-brand-text animate-spin mb-4" />
                <h2 className="text-xl font-bold">Anvil Strength</h2>
                <p className="text-ink-subtle text-sm mt-2">Verificando sesión...</p>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ session, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
