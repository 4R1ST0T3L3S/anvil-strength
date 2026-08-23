import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, X, Check, Loader, CalendarCheck, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, getPeriodKey, mergeQuestions,
    FormType, FormQuestion, FormAnswer
} from '../../services/formsService';
import { fetchActiveCoach } from '../coach/hooks/useCoachRoster';
import { CheckInAnswerFields, AnswerValues } from './CheckInAnswerFields';

// ============ Tarjeta de acceso (para el home del atleta) ============

export function CheckInCard({ athleteId }: { athleteId: string }) {
    const [openForm, setOpenForm] = useState<FormType | null>(null);
    const [status, setStatus] = useState<{ daily: boolean; weekly: boolean }>({ daily: false, weekly: false });

    const refreshStatus = useCallback(async () => {
        try {
            const [daily, weekly] = await Promise.all([
                formsService.getResponse(athleteId, 'daily', getPeriodKey('daily')),
                formsService.getResponse(athleteId, 'weekly', getPeriodKey('weekly'))
            ]);
            setStatus({ daily: !!daily, weekly: !!weekly });
        } catch { /* tabla aún no migrada: la tarjeta sigue funcionando */ }
    }, [athleteId]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    return (
        <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                <ClipboardCheck size={16} className="text-anvil-red" /> Check-in
            </h2>
            <div className="grid grid-cols-2 gap-3">
                {(['daily', 'weekly'] as FormType[]).map(type => {
                    const done = status[type];
                    return (
                        <button
                            key={type}
                            onClick={() => setOpenForm(type)}
                            className={`relative p-4 rounded-2xl border text-left transition-[background-color,border-color,color,transform] active:scale-[0.97] ${
 done
 ? 'bg-green-500/5 border-green-500/20'
 : 'bg-[#1c1c1c] border-white/10 hover:border-anvil-red/40'
 }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <CalendarCheck size={18} className={done ? 'text-green-400' : 'text-anvil-red'} />
                                {done && (
                                    <span className="flex items-center gap-1 text-[9px] font-black uppercase text-green-400">
                                        <Check size={10} /> Hecho
                                    </span>
                                )}
                            </div>
                            <p className="font-black uppercase text-sm text-white leading-none">
                                {type === 'daily' ? 'Diario' : 'Semanal'}
                            </p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">
                                {done ? 'Editar respuesta' : type === 'daily' ? '¿Cómo fue la sesión?' : 'Resumen de la semana'}
                            </p>
                        </button>
                    );
                })}
            </div>

            {openForm && (
                <CheckInFormModal
                    athleteId={athleteId}
                    type={openForm}
                    onClose={() => setOpenForm(null)}
                    onSubmitted={() => { setOpenForm(null); refreshStatus(); }}
                />
            )}
        </div>
    );
}

// ============ Modal de formulario ============

/**
 * Se exporta para que el cierre del entrenamiento pueda abrir EL MISMO
 * formulario (ver `SessionFinish`). Duplicarlo allí habría significado dos
 * sitios donde se resuelve la plantilla del coach y se fusionan las preguntas
 * antiguas, y basta con que uno se quede atrás para que el atleta conteste un
 * cuestionario distinto según por dónde entre.
 */
export function CheckInFormModal({
    athleteId,
    type,
    onClose,
    onSubmitted
}: {
    athleteId: string;
    type: FormType;
    onClose: () => void;
    onSubmitted: () => void;
}) {
    const [questions, setQuestions] = useState<FormQuestion[]>([]);
    const [intro, setIntro] = useState<string | null>(null);
    const [values, setValues] = useState<AnswerValues>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editedByCoach, setEditedByCoach] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                // Plantilla del coach del atleta (o predefinida)
                const coach = await fetchActiveCoach(athleteId).catch(() => null);
                const qs = await formsService.getTemplate(coach?.id || null, type);
                formsService.getIntro(coach?.id || null, type).then(setIntro).catch(() => { });

                /**
                 * Las preguntas se fijan ANTES de intentar leer lo ya
                 * contestado, y la lectura va en su propio `catch`.
                 *
                 * Antes las dos cosas estaban en el mismo `try`: si
                 * `getResponse` fallaba —sin red, con la tabla sin migrar, o
                 * con la RLS diciendo que no— se saltaba a `catch` y
                 * `setQuestions` no llegaba a ejecutarse. El atleta veía el
                 * formulario VACÍO con el botón de enviar activo, y enviarlo
                 * guardaba una lista de respuestas vacía ENCIMA de la que ya
                 * hubiera de ese día.
                 */
                let existing = null;
                try {
                    existing = await formsService.getResponse(athleteId, type, getPeriodKey(type));
                } catch (e) {
                    console.error('No se pudo leer el check-in de este periodo:', e);
                }

                // El coach puede haber añadido preguntas que ya no están en la
                // plantilla; se conservan para no perder lo respondido.
                setQuestions(mergeQuestions(qs, existing?.answers));
                if (existing) {
                    const vals: AnswerValues = {};
                    existing.answers.forEach(a => { vals[a.id] = a.value; });
                    setValues(vals);
                    setEditedByCoach(!!existing.updated_by && existing.updated_by !== athleteId);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [athleteId, type]);

    const handleSubmit = async () => {
        // Sin preguntas no hay nada que enviar, y enviarlo BORRARÍA lo
        // contestado antes: `submitResponse` hace un upsert de la fila entera.
        if (questions.length === 0) {
            toast.error('No se pudo cargar el cuestionario. Vuelve a intentarlo.');
            return;
        }
        setSaving(true);
        try {
            const answers: FormAnswer[] = questions.map(q => ({
                ...q,
                value: values[q.id] ?? null
            }));
            await formsService.submitResponse(athleteId, type, getPeriodKey(type), answers, athleteId);
            toast.success('Check-in enviado. ¡Tu coach lo verá!');
            onSubmitted();
        } catch (e) {
            console.error(e);
            toast.error('Error al enviar el check-in');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ opacity: 0, y: 60 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 60 }}
                    className="relative bg-[#1c1c1c] w-full md:max-w-lg rounded-t-3xl md:rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                        <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                            <ClipboardCheck className="text-anvil-red" size={18} />
                            Check-in {type === 'daily' ? 'diario' : 'semanal'}
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {editedByCoach && (
                            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-anvil-red bg-anvil-red/10 border border-anvil-red/20 rounded-xl px-3 py-2">
                                <UserCog size={13} /> Tu coach ha modificado este check-in
                            </p>
                        )}
                        {loading ? (
                            <div className="flex justify-center py-10"><Loader className="animate-spin text-anvil-red" size={24} /></div>
                        ) : (
                            <>
                                {intro && (
                                    <p className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs leading-relaxed text-gray-400">
                                        {intro}
                                    </p>
                                )}
                                <CheckInAnswerFields
                                    questions={questions}
                                    values={values}
                                    onChange={(id, value) => setValues(v => ({ ...v, [id]: value }))}
                                />
                            </>
                        )}
                    </div>

                    <div className="p-5 border-t border-white/5 shrink-0">
                        <button
                            onClick={handleSubmit}
                            disabled={saving || loading || questions.length === 0}
                            className="w-full py-3.5 rounded-xl bg-anvil-red hover:bg-red-700 text-white font-black uppercase tracking-wider text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader className="animate-spin" size={16} /> : <Check size={16} />}
                            Enviar check-in
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
