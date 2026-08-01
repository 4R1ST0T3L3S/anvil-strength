import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Loader, Settings2, Plus, Trash2, X, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, FormType, FormQuestion, FormResponse, QuestionType,
    DEFAULT_DAILY_QUESTIONS, DEFAULT_WEEKLY_QUESTIONS
} from '../../services/formsService';

/** Pestaña de check-ins del atleta para el coach: respuestas + edición de plantillas. */
export function CoachCheckInsTab({ athleteId, coachId }: { athleteId: string; coachId: string }) {
    const [type, setType] = useState<FormType>('daily');
    const [responses, setResponses] = useState<FormResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [editorOpen, setEditorOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const data = await formsService.getResponsesByAthlete(athleteId, type);
            setResponses(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [athleteId, type]);

    useEffect(() => { load(); }, [load]);

    const scaleColor = (v: number) => {
        if (v <= 3) return 'text-red-400 bg-red-500/10 border-red-500/20';
        if (v <= 6) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
        return 'text-green-400 bg-green-500/10 border-green-500/20';
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <ClipboardCheck className="text-anvil-red" />
                    Check-ins
                </h3>
                <div className="flex items-center gap-2">
                    <div className="flex bg-black/20 p-1 rounded-lg">
                        {(['daily', 'weekly'] as FormType[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`px-4 py-1.5 rounded-md text-xs font-black uppercase transition-all ${
                                    type === t ? 'bg-anvil-red text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {t === 'daily' ? 'Diario' : 'Semanal'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setEditorOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-black uppercase text-gray-300 hover:text-white hover:border-anvil-red/40 transition-all"
                    >
                        <Settings2 size={14} className="text-anvil-red" />
                        Editar formulario
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader className="animate-spin text-anvil-red" size={26} /></div>
            ) : responses.length === 0 ? (
                <div className="text-center py-16 bg-[#252525] border border-white/5 rounded-xl">
                    <ClipboardCheck size={40} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400 font-medium">
                        El atleta aún no ha respondido ningún check-in {type === 'daily' ? 'diario' : 'semanal'}.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {responses.map(r => (
                        <div key={r.id} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">
                                {r.type === 'daily'
                                    ? new Date(r.period_key).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                                    : `Semana ${r.period_key.split('-W')[1]} · ${r.period_key.split('-W')[0]}`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {r.answers.filter(a => a.qtype !== 'text' && a.value !== null && a.value !== '').map(a => (
                                    <div
                                        key={a.id}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                                            a.qtype === 'scale' ? scaleColor(Number(a.value)) : 'text-gray-300 bg-white/5 border-white/10'
                                        }`}
                                    >
                                        <span className="text-gray-400 font-medium">{a.label}:</span>
                                        <span className="font-black">
                                            {a.qtype === 'number' ? Number(a.value).toLocaleString('es-ES') : `${a.value}/10`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {r.answers.filter(a => a.qtype === 'text' && a.value).map(a => (
                                <p key={a.id} className="text-sm text-gray-300 mt-3 bg-black/20 border border-white/5 rounded-xl p-3 leading-relaxed">
                                    💬 {a.value}
                                </p>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {editorOpen && (
                <TemplateEditorModal
                    coachId={coachId}
                    type={type}
                    onClose={() => setEditorOpen(false)}
                />
            )}
        </div>
    );
}

// ============ Editor de plantilla ============

function TemplateEditorModal({ coachId, type, onClose }: { coachId: string; type: FormType; onClose: () => void }) {
    const [questions, setQuestions] = useState<FormQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        formsService.getTemplate(coachId, type)
            .then(setQuestions)
            .catch(() => setQuestions(type === 'daily' ? DEFAULT_DAILY_QUESTIONS : DEFAULT_WEEKLY_QUESTIONS))
            .finally(() => setLoading(false));
    }, [coachId, type]);

    const updateQuestion = (i: number, updates: Partial<FormQuestion>) => {
        setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, ...updates } : q));
    };

    const addQuestion = () => {
        setQuestions(prev => [...prev, { id: `custom_${prev.length}_${prev.map(q => q.id).join('').length}`, label: '', qtype: 'scale' }]);
    };

    const removeQuestion = (i: number) => {
        setQuestions(prev => prev.filter((_, idx) => idx !== i));
    };

    const handleSave = async () => {
        const valid = questions.filter(q => q.label.trim());
        if (valid.length === 0) {
            toast.error('Añade al menos una pregunta');
            return;
        }
        setSaving(true);
        try {
            await formsService.saveTemplate(coachId, type, valid);
            toast.success('Formulario guardado. Se aplicará a todos tus atletas.');
            onClose();
        } catch (e) {
            console.error(e);
            toast.error('Error guardando el formulario (¿ejecutaste la migración SQL?)');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            await formsService.resetTemplate(coachId, type);
            setQuestions(type === 'daily' ? DEFAULT_DAILY_QUESTIONS : DEFAULT_WEEKLY_QUESTIONS);
            toast.success('Formulario restablecido al predefinido');
        } catch (e) {
            console.error(e);
            toast.error('Error al restablecer');
        }
    };

    const QTYPE_LABELS: Record<QuestionType, string> = { scale: '0-10', number: 'Número', text: 'Texto' };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#1c1c1c] w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                        <Settings2 className="text-anvil-red" size={18} />
                        Formulario {type === 'daily' ? 'diario' : 'semanal'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader className="animate-spin text-anvil-red" size={24} /></div>
                    ) : (
                        <>
                            {questions.map((q, i) => (
                                <div key={i} className="flex items-center gap-2 bg-[#252525] border border-white/5 rounded-xl p-3">
                                    <input
                                        type="text"
                                        value={q.label}
                                        onChange={(e) => updateQuestion(i, { label: e.target.value })}
                                        placeholder="Texto de la pregunta..."
                                        maxLength={120}
                                        className="flex-1 bg-black/30 border border-white/5 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors min-w-0"
                                    />
                                    <select
                                        value={q.qtype}
                                        onChange={(e) => updateQuestion(i, { qtype: e.target.value as QuestionType })}
                                        className="bg-black/30 border border-white/5 rounded-lg py-2 px-2 text-gray-300 text-xs focus:outline-none focus:border-anvil-red/50 shrink-0"
                                    >
                                        {(Object.keys(QTYPE_LABELS) as QuestionType[]).map(t => (
                                            <option key={t} value={t}>{QTYPE_LABELS[t]}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => removeQuestion(i)}
                                        className="p-2 text-gray-600 hover:text-red-500 transition-colors shrink-0"
                                        title="Eliminar pregunta"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={addQuestion}
                                className="w-full py-3 border-2 border-dashed border-white/10 hover:border-anvil-red/50 rounded-xl text-gray-500 hover:text-anvil-red text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> Añadir pregunta
                            </button>
                        </>
                    )}
                </div>

                <div className="p-5 border-t border-white/5 shrink-0 flex items-center justify-between gap-3">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-wide transition-colors"
                    >
                        <RotateCcw size={13} /> Restablecer predefinido
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="px-6 py-2.5 rounded-lg bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-wider text-xs transition-colors disabled:opacity-40 flex items-center gap-2"
                    >
                        {saving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
