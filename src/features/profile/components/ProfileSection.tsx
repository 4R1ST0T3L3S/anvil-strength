import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Loader, Save, Camera, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProfileSectionProps {
    user: UserProfile;
    onUpdate: () => void;
}

export function ProfileSection({ user, onUpdate }: ProfileSectionProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(user.avatar_url || user.profile_image || null);

    // Form state
    const [formData, setFormData] = useState({
        name: user.full_name || user.name || '',
        nickname: user.nickname || '',
        gender: user.gender || '',
        weight_category: user.weight_category || '',
        age_category: user.age_category || '',
        squat_pr: user.squat_pr?.toString() || '',
        bench_pr: user.bench_pr?.toString() || '',
        deadlift_pr: user.deadlift_pr?.toString() || '',
        biography: user.biography || ''
    });

    useEffect(() => {
        setFormData({
            name: user.full_name || user.name || '',
            nickname: user.nickname || '',
            gender: user.gender || '',
            weight_category: user.weight_category || '',
            age_category: user.age_category || '',
            squat_pr: user.squat_pr?.toString() || '',
            bench_pr: user.bench_pr?.toString() || '',
            deadlift_pr: user.deadlift_pr?.toString() || '',
            biography: user.biography || ''
        });
        setImagePreview(user.avatar_url || user.profile_image || null);
    }, [user]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'La imagen es demasiado grande (máx 2MB)' });
                return;
            }
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const removePhoto = () => {
        setImageFile(null);
        setImagePreview(null);
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) return null;
        try {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, imageFile);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Error al subir imagen:', error);
            return null;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            let profileImageUrl = user.avatar_url || user.profile_image || '';

            if (imageFile) {
                const uploadedUrl = await uploadImage();
                if (uploadedUrl) profileImageUrl = uploadedUrl;
            } else if (imagePreview === null) {
                profileImageUrl = '';
            }

            const updateData: any = {
                full_name: formData.name,
                nickname: formData.nickname,
                avatar_url: profileImageUrl,
                gender: formData.gender || null,
                age_category: formData.age_category || null,
                weight_category: formData.weight_category || null,
                biography: formData.biography || null
            };

            if (user.role === 'athlete') {
                updateData.squat_pr = formData.squat_pr ? parseFloat(formData.squat_pr) : null;
                updateData.bench_pr = formData.bench_pr ? parseFloat(formData.bench_pr) : null;
                updateData.deadlift_pr = formData.deadlift_pr ? parseFloat(formData.deadlift_pr) : null;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', user.id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Perfil actualizado con éxito' });
            onUpdate();
            setImageFile(null);
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error al actualizar perfil:', error);
            setMessage({ type: 'error', text: 'No se pudo guardar la información' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <header className="mb-8">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white">Mi Perfil</h1>
                <p className="text-gray-400 text-lg">Gestiona tu información personal y marcas.</p>
            </header>

            {message && (
                <div className={`mb-8 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <p className="font-bold text-sm">{message.text}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Avatar Section */}
                <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 transition-all hover:border-white/10">
                    <div className="relative group">
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-anvil-red bg-[#1c1c1c] flex items-center justify-center relative">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            ) : (
                                <span className="text-4xl font-black text-gray-600">
                                    {(formData.nickname?.[0] || formData.name?.[0] || 'U').toUpperCase()}
                                </span>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera size={32} className="text-white" />
                            </div>
                        </div>
                        <label className="absolute bottom-1 right-1 bg-white text-black p-2 rounded-full cursor-pointer shadow-xl hover:bg-anvil-red hover:text-white transition-all transform hover:scale-110">
                            <Camera size={18} />
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                        </label>
                        {imagePreview && (
                            <button
                                type="button"
                                onClick={removePhoto}
                                className="absolute top-1 right-1 bg-black/80 text-white p-2 rounded-full hover:bg-red-600 transition-colors shadow-lg"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">Foto de Perfil</h3>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                            Sube una foto clara. Se recomienda un formato cuadrado (máx. 2MB).
                        </p>
                    </div>
                </div>

                {/* Personal Info */}
                <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-anvil-red border-l-2 border-anvil-red pl-3 mb-6">Información Personal</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre Completo</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Apodo / Mote</label>
                            <input
                                type="text"
                                value={formData.nickname}
                                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                                className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all font-bold tracking-widest"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email (No editable)</label>
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                className="w-full bg-[#1c1c1c]/50 border border-white/5 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Rol</label>
                            <div className="w-full bg-[#1c1c1c]/50 border border-white/5 rounded-xl px-4 py-3 text-gray-400 capitalize font-bold">
                                {user.role === 'coach' ? 'Entrenador' : 'Atleta'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Categories & PRs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-anvil-red border-l-2 border-anvil-red pl-3 mb-6">Categorías</h3>
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Categoría de Edad</label>
                                <select
                                    value={formData.age_category}
                                    onChange={e => setFormData({ ...formData, age_category: e.target.value })}
                                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="Sub-Junior">Sub-Junior</option>
                                    <option value="Junior">Junior</option>
                                    <option value="Senior">Senior (Open)</option>
                                    <option value="Master 1">Master 1</option>
                                    <option value="Master 2">Master 2</option>
                                    <option value="Master 3">Master 3</option>
                                    <option value="Master 4">Master 4</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sexo</label>
                                <select
                                    value={formData.gender}
                                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="male">Masculino</option>
                                    <option value="female">Femenino</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Categoría de Peso</label>
                                <select
                                    value={formData.weight_category}
                                    onChange={e => setFormData({ ...formData, weight_category: e.target.value })}
                                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all"
                                >
                                    <option value="">Seleccionar...</option>
                                    <optgroup label="Masculino">
                                        <option value="-59kg">-59kg</option>
                                        <option value="-66kg">-66kg</option>
                                        <option value="-74kg">-74kg</option>
                                        <option value="-83kg">-83kg</option>
                                        <option value="-93kg">-93kg</option>
                                        <option value="-105kg">-105kg</option>
                                        <option value="-120kg">-120kg</option>
                                        <option value="+120kg">+120kg</option>
                                    </optgroup>
                                    <optgroup label="Femenino">
                                        <option value="-47kg">-47kg</option>
                                        <option value="-52kg">-52kg</option>
                                        <option value="-57kg">-57kg</option>
                                        <option value="-63kg">-63kg</option>
                                        <option value="-69kg">-69kg</option>
                                        <option value="-76kg">-76kg</option>
                                        <option value="-84kg">-84kg</option>
                                        <option value="+84kg">+84kg</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-anvil-red border-l-2 border-anvil-red pl-3 mb-6">Marcas (PRs)</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-[#1c1c1c] p-4 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sentadilla</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.squat_pr}
                                    onChange={e => setFormData({ ...formData, squat_pr: e.target.value })}
                                    className="bg-transparent text-right font-black text-xl text-white outline-none w-24"
                                    placeholder="0"
                                />
                            </div>
                            <div className="flex items-center justify-between bg-[#1c1c1c] p-4 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Banca</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.bench_pr}
                                    onChange={e => setFormData({ ...formData, bench_pr: e.target.value })}
                                    className="bg-transparent text-right font-black text-xl text-white outline-none w-24"
                                    placeholder="0"
                                />
                            </div>
                            <div className="flex items-center justify-between bg-[#1c1c1c] p-4 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Muerto</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.deadlift_pr}
                                    onChange={e => setFormData({ ...formData, deadlift_pr: e.target.value })}
                                    className="bg-transparent text-right font-black text-xl text-white outline-none w-24"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Biography */}
                <div className="bg-[#252525] border border-white/5 rounded-2xl p-8 space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-anvil-red border-l-2 border-anvil-red pl-3 mb-6">
                        {user.role === 'coach' ? 'Biografía / Especialidad' : 'Sobre mí / Objetivos'}
                    </h3>
                    <textarea
                        value={formData.biography}
                        onChange={e => setFormData({ ...formData, biography: e.target.value })}
                        rows={5}
                        placeholder="Escribe algo sobre ti..."
                        className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-all resize-none"
                    />
                </div>

                {/* Sticky Submit Bar for Mobile / Floating for Desktop */}
                <div className="flex justify-end pt-4 pb-12">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full md:w-auto bg-white text-black hover:bg-anvil-red hover:text-white font-black px-12 py-4 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>
                                <Loader className="animate-spin" size={20} />
                                <span>Guardando...</span>
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                <span>Guardar Cambios</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
