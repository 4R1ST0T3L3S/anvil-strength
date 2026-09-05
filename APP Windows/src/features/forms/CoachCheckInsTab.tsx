import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Loader, Settings2, Plus, Trash2, X, Save, RotateCcw, Pencil, UserCog, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, FormType, FormQuestion, FormResponse, QuestionType, FormAnswer,
    DEFAULT_DAILY_QUESTIONS, DEFAULT_WEEKLY_QUESTIONS,
    getPeriodKey, periodLabel, mergeQuestions
} from '../../services/formsService';
import {
    withResolvedAxes, resolveAxis, SELECTABLE_AXES, AXIS_DEFINITIONS, type FormAxis,
} from '../../lib/forms/axes';
import { CheckInAnswerFields, AnswerValues } from './CheckInAnswerFields';
import { ConfirmationModal } from '../../components/modals/ConfirmationModal';
import { CLAVES } from '../../lib/queryKeys';

/** Pestaña de check-ins del atleta para el coach: respuestas + edición de plantillas. */
export function CoachCheckInsTab({ athleteId, coachId }: { athleteId: string; coachId: string }) {
    const [type, setType] = useState<FormType>('daily');
    const queryClient = useQueryClient();
    const [editorOpen, setEditorOpen] = useState(false);
    /** Respuesta que el coach está editando; `'new'` = crear una nueva. */
    const [editing, setEditing] = useState<FormResponse | 'new' | null>(null);
    const [deleting, setDeleting] = useState<FormResponse | null>(null);

    const { data: responses = [], isPending: loading } = useQuery({
        queryKey: CLAVES.cuestionarios.respuestasDeAtleta(athleteId, type),
        queryFn: () => formsService.getResponsesByAthlete(athleteId, type),
    });

    const load = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CLAVES.cuestionarios.respuestasDeAtleta(athleteId, type) });
    }, [queryClient, athleteId, type]);

    const scaleColor = (v: number) => {
        if (v <= 3) return 'text-danger-text bg-danger-quiet border-danger/20';
        if (v <= 6) return 'text-warning bg-warning-quiet border-warning/20';
        return 'text-success bg-success-quiet border-success/20';
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
        <div className="w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-black uppercase tracking-tight text-ink flex items-center gap-2">
                    <ClipboardCheck className="text-brand-text" />
                    Check-ins
                </h3>
                <div className="flex items-center gap-2">
                    <div className="flex bg-black/20 p-1 rounded-lg">
                        {(['daily', 'weekly'] as FormType[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`px-4 py-1.5 rounded-md text-xs font-black uppercase transition-colors ${
 type === t ? 'bg-brand text-ink' : 'text-ink-muted hover:text-ink'
 }`}
                            >
                                {t === 'daily' ? 'Diario' : 'Semanal'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setEditing('new')}
                        className="flex items-center gap-2 px-3 py-2 bg-brand/10 border border-brand/30 rounded-lg text-xs font-black uppercase text-brand-text hover:bg-brand hover:text-ink transition-colors"
                    >
                        <Plus size={14} />
                        Nuevo check-in
                    </button>
                    <button
                        onClick={() => setEditorOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-line rounded-lg text-xs font-black uppercase text-ink hover:text-ink hover:border-brand/40 transition-colors"
                    >
                        <Settings2 size={14} className="text-brand-text" />
                        Editar formulario
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader className="animate-spin text-brand-text" size={26} /></div>
            ) : responses.length === 0 ? (
                <div className="text-center py-16 bg-surface-raised border border-subtle rounded-xl">
                    <ClipboardCheck size={40} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-ink-muted font-medium">
                        El atleta aún no ha respondido ningún check-in {type === 'daily' ? 'diario' : 'semanal'}.
                    </p>
                    <button
                        onClick={() => setEditing('new')}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand/10 border border-brand/30 rounded-lg text-xs font-black uppercase text-brand-text hover:bg-brand hover:text-ink transition-colors"
                    >
                        <Plus size={14} /> Rellenarlo por él
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {responses.map(r => (
                        <div key={r.id} className="bg-surface-raised border border-subtle rounded-2xl p-5">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                    <p className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle">
                                        {periodLabel(r.type, r.period_key)}
                                    </p>
                                    {r.updated_by === coachId && (
                                        <span className="mt-1 inline-flex items-center gap-1 text-t-2xs font-black uppercase tracking-wider text-brand-text">
                                            <UserCog size={10} /> Editado por ti
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => setEditing(r)}
                                        title="Editar respuestas"
                                        className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/10 transition-colors"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        onClick={() => setDeleting(r)}
                                        title="Eliminar check-in"
                                        className="p-2 rounded-lg text-gray-600 hover:text-danger-text hover:bg-danger-quiet transition-colors"
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
 a.qtype === 'scale' ? scaleColor(Number(a.value)) : 'text-ink bg-white/5 border-line'
 }`}
                                    >
                                        <span className="text-ink-muted font-medium">{a.label}:</span>
                                        <span className="font-black">
                                            {a.qtype === 'number' ? Number(a.value).toLocaleString('es-ES') : `${a.value}/10`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {r.answers.filter(a => a.qtype === 'text' && a.value).map(a => (
                                <p key={a.id} className="text-sm text-ink mt-3 bg-black/20 border border-subtle rounded-xl p-3 leading-relaxed">
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
        <div className="fixed inset-0 z-[200] flex justify-center items-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-canvas w-full border border-line shadow-2xl flex flex-col max-h-[90vh] max-w-lg rounded-2xl">
                <div className="flex items-center justify-between p-5 border-b border-subtle shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-black uppercase text-ink flex items-center gap-2">
                            <UserCog className="text-brand-text" size={18} />
                            {response ? 'Editar check-in' : 'Nuevo check-in'}
                        </h2>
                        <p className="text-t-2xs font-bold uppercase tracking-wider text-ink-subtle mt-1">
                            {type === 'daily' ? 'Diario' : 'Semanal'} · en nombre del atleta
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-ink-muted hover:text-ink transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-ink mb-3">
                            {type === 'daily' ? 'Fecha' : 'Semana'}
                        </label>
                        {response ? (
                            <p className="text-sm text-ink-muted bg-black/30 border border-subtle rounded-xl py-3 px-4">
                                {periodLabel(type, periodKey)}
                            </p>
                        ) : (
                            <>
                                <input
                                    type={type === 'daily' ? 'date' : 'week'}
                                    value={periodKey}
                                    onChange={(e) => setPeriodKey(e.target.value)}
                                    className="w-full bg-surface-sunken border border-line rounded-xl py-3 px-4 text-ink text-sm focus:border-brand/50 transition-colors"
                                />
                                {overwrites && (
                                    <p className="text-t-2xs font-bold text-warning mt-2">
                                        Ya existe un check-in en ese periodo: al guardar lo reemplazarás.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10"><Loader className="animate-spin text-brand-text" size={24} /></div>
                    ) : (
                        <CheckInAnswerFields
                            questions={questions}
                            values={values}
                            onChange={(id, value) => setValues(v => ({ ...v, [id]: value }))}
                        />
                    )}
                </div>

                <div className="p-5 border-t border-subtle shrink-0">
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="w-full py-3.5 rounded-xl bg-brand hover:bg-red-700 text-ink font-black uppercase tracking-wider text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
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
    const [intro, setIntro] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    /**
     * Si la carga falla, NO se rellena con la plantilla predefinida.
     *
     * `getTemplate` sí lo hace —correcto para el atleta, que necesita un
     * cuestionario aunque sea genérico—, pero aquí sería la plantilla real
     * quedando invisible: el coach vería la predefinida sin saber que es un
     * error de carga, y "Guardar" la escribiría encima de la suya. Con
     * `loadError` el editor se queda vacío y avisa, y `handleSave` se niega
     * a guardar hasta que una recarga funcione.
     */
    const [loadError, setLoadError] = useState(false);

    /**
     * `setLoading(true)` solo lo dispara este manejador, nunca el efecto de
     * carga: un efecto que escribe estado de forma síncrona en su cuerpo
     * dispara un render en cascada y el compilador de React lo rechaza. La
     * carga inicial se apoya en que `loading` YA empieza en `true`; volver a
     * cargar (el botón "Reintentar") pasa por aquí, que sube `reloadKey` y
     * dispara el efecto de abajo.
     */
    const [reloadKey, setReloadKey] = useState(0);
    const retry = useCallback(() => {
        setLoading(true);
        setLoadError(false);
        setReloadKey(k => k + 1);
    }, []);

    useEffect(() => {
        let alive = true;
        Promise.all([
            formsService.getTemplateOrThrow(coachId, type),
            formsService.getIntro(coachId, type),
        ])
            // `withResolvedAxes` escribe el eje que la heurística deduce en las
            // preguntas que todavía no lo llevan (decisión K9). A partir de
            // aquí es un dato editable y no una adivinanza que se rehace en
            // cada pintado: el coach lo ve, lo puede corregir, y su
            // corrección no se la pisa nadie.
            .then(([qs, i]) => { if (alive) { setQuestions(withResolvedAxes(qs)); setIntro(i ?? ''); } })
            .catch((e) => { if (alive) { console.error(e); setLoadError(true); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [coachId, type, reloadKey]);

    const updateQuestion = (i: number, updates: Partial<FormQuestion>) => {
        setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, ...updates } : q));
    };

    const addQuestion = () => {
        setQuestions(prev => [...prev, { id: `custom_${prev.length}_${prev.map(q => q.id).join('').length}`, label: '', qtype: 'scale', axis: 'scale10' }]);
    };

    const removeQuestion = (i: number) => {
        setQuestions(prev => prev.filter((_, idx) => idx !== i));
    };

    const handleSave = async () => {
        if (loadError) {
            toast.error('No se pudo cargar el formulario actual. Reintenta antes de guardar: guardar ahora lo sustituiría por lo que ves aquí, que puede no ser lo que tienen tus atletas.');
            return;
        }
        const valid = questions.filter(q => q.label.trim());
        if (valid.length === 0) {
            toast.error('Añade al menos una pregunta');
            return;
        }
        setSaving(true);
        try {
            await formsService.saveTemplate(coachId, type, valid, intro);
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
            <div className="relative bg-surface-canvas w-full max-w-xl rounded-2xl border border-line shadow-2xl flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between p-5 border-b border-subtle shrink-0">
                    <h2 className="text-lg font-black uppercase text-ink flex items-center gap-2">
                        <Settings2 className="text-brand-text" size={18} />
                        Formulario {type === 'daily' ? 'diario' : 'semanal'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-ink-muted hover:text-ink transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader className="animate-spin text-brand-text" size={24} /></div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <AlertTriangle size={28} className="text-danger-text" />
                            <p className="text-sm font-bold text-ink">No se pudo cargar el formulario actual</p>
                            <p className="max-w-xs text-t-2xs text-ink-subtle">
                                Guardar ahora lo sustituiría a ciegas. Reintenta antes de tocar nada.
                            </p>
                            <button
                                onClick={retry}
                                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-2 text-t-2xs font-black uppercase tracking-wide text-ink hover:border-brand/40 transition-colors"
                            >
                                <RefreshCw size={13} /> Reintentar
                            </button>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="mb-1.5 block text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                                    Indicación general (opcional)
                                </label>
                                <textarea
                                    value={intro}
                                    onChange={(e) => setIntro(e.target.value)}
                                    placeholder='Ej: "Rellénalo la noche anterior. La escala es de 1 a 10."'
                                    rows={2}
                                    maxLength={500}
                                    className="w-full resize-y bg-black/30 border border-subtle rounded-lg py-2 px-3 text-ink text-sm focus:border-brand/50 transition-colors"
                                />
                                <p className="mt-1 text-t-2xs text-gray-600">Aparece arriba del todo, antes de la primera pregunta.</p>
                            </div>

                            {questions.map((q, i) => (
                                <div key={i} className="space-y-2 bg-surface-raised border border-subtle rounded-xl p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={q.label}
                                            onChange={(e) => updateQuestion(i, { label: e.target.value })}
                                            placeholder="Texto de la pregunta..."
                                            maxLength={120}
                                            className="flex-1 bg-black/30 border border-subtle rounded-lg py-2 px-3 text-ink text-sm focus:border-brand/50 transition-colors min-w-0"
                                        />
                                        <select
                                            value={q.qtype}
                                            onChange={(e) => updateQuestion(i, { qtype: e.target.value as QuestionType })}
                                            className="bg-black/30 border border-subtle rounded-lg py-2 px-2 text-ink text-xs focus:border-brand/50 shrink-0"
                                        >
                                            {(Object.keys(QTYPE_LABELS) as QuestionType[]).map(t => (
                                                <option key={t} value={t}>{QTYPE_LABELS[t]}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => removeQuestion(i)}
                                            className="p-2 text-gray-600 hover:text-danger-text transition-colors shrink-0"
                                            title="Eliminar pregunta"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={q.help ?? ''}
                                        onChange={(e) => updateQuestion(i, { help: e.target.value || undefined })}
                                        placeholder="Ayuda bajo la pregunta (opcional): cómo se responde, qué escala usar..."
                                        maxLength={160}
                                        className="w-full bg-black/20 border border-subtle rounded-lg py-1.5 px-3 text-ink-muted text-xs focus:border-brand/50 transition-colors"
                                    />
                                    {/* EN QUÉ GRÁFICA SE PINTA (K9).
                                        Dos preguntas solo comparten eje Y si
                                        comparten familia de escala: sin esto,
                                        "pasos" (~9.000) aplastaba a "sueño"
                                        (0-10) contra el suelo. */}
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-t-2xs font-black uppercase tracking-widest text-ink-subtle">
                                            Gráfica
                                        </span>
                                        <select
                                            value={q.axis ?? resolveAxis(q)}
                                            onChange={(e) => updateQuestion(i, { axis: e.target.value as FormAxis })}
                                            className="flex-1 bg-black/20 border border-subtle rounded-lg py-1.5 px-2 text-ink-muted text-xs focus:border-brand/50"
                                        >
                                            {SELECTABLE_AXES.map(a => (
                                                <option key={a} value={a}>{AXIS_DEFINITIONS[a].label}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            value={q.unit ?? ''}
                                            onChange={(e) => updateQuestion(i, { unit: e.target.value || undefined })}
                                            placeholder="Unidad"
                                            maxLength={12}
                                            className="w-24 shrink-0 bg-black/20 border border-subtle rounded-lg py-1.5 px-2 text-ink-muted text-xs focus:border-brand/50"
                                        />
                                    </div>
                                    {q.qtype === 'scale' && (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={q.scale?.minLabel ?? ''}
                                                onChange={(e) => updateQuestion(i, { scale: { min: 1, max: 10, ...q.scale, minLabel: e.target.value || undefined } })}
                                                placeholder="Extremo bajo (1)"
                                                maxLength={40}
                                                className="flex-1 bg-black/20 border border-subtle rounded-lg py-1.5 px-3 text-ink-muted text-xs focus:border-brand/50"
                                            />
                                            <input
                                                type="text"
                                                value={q.scale?.maxLabel ?? ''}
                                                onChange={(e) => updateQuestion(i, { scale: { min: 1, max: 10, ...q.scale, maxLabel: e.target.value || undefined } })}
                                                placeholder="Extremo alto (10)"
                                                maxLength={40}
                                                className="flex-1 bg-black/20 border border-subtle rounded-lg py-1.5 px-3 text-ink-muted text-xs focus:border-brand/50"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={addQuestion}
                                className="w-full py-3 border-2 border-dashed border-line hover:border-brand/50 rounded-xl text-ink-subtle hover:text-brand-text text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> Añadir pregunta
                            </button>
                        </>
                    )}
                </div>

                <div className="p-5 border-t border-subtle shrink-0 flex items-center justify-between gap-3">
                    <button
                        onClick={handleReset}
                        disabled={loadError}
                        className="flex items-center gap-2 text-xs font-bold text-ink-subtle hover:text-ink uppercase tracking-wide transition-colors disabled:opacity-40"
                    >
                        <RotateCcw size={13} /> Restablecer predefinido
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading || loadError}
                        className="px-6 py-2.5 rounded-lg bg-brand hover:bg-red-700 text-ink font-black uppercase tracking-wider text-xs transition-colors disabled:opacity-40 flex items-center gap-2"
                    >
                        {saving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
