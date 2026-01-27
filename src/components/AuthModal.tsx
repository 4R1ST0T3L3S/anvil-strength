import React, { useState } from 'react';
import { X, Mail, Lock, User, Loader } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: any) => void;
}

export function AuthModal({ isOpen, onClose, onLogin }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    age: '',
    weight: '',
    height: '',
    squat_pr: '',
    bench_pr: '',
    deadlift_pr: '',
    bio: ''
  });

  if (!isOpen) return null;

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
      
      <div className="relative bg-[#1c1c1c] w-full max-w-md rounded-sm border border-white/10 shadow-2xl p-8">
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
            <div className="relative">
              <label htmlFor="name" className="sr-only">Nombre completo</label>
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Nombre completo"
                autoComplete="name"
                className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required={!isLogin}
              />
            </div>
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
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
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
              className="w-full bg-[#252525] border border-white/10 text-white pl-10 pr-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>

          {!isLogin && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Edad"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.age}
                  onChange={(e) => setFormData({...formData, age: e.target.value})}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Peso (kg)"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: e.target.value})}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Alt (cm)"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.height}
                  onChange={(e) => setFormData({...formData, height: e.target.value})}
                />
              </div>
              
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Mejores Marcas (PRs)</div>
              
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  step="0.1"
                  placeholder="SQ (kg)"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.squat_pr}
                  onChange={(e) => setFormData({...formData, squat_pr: e.target.value})}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="BP (kg)"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.bench_pr}
                  onChange={(e) => setFormData({...formData, bench_pr: e.target.value})}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="DL (kg)"
                  className="bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red"
                  value={formData.deadlift_pr}
                  onChange={(e) => setFormData({...formData, deadlift_pr: e.target.value})}
                />
              </div>

              <textarea
                placeholder="Biografía / Objetivos"
                rows={2}
                className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red resize-none"
                value={formData.bio}
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-black uppercase py-4 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-6"
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
