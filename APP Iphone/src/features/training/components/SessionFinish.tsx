import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, Loader, PenLine, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { trainingService } from '../../../services/trainingService';
import { formsService, getPeriodKey } from '../../../services/formsService';
import { summarizeSessionLive, type SummarizableExercise } from '../../../lib/stats/sessionSummary';
import { CheckInFormModal } from '../../forms/AthleteCheckIns';

/**
 * CIERRE DEL ENTRENAMIENTO
 * =====================================================================
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * `training_sessions.completed_at` existe desde
 * database/admin_role_and_session_completion.sql, pero desde que se retiró el
 * pie flotante con el botón "Terminar el día" NADIE lo escribía. El
 * razonamiento de aquel cambio era correcto —el pie se posicionaba contra el
 * alto del contenedor y en el móvil acababa flotando en mitad de la pantalla—
 * pero se llevó por delante el dato, y con él tres cosas:
 *
 *   · la tarjeta de inicio no podía decir "Hecho" nunca;
 *   · `athlete_notes` —cómo fue el día, en palabras del atleta— se quedó sin
 *     ningún sitio donde escribirse;
 *   · la ADHERENCIA que ve el entrenador cuenta días cerrados, así que salía
 *     a cero para todo el mundo.
 *
 * Aquí vuelve el cierre, pero como CONTENIDO NORMAL al final del scroll y no
 * como barra flotante. Así desaparece el motivo por el que se quitó: no se
 * posiciona contra nada, va detrás del último ejercicio, que es exactamente
 * donde está el atleta cuando termina.
 *
 * Y ES EL MOMENTO DEL CHECK-IN
 *
 * El check-in diario se pedía desde la pantalla de inicio, o sea, antes de
 * entrenar — cuando la mitad de las preguntas ("sensación de la sesión") aún
 * no tienen respuesta. Al terminar sí la tienen. La recomendación NO bloquea
 * nada: es una tarjeta con dos botones, y si ya está contestado hoy no
 * aparece.
 */

interface SessionFinishProps {
    sessionId: string;
    athleteId: string;
    /** Los ejercicios del día tal y como los tiene la pantalla. */
    exercises: SummarizableExercise[];
    /** ISO de cierre, o null si el día sigue abierto. */
    completedAt: string | null;
    /** Notas del atleta ya guardadas. */
    athleteNotes: string | null;
    /** Sube el estado a la pantalla para que la ficha del día se entere. */
    onChange: (patch: { completed_at?: string | null; athlete_notes?: string | null }) => void;
}

