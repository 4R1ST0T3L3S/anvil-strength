import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAPrompt } from './components/PWAPrompt';
import { Loader } from 'lucide-react';

// Lazy Load Pages - REVERTED for Debugging
// const LandingPage = React.lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));
// const UserDashboard = React.lazy(() => import('./pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
// const CoachDashboard = React.lazy(() => import('./pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));

import { LandingPage } from './pages/LandingPage';
import { UserDashboard } from './pages/UserDashboard';
import { CoachDashboard } from './pages/CoachDashboard';

function ErrorFallback({ error, resetErrorBoundary }: { error: any; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="min-h-screen bg-[#1c1c1c] text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-2xl font-bold text-anvil-red mb-2">Algo salió mal</h2>
      <pre className="text-gray-400 text-sm bg-black/50 p-4 rounded mb-4 max-w-lg overflow-auto">
        {error.message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-white text-black font-bold rounded hover:bg-gray-200"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}

function LoadingScreen({ message = 'Cargando Anvil Strength...' }: { message?: string }) {
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    // If loading takes > 8 seconds, show reset button
    const timer = setTimeout(() => setShowReset(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleForceLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#1c1c1c] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader className="animate-spin text-anvil-red" size={48} />
        <p className="text-gray-400 font-bold tracking-widest uppercase text-sm">{message}</p>

        {showReset && (
          <div className="mt-8 text-center animate-fade-in">
            <p className="text-xs text-red-400 mb-2">¿Tarda demasiado?</p>
            <button
              onClick={handleForceLogout}
              className="text-xs border border-red-500/50 text-red-500 px-3 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              Forzar Cierre de Sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { data: user, isLoading, isError, error } = useUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        await queryClient.invalidateQueries({ queryKey: ['user'] });

        if (event === 'SIGNED_IN') {
          setIsAuthModalOpen(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(['user'], null);
  };

  const handleLoginClick = () => setIsAuthModalOpen(true);
  const handleOpenSettings = () => setIsSettingsModalOpen(true);

  // Handlers for modal updates to refresh data
  const handleProfileUpdate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['user'] });
    // We don't necessarily close the modal here, depends on user UX preference, 
    // but usually SettingsModal stays open or closes itself.
  };

  // Determine View
  let content;
  if (isLoading) {
    content = <LoadingScreen message="Verificando sesión..." />;
  } else if (isError) {
    content = (
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
  } else if (!user) {
    content = (
      <LandingPage
        onLoginClick={handleLoginClick}
        user={null}
        onGoToDashboard={() => { /* No-op since we redirect if logged in, or show login */ }}
      />
    );
  } else {
    // Authenticated
    if (user.role === 'coach') {
      content = (
        <CoachDashboard
          user={user}
          onLogout={handleLogout}
        />
      );
    } else {
      content = (
        <UserDashboard
          user={user}
          onLogout={handleLogout}
          onOpenSettings={handleOpenSettings}
          onGoToHome={() => { /* Probably handled by Sidebar logic now */ }}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-white selection:bg-anvil-red selection:text-white font-sans">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {content}
      </ErrorBoundary>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={() => queryClient.invalidateQueries({ queryKey: ['user'] })}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        user={user}
        onUpdate={handleProfileUpdate}
      />
      <PWAPrompt />
    </div>
  );
}

export default App;
