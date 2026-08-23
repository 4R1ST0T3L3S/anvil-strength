import { useState } from 'react';
import { LazyMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { supabase } from './lib/supabase';
import { useUser } from './hooks/useUser';
import { useRedeemPendingInvite } from './hooks/useRedeemPendingInvite';
import { useClaimManagedProfile } from './hooks/useClaimManagedProfile';
import { AuthModal } from './features/auth/components/AuthModal';
import { ErrorFallback } from './components/ui/ErrorFallback';
import { Button } from './components/ui/Button';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';

import { ReloadPrompt } from './components/pwa/ReloadPrompt';
import { Toaster } from 'sonner';

import { AppRoutes } from './routes/AppRoutes';
import { CountdownPage } from './features/landing/pages/CountdownPage';
import { NotificationProvider } from './components/ui/NotificationProvider';
import { CookieNotice } from './components/ui/CookieNotice';


/**
 * LAS CARACTERÍSTICAS DE ANIMACIÓN, DESPUÉS DEL PRIMER PINTADO.
 * =====================================================================
 *
 * framer-motion se reparte en dos: un núcleo diminuto (el componente `m`,
 * unos 5 KB) y el motor que de verdad anima (`domMax`, unos 28 KB, con
 * gestos, arrastre, presencia y animaciones de disposición).
 *
 * Importando `motion` a secas se traen los dos SIEMPRE, en el arranque, en
 * los 61 ficheros que lo usaban. Con `LazyMotion` y una función que devuelve
 * una promesa, el motor se descarga en cuanto la pestaña respira, y el
 * primer pintado no lo espera.
 *
 * `domMax` y no `domAnimation`: la aplicación usa arrastre (los carruseles
 * de la portada y las hojas del editor de día), `layoutId` (el indicador de
 * la barra lateral, la barra de pestañas y `Tabs`) y `Reorder` (ordenar
 * ejercicios), y las tres viven en el paquete grande. Con `domAnimation`
 * esas tres dejarían de funcionar EN SILENCIO, que es peor que no ahorrar.
 *
 * Lo único que se pierde: durante los primeros instantes, una animación que
 * se dispare antes de que llegue el motor se resuelve al instante en vez de
 * animarse. Para una entrada de 220ms, nadie lo nota.
 */
const cargarMotor = () => import('framer-motion').then((mod) => mod.domMax);

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




  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleLoginClick = () => { setAuthMode('login'); setIsAuthModalOpen(true); };
  const handleSignupClick = () => { setAuthMode('signup'); setIsAuthModalOpen(true); };

  // El arranque en frío: todavía no se sabe si hay sesión, así que no se
  // sabe ni qué panel pintar. Es la única espera de la aplicación en la que
  // de verdad no hay nada que conservar en pantalla, y por eso es la única
  // que lleva la pantalla completa con la mascota. Todo lo demás usa
  // esqueletos que conservan el armazón — ver AppShellSkeleton.
  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-sunken p-4 text-ink">
        <h2 className="mb-2 text-t-xl font-bold text-danger">Error de conexión</h2>
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
    // `overflow-x-hidden` es el corte de seguridad de la aplicación entera:
    // basta con que una tabla o una rejilla se pase de ancho para arrastrar la
    // PÁGINA hacia la derecha y dejar media pantalla en negro. El precio es que
    // esconde los desbordes en vez de arreglarlos, y por eso existe
    // `src/lib/overflowGuard.ts`, que en desarrollo los delata igualmente.
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-sunken font-sans text-ink selection:bg-brand selection:text-brand-ink">
      {/* Todo lo que anima va DENTRO. Un `<m.div>` fuera de aquí no se
          anima y no avisa. Ver la nota de `cargarMotor` arriba. */}
      <LazyMotion features={cargarMotor}>
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
      </LazyMotion>
    </div>
  );
}

export default App;
