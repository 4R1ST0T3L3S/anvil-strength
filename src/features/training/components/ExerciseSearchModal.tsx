import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Plus, Loader2, Dumbbell } from 'lucide-react';
import { ExerciseLibrary } from '../../../types/training';
import { trainingService } from '../../../services/trainingService';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

interface Props {
    onSelect: (exerciseId: string) => void;
    onClose: () => void;
}

const MUSCLE_GROUPS = ['Todos', 'Pecho', 'Espalda', 'Pierna', 'Hombro', 'Bíceps', 'Tríceps', 'Core', 'Otros'];

export function ExerciseSearchModal({ onSelect, onClose }: Props) {
    const [exercises, setExercises] = useState<ExerciseLibrary[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('Todos');
    
    // Custom Exercise State
    const [isCreating, setIsCreating] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customGroup, setCustomGroup] = useState('Otros');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadExercises();
    }, []);

    const loadExercises = async () => {
        try {
            setLoading(true);
            const data = await trainingService.getExerciseLibrary();
            setExercises(data);
        } catch (error) {
            console.error('Error loading exercises:', error);
            toast.error('Error al cargar la biblioteca de ejercicios');
        } finally {
            setLoading(false);
        }
    };

    const filteredExercises = useMemo(() => {
        let filtered = exercises;
        if (activeTab !== 'Todos') {
            filtered = filtered.filter(e => e.muscle_group === activeTab);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            filtered = filtered.filter(e => e.name.toLowerCase().includes(q));
        }
        return filtered;
    }, [exercises, search, activeTab]);

    const handleCreateCustom = async () => {
        if (!customName.trim()) return;
        try {
            setSubmitting(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const newEx = await trainingService.createExercise({
                name: customName.trim(),
                muscle_group: customGroup,
                coach_id: user.id,
                is_public: false,
                video_url: null
            });
            
            toast.success('Ejercicio creado con éxito');
            setExercises(prev => [...prev, newEx]);
            setIsCreating(false);
            setCustomName('');
            onSelect(newEx.id); // Select it immediately
        } catch (error) {
            console.error('Error creating custom exercise', error);
            toast.error('Error al crear el ejercicio');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#111] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-zinc-800">
                    <h2 className="text-white font-black uppercase text-lg tracking-wider flex items-center gap-2">
                        <Dumbbell className="text-anvil-red" />
                        Buscador de Ejercicios
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors bg-zinc-900/50 p-2 rounded-full hover:bg-zinc-800">
                        <X size={20} />
                    </button>
                </div>

                {isCreating ? (
                    <div className="p-6 flex-1 flex flex-col justify-center">
                        <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider text-center">Crear Nuevo Ejercicio</h3>
                        <div className="space-y-4 max-w-md mx-auto w-full">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Nombre del Ejercicio</label>
                                <input 
                                    type="text" 
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="Ej: Sentadilla con Pausa 3s"
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white p-3 rounded-lg focus:border-anvil-red outline-none transition-colors"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Grupo Muscular</label>
                                <select 
                                    value={customGroup}
                                    onChange={(e) => setCustomGroup(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white p-3 rounded-lg focus:border-anvil-red outline-none transition-colors"
                                >
                                    {MUSCLE_GROUPS.filter(g => g !== 'Todos').map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-3 mt-8">
                                <button 
                                    onClick={() => setIsCreating(false)}
                                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold uppercase text-sm transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleCreateCustom}
                                    disabled={!customName.trim() || submitting}
                                    className="flex-1 py-3 bg-anvil-red hover:bg-red-600 text-black rounded-lg font-black uppercase text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                                    Crear y Seleccionar
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Search Bar */}
                        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                            <div className="relative flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar ejercicio..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
                                        autoFocus
                                    />
                                </div>
                                <button 
                                    onClick={() => setIsCreating(true)}
                                    className="px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold uppercase text-xs flex items-center gap-2 transition-colors border border-zinc-700"
                                >
                                    <Plus size={16} /> Crear
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex overflow-x-auto p-2 border-b border-zinc-800 bg-zinc-900/30 hide-scrollbar">
                            {MUSCLE_GROUPS.map(group => (
                                <button
                                    key={group}
                                    onClick={() => setActiveTab(group)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors mr-2 ${
                                        activeTab === group 
                                        ? 'bg-anvil-red text-black' 
                                        : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                                    }`}
                                >
                                    {group}
                                </button>
                            ))}
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
                                    <Loader2 className="animate-spin mb-4 text-anvil-red" size={32} />
                                    <p className="uppercase font-bold text-xs tracking-widest">Cargando ejercicios...</p>
                                </div>
                            ) : filteredExercises.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {filteredExercises.map(ex => (
                                        <button
                                            key={ex.id}
                                            onClick={() => onSelect(ex.id)}
                                            className="flex flex-col text-left p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-all group"
                                        >
                                            <span className="font-bold text-white group-hover:text-anvil-red transition-colors">{ex.name}</span>
                                            <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{ex.muscle_group || 'Otros'}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-center px-4">
                                    <Dumbbell size={48} className="mb-4 opacity-20" />
                                    <p className="mb-2 font-bold text-lg">No se encontraron ejercicios</p>
                                    <p className="text-sm">¿No encuentras lo que buscas? Puedes crear uno nuevo.</p>
                                    <button 
                                        onClick={() => setIsCreating(true)}
                                        className="mt-4 px-6 py-2 bg-anvil-red/10 text-anvil-red border border-anvil-red/20 hover:bg-anvil-red hover:text-black rounded-lg font-bold uppercase text-xs transition-colors"
                                    >
                                        Crear Ejercicio Custom
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
