import React, { useState, useEffect, useRef } from 'react';
import { X, User, Save, Loader, Camera, Trash2 } from 'lucide-react';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    age_category: '',
    weight_category: '',
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
        age_category: user.age_category || '',
        weight_category: user.weight_category || '',
        squat_pr: user.squat_pr || '',
        bench_pr: user.bench_pr || '',
        deadlift_pr: user.deadlift_pr || '',
        bio: user.bio || '',
        profile_image: user.profile_image || ''
      });
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        setError('La imagen es demasiado grande (máx 2MB)');
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
      
      <div className="relative bg-[#1c1c1c] w-full max-w-2xl rounded-xl border border-white/10 shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
            Mi Perfil
          </h2>
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

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Top Section: Photo + Names */}
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center bg-white/5 p-6 border border-white/5 rounded-sm">
            {/* Photo Section */}
            <div className="relative group">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 md:w-40 md:h-40 rounded-sm border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden cursor-pointer hover:border-anvil-red transition-colors relative"
              >
                {formData.profile_image ? (
                  <>
                    <img src={formData.profile_image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold uppercase gap-2">
                      <Camera size={20} />
                      Cambiar Foto
                    </div>
                  </>
                ) : (
                  <div className="text-center p-4">
                    <Camera className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Subir Foto</span>
                  </div>
                )}
              </div>
              {formData.profile_image && (
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                  className="absolute -top-2 -right-2 bg-anvil-red text-white p-1.5 rounded-full hover:bg-red-700 transition-colors shadow-lg"
                  title="Eliminar foto"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Names Section */}
            <div className="flex-1 w-full space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre Completo</label>
                <input
                  type="text"
                  className="w-full bg-[#1c1c1c] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-anvil-red uppercase tracking-wider">Mote / Apodo</label>
                <input
                  type="text"
                  className="w-full bg-[#1c1c1c] border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors font-bold tracking-widest"
                  value={formData.nickname}
                  onChange={(e) => setFormData({...formData, nickname: e.target.value})}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Categories & Biography */}
            <div className="space-y-6 flex flex-col">
              <div className="space-y-4">
                <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-4 border-l-2 border-anvil-red pl-3">Categorías Powerlifting</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Cat. Edad</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red transition-colors [&>option]:bg-[#1c1c1c] [&>option]:text-white [&>optgroup]:bg-[#1c1c1c] [&>optgroup]:text-white"
                      value={formData.age_category}
                      onChange={(e) => setFormData({...formData, age_category: e.target.value})}
                    >
                      <option value="" disabled className="bg-[#1c1c1c] text-gray-500">Seleccionar</option>
                      <option value="Sub-Junior" className="bg-[#1c1c1c] text-white">Sub-Junior</option>
                      <option value="Junior" className="bg-[#1c1c1c] text-white">Junior</option>
                      <option value="Senior" className="bg-[#1c1c1c] text-white">Senior (Open)</option>
                      <option value="Master 1" className="bg-[#1c1c1c] text-white">Master 1</option>
                      <option value="Master 2" className="bg-[#1c1c1c] text-white">Master 2</option>
                      <option value="Master 3" className="bg-[#1c1c1c] text-white">Master 3</option>
                      <option value="Master 4" className="bg-[#1c1c1c] text-white">Master 4</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Cat. Peso</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-anvil-red transition-colors [&>option]:bg-[#1c1c1c] [&>option]:text-white [&>optgroup]:bg-[#1c1c1c] [&>optgroup]:text-white"
                      value={formData.weight_category}
                      onChange={(e) => setFormData({...formData, weight_category: e.target.value})}
                    >
                      <option value="" disabled className="bg-[#1c1c1c] text-gray-500">Seleccionar</option>
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
                </div>
              </div>

              <div className="space-y-4 flex-1 flex flex-col">
                <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-4 border-l-2 border-anvil-red pl-3">Biografía / Objetivos</h3>
                <textarea
                  rows={6}
                  className="w-full flex-1 bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red transition-colors resize-none text-sm"
                  value={formData.bio}
                  onChange={(e) => setFormData({...formData, bio: e.target.value})}
                  placeholder="Escribe tus objetivos..."
                />
              </div>
            </div>

            {/* Performance Info */}
            <div className="space-y-4">
              <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-4 border-l-2 border-anvil-red pl-3">Marcas (PRs)</h3>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Sentadilla (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                    value={formData.squat_pr}
                    onChange={(e) => setFormData({...formData, squat_pr: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Press de Banca (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                    value={formData.bench_pr}
                    onChange={(e) => setFormData({...formData, bench_pr: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Peso Muerto (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-anvil-red"
                    value={formData.deadlift_pr}
                    onChange={(e) => setFormData({...formData, deadlift_pr: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-black uppercase py-5 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-8 shadow-xl"
          >
            {isLoading ? <Loader className="animate-spin" size={20} /> : <><Save size={20} /> Guardar Cambios</>}
          </button>
        </form>
      </div>
    </div>
  );
}
