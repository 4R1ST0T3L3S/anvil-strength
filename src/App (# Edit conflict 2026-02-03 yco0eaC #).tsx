import { useState, useEffect, Suspense, lazy } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { AuthModal } from './features/auth/components/AuthModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';
import { ProfileSkeleton } from './components/skeletons/ProfileSkeleton';
import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { Toaster } from 'sonner';

// Lazy Load Pages
// Landing Page is kept eager for LCP/First Fold performance, or can be lazy if it's very heavy. 
// Given the user request, I will lazy load Dashboard/Profile which are behind auth.
import { LandingPage } from './features/landing/pages/LandingPage';

const UserDashboard = lazy(() => import('./features/athlete/pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = lazy(() => import('./features/coach/pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage').then(module => ({ default: module.ProfilePage })));

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';



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
              <Suspense fallback={<DashboardSkeleton />}>
                <UserDashboard
                  user={user}
                  onLogout={handleLogout}
                  onOpenSettings={handleOpenSettings}
                  onGoToHome={() => { }}
                />
              </Suspense>
            )
          } />
          <Route path="/coach-dashboard" element={
            !user ? (
              <Navigate to="/" replace />
            ) : user.role !== 'coach' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Suspense fallback={<DashboardSkeleton />}>
                <CoachDashboard user={user} onLogout={handleLogout} />
              </Suspense>
            )
          } />
          <Route path="/profile" element={
            !user ? (
              <Navigate to="/" replace />
            ) : (
              <Suspense fallback={<ProfileSkeleton />}>
                <ProfilePage onLogout={handleLogout} />
              </Suspense>
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
