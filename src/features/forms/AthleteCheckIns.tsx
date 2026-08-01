import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, X, Check, Loader, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, getPeriodKey,
    FormType, FormQuestion, FormAnswer
} from '../../services/formsService';
import { chatService } from '../../services/chatService';

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
                            className={`relative p-4 rounded-2xl border text-left transition-all active:scale-[0.97] ${
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

function CheckInFormModal({
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
    const [values, setValues] = useState<Record<string, string | number | null>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                // Plantilla del coach del atleta (o predefinida)
                const coach = await chatService.getMyCoach(athleteId).catch(() => null);
                const qs = await formsService.getTemplate(coach?.id || null, type);
                setQuestions(qs);

                // Precargar respuesta existente del periodo (permite editar)
                const existing = await formsService.getResponse(athleteId, type, getPeriodKey(type));
                if (existing) {
                    const vals: Record<string, string | number | null> = {};
                    existing.answers.forEach(a => { vals[a.id] = a.value; });
                    setValues(vals);
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
        setSaving(true);
        try {
            const answers: FormAnswer[] = questions.map(q => ({
                ...q,
                value: values[q.id] ?? null
            }));
            await formsService.submitResponse(athleteId, type, getPeriodKey(type), answers);
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
                        {loading ? (
                            <div className="flex justify-center py-10"><Loader className="animate-spin text-anvil-red" size={24} /></div>
                        ) : (
                            questions.map(q => (
                                <div key={q.id}>
                                    <label className="block text-sm font-bold text-white mb-3">{q.label}</label>

                                    {q.qtype === 'scale' && (
                                        <div className="grid grid-cols-11 gap-1">
                                            {Array.from({ length: 11 }, (_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setValues(v => ({ ...v, [q.id]: i }))}
                                                    className={`aspect-square rounded-lg text-xs font-black transition-all ${
                                                        values[q.id] === i
                                                            ? 'bg-anvil-red text-white scale-110 shadow-lg shadow-anvil-red/30'
                                                            : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'
                                                    }`}
                                                >
                                                    {i}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {q.qtype === 'number' && (
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={values[q.id] ?? ''}
                                            onChange={(e) => setValues(v => ({ ...v, [q.id]: e.target.value === '' ? null : Number(e.target.value) }))}
                                            placeholder="0"
                                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors"
                                        />
                                    )}

                                    {q.qtype === 'text' && (
                                        <textarea
                                            value={(values[q.id] as string) ?? ''}
                                            onChange={(e) => setValues(v => ({ ...v, [q.id]: e.target.value }))}
                                            rows={3}
                                            maxLength={1000}
                                            placeholder="Escribe aquí..."
                                            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-anvil-red/50 transition-colors resize-none"
                                        />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-5 border-t border-white/5 shrink-0">
                        <button
                            onClick={handleSubmit}
                            disabled={saving || loading}
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
