import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Loader, Settings2, Plus, Trash2, X, Save, RotateCcw, Pencil, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, FormType, FormQuestion, FormResponse, QuestionType, FormAnswer,
    DEFAULT_DAILY_QUESTIONS, DEFAULT_WEEKLY_QUESTIONS,
    getPeriodKey, periodLabel, mergeQuestions
} from '../../services/formsService';
import { CheckInAnswerFields, AnswerValues } from './CheckInAnswerFields';
import { ConfirmationModal } from '../../components/modals/ConfirmationModal';

/** Pestaña de check-ins del atleta para el coach: respuestas + edición de plantillas. */
export function CoachCheckInsTab({ athleteId, coachId }: { athleteId: string; coachId: string }) {
    const [type, setType] = useState<FormType>('daily');
    const [responses, setResponses] = useState<FormResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [editorOpen, setEditorOpen] = useState(false);
    /** Respuesta que el coach está editando; `'new'` = crear una nueva. */
    const [editing, setEditing] = useState<FormResponse | 'new' | null>(null);
    const [deleting, setDeleting] = useState<FormResponse | null>(null);

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

    const handleDelete = async () => {
        if (!deleting) return;
        try {
            await formsService.deleteResponse(deleting.id);
            toast.success('Check-in eliminado');
            setDeleting(null);
            load();
        } catch (e) {
            console.error(e);
            toast.error('No se pudo eliminar el check-in');
        }
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
                        onClick={() => setEditing('new')}
                        className="flex items-center gap-2 px-3 py-2 bg-anvil-red/10 border border-anvil-red/30 rounded-lg text-xs font-black uppercase text-anvil-red hover:bg-anvil-red hover:text-white transition-all"
                    >
                        <Plus size={14} />
                        Nuevo check-in
                    </button>
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
                    <button
                        onClick={() => setEditing('new')}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-anvil-red/10 border border-anvil-red/30 rounded-lg text-xs font-black uppercase text-anvil-red hover:bg-anvil-red hover:text-white transition-all"
                    >
                        <Plus size={14} /> Rellenarlo por él
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {responses.map(r => (
                        <div key={r.id} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-5">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                                        {periodLabel(r.type, r.period_key)}
                                    </p>
                                    {r.updated_by === coachId && (
                                        <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-anvil-red">
                                            <UserCog size={10} /> Editado por ti
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => setEditing(r)}
                                        title="Editar respuestas"
                                        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(r)}
                                        title="Eliminar check-in"
                                        className="p-2 rounded-lg text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
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

            {editing && (
                <CoachResponseEditorModal
                    athleteId={athleteId}
                    coachId={coachId}
                    type={type}
                    response={editing === 'new' ? null : editing}
                    existingKeys={responses.map(r => r.period_key)}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}

            <ConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Eliminar check-in"
                description={
                    deleting
                        ? `Se borrará el check-in de ${periodLabel(deleting.type, deleting.period_key)}. El atleta podrá volver a rellenarlo.`
                        : ''
                }
                confirmText="Eliminar"
                variant="danger"
            />
        </div>
    );
}

// ============ Editor de respuestas del atleta (lo rellena el coach) ============

function CoachResponseEditorModal({
    athleteId,
    coachId,
    type,
    response,
    existingKeys,
    onClose,
    onSaved
}: {
    athleteId: string;
    coachId: string;
    type: FormType;
    /** `null` = crear un check-in nuevo. */
    response: FormResponse | null;
    existingKeys: string[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [questions, setQuestions] = useState<FormQuestion[]>([]);
    const [values, setValues] = useState<AnswerValues>({});
    const [periodKey, setPeriodKey] = useState(response?.period_key || getPeriodKey(type));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const template = await formsService.getTemplate(coachId, type);
                if (cancelled) return;
                setQuestions(mergeQuestions(template, response?.answers));
                if (response) {
                    const vals: AnswerValues = {};
                    response.answers.forEach(a => { vals[a.id] = a.value; });
                    setValues(vals);
                }
            } catch (e) {
                console.error(e);
                toast.error('No se pudo cargar el formulario');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [coachId, type, response]);

    /* Al crear uno nuevo avisamos si ese día/semana ya tiene respuesta: el
       upsert la sobreescribiría sin decir nada. */
    const overwrites = !response && existingKeys.includes(periodKey);

    const handleSave = async () => {
        if (!periodKey) {
            toast.error(type === 'daily' ? 'Elige una fecha' : 'Elige una semana');
            return;
        }
        setSaving(true);
        try {
            const answers: FormAnswer[] = questions.map(q => ({ ...q, value: values[q.id] ?? null }));
            await formsService.submitResponse(athleteId, type, periodKey, answers, coachId);
            toast.success('Check-in guardado. El atleta lo verá actualizado.');
            onSaved();
        } catch (e) {
            console.error(e);
            toast.error('Error al guardar (¿ejecutaste coach_edit_checkins.sql?)');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#1c1c1c] w-full md:max-w-lg rounded-t-3xl md:rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                            <UserCog className="text-anvil-red" size={18} />
                            {response ? 'Editar check-in' : 'Nuevo check-in'}
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">
                            {type === 'daily' ? 'Diario' : 'Semanal'} · en nombre del atleta
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-white mb-3">
                            {type === 'daily' ? 'Fecha' : 'Semana'}
                        </label>
                        {response ? (
                            <p className="text-sm text-gray-400 bg-black/30 border border-white/5 rounded-xl py-3 px-4">
                                {periodLabel(type, periodKey)}
                            </p>
                        ) : (
                            <>
                                <input
                                    type={type === 'daily' ? 'date' : 'week'}
                                    value={periodKey}
                                    onChange={(e) => setPeriodKey(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors"
                                />
                                {overwrites && (
                                    <p className="text-[11px] font-bold text-yellow-400 mt-2">
                                        Ya existe un check-in en ese periodo: al guardar lo reemplazarás.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10"><Loader className="animate-spin text-anvil-red" size={24} /></div>
                    ) : (
                        <CheckInAnswerFields
                            questions={questions}
                            values={values}
                            onChange={(id, value) => setValues(v => ({ ...v, [id]: value }))}
                        />
                    )}
                </div>

                <div className="p-5 border-t border-white/5 shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="w-full py-3.5 rounded-xl bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-wider text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader className="animate-spin" size={16} /> : <Save size={16} />}
                        Guardar check-in
                    </button>
                </div>
            </div>
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
