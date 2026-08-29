import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { useRedeemPendingInvite } from './hooks/useRedeemPendingInvite';
import { useClaimManagedProfile } from './hooks/useClaimManagedProfile';
import { AuthModal } from './features/auth/components/AuthModal';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { Toaster } from 'sonner';

import { AppRoutes } from './routes/AppRoutes';
import { CountdownPage } from './features/landing/pages/CountdownPage';
import { NotificationProvider } from './components/ui/NotificationProvider';
import { CookieNotice } from './components/ui/CookieNotice';


function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // La portada ofrece "Entrar" y "Crear cuenta" por separado: quien viene a
  // registrarse no debería aterrizar en un formulario de login.
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const { data: user, isLoading, isError, error } = useUser();
  const queryClient = useQueryClient();

  // Quien llega por un enlace de invitación sin tener cuenta se va a
  // registrarse y vuelve por otra ruta (el correo de confirmación, o Google),
  // así que el código no puede canjearse en la página de la invitación: se
  // canjea aquí, en cuanto aparece una sesión, mire el usuario donde mire.
  useRedeemPendingInvite(user);

  // Quien entra por primera vez en una ficha que le creó su entrenador la
  // reclama aquí: no se migra nada, la cuenta ya era suya. Ver el hook.
  useClaimManagedProfile(user);

  // COUNTDOWN LOGIC
  const isPreLaunch = false;
  // Allow bypass with ?admin=true
  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get('admin') === 'true';

  if (isPreLaunch && !isAdmin) {
    return <CountdownPage />;
  }

  // Si venimos redirigidos de la web con ?signup=true, abrir el modal
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (searchParams.get('signup') === 'true' && !user && !isLoading) {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       setAuthMode('signup');
       setIsAuthModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);




  const handleLogout = async () => {
    localStorage.removeItem('anvil_user_cache');
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleLoginClick = () => { 
    setAuthMode('login'); 
    setIsAuthModalOpen(true); 
  };
  
  const handleSignupClick = () => { 
    setAuthMode('signup'); 
    setIsAuthModalOpen(true); 
  };

  if (isLoading) return <LoadingSpinner fullscreen message="Verificando sesión..." />;

  if (isError) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-anvil-red mb-2">Error de conexión</h2>
        <p className="text-gray-400 mb-4 text-center max-w-md">
          {error instanceof Error ? error.message : 'No se pudo cargar el perfil.'}
        </p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['user'] })}
          className="bg-white text-black px-6 py-3 rounded-lg font-black uppercase tracking-wider hover:bg-gray-200 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-anvil-red selection:text-white font-sans overflow-x-hidden">
      <ReloadPrompt />
      <Toaster position="top-center" theme="dark" richColors />
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <NotificationProvider user={user || null}>
          <AppRoutes
            user={user}
            onLoginClick={handleLoginClick}
            onSignupClick={handleSignupClick}
            onLogout={handleLogout}
          />
        </NotificationProvider>
      </ErrorBoundary>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authMode}
      />

      {/* Solo fuera del panel: dentro, la barra de pestañas móvil ya vive en
          el mismo borde inferior (ver DashboardLayout.tsx) y las dos
          encimadas serían ilegibles. Quien ya ha entrado ya ha usado la
          cookie de sesión que este aviso explica. */}
      {!user && <CookieNotice />}
    </div>
  );
}

export default App;
