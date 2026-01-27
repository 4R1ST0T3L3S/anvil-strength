import React, { useState, useRef } from 'react';
import { X, Mail, Lock, User, Loader, Camera, Trash2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: any) => void;
}

export function AuthModal({ isOpen, onClose, onLogin }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
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
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('La imagen es demasiado grande (máx 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profile_image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setFormData({ ...formData, profile_image: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const endpoint = isLogin ? 'http://localhost:3000/api/login' : 'http://localhost:3000/api/register';
      const body = isLogin 
        ? { email: formData.email, password: formData.password }
        : formData;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la autenticación');
      }

      // Guardar token y usuario
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      onLogin(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#1c1c1c] w-full max-w-md rounded-xl border border-white/10 shadow-2xl p-8">
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
            {isLogin ? 'Bienvenido de nuevo, atleta.' : 'Únete al equipo Anvil Strength.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 mb-6 text-sm text-center font-bold">
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
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Nombre completo"
                  autoComplete="name"
                  className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required={!isLogin}
                />
              </div>

              <div className="relative">
                <label htmlFor="nickname" className="sr-only">Mote / Apodo</label>
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-anvil-red" size={20} />
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  placeholder="Mote / Apodo (Ej: El Toro)"
                  className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors font-bold"
                  value={formData.nickname}
                  onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                  required={!isLogin}
                />
              </div>
            </>
          )}

          <div className="relative">
            <label htmlFor="email" className="sr-only">Correo electrónico</label>
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="username email"
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="relative">
            <label htmlFor="password" alt="Contraseña" className="sr-only">Contraseña</label>
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              key={isLogin ? 'login-password' : 'register-password'}
              id="password"
              name="password"
              type="password"
              placeholder="Contraseña"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>

          {!isLogin && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <select
                  className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-anvil-red transition-colors [&>option]:bg-[#1c1c1c] [&>option]:text-white [&>optgroup]:bg-[#1c1c1c] [&>optgroup]:text-white"
                  value={formData.age_category}
                  onChange={(e) => setFormData({...formData, age_category: e.target.value})}
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
                  onChange={(e) => setFormData({...formData, weight_category: e.target.value})}
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
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-black uppercase py-4 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-6 shadow-xl shadow-black/20"
          >
            {isLoading ? <Loader className="animate-spin" size={20} /> : (isLogin ? 'Entrar' : 'Registrarse')}
          </button>
        </form>

        <div className="mt-6 text-center">
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
