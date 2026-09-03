import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Check, Loader, CalendarCheck, UserCog, Calendar, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
    formsService, getPeriodKey, periodLabel, mergeQuestions,
    FormType, FormQuestion, FormAnswer
} from '../../services/formsService';
import { fetchActiveCoach } from '../coach/hooks/useCoachRoster';
import { CheckInAnswerFields, AnswerValues } from './CheckInAnswerFields';
import { CLAVES } from '../../lib/queryKeys';
import { Modal } from '../../components/ui/Modal';

// ============ Tarjeta de acceso (para el home del atleta) ============

export function CheckInCard({ athleteId }: { athleteId: string }) {
    const [openForm, setOpenForm] = useState<FormType | null>(null);
    const queryClient = useQueryClient();

    // Si el atleta ya ha rellenado hoy el diario y esta semana el semanal.
    // Por consulta: esta tarjeta vive en el inicio del atleta, que es la
    // pantalla más visitada de la aplicación, y volver a ella no debería
    // costar dos peticiones.
    const { data: status = { daily: false, weekly: false } } = useQuery({
        queryKey: CLAVES.cuestionarios.estadoDeAtleta(athleteId),
        queryFn: async () => {
            try {
                const [daily, weekly] = await Promise.all([
                    formsService.getResponse(athleteId, 'daily', getPeriodKey('daily')),
                    formsService.getResponse(athleteId, 'weekly', getPeriodKey('weekly')),
                ]);
                return { daily: !!daily, weekly: !!weekly };
            } catch {
                // Tabla aún no migrada: la tarjeta sigue funcionando y solo
                // deja de saber si ya se rellenó.
                return { daily: false, weekly: false };
            }
        },
    });

    const refreshStatus = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CLAVES.cuestionarios.estadoDeAtleta(athleteId) });
    }, [queryClient, athleteId]);

    return (
        <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-ink-subtle flex items-center gap-2">
                <ClipboardCheck size={16} className="text-brand-text" /> Check-in
            </h2>
            <div className="grid grid-cols-2 gap-2 xl:h-52 2xl:h-60">
                {(['daily', 'weekly'] as FormType[]).map(type => {
                    const done = status[type];
                    return (
                        <button
                            key={type}
                            onClick={() => setOpenForm(type)}
                            className={`group relative flex h-full min-h-[96px] xl:min-h-0 w-full flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-3 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised ${
                                done ? 'group-hover:border-success/50' : 'group-hover:border-brand/50'
                            }`}
                        >
                            <CalendarCheck
                                size={72}
                                aria-hidden="true"
                                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
                            />
                            <span className={`flex h-8 w-8 xl:h-7 xl:w-7 shrink-0 items-center justify-center rounded-field ${done ? 'bg-success/10' : 'bg-brand/10'}`}>
                                <CalendarCheck size={16} className={done ? 'text-success' : 'text-brand'} aria-hidden="true" />
                            </span>
                            <span className="relative mt-1.5 xl:mt-1 flex flex-col min-h-0 overflow-hidden">
                                <span className="block text-t-sm xl:text-t-base font-bold leading-tight text-ink truncate">
                                    {type === 'daily' ? 'Diario' : 'Semanal'}
                                </span>
                                <span className="mt-0.5 flex items-center gap-1 text-[10px] xl:text-t-xs text-ink-subtle truncate">
                                    <span className="truncate">
                                        {done ? 'Hecho (Editar respuesta)' : type === 'daily' ? '¿Cómo fue la sesión?' : 'Resumen de la semana'}
                                    </span>
                                </span>
                            </span>
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
 * Cuántos días atrás se puede rellenar un check-in olvidado.
 *
 * No es "sin límite": eso convertiría el check-in diario en un historial
 * reescribible a voluntad. Dos semanas cubre "se me olvidó ayer" o "llevo
 * unos días sin entrar" sin abrir la puerta a rehacer meses hacia atrás.
 */
const DIAS_ATRAS_PERMITIDOS = 14;

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
    // Solo el diario admite fecha atrás: "se me olvidó UN DÍA" no tiene
    // equivalente sensato en el semanal, que resume una semana entera.
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const periodKey = getPeriodKey(type, selectedDate);

    // La plantilla del coach, SIN mezclar con ninguna respuesta: es la base
    // fija a partir de la cual se recalculan las preguntas cada vez que
    // cambia la fecha. Si `questions` se mutara directamente con
    // `mergeQuestions`, una pregunta antigua que solo existiera en el
    // check-in de un día se quedaría pegada al cambiar a otro día que nunca
    // la tuvo.
    const [template, setTemplate] = useState<FormQuestion[]>([]);
    const [questions, setQuestions] = useState<FormQuestion[]>([]);
    const [intro, setIntro] = useState<string | null>(null);
    const [values, setValues] = useState<AnswerValues>({});
    const [saving, setSaving] = useState(false);
    const [editedByCoach, setEditedByCoach] = useState(false);
    /**
     * Qué periodo hay cargado AHORA MISMO en `values`/`questions`.
     *
     * `loading` se DERIVA de comparar esto con `periodKey` en vez de
     * escribirse con un `setLoading(true)` al principio del efecto: un
     * efecto que escribe estado de forma síncrona en su cuerpo dispara un
     * render en cascada y el compilador de React lo rechaza. En cuanto
     * cambia la fecha, `loadedKey` deja de coincidir con `periodKey` —y
     * `loading` pasa a `true` solo, sin que nadie tenga que ordenarlo.
     */
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    // Plantilla y su indicación: una vez por atleta/tipo. Cambiar de fecha NO
    // las recarga — son las mismas preguntas para cualquier día.
    useEffect(() => {
        let alive = true;
        (async () => {
            const coach = await fetchActiveCoach(athleteId).catch(() => null);
            const qs = await formsService.getTemplate(coach?.id || null, type);
            if (!alive) return;
            setTemplate(qs);
            formsService.getIntro(coach?.id || null, type).then(i => { if (alive) setIntro(i); }).catch(() => {});
        })();
        return () => { alive = false; };
    }, [athleteId, type]);

    const loading = loadedKey !== periodKey;

    // Lo ya contestado en ESTE periodo: se recarga al cambiar de fecha.
    useEffect(() => {
        if (template.length === 0) return;
        let alive = true;
        (async () => {
            /**
             * Si esto falla, las preguntas se quedan siendo las de la
             * plantilla y solo se pierde saber si ya había una respuesta ese
             * día. Antes un fallo aquí podía dejar `questions` vacío con el
             * botón de enviar activo, y enviar guardaba una lista de
             * respuestas vacía ENCIMA de la que hubiera. Separarlo de la
             * carga de la plantilla es lo que evita que un error de red
             * borre lo que el atleta ya tenía.
             */
            let existing = null;
            try {
                existing = await formsService.getResponse(athleteId, type, periodKey);
            } catch (e) {
                console.error('No se pudo leer el check-in de este periodo:', e);
            }
            if (!alive) return;

            // El coach puede haber añadido preguntas que ya no están en la
            // plantilla; se conservan para no perder lo respondido de ESTE
            // día en concreto — nunca las de otro día que se haya mirado antes.
            setQuestions(mergeQuestions(template, existing?.answers));
            if (existing) {
                const vals: AnswerValues = {};
                existing.answers.forEach(a => { vals[a.id] = a.value; });
                setValues(vals);
                setEditedByCoach(!!existing.updated_by && existing.updated_by !== athleteId);
            } else {
                setValues({});
                setEditedByCoach(false);
            }
            setLoadedKey(periodKey);
        })();
        return () => { alive = false; };
    }, [athleteId, type, periodKey, template]);

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
            await formsService.submitResponse(athleteId, type, periodKey, answers, athleteId);
            toast.success(
                periodKey === getPeriodKey(type)
                    ? 'Check-in enviado. ¡Tu coach lo verá!'
                    : `Check-in del ${periodLabel(type, periodKey)} guardado.`
            );
            onSubmitted();
        } catch (e) {
            console.error(e);
            toast.error('Error al enviar el check-in');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            size="md"
            footer={
                <button
                    onClick={handleSubmit}
                    disabled={saving || loading || questions.length === 0}
                    className="w-full py-3.5 rounded-xl bg-brand hover:bg-red-700 text-ink font-black uppercase tracking-wider text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                    {saving ? <Loader className="animate-spin" size={16} /> : <Check size={16} />}
                    Enviar check-in
                </button>
            }
        >
            <div className="space-y-6">
                <div className="flex items-center gap-2 -mt-1">
                    <ClipboardCheck className="text-brand-text shrink-0" size={18} />
                    <h2 className="text-lg font-black uppercase text-ink">
                        Check-in {type === 'daily' ? 'diario' : 'semanal'}
                    </h2>
                </div>

                {type === 'daily' && (
                    <FechaDelCheckIn value={selectedDate} onChange={setSelectedDate} />
                )}

                {editedByCoach && (
                    <p className="flex items-center gap-2 text-t-2xs font-bold uppercase tracking-wide text-brand-text bg-brand/10 border border-brand/20 rounded-xl px-3 py-2">
                        <UserCog size={13} /> Tu coach ha modificado este check-in
                    </p>
                )}
                {loading ? (
                    <div className="flex justify-center py-10"><Loader className="animate-spin text-brand-text" size={24} /></div>
                ) : (
                    <>
                        {intro && (
                            <p className="rounded-xl border border-line bg-white/5 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
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
        </Modal>
    );
}

/**
 * Fecha del check-in, arriba a la izquierda: hoy por defecto, y un `<input
 * type="date">` nativo debajo para corregir un día olvidado.
 *
 * Es un `<input>` nativo y no un calendario propio a propósito: en el
 * teléfono abre el selector del sistema, que el usuario ya conoce, y no hay
 * que mantener ni una librería de calendario ni su compatibilidad con
 * lectores de pantalla.
 */
function FechaDelCheckIn({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
    const hoy = new Date();
    const minDate = new Date(hoy);
    minDate.setDate(minDate.getDate() - DIAS_ATRAS_PERMITIDOS);

    const toInputValue = (d: Date) => getPeriodKey('daily', d);

    return (
        <div className="relative inline-flex">
            <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2 text-left cursor-pointer hover:border-brand/40 transition-colors">
                <Calendar size={15} className="text-brand-text shrink-0" />
                <span className="text-t-xs font-bold capitalize text-ink">
                    {periodLabel('daily', toInputValue(value))}
                </span>
                <ChevronDown size={13} className="text-ink-faint shrink-0" />
                <input
                    type="date"
                    // El teclado táctil ocupa toda la pantalla en móvil: el
                    // input real está encima del texto, invisible, y es lo
                    // que de verdad recibe el toque.
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    value={toInputValue(value)}
                    min={toInputValue(minDate)}
                    max={toInputValue(hoy)}
                    onChange={(e) => {
                        if (!e.target.value) return;
                        onChange(new Date(`${e.target.value}T12:00:00`));
                    }}
                    aria-label="Elegir fecha del check-in"
                />
            </label>
        </div>
    );
}


