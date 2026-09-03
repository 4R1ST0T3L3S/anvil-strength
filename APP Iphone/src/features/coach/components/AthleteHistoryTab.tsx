import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Trophy, Plus, Trash2, Sparkles, Check, X, Gauge, Zap, AlertCircle, Loader,
} from 'lucide-react';
import { toast } from 'sonner';
import { trainingService, type ExerciseHistoryRow } from '../../../services/trainingService';
import { repMaxesService } from '../../../services/repMaxesService';
import {
    detectRepMaxes, marksForExercise, exercisesWithMarks, markLabel,
    MAX_TRACKED_REPS,
    type RepMax, type RepMaxCandidate,
} from '../../../lib/stats/repMaxes';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

/**
 * HISTÓRICO — LAS MEJORES MARCAS DEL ATLETA
 * =====================================================================
 *
 * UNA MARCA POR NÚMERO DE REPETICIONES, NO UNA SOLA CIFRA
 *
 * Mejor single, mejor doble, mejor triple, mejor 5RM… Cada una es su propio
 * registro porque cada una contesta a una pregunta distinta al programar. Un
 * 220×1 no dice nada sobre lo que este atleta puede hacer a cinco
 * repeticiones, y ordenarlas todas por peso —que es lo que haría cualquier
 * implementación ingenua— borraría las de repeticiones altas en cuanto
 * alguien hiciera un single pesado.
 *
 * La regla completa, con su desempate por RPE y velocidad, vive en
 * `lib/stats/repMaxes.ts` y tiene su propio banco de pruebas.
 *
 *
 * LA DETECCIÓN PROPONE. EL COACH CONFIRMA.
 *
 * El sistema recorre el registro y encuentra series que superan a la marca
 * vigente, pero NO las guarda solo. Es una decisión deliberada del 30/08/2026,
 * y la razón es concreta: el origen del dato es el registro del atleta, que se
 * teclea con el móvil entre serie y serie. Un 250 donde iba un 150 es un error
 * normal, y si esa serie se convirtiera sola en la mejor marca pasaría a ser
 * la referencia sobre la que se calculan los porcentajes de todo el bloque
 * siguiente — propagando el error a cada sesión sin que nadie lo viera.
 *
 * Un clic de confirmación es barato. Deshacer un bloque programado sobre una
 * marca falsa, no.
 */

interface AthleteHistoryTabProps {
    athleteId: string;
}

