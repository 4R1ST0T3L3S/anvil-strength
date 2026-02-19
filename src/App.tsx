import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { AuthModal } from './features/auth/components/AuthModal';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { Toaster } from 'sonner';

import { AppRoutes } from './routes/AppRoutes';
import { CountdownPage } from './features/landing/pages/CountdownPage';

const LAUNCH_DATE = new Date('2026-02-22T20:00:00');

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { data: user, isLoading, isError, error } = useUser();
  const queryClient = useQueryClient();

  // COUNTDOWN LOGIC
  const now = new Date();
  const isPreLaunch = now < LAUNCH_DATE;
  // Allow bypass with ?admin=true
  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get('admin') === 'true';

  if (isPreLaunch && !isAdmin) {
    return <CountdownPage />;
  }




  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleLoginClick = () => setIsAuthModalOpen(true);

  if (isLoading) return <LoadingSpinner fullscreen message="Verificando sesión..." />;

  if (isError) {
    return (
      <div className="min-h-screen bg-[#1c1c1c] text-white flex flex-col items-center justify-center p-4">
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
    <div className="min-h-screen bg-[#1c1c1c] text-white selection:bg-anvil-red selection:text-white font-sans overflow-x-hidden">
      <ReloadPrompt />
      <Toaster position="top-center" theme="dark" richColors />
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AppRoutes
          user={user}
          onLoginClick={handleLoginClick}
          onLogout={handleLogout}
        />
      </ErrorBoundary>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default App;
