import { useState, useRef } from 'react';
import { X, Mail, Lock, User as UserIcon, Loader, Camera } from 'lucide-react';
import { supabase } from '../../../lib/supabase';


interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    email: '',
    password: '',
    age_category: '',
    weight_category: '',
    bio: '',
    profile_image: ''
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError('');

    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('El archivo debe ser una imagen válida');
        return;
      }

      // 2MB limit for base64 strings to be safe with database/payload limits
      if (file.size > 2 * 1024 * 1024) {
        setError('La imagen es demasiado grande (máx 2MB)');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profile_image: reader.result as string });
      };
      reader.onerror = () => {
        setError('Error al leer el archivo de imagen');
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setFormData({ ...formData, profile_image: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) {
        throw error;
      }

      // We don't onClose immediately because OAuth redirects the entire page.

    } catch (err: any) {
      console.error('Error con Google Auth:', err);
      setError(err.message || 'Error al conectar con Google.');
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
        const { data, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.name,
              nickname: formData.nickname,
            }
          }
        });

        if (authError) {
          console.error('Error de Registro:', authError.message);
          throw authError;
        }

        if (data.user && !data.session) {
          setError('Cuenta creada. Por favor revisa tu email para confirmar tu cuenta.');
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
      // Translate common Supabase errors to Spanish friendly messages
      let msg = err instanceof Error ? err.message : 'Error desconocido';
      if (msg.includes('Invalid login credentials')) msg = 'Email o contraseña incorrectos.';

      setError(msg || 'Error de conexión con el servidor');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#1c1c1c] w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 shadow-2xl p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
            {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>
          <p className="text-gray-400 text-sm">
            {isLogin ? 'Bienvenido de nuevo, atleta.' : 'Únete al Anvil Strength Club.'}
          </p>
        </div>

        {error && (
          <div data-testid="auth-error-message" className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 mb-6 text-sm text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="flex flex-col items-center mb-6">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden cursor-pointer hover:border-anvil-red transition-colors relative group"
              >
                {formData.profile_image ? (
                  <>
                    <img src={formData.profile_image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Camera size={20} />
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Camera className="h-6 w-6 text-gray-500 mx-auto" />
                    <span className="text-[8px] font-bold text-gray-500 uppercase">Foto</span>
                  </div>
                )}
              </div>
              {formData.profile_image && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                  className="text-[10px] text-anvil-red font-bold uppercase mt-2 hover:text-red-400"
                >
                  Eliminar
                </button>
              )}
            </div>
          )}

          {!isLogin && (
            <>
              <div className="relative">
                <label htmlFor="name" className="sr-only">Nombre completo</label>
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Nombre completo"
                  autoComplete="name"
                  className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required={!isLogin}
                />
              </div>

              <div className="relative">
                <label htmlFor="nickname" className="sr-only">Mote / Apodo</label>
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-anvil-red" size={20} />
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  placeholder="Mote / Apodo (Ej: El Toro)"
                  className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors font-bold"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  required={!isLogin}
                />
              </div>
            </>
          )}

          <div className="relative">
            <label htmlFor="email" className="sr-only">Correo electrónico</label>
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              data-testid="auth-email-input"
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="username email"
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="relative">
            <label htmlFor="password" className="sr-only">Contraseña</label>
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              data-testid="auth-password-input"
              key={isLogin ? 'login-password' : 'register-password'}
              id="password"
              name="password"
              type="password"
              placeholder="Contraseña"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          {!isLogin && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <select
                  className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-anvil-red transition-colors [&>option]:bg-[#1c1c1c] [&>option]:text-white [&>optgroup]:bg-[#1c1c1c] [&>optgroup]:text-white"
                  value={formData.age_category}
                  onChange={(e) => setFormData({ ...formData, age_category: e.target.value })}
                  required
                >
                  <option value="" disabled className="bg-[#1c1c1c] text-gray-500">Cat. Edad</option>
                  <option value="Sub-Junior" className="bg-[#1c1c1c] text-white">Sub-Junior</option>
                  <option value="Junior" className="bg-[#1c1c1c] text-white">Junior</option>
                  <option value="Senior" className="bg-[#1c1c1c] text-white">Senior (Open)</option>
                  <option value="Master 1" className="bg-[#1c1c1c] text-white">Master 1</option>
                  <option value="Master 2" className="bg-[#1c1c1c] text-white">Master 2</option>
                  <option value="Master 3" className="bg-[#1c1c1c] text-white">Master 3</option>
                  <option value="Master 4" className="bg-[#1c1c1c] text-white">Master 4</option>
                </select>

                <select
                  className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-anvil-red transition-colors [&>option]:bg-[#1c1c1c] [&>option]:text-white [&>optgroup]:bg-[#1c1c1c] [&>optgroup]:text-white"
                  value={formData.weight_category}
                  onChange={(e) => setFormData({ ...formData, weight_category: e.target.value })}
                  required
                >
                  <option value="" disabled className="bg-[#1c1c1c] text-gray-500">Cat. Peso</option>
                  <optgroup label="Masculino" className="bg-[#1c1c1c] text-anvil-red font-bold">
                    <option value="-59kg" className="bg-[#1c1c1c] text-white">-59kg</option>
                    <option value="-66kg" className="bg-[#1c1c1c] text-white">-66kg</option>
                    <option value="-74kg" className="bg-[#1c1c1c] text-white">-74kg</option>
                    <option value="-83kg" className="bg-[#1c1c1c] text-white">-83kg</option>
                    <option value="-93kg" className="bg-[#1c1c1c] text-white">-93kg</option>
                    <option value="-105kg" className="bg-[#1c1c1c] text-white">-105kg</option>
                    <option value="-120kg" className="bg-[#1c1c1c] text-white">-120kg</option>
                    <option value="+120kg" className="bg-[#1c1c1c] text-white">+120kg</option>
                  </optgroup>
                  <optgroup label="Femenino" className="bg-[#1c1c1c] text-anvil-red font-bold">
                    <option value="-47kg" className="bg-[#1c1c1c] text-white">-47kg</option>
                    <option value="-52kg" className="bg-[#1c1c1c] text-white">-52kg</option>
                    <option value="-57kg" className="bg-[#1c1c1c] text-white">-57kg</option>
                    <option value="-63kg" className="bg-[#1c1c1c] text-white">-63kg</option>
                    <option value="-69kg" className="bg-[#1c1c1c] text-white">-69kg</option>
                    <option value="-76kg" className="bg-[#1c1c1c] text-white">-76kg</option>
                    <option value="-84kg" className="bg-[#1c1c1c] text-white">-84kg</option>
                    <option value="+84kg" className="bg-[#1c1c1c] text-white">+84kg</option>
                  </optgroup>
                </select>
              </div>

              <textarea
                placeholder="Biografía / Objetivos"
                rows={4}
                className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-anvil-red resize-none"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              />
            </div>
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
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-[#1c1c1c] text-gray-500 font-bold uppercase tracking-wider">O continuar con</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading}
          className="w-full bg-[#252525] hover:bg-[#303030] text-white border border-white/10 font-black uppercase py-4 rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
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
            className="text-gray-400 hover:text-white text-sm font-bold uppercase tracking-wide transition-colors"
          >
            {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