export function AthleteHistoryTab({ athleteId }: AthleteHistoryTabProps) {
    const queryClient = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const marksKey = ['rep-maxes', athleteId] as const;

    const marksQuery = useQuery({
        queryKey: marksKey,
        queryFn: () => repMaxesService.list(athleteId),
        staleTime: 30 * 1000,
    });

    const availableQuery = useQuery({
        queryKey: ['rep-maxes-disponible'],
        queryFn: () => repMaxesService.isAvailable(),
        staleTime: 5 * 60 * 1000,
    });

    // El historial solo hace falta para PROPONER. Se pide aparte para que la
    // tabla de marcas se pinte sin esperar a decenas de miles de series.
    const historyQuery = useQuery({
        queryKey: ['rep-maxes-historial', athleteId],
        queryFn: () => trainingService.getExerciseHistoryByAthlete(athleteId),
        staleTime: 5 * 60 * 1000,
    });

    const marks = useMemo(() => marksQuery.data ?? [], [marksQuery.data]);

    const candidates = useMemo(() => {
        const history: ExerciseHistoryRow[] = historyQuery.data ?? [];
        return detectRepMaxes(history, marks)
            .filter(c => !dismissed.has(candidateKey(c)));
    }, [historyQuery.data, marks, dismissed]);

    const exercises = useMemo(() => exercisesWithMarks(marks), [marks]);

    const unavailable = availableQuery.data === false;

    const refresh = () => queryClient.invalidateQueries({ queryKey: marksKey });

    const handleConfirm = async (candidate: RepMaxCandidate) => {
        setConfirming(candidateKey(candidate));
        try {
            await repMaxesService.confirm(athleteId, candidate);
            toast.success(`${markLabel(candidate.reps)} actualizado: ${candidate.load_kg} kg`);
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la marca');
        } finally {
            setConfirming(null);
        }
    };

    const handleDelete = async (mark: RepMax) => {
        if (!mark.id) return;
        try {
            await repMaxesService.remove(mark.id);
            toast.success('Marca eliminada');
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
        }
    };

    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-t-base font-bold text-ink">
                        <Trophy size={16} className="text-brand-text" aria-hidden="true" />
                        Mejores marcas
                    </h3>
                    <p className="mt-0.5 text-t-xs text-ink-subtle">
                        Lo mejor que ha levantado con cada número de repeticiones.
                    </p>
                </div>

                <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={14} />}
                    onClick={() => setAddOpen(true)}
                    disabled={unavailable}
                >
                    Añadir marca
                </Button>
            </header>

            {/* La migración pendiente se DICE, con el archivo exacto. Un vacío
                sin explicación se lee como "este atleta no tiene marcas". */}
            {unavailable && (
                <div className="flex items-start gap-2.5 rounded-card border border-[var(--border-default)] bg-[var(--warning-quiet)] px-4 py-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    <div className="min-w-0 text-t-xs leading-relaxed text-ink-muted">
                        <p className="font-bold text-ink">Falta una migración</p>
                        <p className="mt-0.5">
                            Las mejores marcas necesitan la tabla <code>athlete_rep_maxes</code>. Ejecuta{' '}
                            <code className="text-ink">database/CALENDARIO_Y_MARCAS_2026-08-30.sql</code>{' '}
                            en el editor SQL de Supabase.
                        </p>
                    </div>
                </div>
            )}

            {/* ------------ PROPUESTAS ------------ */}
            {!unavailable && candidates.length > 0 && (
                <section className="rounded-card border border-[var(--brand-line)] bg-brand-quiet p-4">
                    <h4 className="flex items-center gap-2 text-t-xs font-black uppercase tracking-widest text-brand-text">
                        <Sparkles size={13} aria-hidden="true" />
                        {candidates.length} {candidates.length === 1 ? 'marca detectada' : 'marcas detectadas'}
                    </h4>
                    <p className="mt-1 text-t-xs leading-relaxed text-ink-muted">
                        Series registradas que superan la marca vigente. Confírmalas para
                        usarlas como referencia al programar.
                    </p>

                    <ul className="mt-3 space-y-2">
                        {candidates.map(c => {
                            const key = candidateKey(c);
                            return (
                                <li
                                    key={key}
                                    className="flex flex-wrap items-center gap-3 rounded-field bg-surface-raised p-3"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-t-sm font-bold text-ink">
                                            {c.exercise_name}
                                        </span>
                                        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-t-xs tabular-nums text-ink-muted">
                                            <span className="font-black text-brand-text">
                                                {c.load_kg} × {c.reps}
                                            </span>
                                            {c.rpe != null && <span>@{c.rpe}</span>}
                                            {c.mean_velocity != null && <span>{c.mean_velocity.toFixed(2)} m/s</span>}
                                            {c.achieved_on && <span className="text-ink-subtle">{fmtDate(c.achieved_on)}</span>}
                                        </span>
                                        <span className="mt-0.5 block text-t-2xs text-ink-subtle">
                                            {c.supersedes
                                                ? `Supera a ${c.supersedes.load_kg} × ${c.supersedes.reps}`
                                                : `Primera marca a ${c.reps} ${c.reps === 1 ? 'repetición' : 'repeticiones'}`}
                                        </span>
                                    </span>

                                    <span className="flex shrink-0 items-center gap-1.5">
                                        <button
                                            onClick={() => setDismissed(prev => new Set(prev).add(key))}
                                            aria-label="Descartar esta propuesta"
                                            title="Descartar"
                                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                        >
                                            <X size={14} aria-hidden="true" />
                                        </button>
                                        <button
                                            onClick={() => handleConfirm(c)}
                                            disabled={confirming === key}
                                            className="flex items-center gap-1.5 rounded-field bg-brand px-3 py-2 text-t-xs font-bold text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                        >
                                            {confirming === key
                                                ? <Loader size={13} className="animate-spin" aria-hidden="true" />
                                                : <Check size={13} aria-hidden="true" />}
                                            Confirmar
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {/* ------------ LAS MARCAS ------------ */}
            <EstadoDeDatos
                consulta={marksQuery}
                queEs="que.datos"
                vacio={marks.length === 0}
                esqueleto={<Skeleton className="h-40 w-full rounded-card" />}
                vacioIcono={<Trophy size={20} aria-hidden="true" />}
                vacioTitulo={unavailable ? 'No disponible todavía' : 'Sin marcas registradas'}
                vacioCuerpo={
                    unavailable
                        ? 'Ejecuta la migración para empezar a registrar marcas.'
                        : historyQuery.isLoading
                            ? 'Buscando marcas en el historial del atleta…'
                            : 'Añade una marca a mano, o registra series en el entrenamiento y el sistema las detectará.'
                }
                vacioAccion={
                    !unavailable && (
                        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
                            Añadir la primera
                        </Button>
                    )
                }
            >
                <div className="space-y-4">
                    {exercises.map(ex => (
                        <section
                            key={ex.key}
                            className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised"
                        >
                            <h4 className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-t-sm font-bold text-ink">
                                {ex.name}
                            </h4>

                            <ul className="divide-y divide-[var(--border-subtle)]">
                                {marksForExercise(marks, ex.name).map(mark => (
                                    <li key={mark.id} className="group flex items-center gap-3 px-4 py-2.5">
                                        <span className="w-24 shrink-0 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                                            {markLabel(mark.reps).replace('Mejor ', '')}
                                        </span>

                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                                                <span className="text-t-base font-black tabular-nums text-ink">
                                                    {mark.load_kg} <span className="text-t-xs font-bold text-ink-subtle">kg</span>
                                                </span>
                                                {mark.rpe != null && (
                                                    <span className="flex items-center gap-0.5 text-t-xs tabular-nums text-ink-muted">
                                                        <Gauge size={10} aria-hidden="true" />@{mark.rpe}
                                                    </span>
                                                )}
                                                {mark.mean_velocity != null && (
                                                    <span className="flex items-center gap-0.5 text-t-xs tabular-nums text-ink-muted">
                                                        <Zap size={10} aria-hidden="true" />{mark.mean_velocity.toFixed(2)} m/s
                                                    </span>
                                                )}
                                                {mark.achieved_on && (
                                                    <span className="text-t-xs tabular-nums text-ink-subtle">
                                                        {fmtDate(mark.achieved_on)}
                                                    </span>
                                                )}
                                                {/* De dónde salió. Importa: una marca
                                                    detectada viene de una serie real y
                                                    una manual de lo que alguien tecleó. */}
                                                <span className="rounded-chip bg-surface-sunken px-1.5 py-0.5 text-t-2xs uppercase tracking-wide text-ink-faint">
                                                    {mark.source === 'detected' ? 'Del registro' : 'Manual'}
                                                </span>
                                            </span>
                                        </span>

                                        <button
                                            onClick={() => handleDelete(mark)}
                                            aria-label={`Eliminar ${markLabel(mark.reps).toLowerCase()} de ${ex.name}`}
                                            className="shrink-0 rounded-field p-2 text-ink-faint opacity-0 transition-opacity duration-fast ease-snap hover:text-danger-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100"
                                        >
                                            <Trash2 size={14} aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </EstadoDeDatos>

            <AddMarkModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                athleteId={athleteId}
                onSaved={() => { setAddOpen(false); refresh(); }}
            />
        </div>
    );
}

const candidateKey = (c: RepMaxCandidate) => `${c.exercise_key}|${c.reps}|${c.training_set_id}`;

/** 'YYYY-MM-DD' → '12/06/2026'. A mano: `new Date` desplazaría el día. */
function fmtDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)}/${Number(m)}/${y}`;
}

// =====================================================================

function AddMarkModal({
    open, onClose, athleteId, onSaved,
}: {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    onSaved: () => void;
}) {
    const [name, setName] = useState('');
    const [reps, setReps] = useState('1');
    const [load, setLoad] = useState('');
    const [rpe, setRpe] = useState('');
    const [velocity, setVelocity] = useState('');
    const [date, setDate] = useState('');
    const [saving, setSaving] = useState(false);

    const reset = () => {
        setName(''); setReps('1'); setLoad(''); setRpe(''); setVelocity(''); setDate('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();

        const repsNum = Number.parseInt(reps, 10);
        const loadNum = Number.parseFloat(load.replace(',', '.'));

        if (!name.trim()) { toast.error('El ejercicio es obligatorio'); return; }
        if (!Number.isFinite(repsNum) || repsNum < 1 || repsNum > MAX_TRACKED_REPS) {
            toast.error(`Las repeticiones tienen que estar entre 1 y ${MAX_TRACKED_REPS}`);
            return;
        }
        if (!Number.isFinite(loadNum) || loadNum <= 0) { toast.error('El peso tiene que ser mayor que cero'); return; }

        setSaving(true);
        try {
            await repMaxesService.upsert({
                athleteId,
                exerciseName: name.trim(),
                reps: repsNum,
                loadKg: loadNum,
                rpe: rpe ? Number.parseFloat(rpe.replace(',', '.')) : null,
                meanVelocity: velocity ? Number.parseFloat(velocity.replace(',', '.')) : null,
                achievedOn: date || null,
                source: 'manual',
            });
            toast.success('Marca guardada');
            reset();
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Nueva marca" size="md" dismissible={!saving}>
            <form onSubmit={submit} className="space-y-4">
                <label className="block space-y-1.5">
                    <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Ejercicio <span className="text-brand-text">*</span>
                    </span>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Sentadilla"
                        autoFocus
                        className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Repeticiones <span className="text-brand-text">*</span>
                        </span>
                        <input
                            type="number" inputMode="numeric" min={1} max={MAX_TRACKED_REPS}
                            value={reps}
                            onChange={e => setReps(e.target.value)}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm tabular-nums text-ink transition-colors duration-fast focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    </label>

                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Peso (kg) <span className="text-brand-text">*</span>
                        </span>
                        <input
                            type="text" inputMode="decimal"
                            value={load}
                            onChange={e => setLoad(e.target.value)}
                            placeholder="205"
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm tabular-nums text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    </label>
                </div>

                {/* Los tres opcionales. No son adorno: son lo que desempata dos
                    marcas del mismo peso, y lo que hace comparable una marca
                    de hace un año con una de esta semana. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">RPE</span>
                        <input
                            type="text" inputMode="decimal"
                            value={rpe} onChange={e => setRpe(e.target.value)} placeholder="9"
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm tabular-nums text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    </label>

                    <label className="block space-y-1.5">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">m/s</span>
                        <input
                            type="text" inputMode="decimal"
                            value={velocity} onChange={e => setVelocity(e.target.value)} placeholder="0.23"
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm tabular-nums text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    </label>

                    <label className="col-span-2 block space-y-1.5 sm:col-span-1">
                        <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Fecha</span>
                        <input
                            type="date"
                            value={date} onChange={e => setDate(e.target.value)}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm text-ink transition-colors duration-fast focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    </label>
                </div>

                <p className="text-t-2xs leading-relaxed text-ink-subtle">
                    Si ya existe una marca de este ejercicio con estas repeticiones, se
                    sustituye. Cada número de repeticiones tiene su propia marca.
                </p>

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button type="submit" variant="primary" loading={saving}>
                        Guardar marca
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
