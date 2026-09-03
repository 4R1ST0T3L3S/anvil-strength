import { LazyMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { useRedeemPendingInvite } from './hooks/useRedeemPendingInvite';
import { useClaimManagedProfile } from './hooks/useClaimManagedProfile';
import { useCapabilityConfig } from './hooks/useCapabilityConfig';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { Button } from './components/ui/Button';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';


import { Toaster } from 'sonner';

import { AppRoutes } from './routes/AppRoutes';
import { NotificationProvider } from './components/ui/NotificationProvider';
import { BackToTop } from './components/ui/BackToTop';


import { useNativeFeatures } from './hooks/useNativeFeatures';

const cargarMotor = () => import('framer-motion').then((mod) => mod.domMax);

function App() {
  const { data: user, isLoading, isError, error } = useUser();
  useNativeFeatures(!isLoading);
  const queryClient = useQueryClient();

  useRedeemPendingInvite(user);
  useClaimManagedProfile(user);
  useCapabilityConfig(user);

  const handleLogout = async () => {
    localStorage.removeItem('anvil_user_cache');
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-sunken p-4 text-ink">
        <h2 className="mb-2 text-t-xl font-bold text-danger-text">Error de conexión</h2>
        <p className="mb-4 max-w-md text-center text-ink-muted">
          {error instanceof Error ? error.message : 'No se pudo cargar el perfil.'}
        </p>
        <Button variant="primary" size="lg" onClick={() => queryClient.invalidateQueries({ queryKey: ['user'] })}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-sunken font-sans text-ink selection:bg-brand selection:text-brand-ink">
      <LazyMotion features={cargarMotor}>

        <Toaster position="top-center" theme="dark" richColors />
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <NotificationProvider user={user || null}>
            <AppRoutes
              user={user}
              onLogout={handleLogout}
            />
          </NotificationProvider>
        </ErrorBoundary>

        <BackToTop />
      </LazyMotion>
    </div>
  );
}

export default App;


