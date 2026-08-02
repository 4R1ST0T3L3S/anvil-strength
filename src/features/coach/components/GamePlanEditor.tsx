import { useState, useEffect } from 'react';
import { X, Save, Loader, FileDown, Plus, Trash2, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { CompetitionAssignment } from '../../../services/competitionsService';
import {
    gamePlanService, GamePlan, GamePlanData, GamePlanLift, emptyPlan
} from '../../../services/gamePlanService';

const LIFTS: { key: keyof GamePlanData; label: string; short: string }[] = [
    { key: 'squat', label: 'Sentadilla', short: 'SQ' },
    { key: 'bench', label: 'Press Banca', short: 'BP' },
    { key: 'deadlift', label: 'Peso Muerto', short: 'DL' },
];

const ATTEMPT_LABELS = ['1er Intento', '2º Intento', '3er Intento'];

interface GamePlanEditorProps {
    coachId: string;
    athleteId: string;
    athleteName: string;
    competition: CompetitionAssignment;
    onClose: () => void;
}

export function GamePlanEditor({ coachId, athleteId, athleteName, competition, onClose }: GamePlanEditorProps) {
    const [plan, setPlan] = useState<GamePlanData>(emptyPlan());
    const [notes, setNotes] = useState('');
    const [existingId, setExistingId] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        gamePlanService.getByCompetition(athleteId, competition.id)
            .then((gp: GamePlan | null) => {
                if (gp) {
                    // Fusionar con estructura vacía por si faltan campos
                    const base = emptyPlan();
                    setPlan({
                        squat: { ...base.squat, ...gp.plan?.squat },
                        bench: { ...base.bench, ...gp.plan?.bench },
                        deadlift: { ...base.deadlift, ...gp.plan?.deadlift },
                    });
                    setNotes(gp.notes || '');
                    setExistingId(gp.id);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [athleteId, competition.id]);

    const updateLift = (lift: keyof GamePlanData, updates: Partial<GamePlanLift>) => {
        setPlan(prev => ({ ...prev, [lift]: { ...prev[lift], ...updates } }));
    };

    const updateAttempt = (lift: keyof GamePlanData, i: number, field: string, value: string) => {
        setPlan(prev => ({
            ...prev,
            [lift]: {
                ...prev[lift],
                attempts: prev[lift].attempts.map((a, idx) => idx === i ? { ...a, [field]: value } : a)
            }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await gamePlanService.save({
                id: existingId,
                coach_id: coachId,
                athlete_id: athleteId,
                competition_id: competition.id,
                competition_name: competition.name,
                competition_date: competition.date,
                plan,
                notes: notes.trim() || null
            });
            setExistingId(saved.id);
            toast.success('Game plan guardado');
        } catch (e) {
            console.error(e);
            toast.error('Error guardando (¿ejecutaste la migración SQL?)');
        } finally {
            setSaving(false);
        }
    };

    const handleExportPdf = () => {
        // Vista imprimible: el CSS de index.css oculta el resto de la app al imprimir
        window.print();
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-[180] bg-[#141414] flex items-center justify-center">
                <Loader className="animate-spin text-anvil-red" size={30} />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[180] bg-[#141414] flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 md:px-8 py-4 border-b border-white/5 bg-[#1a1a1a] shrink-0 print:hidden">
                <div className="min-w-0">
                    <h2 className="text-lg md:text-2xl font-black uppercase text-white flex items-center gap-2 tracking-tight truncate">
                        <Swords className="text-anvil-red shrink-0" size={22} />
                        Game Plan · <span className="text-gray-400 truncate">{athleteName}</span>
                    </h2>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider truncate">
                        {competition.name} · {new Date(competition.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleExportPdf}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-gray-300 hover:text-white hover:border-anvil-red/40 transition-all"
                    >
                        <FileDown size={14} className="text-anvil-red" /> PDF
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2.5 bg-anvil-red hover:bg-red-700 rounded-xl text-xs font-black uppercase text-white transition-colors disabled:opacity-40"
                    >
                        {saving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />} Guardar
                    </button>
                    <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors" aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 print:hidden">
                <div className="max-w-5xl mx-auto space-y-6">
                    {LIFTS.map(({ key, label }) => {
                        const lift = plan[key];
                        return (
                            <div key={key} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-5 md:p-6">
                                <h3 className="text-xl font-black uppercase italic text-white mb-5 flex items-center gap-3">
                                    <span className="text-anvil-red">{label}</span>
                                </h3>

                                {/* Intentos */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                    {lift.attempts.map((att, i) => (
                                        <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-2.5">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{ATTEMPT_LABELS[i]}</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-[9px] font-black uppercase text-gray-600 block mb-1">Kg</label>
                                                    <input
                                                        value={att.kg}
                                                        onChange={(e) => updateAttempt(key, i, 'kg', e.target.value)}
                                                        placeholder="—"
                                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2 px-2 text-white text-sm font-black text-center focus:outline-none focus:border-anvil-red/50"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black uppercase text-gray-600 block mb-1">RPE</label>
                                                    <input
                                                        value={att.rpe}
                                                        onChange={(e) => updateAttempt(key, i, 'rpe', e.target.value)}
                                                        placeholder="—"
                                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2 px-2 text-white text-sm text-center focus:outline-none focus:border-anvil-red/50"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black uppercase text-gray-600 block mb-1">Vel m/s</label>
                                                    <input
                                                        value={att.velocity}
                                                        onChange={(e) => updateAttempt(key, i, 'velocity', e.target.value)}
                                                        placeholder="—"
                                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2 px-2 text-white text-sm text-center focus:outline-none focus:border-anvil-red/50"
                                                    />
                                                </div>
                                            </div>
                                            <input
                                                value={att.note}
                                                onChange={(e) => updateAttempt(key, i, 'note', e.target.value)}
                                                placeholder="Anotación (ej: solo si el 2º sube fácil)"
                                                className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2 px-3 text-gray-300 text-xs focus:outline-none focus:border-anvil-red/50"
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Aproximaciones (calentamientos) */}
                                <div className="mb-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Aproximaciones</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {lift.warmups.map((w, i) => (
                                            <div key={i} className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5">
                                                <input
                                                    value={w.kg}
                                                    onChange={(e) => updateLift(key, { warmups: lift.warmups.map((x, xi) => xi === i ? { ...x, kg: e.target.value } : x) })}
                                                    placeholder="kg"
                                                    className="w-14 bg-transparent text-white text-xs font-bold text-center focus:outline-none"
                                                />
                                                <span className="text-gray-600 text-xs">×</span>
                                                <input
                                                    value={w.reps}
                                                    onChange={(e) => updateLift(key, { warmups: lift.warmups.map((x, xi) => xi === i ? { ...x, reps: e.target.value } : x) })}
                                                    placeholder="reps"
                                                    className="w-10 bg-transparent text-white text-xs text-center focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => updateLift(key, { warmups: lift.warmups.filter((_, xi) => xi !== i) })}
                                                    className="text-gray-700 hover:text-danger p-0.5"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => updateLift(key, { warmups: [...lift.warmups, { kg: '', reps: '' }] })}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-anvil-red/10 text-gray-500 hover:text-anvil-red text-[10px] font-black uppercase transition-colors border border-transparent hover:border-anvil-red/30"
                                        >
                                            <Plus size={11} /> Serie
                                        </button>
                                    </div>
                                </div>

                                {/* Nota del levantamiento */}
                                <input
                                    value={lift.liftNote}
                                    onChange={(e) => updateLift(key, { liftNote: e.target.value })}
                                    placeholder={`Notas de ${label.toLowerCase()} (setup, comandos, avisos...)`}
                                    className="w-full bg-black/20 border border-white/5 rounded-xl py-2.5 px-4 text-gray-300 text-sm focus:outline-none focus:border-anvil-red/50"
                                />
                            </div>
                        );
                    })}

                    {/* Notas generales */}
                    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-5 md:p-6">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Notas generales del día</p>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            maxLength={2000}
                            placeholder="Pesaje, horarios, comida, equipación, mentalidad..."
                            className="w-full bg-black/20 border border-white/5 rounded-xl py-3 px-4 text-gray-200 text-sm focus:outline-none focus:border-anvil-red/50 resize-none"
                        />
                    </div>
                </div>
            </div>

            {/* ============ VISTA IMPRIMIBLE (solo visible al imprimir/exportar PDF) ============ */}
            <div id="gameplan-print" className="hidden print:block bg-white text-black p-8 font-sans">
                <div className="border-b-4 border-black pb-4 mb-6 flex items-end justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest">ANVIL STRENGTH · GAME PLAN</p>
                        <h1 className="text-3xl font-black uppercase">{athleteName}</h1>
                    </div>
                    <div className="text-right text-sm font-bold">
                        <p>{competition.name}</p>
                        <p>{new Date(competition.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        {competition.location && <p className="font-medium">{competition.location}</p>}
                    </div>
                </div>

                {LIFTS.map(({ key, label }) => {
                    const lift = plan[key];
                    const hasContent = lift.attempts.some(a => a.kg) || lift.warmups.length > 0;
                    if (!hasContent) return null;
                    return (
                        <div key={key} className="mb-6" style={{ pageBreakInside: 'avoid' }}>
                            <h2 className="text-xl font-black uppercase border-b-2 border-black pb-1 mb-3">{label}</h2>
                            <table className="w-full text-sm border-collapse mb-2">
                                <thead>
                                    <tr className="text-left text-xs uppercase font-black border-b border-gray-400">
                                        <th className="py-1 pr-4">Intento</th>
                                        <th className="py-1 pr-4">Kg</th>
                                        <th className="py-1 pr-4">RPE</th>
                                        <th className="py-1 pr-4">Vel (m/s)</th>
                                        <th className="py-1">Anotación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lift.attempts.map((a, i) => (
                                        <tr key={i} className="border-b border-gray-200">
                                            <td className="py-1.5 pr-4 font-bold">{ATTEMPT_LABELS[i]}</td>
                                            <td className="py-1.5 pr-4 font-black text-lg">{a.kg || '—'}</td>
                                            <td className="py-1.5 pr-4">{a.rpe || '—'}</td>
                                            <td className="py-1.5 pr-4">{a.velocity || '—'}</td>
                                            <td className="py-1.5 text-xs">{a.note || ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {lift.warmups.length > 0 && (
                                <p className="text-sm">
                                    <span className="font-black uppercase text-xs">Aproximaciones: </span>
                                    {lift.warmups.map(w => `${w.kg}×${w.reps}`).join(' → ')}
                                </p>
                            )}
                            {lift.liftNote && <p className="text-xs mt-1 italic">📝 {lift.liftNote}</p>}
                        </div>
                    );
                })}

                {notes && (
                    <div className="mt-4 border-t-2 border-black pt-3">
                        <h3 className="font-black uppercase text-sm mb-1">Notas generales</h3>
                        <p className="text-sm whitespace-pre-wrap">{notes}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
