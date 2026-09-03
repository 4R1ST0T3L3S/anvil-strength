import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useUser } from '../../../hooks/useUser';
import { homeRouteFor } from '../../../lib/roles';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

/**
 * Aterrizaje tras autenticarse con Google o tras confirmar el email.
 *
 * Supabase devuelve al usuario aquí con el token en el fragmento de la URL.
 * El cliente lo canjea solo y dispara `SIGNED_IN`, así que esta pantalla no
 * tiene que hacer nada más que ESPERAR a que el contexto tenga sesión y
 * mandar a cada rol a su panel.
 *
 * Existe como ruta propia, en vez de volver a "/", por dos motivos:
 * es una URL fija y concreta que se puede meter en la lista blanca de
 * Supabase, y evita el parpadeo de portada que se veía mientras la sesión
 * terminaba de restaurarse.
 */
export function AuthCallback() {
    const { session, loading: sessionLoading } = useAuth();
    const { data: user, isLoading: userLoading } = useUser();

    // Si el token viniera mal, quedarse aquí girando para siempre sería el
    // peor final posible. A los 8 segundos se devuelve a la portada.
    const [timedOut, setTimedOut] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setTimedOut(true), 8000);
        return () => clearTimeout(t);
    }, []);

    if (timedOut && !session) {
        return <Navigate to="/" replace />;
    }

    if (sessionLoading || (session && userLoading)) {
        return <LoadingSpinner fullscreen message="Entrando…" />;
    }

    if (!session) {
        return <Navigate to="/" replace />;
    }

    // Quien gestiona atletas va a su panel; el resto, al de atleta. Los
    // usuarios sin perfil todavía cargado caen en /dashboard, que ya sabe
    // esperar a que llegue. Ver src/lib/roles.ts.
    return <Navigate to={homeRouteFor(user)} replace />;
}
