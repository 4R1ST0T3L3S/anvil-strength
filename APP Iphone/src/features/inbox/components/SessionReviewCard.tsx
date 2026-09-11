import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Check, ChevronDown, ClipboardList, History, MessageSquareText, PenLine, Play, Trash2, Video,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { controlBase } from '../../../components/ui/Field';
import { formsService } from '../../../services/formsService';
import { CLAVES } from '../../../lib/queryKeys';
import { claveDeFecha, fechaLarga, haceCuanto, hora } from '../../../lib/tiempo';
import {
    deviationsOf, prescribedKg, prescribedReps, prescribedRpe, summarizeSession,
} from '../../../lib/stats/executionLog';
import { formatMetric } from '../../../lib/vbt/metricRegistry';
import { cambiosDesdeRevision, type ReviewedSession, type SessionReview, type SessionFeedback } from '../../../services/reviewService';
import type { LoggedExercise, LoggedSet } from '../../../services/trainingService';

/**
 * UN ENTRENAMIENTO, LISTO PARA REVISAR
 * =====================================================================
 *
 * Toda la información que tiene Anvil de ese día, en orden de utilidad:
 *
 *   1. Qué día y cómo fue (cifras del día y las palabras del atleta).
 *   2. Si vuelve tras una revisión: QUÉ cambió, serie a serie.
 *   3. Cada ejercicio con lo pautado frente a lo hecho, RPE, notas por
 *      serie, vídeo y métricas de velocidad si las hay.
 *   4. El check-in de ese día, si lo contestó.
 *   5. El feedback ya enviado y el cuadro para escribir más.
 *   6. El check. Y solo el check saca esto de la bandeja.
 */

const fmtKg = (n: number | null | undefined) => (n == null ? '—' : `${String(n).replace('.', ',')}`);
const fmtN = (n: number | null | undefined) => (n == null ? '—' : String(n).replace('.', ','));

