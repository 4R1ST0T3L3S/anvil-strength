import { LazyMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'sonner';
import { cerrarSesion } from './lib/sesion';
import { useUser } from './hooks/useUser';
import { useRedeemPendingInvite } from './hooks/useRedeemPendingInvite';
import { useClaimManagedProfile } from './hooks/useClaimManagedProfile';
import { useCapabilityConfig } from './hooks/useCapabilityConfig';
import { useNativeFeatures } from './hooks/useNativeFeatures';
import { useTemaEnPantalla } from './hooks/useTema';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { Button } from './components/ui/Button';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';

import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { esAppEmpaquetada } from './lib/entorno';

import { AppRoutes } from './routes/AppRoutes';
import { NotificationProvider } from './components/ui/NotificationProvider';
import { BackToTop } from './components/ui/BackToTop';

/**
 * LA APP PARA ANDROID (Capacitor → APK).
 * =====================================================================
 *
 * Es la aplicación completa sin la web pública: el acceso es una pantalla
 * (`/`, AuthScreen) y no un modal sobre la portada, y no hay aviso de
 * cookies ni registro de marca. `useNativeFeatures` engancha la barra de
 * estado, el botón atrás y los enlaces profundos del sistema.
 *
 * El service worker NO se registra dentro del APK: su caché sobrevive a
 * las actualizaciones y serviría un index.html que pide ficheros que el
 * paquete nuevo ya no tiene (ver `esAppEmpaquetada`).
 */
const cargarMotor = () => import('framer-motion').then((mod) => mod.domMax);

const ESTILO_AVISO = {
  background: 'var(--surface-overlay)',
  color: 'var(--ink)',
  border: '1px solid var(--card-border)',
  boxShadow: 'var(--shadow-lg)',
  fontFamily: 'var(--font-sans)',
} as const;

function App() {
  const { data: user, isLoading, isError, error } = useUser();
  const queryClient = useQueryClient();
  const temaPintado = useTemaEnPantalla();

  useRedeemPendingInvite(user);
  useClaimManagedProfile(user);
  useCapabilityConfig(user);

  // Capacitor: barra de estado, botón atrás y enlaces profundos del APK.
  useNativeFeatures(!isLoading);

  // Una sola copia, en src/lib/sesion.ts.
  const handleLogout = cerrarSesion;

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-canvas p-6 text-center text-ink">
        <h2 className="text-t-xl font-semibold">No hay conexión con Anvil</h2>
        <p className="mt-2 max-w-md text-t-sm text-ink-muted">
          {error instanceof Error ? error.message : 'No se pudo cargar el perfil.'}
        </p>
        <Button className="mt-6" variant="primary" size="lg" onClick={() => queryClient.invalidateQueries({ queryKey: ['user'] })}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-canvas font-sans text-ink selection:bg-brand selection:text-brand-ink">
      <LazyMotion features={cargarMotor}>
        {!esAppEmpaquetada() && <ReloadPrompt />}
        <Toaster
          position="top-center"
          theme={temaPintado === 'claro' ? 'light' : 'dark'}
          toastOptions={{
            style: ESTILO_AVISO,
            classNames: { description: '!text-ink-muted' },
          }}
        />
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <NotificationProvider user={user || null}>
            <AppRoutes user={user} onLogout={handleLogout} />
          </NotificationProvider>
        </ErrorBoundary>
        <BackToTop />
      </LazyMotion>
    </div>
  );
}

export default App;
