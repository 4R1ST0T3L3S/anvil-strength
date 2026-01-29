import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { AuthModal } from './features/auth/components/AuthModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { Loader } from 'lucide-react';

// Lazy Load Pages - REVERTED for Debugging
// const LandingPage = React.lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));
// const UserDashboard = React.lazy(() => import('./pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
// const CoachDashboard = React.lazy(() => import('./pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));

import { LandingPage } from './pages/LandingPage';

import { UserDashboard } from './pages/UserDashboard';
import { CoachDashboard } from './pages/CoachDashboard';
import { ProfilePage } from './pages/ProfilePage';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

function ErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return (
    <div role="alert" className="min-h-screen bg-[#1c1c1c] text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-2xl font-bold text-anvil-red mb-2">Algo salió mal</h2>
      <pre className="text-gray-400 text-sm bg-black/50 p-4 rounded mb-4 max-w-lg overflow-auto">
        {errorMessage}
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
  const location = useLocation();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) {
        await queryClient.invalidateQueries({ queryKey: ['user'] });
        if (event === 'SIGNED_IN') setIsAuthModalOpen(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleLoginClick = () => setIsAuthModalOpen(true);
  const handleOpenSettings = () => setIsSettingsModalOpen(true);

  if (isLoading) return <LoadingScreen message="Verificando sesión..." />;

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
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <LandingPage
              onLoginClick={handleLoginClick}
              user={user}
            />
          } />
          <Route path="/dashboard" element={
            !user ? (
              <Navigate to="/" replace />
            ) : user.role === 'coach' ? (
              <Navigate to="/coach-dashboard" replace />
            ) : (
              <UserDashboard
                user={user}
                onLogout={handleLogout}
                onOpenSettings={handleOpenSettings}
                onGoToHome={() => { }}
              />
            )
          } />
          <Route path="/coach-dashboard" element={
            !user ? (
              <Navigate to="/" replace />
            ) : user.role !== 'coach' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <CoachDashboard user={user} onLogout={handleLogout} />
            )
          } />
          <Route path="/profile" element={
            !user ? (
              <Navigate to="/" replace />
            ) : (
              <ProfilePage onLogout={handleLogout} />
            )
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {user && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          user={user}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['user'] })}
        />
      )}
    </div>
  );
}

export default App;
