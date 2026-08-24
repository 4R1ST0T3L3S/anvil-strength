import { useState } from 'react';
import { X, Mail, Lock, User as UserIcon, Loader, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getAuthCallbackUrl } from '../../../lib/authRedirect';


interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Con qué pestaña se abre. La portada tiene botones para las dos. */
  initialMode?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  /** Sin marcar por defecto: el consentimiento tiene que ser un acto positivo del usuario. */
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Verificar conectividad con Supabase cuando hay error de red
  const checkSupabaseConnectivity = async () => {
    setIsCheckingConnectivity(true);
    try {
      const response = await fetch('https://ihcyuoczbmjxfinxvzra.supabase.co/rest/v1/', {
        method: 'GET',
        headers: {
          'apikey': 'sb_publishable_W_yJ-b6yTtx4Qnc4_G9M-w_aYh1agiZ',
        }
      });
      setSupabaseStatus(response.ok ? 'online' : 'offline');
    } catch {
      setSupabaseStatus('offline');
    } finally {
      setIsCheckingConnectivity(false);
    }
  };

  /*
   * El modal se monta una vez y se reutiliza: sin esto, pulsar "Registrarse"
   * después de haber abierto "Entrar" seguía enseñando el formulario de login.
   *
   * Ajuste durante el render y no un efecto. Con el efecto se pintaba un frame
   * con el modo anterior antes de corregirlo, y en este modal concreto eso
   * significa que al pedir "Crear cuenta" se leía "Entrar" durante un instante.
   * React documenta este patrón para reiniciar estado al cambiar una prop:
   * detecta el setState, tira el render a medias y rehace con el valor nuevo.
   */
  const [aperturaAnterior, setAperturaAnterior] = useState({ isOpen, initialMode });
  if (aperturaAnterior.isOpen !== isOpen || aperturaAnterior.initialMode !== initialMode) {
    setAperturaAnterior({ isOpen, initialMode });
    if (isOpen) {
      setIsLogin(initialMode === 'login');
      setError('');
      setNotice('');
      setSupabaseStatus('unknown');
      setAcceptedTerms(false);
    }
  }

  /**
   * El alta pide lo mínimo: apodo, email y contraseña.
   *
   * Antes exigía categoría de peso y de edad, que dejaban fuera a cualquiera
   * que no compita en powerlifting, y una foto y una biografía que nadie
   * rellena con ganas antes de haber visto la aplicación. Todo eso se edita
   * luego en el perfil, cuando ya hay un motivo para hacerlo.
   */
  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    password: '',
  });

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    if (!isLogin && !acceptedTerms) {
      setError('Tienes que aceptar los Términos y la Política de Privacidad para crear una cuenta.');
      return;
    }
    setError('');
    setIsGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Vuelve a /auth/callback de ESTE origen. Ver lib/authRedirect.ts:
          // si el origen no está en la lista blanca de Supabase, el panel lo
          // ignora y manda a su "Site URL" — el bug de acabar en vercel.app.
          redirectTo: getAuthCallbackUrl()
        }
      });

      if (error) {
        throw error;
      }

      // We don't onClose immediately because OAuth redirects the entire page.

    } catch (err: unknown) {
      console.error('Error con Google Auth:', err);
      const msg = err instanceof Error ? err.message : 'Error al conectar con Google.';
      setError(msg);
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);

    try {

      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (authError) {
          console.error('Error de Auth:', authError.message);
          throw authError; // This jumps to catch block
        }


        // We DO NOT call onClose() here immediately because App.tsx listens to the state change
        // However, if we don't close it, it might hang if App.tsx crashes.
        // Let's rely on success.

        // Now that we removed the listener from App.tsx, we must close it here.
        onClose();
      } else {
        const nickname = formData.nickname.trim();

        const { data, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            // El apodo hace también de nombre visible hasta que el usuario
            // rellene su perfil. Sin esto la app le llamaría por la parte
            // izquierda de su email.
            data: {
              full_name: nickname,
              nickname,
            },
            // Si el proyecto exige confirmar el email, el enlace del correo
            // tiene que volver AQUÍ y no a la Site URL del panel.
            emailRedirectTo: getAuthCallbackUrl(),
          }
        });

        if (authError) {
          console.error('Error de Registro:', authError.message);
          throw authError;
        }

        if (data.user && !data.session) {
          // No es un error: la cuenta existe, solo falta confirmarla. Salía en
          // rojo y con aspecto de fallo, y la gente lo reintentaba.
          setNotice('Cuenta creada. Revisa tu email para confirmarla y entrar.');
          setIsLoading(false);
          return;
        }

        // If we have a session (auto-login after register), close modal
        if (data.session) {
          onClose();
        }
      }

      // Safety timeout: If App.tsx doesn't close the modal in 2 seconds, we force close it 
      // preventing "infinite loading" perception if something glitchy happens with the listener
      setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          onClose();
        }
      }, 2000);

    } catch (err: unknown) {
      console.error('Error capturado en handleSubmit:', err);

      let msg = err instanceof Error ? err.message : 'Error desconocido';

      // Translate common Supabase errors to Spanish friendly messages
      if (msg.includes('Invalid login credentials')) {
        msg = 'Email o contraseña incorrectos.';
      } else if (msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
        msg = 'Sin conexión. Verifica tu internet o que la URL de Supabase sea accesible.';
      } else if (msg.includes('CORS')) {
        msg = 'Error de permiso entre el navegador y el servidor. Verifica la configuración CORS de Supabase.';
      } else if (msg.includes('timeout')) {
        msg = 'La solicitud tardó demasiado. Intenta de nuevo.';
      }

      setError(msg || 'Error de conexión con el servidor');

      // Si es un error de red, verificar conectividad con Supabase
      if (msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
        await checkSupabaseConnectivity();
      }

      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-sunken w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-line shadow-2xl p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-ink uppercase tracking-tighter mb-2">
            {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>
          <p className="text-ink-muted text-sm">
            {isLogin ? 'Bienvenido de nuevo, atleta.' : 'Tres datos y estás dentro.'}
          </p>
        </div>

        {error && (
          <div>
            <div data-testid="auth-error-message" className="bg-danger-quiet border border-danger/20 text-danger-text p-3 mb-6 text-sm text-center font-bold rounded-lg">
              {error}
            </div>

            {(error.includes('Sin conexión') || error.includes('permiso')) && (
              <div className="bg-warning-quiet border border-warning/20 text-warning p-3 mb-6 text-xs rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold mb-1">Diagnóstico:</p>
                    <p className="mb-2">✓ Verifica que tienes conexión a internet</p>
                    <p className="mb-2">✓ Intenta desde otra red WiFi o datos móviles</p>
                    <p className="mb-2">✓ Si sigue fallando, el servidor podría estar caído</p>
                    {supabaseStatus === 'unknown' && (
                      <button
                        type="button"
                        onClick={checkSupabaseConnectivity}
                        disabled={isCheckingConnectivity}
                        className="text-amber-300 hover:text-amber-200 underline font-bold mt-2"
                      >
                        {isCheckingConnectivity ? 'Verificando...' : 'Verificar servidor'}
                      </button>
                    )}
                    {supabaseStatus === 'online' && (
                      <p className="text-success font-bold mt-2">✓ Servidor online. Es un problema de tu red.</p>
                    )}
                    {supabaseStatus === 'offline' && (
                      <p className="text-danger-text font-bold mt-2">✗ Servidor no responde. Intenta más tarde.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {notice && (
          <div className="bg-success-quiet border border-success/20 text-success p-3 mb-6 text-sm text-center font-bold rounded-lg">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="relative">
              <label htmlFor="nickname" className="sr-only">Apodo</label>
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text" size={20} />
              <input
                id="nickname"
                name="nickname"
                type="text"
                placeholder="Apodo (Ej: El Toro)"
                autoComplete="nickname"
                className="w-full bg-surface-sunken border border-line text-ink pl-10 pr-4 py-3 rounded-lg focus:border-brand transition-colors font-bold"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                required={!isLogin}
              />
            </div>
          )}

          <div className="relative">
            <label htmlFor="email" className="sr-only">Correo electrónico</label>
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={20} />
            <input
              data-testid="auth-email-input"
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="username email"
              className="w-full bg-surface-sunken border border-line text-ink pl-10 pr-4 py-3 rounded-lg focus:border-brand transition-colors"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="relative">
            <label htmlFor="password" className="sr-only">Contraseña</label>
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={20} />
            <input
              data-testid="auth-password-input"
              key={isLogin ? 'login-password' : 'register-password'}
              id="password"
              name="password"
              type="password"
              placeholder="Contraseña"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full bg-surface-sunken border border-line text-ink pl-10 pr-4 py-3 rounded-lg focus:border-brand transition-colors"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          {!isLogin && (
            <>
              <p className="text-center text-xs leading-relaxed text-ink-subtle">
                Tus marcas, categoría y foto se añaden luego desde tu perfil, y solo si quieres.
              </p>

              {/* Sin premarcar: el RGPD exige un acto positivo, no una casilla
                  que el usuario tenga que desmarcar. `required` bloquea el
                  envío del formulario de forma nativa si no se marca. */}
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                />
                <span>
                  He leído y acepto los{' '}
                  <a href="/legal/terminos" target="_blank" rel="noopener noreferrer" className="text-brand-text hover:underline">
                    Términos y Condiciones
                  </a>{' '}
                  y la{' '}
                  <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" className="text-brand-text hover:underline">
                    Política de Privacidad
                  </a>
                  .
                </span>
              </label>
            </>
          )}

          <button
            data-testid="auth-submit-button"
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-6 shadow-xl shadow-black/20"
          >
            {isLoading ? <Loader className="animate-spin" size={20} /> : (isLogin ? 'Entrar' : 'Registrarse')}
          </button>
        </form>

        <div className="relative mt-8 mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-surface-sunken text-ink-subtle font-bold uppercase tracking-wider">O continuar con</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading}
          className="w-full bg-surface-sunken hover:bg-[#303030] text-ink border border-line font-black uppercase py-4 rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
        >
          {isGoogleLoading ? (
            <Loader className="animate-spin" size={20} />
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.79 15.72 17.56V20.32H19.28C21.36 18.4 22.56 15.6 22.56 12.25Z" fill="#4285F4" />
                <path d="M12 23C14.97 23 17.46 22.02 19.28 20.32L15.72 17.56C14.74 18.22 13.48 18.62 12 18.62C9.13 18.62 6.7 16.68 5.82 14.07H2.15V16.92C3.96 20.53 7.69 23 12 23Z" fill="#34A853" />
                <path d="M5.82 14.07C5.59 13.39 5.46 12.7 5.46 12C5.46 11.3 5.59 10.61 5.82 9.93V7.08H2.15C1.41 8.56 1 10.23 1 12C1 13.77 1.41 15.44 2.15 16.92L5.82 14.07Z" fill="#FBBC05" />
                <path d="M12 5.38C13.62 5.38 15.06 5.94 16.21 7.02L19.36 3.87C17.46 2.1 14.97 1 12 1C7.69 1 3.96 3.47 2.15 7.08L5.82 9.93C6.7 7.32 9.13 5.38 12 5.38Z" fill="#EA4335" />
              </svg>
              <span>{isLogin ? 'Entrar con Google' : 'Registrarse con Google'}</span>
            </>
          )}
        </button>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-ink-muted hover:text-ink text-sm font-bold uppercase tracking-wide transition-colors"
          >
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
