import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Save, Trophy, Palette, Type, Clock, Layout } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface BannerSettings {
    customName?: string;
    targetDate?: string;
    targetTime?: string; // HH:mm
    theme?: 'blue' | 'gold' | 'neon' | 'red' | 'dark' | 'glass';
    font?: 'inter' | 'bebas' | 'mono' | 'black';
    shape?: 'rounded' | 'square' | 'pill';
    backgroundImage?: string;
}

interface BannerSettingsModalProps {
    userId: string;
    fullUserMetadata: any;
    isOpen: boolean;
    onClose: () => void;
}

export function BannerSettingsModal({ userId, fullUserMetadata, isOpen, onClose }: BannerSettingsModalProps) {
    const initialSettings = fullUserMetadata?.competition_banner_settings || {};
    const [settings, setSettings] = useState<BannerSettings>(initialSettings);
    const [isSaving, setIsSaving] = useState(false);
    const [showAllThemes, setShowAllThemes] = useState(false);
    const queryClient = useQueryClient();

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Actualizar metadatos de AUTH (El usuario siempre tiene permiso para esto)
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    ...fullUserMetadata,
                    competition_banner_settings: settings
                }
            });

            if (authError) throw authError;

            // Intentar actualizar perfiles (opcional, por si acaso hay RLS)
            await supabase
                .from('profiles')
                .update({
                    user_metadata: {
                        ...(fullUserMetadata || {}),
                        competition_banner_settings: settings
                    }
                })
                .eq('id', userId);

            await queryClient.invalidateQueries({ queryKey: ['user'] });
            onClose();
        } catch (err) {
            console.error('Error saving banner settings:', err);
            alert('Error al guardar los ajustes. Inténtalo de nuevo.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-[#161616] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]">
                    <div className="flex items-center gap-3">
                        <Palette className="text-anvil-red" size={20} />
                        <h3 className="text-white font-black uppercase italic tracking-widest">Personalizar Contador</h3>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* General Info */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Trophy size={14} /> Información del Evento
                        </h4>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Nombre Personalizado</label>
                            <input
                                type="text"
                                value={settings.customName || ''}
                                onChange={e => setSettings({ ...settings, customName: e.target.value })}
                                placeholder="Ej: Mi Próximo PR"
                                className="w-full bg-black border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-anvil-red/50 transition-all"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1">Fecha</label>
                                <input
                                    type="date"
                                    value={settings.targetDate || ''}
                                    onChange={e => setSettings({ ...settings, targetDate: e.target.value })}
                                    className="w-full bg-black border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-anvil-red/50 transition-all [color-scheme:dark]"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1 flex items-center gap-1">
                                    <Clock size={10} /> Hora Exacta
                                </label>
                                <input
                                    type="time"
                                    value={settings.targetTime || ''}
                                    onChange={e => setSettings({ ...settings, targetTime: e.target.value })}
                                    className="w-full bg-black border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-anvil-red/50 transition-all [color-scheme:dark]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Aesthetics */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Layout size={14} /> Estética y Estilo
                        </h4>

                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase ml-1">Tema y Colores</label>
                                <button
                                    onClick={() => setShowAllThemes(!showAllThemes)}
                                    className="text-[10px] font-black text-anvil-red uppercase tracking-widest hover:underline"
                                >
                                    {showAllThemes ? 'Ver Menos' : 'Ver Más Opciones'}
                                </button>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                                {[
                                    { id: 'dark', name: 'Noche', class: 'bg-zinc-900 border-zinc-700' },
                                    { id: 'blue', name: 'AEP 1', class: 'bg-blue-600 border-blue-400' },
                                    { id: 'gold', name: 'Nacional', class: 'bg-yellow-600 border-yellow-400' },
                                    { id: 'red', name: 'Anvil', class: 'bg-anvil-red border-red-400' },
                                    { id: 'neon', name: 'Cyber', class: 'bg-purple-600 border-purple-400' },
                                    { id: 'glass', name: 'Cristal', class: 'bg-white/10 border-white/20 backdrop-blur-md' },
                                    // Hidden themes
                                    ...(showAllThemes ? [
                                        { id: 'brutalist', name: 'Brutal', class: 'bg-white border-black' },
                                        { id: 'crimson', name: 'Carmesí', class: 'bg-red-900 border-red-700' },
                                        { id: 'emerald', name: 'Esmeralda', class: 'bg-emerald-600 border-emerald-400' },
                                        { id: 'ocean', name: 'Océano', class: 'bg-gradient-to-br from-cyan-500 to-blue-600' },
                                        { id: 'sunset', name: 'Ocaso', class: 'bg-gradient-to-br from-orange-500 to-rose-600' },
                                        { id: 'forest', name: 'Bosque', class: 'bg-gradient-to-br from-green-600 to-emerald-900' },
                                        { id: 'midnight', name: 'Media N.', class: 'bg-gradient-to-br from-indigo-900 to-black' },
                                        { id: 'lava', name: 'Lava', class: 'bg-gradient-to-br from-red-600 to-orange-800' },
                                        { id: 'minimal', name: 'Gris', class: 'bg-zinc-100 border-zinc-300' },
                                        { id: 'pink', name: 'Rosa', class: 'bg-gradient-to-br from-pink-400 to-rose-500' },
                                        { id: 'skyblue', name: 'Celeste', class: 'bg-gradient-to-br from-sky-300 to-blue-400' }
                                    ] : [])
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSettings({ ...settings, theme: t.id as any })}
                                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${settings.theme === t.id ? 'border-white bg-white/10 scale-105 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'border-transparent bg-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full ${t.class} border shadow-lg`} />
                                        <span className="text-[10px] font-bold text-white uppercase">{t.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>


                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-3 ml-1">Forma del Contenedor</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { id: 'rounded', name: 'Redondo', class: 'rounded-xl' },
                                    { id: 'square', name: 'Recto', class: 'rounded-none' },
                                    { id: 'pill', name: 'Cápsula', class: 'rounded-full' },
                                    { id: 'extra', name: 'Extra', class: 'rounded-[3rem]' }
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSettings({ ...settings, shape: s.id as any })}
                                        className={`p-2 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${settings.shape === s.id ? 'border-anvil-red bg-anvil-red/10' : 'border-transparent bg-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className={`w-full h-8 bg-zinc-700 ${s.class}`} />
                                        <span className="text-[9px] font-bold text-zinc-400 uppercase">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>


                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1.5 ml-1 flex items-center gap-1">
                                    <Type size={12} /> Tipografía
                                </label>
                                <select
                                    value={settings.font || 'inter'}
                                    onChange={e => setSettings({ ...settings, font: e.target.value as any })}
                                    className="w-full bg-black border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-anvil-red/50 appearance-none"
                                >
                                    <option value="inter">Inter (Moderno)</option>
                                    <option value="bebas">Bebas (Fuerte)</option>
                                    <option value="mono">Mono (Digital)</option>
                                    <option value="black">Black Italic</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 bg-[#0a0a0a] border-t border-white/5 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 sm:px-6 sm:py-4 rounded-xl font-bold uppercase text-xs tracking-widest text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 bg-anvil-red text-white px-4 py-3 sm:px-6 sm:py-4 rounded-xl font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-red-500 transition-colors shadow-[0_0_30px_rgba(220,38,38,0.3)]"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <><Save size={16} /> Guardar Cambios</>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
}

