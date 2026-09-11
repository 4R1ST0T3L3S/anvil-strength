import { useState } from 'react';
import { LazyMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'sonner';
import { cerrarSesion } from './lib/sesion';
import { useUser } from './hooks/useUser';
import { useRedeemPendingInvite } from './hooks/useRedeemPendingInvite';
import { useClaimManagedProfile } from './hooks/useClaimManagedProfile';
import { useCapabilityConfig } from './hooks/useCapabilityConfig';
import { useTemaEnPantalla } from './hooks/useTema';
import { AuthModal } from './features/auth/components/AuthModal';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { Button } from './components/ui/Button';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';

import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { esAppEmpaquetada } from './lib/entorno';

import { AppRoutes } from './routes/AppRoutes';
import { CountdownPage } from './features/landing/pages/CountdownPage';
import { NotificationProvider } from './components/ui/NotificationProvider';
import { CookieNotice } from './components/ui/CookieNotice';
import { BackToTop } from './components/ui/BackToTop';
import { RegistroMarca, RegistroPorRuta } from './components/layout/RegistroMarca';


/**
 * LAS CARACTERÍSTICAS DE ANIMACIÓN, DESPUÉS DEL PRIMER PINTADO.
 * =====================================================================
 *
 * framer-motion se reparte en un núcleo diminuto (`m`, ~5 KB) y el motor que
 * anima (`domMax`, ~28 KB). Con `LazyMotion` y una promesa, el motor se
 * descarga en cuanto la pestaña respira y el primer pintado no lo espera.
 * `domMax` y no `domAnimation`: la app usa arrastre, `layoutId` y `Reorder`,
 * que viven en el paquete grande y dejarían de funcionar EN SILENCIO.
 */
const cargarMotor = () => import('framer-motion').then((mod) => mod.domMax);

/**
 * Los avisos con las superficies del sistema: el mismo menú flotante de la
 * app, en los dos temas. Sin `richColors`: un aviso de error no necesita un
 * fondo rojo para leerse como error, le basta su icono.
 */
const ESTILO_AVISO = {
  background: 'var(--surface-overlay)',
  color: 'var(--ink)',
  border: '1px solid var(--card-border)',
  boxShadow: 'var(--shadow-lg)',
  fontFamily: 'var(--font-sans)',
} as const;

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // La portada ofrece "Entrar" y "Crear cuenta" por separado: quien viene a
  // registrarse no debería aterrizar en un formulario de login.
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const { data: user, isLoading, isError, error } = useUser();
  const queryClient = useQueryClient();
  // El tema que HAY pintado, lo cambie quien lo cambie: los avisos lo siguen.
  const temaPintado = useTemaEnPantalla();

  // Quien llega por un enlace de invitación sin cuenta se registra y vuelve
  // por otra ruta: el código se canjea aquí, en cuanto aparece una sesión.
  useRedeemPendingInvite(user);

  // Quien entra por primera vez en una ficha que le creó su entrenador la
  // reclama aquí: no se migra nada, la cuenta ya era suya.
  useClaimManagedProfile(user);

  // Configuración de permisos por rol, para que `puede()` la lea en cualquier panel.
  useCapabilityConfig(user);

  // COUNTDOWN LOGIC
  const isPreLaunch = false;
  // Allow bypass with ?admin=true
  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get('admin') === 'true';

  if (isPreLaunch && !isAdmin) {
    return <CountdownPage />;
  }

  // Una sola copia, en src/lib/sesion.ts.
  const handleLogout = cerrarSesion;

  const handleLoginClick = () => { setAuthMode('login'); setIsAuthModalOpen(true); };
  const handleSignupClick = () => { setAuthMode('signup'); setIsAuthModalOpen(true); };

  // El arranque en frío: todavía no se sabe si hay sesión, así que no se sabe
  // ni qué panel pintar. Es la única espera sin armazón que conservar.
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
    // `overflow-x-hidden` es el corte de seguridad de la aplicación entera: una
    // tabla que se pase de ancho no puede arrastrar la PÁGINA. En desarrollo
    // `src/lib/overflowGuard.ts` los delata igualmente.
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-canvas font-sans text-ink selection:bg-brand selection:text-brand-ink">
      {/* Todo lo que anima va DENTRO. Un `<m.div>` fuera de aquí no se
          anima y no avisa. */}
      <LazyMotion features={cargarMotor}>
        {/* El service worker solo en la web: dentro del APK sobrevive a las
            actualizaciones y serviría un index.html que pide ficheros que el
            paquete nuevo ya no tiene. Ver la nota completa en el historial. */}
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
            {/* La web pública conserva su propio diseño: el registro de
                marca se decide por la ruta. Ver RegistroMarca.tsx. */}
            <RegistroPorRuta haySesion={!!user}>
              <AppRoutes
                user={user}
                onLoginClick={handleLoginClick}
                onSignupClick={handleSignupClick}
                onLogout={handleLogout}
              />
            </RegistroPorRuta>
          </NotificationProvider>
        </ErrorBoundary>

        {/* El acceso se abre desde la portada y es parte de ella. */}
        <RegistroMarca>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            initialMode={authMode}
          />
        </RegistroMarca>

        {/* UNO para toda la aplicación: se pinta solo cuando hay recorrido
            de sobra, sabe apartarse de la barra de pestañas y sabe que el
            panel desplaza un <main> y no la ventana. */}
        <BackToTop />

        {/* Solo fuera del panel: dentro, la barra de pestañas ya vive en el
            borde inferior. Quien ya ha entrado ya ha usado la cookie de
            sesión que este aviso explica. */}
        {!user && (
          <RegistroMarca>
            <CookieNotice />
          </RegistroMarca>
        )}
      </LazyMotion>
    </div>
  );
}

export default App;