export function SessionReviewCard({
    sesion,
    historial,
    feedback,
    coachId,
    onRevisar,
    onComentar,
    onBorrarComentario,
    revisando,
}: {
    sesion: ReviewedSession;
    historial: SessionReview[];
    feedback: SessionFeedback[];
    coachId: string;
    onRevisar: (comentario: string | null) => void;
    onComentar: (body: string) => Promise<unknown>;
    onBorrarComentario: (itemId: string) => void;
    revisando: boolean;
}) {
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [verHistorial, setVerHistorial] = useState(false);

    const resumen = useMemo(() => summarizeSession(sesion), [sesion]);
    const fechaBase = sesion.date ?? sesion.completedAt ?? null;
    const claveDia = fechaBase ? claveDeFecha(fechaBase.length === 10 ? `${fechaBase}T12:00:00` : fechaBase) : null;

    const ultimaRevision = historial.find(h => !h.undoneAt) ?? null;
    const cambios = useMemo(
        () => (sesion.modifiedAfterReview ? cambiosDesdeRevision(sesion, ultimaRevision?.snapshot) : { cambios: [], notasCambiadas: false }),
        [sesion, ultimaRevision]
    );

    // El check-in DIARIO de ese día, si lo hay. Solo se pide una vez por
    // sesión y no bloquea nada: la tarjeta se pinta con o sin él.
    const checkin = useQuery({
        queryKey: [...CLAVES.cuestionarios.respuestasDeAtleta(sesion.athleteId, 'daily'), claveDia ?? 'sin-fecha'],
        queryFn: () => formsService.getResponse(sesion.athleteId, 'daily', claveDia as string),
        enabled: !!claveDia,
        staleTime: 5 * 60_000,
    });

    const enviarComentario = async () => {
        const body = texto.trim();
        if (!body) return;
        setEnviando(true);
        try {
            await onComentar(body);
            setTexto('');
        } finally {
            setEnviando(false);
        }
    };

    const titulo = sesion.name?.trim() || `Día ${sesion.dayNumber}`;

    return (
        <article className="overflow-hidden rounded-card border border-[var(--card-border)] bg-surface-raised shadow-card">
            {/* ---------------------------------------------------------
                CABECERA: el día, el bloque, y en qué estado llega */}
            <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                <div className="min-w-0">
                    <p className="text-t-sm font-medium text-ink-muted">
                        {fechaBase ? fechaLarga(fechaBase.length === 10 ? `${fechaBase}T12:00:00` : fechaBase) : 'Sin fecha'}
                        {sesion.completedAt && <span className="text-ink-subtle"> · terminado a las {hora(sesion.completedAt)}</span>}
                    </p>
                    <h3 className="mt-0.5 text-t-xl font-semibold text-ink">{titulo}</h3>
                    <p className="mt-0.5 text-t-sm text-ink-subtle">
                        {sesion.blockName} · semana {sesion.weekNumber}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {sesion.modifiedAfterReview && <Badge tono="aviso" icono={<PenLine />}>Modificado tras revisar</Badge>}
                    {resumen.completionPct < 100 && (
                        <Badge tono="neutro">{resumen.completionPct}% de las series</Badge>
                    )}
                </div>
            </header>

            {/* ---------------------------------------------------------
                CIFRAS DEL DÍA */}
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] bg-[var(--separator)] mx-4 sm:mx-5">
                <Cifra label="Series" valor={`${resumen.loggedSets}`} pista={`de ${resumen.plannedSets}`} />
                <Cifra
                    label="Tonelaje"
                    valor={resumen.actualTonnage >= 1000 ? (resumen.actualTonnage / 1000).toFixed(1).replace('.', ',') : `${resumen.actualTonnage}`}
                    pista={resumen.actualTonnage >= 1000 ? 't' : 'kg'}
                />
                <Cifra
                    label="RPE"
                    valor={resumen.actualRpe != null ? fmtN(resumen.actualRpe) : '—'}
                    pista={resumen.plannedRpe != null ? `pautado ${fmtN(resumen.plannedRpe)}` : undefined}
                    tono={
                        resumen.actualRpe != null && resumen.plannedRpe != null
                            ? resumen.actualRpe - resumen.plannedRpe >= 1 ? 'aviso' : resumen.actualRpe - resumen.plannedRpe <= -1 ? 'exito' : undefined
                            : undefined
                    }
                />
            </div>

            <div className="space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                {/* NOTAS DEL ATLETA: lo primero que se lee después de las cifras. */}
                {sesion.athleteNotes?.trim() && (
                    <blockquote className="rounded-[10px] bg-[var(--brand-quiet)] px-3.5 py-3">
                        <p className="text-t-xs font-medium text-brand-text">Cómo le ha ido</p>
                        <p className="mt-1 text-t-sm leading-relaxed text-ink">{sesion.athleteNotes.trim()}</p>
                    </blockquote>
                )}

                {/* QUÉ CAMBIÓ desde la última revisión. */}
                {sesion.modifiedAfterReview && (
                    <section className="rounded-[10px] border border-[var(--warning-quiet)] bg-warning-quiet/60 px-3.5 py-3">
                        <p className="flex items-center gap-1.5 text-t-xs font-medium text-warning">
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                            {ultimaRevision
                                ? `Cambiado después de tu revisión de ${haceCuanto(ultimaRevision.reviewedAt)}`
                                : 'Cambiado después de revisarlo'}
                        </p>
                        {cambios.cambios.length > 0 || cambios.notasCambiadas ? (
                            <ul className="mt-2 space-y-1 text-t-sm text-ink">
                                {cambios.cambios.slice(0, 12).map((c, i) => (
                                    <li key={i} className="flex flex-wrap gap-x-1.5 tabular-nums">
                                        <span className="text-ink-muted">{c.exerciseName} · S{c.serie} · {c.campo}:</span>
                                        <span className="text-ink-subtle line-through">{c.antes}</span>
                                        <span aria-hidden="true">→</span>
                                        <span className="font-semibold">{c.ahora}</span>
                                    </li>
                                ))}
                                {cambios.cambios.length > 12 && (
                                    <li className="text-ink-subtle">… y {cambios.cambios.length - 12} cambios más</li>
                                )}
                                {cambios.notasCambiadas && <li className="text-ink-muted">Ha cambiado las notas del día.</li>}
                            </ul>
                        ) : (
                            <p className="mt-1 text-t-sm text-ink-muted">
                                Los datos registrados coinciden con lo que revisaste; puede que solo haya vuelto a guardar.
                            </p>
                        )}
                    </section>
                )}

                {/* CONSIDERACIONES que pautó el coach: contexto para juzgar. */}
                {sesion.extras?.trim() && (
                    <p className="text-t-xs leading-relaxed text-ink-subtle">
                        <span className="font-medium text-ink-muted">Consideraciones que le diste: </span>
                        {sesion.extras.trim()}
                    </p>
                )}

                {/* EJERCICIOS */}
                <div className="space-y-2.5">
                    {sesion.exercises.map(ex => (
                        <Ejercicio key={ex.id} ejercicio={ex} objetivos={sesion.exerciseTargets[ex.id]} />
                    ))}
                    {sesion.exercises.length === 0 && (
                        <p className="py-3 text-center text-t-sm text-ink-subtle">Día sin ejercicios de trabajo.</p>
                    )}
                </div>

                {/* CHECK-IN DEL DÍA */}
                {checkin.data && Array.isArray(checkin.data.answers) && checkin.data.answers.length > 0 && (
                    <section className="rounded-[10px] bg-[var(--fill-muted)] px-3.5 py-3">
                        <p className="flex items-center gap-1.5 text-t-xs font-medium text-ink-muted">
                            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                            Check-in de ese día
                        </p>
                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                            {checkin.data.answers
                                .filter(a => a.value !== null && a.value !== '' && a.value !== undefined)
                                .map(a => (
                                    <div key={a.id} className="flex items-baseline justify-between gap-3 text-t-sm">
                                        <dt className="min-w-0 truncate text-ink-muted">{a.label}</dt>
                                        <dd className="shrink-0 font-medium tabular-nums text-ink">
                                            {a.qtype === 'scale' ? `${a.value}/10` : `${a.value}${a.unit ? ` ${a.unit}` : ''}`}
                                        </dd>
                                    </div>
                                ))}
                        </dl>
                    </section>
                )}

                {/* HISTORIAL de revisiones anteriores (plegado). */}
                {historial.filter(h => !h.undoneAt).length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setVerHistorial(v => !v)}
                            className="flex items-center gap-1.5 text-t-xs font-medium text-ink-subtle transition-colors duration-fast hover:text-ink"
                        >
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-fast', verHistorial && 'rotate-180')} aria-hidden="true" />
                            Revisiones anteriores ({historial.filter(h => !h.undoneAt).length})
                        </button>
                        {verHistorial && (
                            <ul className="mt-2 space-y-1 text-t-xs text-ink-muted">
                                {historial.filter(h => !h.undoneAt).map(h => (
                                    <li key={h.id}>
                                        {h.snapshot.legacy ? 'Anterior a la bandeja' : `Revisado ${haceCuanto(h.reviewedAt)}`}
                                        {h.wasModified && ' · tras una modificación'}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* FEEDBACK */}
                <section className="border-t border-[var(--separator)] pt-4">
                    {feedback.length > 0 && (
                        <ul className="mb-3 space-y-2">
                            {feedback.map(f => (
                                <li key={f.id} className="group flex items-start gap-2 rounded-[10px] bg-[var(--fill-muted)] px-3.5 py-2.5">
                                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="whitespace-pre-wrap text-t-sm leading-relaxed text-ink">{f.body}</p>
                                        <p className="mt-1 text-t-xs text-ink-subtle">
                                            {haceCuanto(f.createdAt)}{f.readAt ? ' · leído' : ''}
                                        </p>
                                    </div>
                                    {f.senderId === coachId && (
                                        <IconButton
                                            size="sm"
                                            tono="peligro"
                                            aria-label="Retirar este comentario"
                                            icon={<Trash2 />}
                                            className="opacity-60 group-hover:opacity-100"
                                            onClick={() => onBorrarComentario(f.id)}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <label htmlFor={`fb-${sesion.id}`} className="sr-only">Feedback para el atleta</label>
                    <textarea
                        id={`fb-${sesion.id}`}
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        rows={2}
                        maxLength={4000}
                        placeholder="Escribe feedback para el atleta… (opcional)"
                        className={cn(controlBase(false), 'resize-y py-2.5 leading-relaxed')}
                    />

                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                        {texto.trim() && (
                            <Button variant="secondary" onClick={enviarComentario} loading={enviando} disabled={revisando}>
                                Enviar sin revisar
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            icon={<Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />}
                            onClick={() => onRevisar(texto.trim() || null)}
                            loading={revisando}
                            disabled={enviando}
                        >
                            {texto.trim() ? 'Revisar y enviar feedback' : 'Marcar como revisado'}
                        </Button>
                    </div>
                </section>
            </div>
        </article>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

function Cifra({ label, valor, pista, tono }: { label: string; valor: string; pista?: string; tono?: 'aviso' | 'exito' }) {
    return (
        <div className="bg-surface-raised px-3 py-2.5">
            <p className="text-t-xs text-ink-subtle">{label}</p>
            <p className="mt-0.5 flex items-baseline gap-1">
                <span className={cn('text-t-xl font-semibold tabular-nums leading-none', tono === 'aviso' ? 'text-warning' : tono === 'exito' ? 'text-success' : 'text-ink')}>
                    {valor}
                </span>
                {pista && <span className="text-t-xs text-ink-subtle">{pista}</span>}
            </p>
        </div>
    );
}

function Ejercicio({ ejercicio, objetivos }: { ejercicio: LoggedExercise; objetivos?: { rpe: string | null; velocity: string | null } }) {
    const registrado = ejercicio.sets.some(s => s.isCompleted || s.actualReps != null || s.actualLoad != null);
    const hayVbt = ejercicio.sets.some(s => s.vbtMeanVelocity != null || s.vbtFileUrl);

    return (
        <div className={cn('rounded-[10px] border border-[var(--separator)] px-3.5 py-3', !registrado && 'opacity-60')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-t-base font-semibold text-ink">
                    {ejercicio.name}
                    {ejercicio.variantName && <span className="ml-1.5 text-t-sm font-medium text-brand-text">{ejercicio.variantName}</span>}
                </p>
                <p className="text-t-xs text-ink-subtle">
                    {!registrado && 'sin registrar'}
                    {registrado && objetivos?.rpe && `RPE objetivo ${objetivos.rpe}`}
                    {registrado && objetivos?.velocity && ` · ${objetivos.velocity} m/s`}
                    {registrado && ejercicio.restSeconds != null && ` · descanso ${ejercicio.restSeconds}s`}
                </p>
            </div>
            {ejercicio.coachNotes?.trim() && (
                <p className="mt-0.5 text-t-xs text-ink-subtle">{ejercicio.coachNotes.trim()}</p>
            )}

            <div className="-mx-1 mt-2 overflow-x-auto">
                <table className="w-full min-w-[22rem] border-collapse text-t-sm tabular-nums">
                    <thead>
                        <tr className="text-t-xs text-ink-subtle">
                            <th className="w-8 px-1 py-1 text-left font-medium">#</th>
                            <th className="px-1 py-1 text-left font-medium">Pautado</th>
                            <th className="px-1 py-1 text-left font-medium">Hecho</th>
                            <th className="w-16 px-1 py-1 text-right font-medium">RPE</th>
                            {hayVbt && <th className="px-1 py-1 text-right font-medium">Velocidad</th>}
                            <th className="w-8 px-1 py-1" />
                        </tr>
                    </thead>
                    <tbody>
                        {ejercicio.sets.map((s, i) => (
                            <Serie key={s.id} set={s} indice={i + 1} conVbt={hayVbt} />
                        ))}
                    </tbody>
                </table>
            </div>

            {ejercicio.sets.some(s => s.notes?.trim()) && (
                <ul className="mt-2 space-y-1 border-t border-[var(--separator)] pt-2">
                    {ejercicio.sets.map((s, i) =>
                        s.notes?.trim() ? (
                            <li key={s.id} className="flex gap-2 text-t-sm leading-relaxed text-ink-muted">
                                <span className="shrink-0 text-ink-subtle">S{i + 1}</span>
                                <span>{s.notes.trim()}</span>
                            </li>
                        ) : null
                    )}
                </ul>
            )}
        </div>
    );
}

function Serie({ set, indice, conVbt }: { set: LoggedSet; indice: number; conVbt: boolean }) {
    const kg = prescribedKg(set);
    const reps = prescribedReps(set);
    const rpe = prescribedRpe(set);
    const hecha = set.isCompleted || set.actualReps != null || set.actualLoad != null;
    const desv = hecha ? deviationsOf(set) : [];
    const cargaBaja = desv.some(d => d.kind === 'load-down');
    const cargaAlta = desv.some(d => d.kind === 'load-up');
    const rpeAlto = desv.some(d => d.kind === 'rpe-over');

    const pautado = [
        reps != null ? `${reps}` : set.targetReps ? `${set.targetReps}` : null,
        kg != null ? `× ${fmtKg(kg)} kg` : set.targetMetric && set.targetMetric !== 'kg' && set.targetLoad != null ? `× ${fmtN(set.targetLoad)} ${set.targetMetric}` : null,
        rpe != null ? `@${fmtN(rpe)}` : null,
    ].filter(Boolean).join(' ');

    return (
        <tr className={cn('border-t border-[var(--separator)]', !hecha && 'text-ink-subtle')}>
            <td className="px-1 py-1.5 text-ink-subtle">{indice}</td>
            <td className="px-1 py-1.5 text-ink-muted">{pautado || '—'}</td>
            <td className="px-1 py-1.5">
                {hecha ? (
                    <span className={cn('font-semibold', cargaBaja && 'text-warning', cargaAlta && 'text-success')}>
                        {set.actualReps != null ? set.actualReps : '—'}
                        {' × '}
                        {set.actualLoad != null ? `${fmtKg(set.actualLoad)} kg` : '—'}
                    </span>
                ) : (
                    <span>sin registrar</span>
                )}
            </td>
            <td className={cn('px-1 py-1.5 text-right', rpeAlto ? 'font-semibold text-warning' : 'text-ink')}>
                {hecha && set.actualRpe != null ? fmtN(set.actualRpe) : '—'}
            </td>
            {conVbt && (
                <td className="px-1 py-1.5 text-right text-ink-muted">
                    {set.vbtMeanVelocity != null ? formatMetric('mean_velocity', set.vbtMeanVelocity) : set.vbtFileUrl ? 'CSV' : '—'}
                </td>
            )}
            <td className="px-1 py-1.5 text-right">
                {set.videoUrl && (
                    <a
                        href={set.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ver el vídeo de la serie ${indice}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-brand-text transition-colors duration-fast hover:bg-[var(--brand-quiet)]"
                    >
                        {set.videoUrl.includes('youtu') ? <Play className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
                    </a>
                )}
            </td>
        </tr>
    );
}
