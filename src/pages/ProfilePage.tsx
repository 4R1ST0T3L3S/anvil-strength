import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../hooks/useUser';
import { Loader, Save, Upload, X } from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { LayoutDashboard, Users, Calendar, Trophy, User, FileText, Utensils } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProfilePageProps {
    onLogout: () => void;
}

export function ProfilePage({ onLogout }: ProfilePageProps) {
    const { data: user, isLoading: userLoading, refetch } = useUser();
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        nickname: '',
        profile_image: '',
        // Athlete fields
        weight_category: '',
        age_category: '',
        squat_pr: 0,
        bench_pr: 0,
        deadlift_pr: 0,
        // Coach fields
        biography: ''
    });

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.full_name || user.nickname || '',
                nickname: user.nickname || '',
                profile_image: user.avatar_url || '',
                weight_category: user.weight_category || '',
                age_category: user.age_category || '',
                squat_pr: user.squat_pr || 0,
                bench_pr: user.bench_pr || 0,
                deadlift_pr: user.deadlift_pr || 0,
                biography: user.biography || ''
            });
            setImagePreview(user.avatar_url || null);
        }
    }, [user]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile || !user) return null;

        try {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, imageFile);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('profiles')
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Image upload error:', error);
            return null;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSaving(true);
        setMessage(null);

        try {
            let profileImageUrl = formData.profile_image;

            // Upload new image if selected
            if (imageFile) {
                const uploadedUrl = await uploadImage();
                if (uploadedUrl) {
                    profileImageUrl = uploadedUrl;
                }
            }

            const updateData: Record<string, unknown> = {
                full_name: formData.name,
                nickname: formData.nickname,
                avatar_url: profileImageUrl
            };

            // Add role-specific fields
            if (user.role === 'athlete') {
                updateData.weight_category = formData.weight_category || null;
                updateData.age_category = formData.age_category || null;
                updateData.squat_pr = formData.squat_pr || null;
                updateData.bench_pr = formData.bench_pr || null;
                updateData.deadlift_pr = formData.deadlift_pr || null;
            } else if (user.role === 'coach') {
                updateData.biography = formData.biography || null;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', user.id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
            await refetch();
            setImageFile(null);
        } catch (error) {
            console.error('Profile update error:', error);
            setMessage({ type: 'error', text: 'Error al actualizar el perfil' });
        } finally {
            setIsSaving(false);
        }
    };

    if (userLoading) {
        return (
            <div className="min-h-screen bg-[#1c1c1c] flex items-center justify-center">
                <Loader className="animate-spin text-anvil-red" size={48} />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-[#1c1c1c] flex items-center justify-center text-white">
                <p>No se pudo cargar el perfil</p>
            </div>
        );
    }

    // Complete menu items matching respective dashboards
    const menuItems = user.role === 'coach' ? [
        {
            icon: <LayoutDashboard size={20} />,
            label: 'Dashboard',
            onClick: () => navigate('/coach-dashboard'),
            isActive: false
        },
        {
            icon: <Users size={20} />,
            label: 'Mis Atletas',
            onClick: () => navigate('/coach-dashboard'),
            isActive: false
        },
        {
            icon: <Trophy size={20} />,
            label: 'Agenda Equipo',
            onClick: () => navigate('/coach-dashboard'),
            isActive: false
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario AEP',
            onClick: () => navigate('/coach-dashboard'),
            isActive: false
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => navigate('/profile'),
            isActive: true
        }
    ] : [
        {
            icon: <LayoutDashboard size={20} />,
            label: 'Home',
            onClick: () => navigate('/dashboard'),
            isActive: false
        },
        {
            icon: <FileText size={20} />,
            label: 'Mi Planificación',
            onClick: () => navigate('/dashboard'),
            isActive: false
        },
        {
            icon: <Utensils size={20} />,
            label: 'Mi Nutrición',
            onClick: () => navigate('/dashboard'),
            isActive: false
        },
        {
            icon: <Trophy size={20} />,
            label: 'Mis Competiciones',
            onClick: () => navigate('/dashboard'),
            isActive: false
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario AEP',
            onClick: () => navigate('/dashboard'),
            isActive: false
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => navigate('/profile'),
            isActive: true
        }
    ];

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            menuItems={menuItems}
            roleLabel={user.role === 'coach' ? 'Coach' : 'Athlete'}
        >
            <div className="max-w-4xl mx-auto p-6">
                <h1 className="text-3xl font-black text-white mb-8">Mi Perfil</h1>

                {message && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center justify-between ${message.type === 'success' ? 'bg-green-500/20 border border-green-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                        <p className="text-white font-bold">{message.text}</p>
                        <button onClick={() => setMessage(null)} className="text-white hover:opacity-70">
                            <X size={20} />
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-[#252525] rounded-xl p-8 space-y-6">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4 pb-6 border-b border-white/10">
                        <div className="relative">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Avatar" className="w-32 h-32 rounded-full object-cover border-4 border-anvil-red" />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-anvil-red flex items-center justify-center text-white text-4xl font-black">
                                    {formData.nickname?.[0]?.toUpperCase() || formData.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                            <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 bg-white text-black p-2 rounded-full cursor-pointer hover:bg-gray-200 transition-colors">
                                <Upload size={18} />
                            </label>
                            <input
                                id="avatar-upload"
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                            />
                        </div>
                        <p className="text-gray-400 text-sm">Haz clic en el ícono para cambiar tu foto</p>
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Nombre Completo *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Apodo</label>
                            <input
                                type="text"
                                value={formData.nickname}
                                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                                className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Email</label>
                            <input
                                type="email"
                                value={user.email || ''}
                                disabled
                                className="w-full bg-[#1c1c1c]/50 border border-white/5 rounded-lg px-4 py-3 text-gray-500 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">Rol</label>
                            <input
                                type="text"
                                value={user.role === 'coach' ? 'Entrenador' : 'Atleta'}
                                disabled
                                className="w-full bg-[#1c1c1c]/50 border border-white/5 rounded-lg px-4 py-3 text-gray-500 cursor-not-allowed capitalize"
                            />
                        </div>
                    </div>

                    {/* Role-Specific Fields */}
                    {user.role === 'athlete' && (
                        <>
                            <div className="pt-6 border-t border-white/10">
                                <h2 className="text-xl font-black text-white mb-4">Información de Atleta</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Categoría de Peso</label>
                                        <input
                                            type="text"
                                            value={formData.weight_category}
                                            onChange={(e) => setFormData({ ...formData, weight_category: e.target.value })}
                                            placeholder="Ej: -74kg"
                                            className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Categoría de Edad</label>
                                        <input
                                            type="text"
                                            value={formData.age_category}
                                            onChange={(e) => setFormData({ ...formData, age_category: e.target.value })}
                                            placeholder="Ej: Sub-23"
                                            className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/10">
                                <h2 className="text-xl font-black text-white mb-4">Personal Records (PRs)</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Sentadilla (kg)</label>
                                        <input
                                            type="number"
                                            value={formData.squat_pr || ''}
                                            onChange={(e) => setFormData({ ...formData, squat_pr: Number(e.target.value) })}
                                            placeholder="0"
                                            className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Press de Banca (kg)</label>
                                        <input
                                            type="number"
                                            value={formData.bench_pr || ''}
                                            onChange={(e) => setFormData({ ...formData, bench_pr: Number(e.target.value) })}
                                            placeholder="0"
                                            className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Peso Muerto (kg)</label>
                                        <input
                                            type="number"
                                            value={formData.deadlift_pr || ''}
                                            onChange={(e) => setFormData({ ...formData, deadlift_pr: Number(e.target.value) })}
                                            placeholder="0"
                                            className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {user.role === 'coach' && (
                        <div className="pt-6 border-t border-white/10">
                            <h2 className="text-xl font-black text-white mb-4">Información de Entrenador</h2>
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-2">Biografía / Especialidad</label>
                                <textarea
                                    value={formData.biography}
                                    onChange={(e) => setFormData({ ...formData, biography: e.target.value })}
                                    rows={5}
                                    placeholder="Describe tu experiencia, especialidades y enfoque como entrenador..."
                                    className="w-full bg-[#1c1c1c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-anvil-red transition-colors resize-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <div className="flex justify-end pt-6 border-t border-white/10">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-anvil-red hover:bg-red-700 text-white font-black px-8 py-3 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? (
                                <>
                                    <Loader className="animate-spin" size={20} />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    Guardar Cambios
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
