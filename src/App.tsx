import React, { useState, useEffect, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAPrompt } from './components/PWAPrompt';
import { Loader } from 'lucide-react';

// Lazy Load Pages
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));
const UserDashboard = React.lazy(() => import('./pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = React.lazy(() => import('./pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));

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

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#1c1c1c] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader className="animate-spin text-anvil-red" size={48} />
        <p className="text-gray-400 font-bold tracking-widest uppercase text-sm">Cargando Anvil Strength...</p>
      </div>
    </div>
  );
}

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const { data: user, isLoading } = useUser();
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
    content = <LoadingScreen />;
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
        <Suspense fallback={<LoadingScreen />}>
          {content}
        </Suspense>
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
