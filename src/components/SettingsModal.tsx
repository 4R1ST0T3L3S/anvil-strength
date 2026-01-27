import React, { useState, useEffect } from 'react';
import { X, User, Save, Loader, Dumbbell } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUpdate: (user: any) => void;
}

export function SettingsModal({ isOpen, onClose, user, onUpdate }: SettingsModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    age: '',
    weight: '',
    height: '',
    squat_pr: '',
    bench_pr: '',
    deadlift_pr: '',
    bio: '',
    profile_image: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        nickname: user.nickname || '',
        age: user.age || '',
        weight: user.weight || '',
        height: user.height || '',
        squat_pr: user.squat_pr || '',
        bench_pr: user.bench_pr || '',
        deadlift_pr: user.deadlift_pr || '',
        bio: user.bio || '',
        profile_image: user.profile_image || ''
      });
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3000/api/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el perfil');
      }

      const updatedUser = { ...user, ...formData };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      onUpdate(updatedUser);
      setSuccess('Perfil actualizado con éxito');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#1c1c1c] w-full max-w-2xl rounded-sm border border-white/10 shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
            Ajustes de Perfil
          </h2>
          <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">
            Gestiona tu información de atleta
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 mb-6 text-sm text-center font-bold">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-3 mb-6 text-sm text-center font-bold">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-anvil-red text-xs font-black uppercase tracking-[0.2em] mb-4">Datos Personales</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Nombre Completo</label>
                <input
                  type="text"
                  className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-anvil-red uppercase">Mote / Apodo</label>
                <input
                  type="text"
                  className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors font-bold"
                  value={formData.nickname}
                  onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Edad</label>
                  <input
                    type="number"
                    className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-anvil-red"
                    value={formData.age}
                    onChange={(e) => setFormData({...formData, age: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-anvil-red"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Alt (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-[#252525] border border-white/10 text-white px-3 py-2 focus:outline-none focus:border-anvil-red"
                    value={formData.height}
                    onChange={(e) => setFormData({...formData, height: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Performance Info */}
            <div className="space-y-4">
              <h3 className="text-anvil-red text-xs font-black uppercase tracking-[0.2em] mb-4">Marcas (PRs)</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Sentadilla (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                  value={formData.squat_pr}
                  onChange={(e) => setFormData({...formData, squat_pr: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Press de Banca (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                  value={formData.bench_pr}
                  onChange={(e) => setFormData({...formData, bench_pr: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Peso Muerto (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                  value={formData.deadlift_pr}
                  onChange={(e) => setFormData({...formData, deadlift_pr: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Biografía / Objetivos</label>
            <textarea
              rows={4}
              className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors resize-none"
              value={formData.bio}
              onChange={(e) => setFormData({...formData, bio: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">URL de Foto de Perfil</label>
            <input
              type="url"
              className="w-full bg-[#252525] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
              value={formData.profile_image}
              onChange={(e) => setFormData({...formData, profile_image: e.target.value})}
              placeholder="https://ejemplo.com/mi-foto.jpg"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-black uppercase py-4 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-8"
          >
            {isLoading ? <Loader className="animate-spin" size={20} /> : <><Save size={20} /> Guardar Cambios</>}
          </button>
        </form>
      </div>
    </div>
  );
}