export function SessionFinish({
    sessionId,
    athleteId,
    exercises,
    completedAt,
    athleteNotes,
    onChange,
}: SessionFinishProps) {
    const summary = summarizeSessionLive(exercises);

    const [saving, setSaving] = useState(false);
    const [notes, setNotes] = useState(athleteNotes ?? '');
    const [notesOpen, setNotesOpen] = useState(false);

    // Estado del check-in de HOY. `null` = todavía no se sabe; hasta saberlo
    // no se pinta la recomendación, porque enseñarla y esconderla medio
    // segundo después es peor que no enseñarla.
    const [checkInDone, setCheckInDone] = useState<boolean | null>(null);
    const [checkInOpen, setCheckInOpen] = useState(false);

    // El estado local no se resincroniza con las props a mano: la pantalla
    // monta este componente con `key={sessionId}`, así que cambiar de día ya
    // lo remonta con las notas del día nuevo. Un efecto que copiara la prop al
    // estado sería, además de redundante, un render en cascada.

    // Solo se pregunta cuando hace falta: mientras el día está abierto la
    // recomendación no se enseña, así que consultarla sería una llamada por
    // cada día que el atleta abre.
    useEffect(() => {
        if (!completedAt) return;
        let alive = true;

        formsService
            .getResponse(athleteId, 'daily', getPeriodKey('daily'))
            .then(r => { if (alive) setCheckInDone(!!r); })
            // Si la tabla no está migrada, el cierre del entrenamiento tiene
            // que seguir funcionando: se da por no contestado y se ofrece.
            .catch(() => { if (alive) setCheckInDone(false); });

        return () => { alive = false; };
    }, [completedAt, athleteId]);

    const setCompleted = async (completed: boolean) => {
        setSaving(true);
        try {
            const trimmed = notes.trim();
            await trainingService.setSessionCompleted(
                sessionId,
                completed,
                trimmed === '' ? null : trimmed
            );
            onChange({
                completed_at: completed ? new Date().toISOString() : null,
                athlete_notes: trimmed === '' ? null : trimmed,
            });
            if (completed) toast.success('Entrenamiento cerrado');
        } catch (err) {
            console.error('No se pudo cerrar la sesión:', err);
            toast.error('No se pudo guardar. Inténtalo otra vez.');
        } finally {
            setSaving(false);
        }
    };

    /** Guarda solo las notas, sin tocar el estado de cierre. */
    const saveNotes = async () => {
        setSaving(true);
        try {
            const trimmed = notes.trim();
            await trainingService.setSessionCompleted(
                sessionId,
                Boolean(completedAt),
                trimmed === '' ? null : trimmed
            );
            onChange({ athlete_notes: trimmed === '' ? null : trimmed });
            setNotesOpen(false);
            toast.success('Nota guardada');
        } catch (err) {
            console.error('No se pudieron guardar las notas:', err);
            toast.error('No se pudo guardar la nota');
        } finally {
            setSaving(false);
        }
    };

    // Un día sin nada pautado no se "termina": no hay nada que cerrar y la
    // tarjeta solo sería una pregunta rara en una pantalla vacía.
    if (summary.setsTotal === 0) return null;

    const done = Boolean(completedAt);

    return (
        <>
            <section
                className={`overflow-hidden rounded-card border ${
 done
 ? 'border-[var(--success-quiet)] bg-surface-raised'
 : 'border-[var(--border-default)] bg-surface-raised'
 }`}
            >
                <div className="p-4 md:p-5">
                    {/* -------------------------------------------------
                        CABECERA                                       */}
                    <div className="flex items-start gap-3">
                        <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field ${
 done ? 'bg-success-quiet text-success' : 'bg-brand-quiet text-brand-text'
 }`}
                        >
                            <Check size={18} strokeWidth={3} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-t-lg font-black uppercase leading-none tracking-display text-ink">
                                {done ? 'Entrenamiento completado' : '¿Has terminado?'}
                            </h3>
                            <p className="mt-1.5 text-t-sm text-ink-subtle">
                                {done
                                    ? 'Tu entrenador ya lo ve registrado.'
                                    : summary.setsDone >= summary.setsTotal
                                        ? 'Has cerrado todas las series del día.'
                                        : `Te quedan ${summary.setsTotal - summary.setsDone} series por marcar. Puedes cerrarlo igualmente.`}
                            </p>
                        </div>
                    </div>

                    {/* -------------------------------------------------
                        CIFRAS DEL DÍA
                        Solo cuando está cerrado: mientras se entrena, la
                        barra de progreso de la cabecera ya dice lo que hay
                        que saber, y un resumen a medias invita a mirarlo
                        entre series en vez de levantar.               */}
                    {done && (
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <Stat label="Series" value={`${summary.setsDone}`} hint={`de ${summary.setsTotal}`} />
                            {summary.tonnage > 0 && (
                                <Stat
                                    label="Tonelaje"
                                    value={
                                        summary.tonnage >= 1000
                                            ? `${(summary.tonnage / 1000).toFixed(1)}`
                                            : `${summary.tonnage}`
                                    }
                                    hint={summary.tonnage >= 1000 ? 't' : 'kg'}
                                />
                            )}
                            <Stat
                                label="Ejercicios"
                                value={`${summary.exercisesDone}`}
                                hint={`de ${summary.exercisesTotal}`}
                            />
                        </div>
                    )}

                    {/* -------------------------------------------------
                        RPE PAUTADO FRENTE A RPE REAL

                        La comparación que decide la semana siguiente, en el
                        único momento en que el atleta la tiene fresca. Solo
                        sale si hay series con AMBOS valores: un delta sin
                        pares detrás no significa nada, y por eso se dice
                        sobre cuántas series se está afirmando.        */}
                    {done && summary.rpePairs > 0 && (
                        <div className="mt-3 rounded-field bg-surface-sunken p-3">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                    RPE medio
                                </span>
                                <span className="text-t-sm text-ink-muted">
                                    pautado{' '}
                                    <strong className="font-black tabular-nums text-ink">
                                        {summary.plannedRpe?.toFixed(1)}
                                    </strong>
                                </span>
                                <span className="text-t-sm text-ink-muted">
                                    real{' '}
                                    <strong className="font-black tabular-nums text-ink">
                                        {summary.actualRpe?.toFixed(1)}
                                    </strong>
                                </span>
                                {summary.rpeDelta !== null && summary.rpeDelta !== 0 && (
                                    <span
                                        className={`rounded-chip px-2 py-0.5 text-t-2xs font-black tabular-nums ${
 summary.rpeDelta > 0
 ? 'bg-warning-quiet text-warning'
 : 'bg-success-quiet text-success'
 }`}
                                    >
                                        {summary.rpeDelta > 0 ? '+' : ''}
                                        {summary.rpeDelta.toFixed(1)}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1.5 text-t-2xs text-ink-subtle">
                                Sobre {summary.rpePairs} {summary.rpePairs === 1 ? 'serie' : 'series'} con los dos
                                valores. Un rango pautado («7-8») se compara por su extremo alto.
                            </p>
                        </div>
                    )}

                    {/* -------------------------------------------------
                        NOTAS DEL DÍA
                        Plegadas: la mayoría de días no hay nada que
                        contar, y una caja de texto abierta pide ser
                        rellenada.                                     */}
                    {notesOpen || notes ? (
                        <div className="mt-3">
                            <label
                                htmlFor={`notes-${sessionId}`}
                                className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle"
                            >
                                Cómo ha ido
                            </label>
                            <textarea
                                id={`notes-${sessionId}`}
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                placeholder="Molestia en el hombro, la última serie se fue lenta…"
                                // text-t-base (16px): por debajo, iOS hace zoom al enfocar.
                                className="mt-1.5 w-full resize-none rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-base text-ink placeholder:text-ink-subtle focus:border-[var(--brand-line)]"
                            />
                            {done && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={saveNotes}
                                    loading={saving}
                                    className="mt-2"
                                >
                                    Guardar nota
                                </Button>
                            )}
                        </div>
                    ) : (
                        !done && (
                            // El relleno vertical le da los 40px que necesita un
                            // pulgar. Se compensa con el margen —menos arriba,
                            // negativo abajo— para que el enlace ocupe en la
                            // tarjeta el mismo hueco que ocupaba con 18px: si
                            // no, crecer el área pulsable separaría el botón de
                            // "Terminar" y la tarjeta se estiraría por un
                            // cambio que no debería verse.
                            <button
                                type="button"
                                onClick={() => setNotesOpen(true)}
                                className="mt-1.5 -mb-1 flex min-h-[40px] items-center gap-1.5 py-2.5 text-t-xs font-bold uppercase tracking-wider text-ink-subtle transition-colors duration-fast hover:text-ink"
                            >
                                <PenLine size={13} aria-hidden="true" />
                                Añadir una nota
                            </button>
                        )
                    )}

                    {/* -------------------------------------------------
                        ACCIÓN                                         */}
                    <div className="mt-4">
                        {done ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={<RotateCcw size={14} aria-hidden="true" />}
                                onClick={() => setCompleted(false)}
                                loading={saving}
                            >
                                Reabrir el día
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                size="lg"
                                block
                                icon={<Check size={18} strokeWidth={3} aria-hidden="true" />}
                                onClick={() => setCompleted(true)}
                                loading={saving}
                            >
                                Terminar entrenamiento
                            </Button>
                        )}
                    </div>
                </div>

                {/* -----------------------------------------------------
                    RECOMENDACIÓN DE CHECK-IN

                    Va DENTRO de la misma tarjeta y como franja aparte: es
                    consecuencia de haber terminado, no una tarjeta suelta
                    más en una pantalla que ya tiene muchas. Desaparece en
                    cuanto está contestado.                           */}
                {done && checkInDone === false && (
                    <div className="border-t border-subtle bg-surface-sunken p-4 md:p-5">
                        <p className="flex items-center gap-2 text-t-sm font-bold text-ink">
                            <ClipboardCheck size={16} className="shrink-0 text-brand-text" aria-hidden="true" />
                            Antes de irte, completa tu check-in diario.
                        </p>
                        <p className="mt-1 text-t-xs text-ink-subtle">
                            Es lo que le dice a tu entrenador cómo estás llegando a las sesiones.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="primary" size="md" onClick={() => setCheckInOpen(true)}>
                                Completar check-in
                            </Button>
                            {/* "Ahora no" solo cierra la recomendación de esta
                                pantalla. No marca nada: si mañana sigue sin
                                contestarlo, se le volverá a ofrecer. */}
                            <Button variant="ghost" size="md" onClick={() => setCheckInDone(true)}>
                                Ahora no
                            </Button>
                        </div>
                    </div>
                )}

                {done && checkInDone === null && (
                    <div className="flex items-center gap-2 border-t border-subtle bg-surface-sunken px-4 py-3 text-t-xs text-ink-subtle md:px-5">
                        <Loader size={13} className="animate-spin" aria-hidden="true" />
                        Comprobando tu check-in…
                    </div>
                )}
            </section>

            {checkInOpen && (
                <CheckInFormModal
                    athleteId={athleteId}
                    type="daily"
                    onClose={() => setCheckInOpen(false)}
                    onSubmitted={() => {
                        setCheckInOpen(false);
                        setCheckInDone(true);
                    }}
                />
            )}
        </>
    );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-field bg-surface-sunken px-3 py-2.5">
            <p className="text-t-xl font-black tabular-nums leading-none text-ink">
                {value}
                {hint && <span className="ml-1 text-t-2xs font-bold text-ink-subtle">{hint}</span>}
            </p>
            <p className="mt-1 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{label}</p>
        </div>
    );
}
