import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Link2, Loader, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { vbtService, type AttachableSet } from '../../../services/vbtService';
import { velocityZone } from '../../../lib/vbt/analysis';
import type { VbtMetrics } from '../../../types/training';
import { transition, DURATION } from '../../../lib/motion';
import { cn } from '../../../lib/utils';
import { AssignSetPicker, type AssignSetSelection } from './AssignSetPicker';

/**
 * GUARDAR UN ANÁLISIS DE VÍDEO EN UN ATLETA
 * =====================================================================
 *
 * PWR Análisis calculaba velocidad, potencia, ROM y 1RM estimado a partir de
 * un vídeo… y ahí se quedaba. Al cerrar la pestaña, el resultado desaparecía.
 * Era una calculadora, no una herramienta de seguimiento: no había forma de
 * comparar el vídeo de hoy con el del mes pasado ni de que el análisis de un
 * atleta apareciera en su ficha.
 *
 * ESTE PASO ES EL QUE FALTABA: decir de QUIÉN es y, si procede, DE QUÉ SERIE.
 *
 * El enlace con la serie es OPCIONAL a propósito. Media la gente graba en el
 * gimnasio sin tener el día programado delante, y obligar a elegir serie
 * convertiría "guardar" en "abandonar". Sin serie, la medición sigue contando
 * para el perfil carga-velocidad del atleta, que es su uso principal.
 */

interface AthleteOption {
    id: string;
    full_name: string;
    avatar_url?: string | null;
}

export interface SavePwrResultModalProps {
    open: boolean;
    onClose: () => void;
    coachId: string | null;
    /** Métricas calculadas por el analizador de vídeo. */
    metrics: VbtMetrics;
    /** Carga con la que se hizo el levantamiento, tal y como la puso el coach. */
    loadKg: number | null;
    /** Repeticiones detectadas en el vídeo. */
    reps: number | null;
    /** Velocidad de cada repetición, si el analizador separó varias. */
    repVelocities?: number[] | null;
    /**
     * Todo lo que el analizador mide y no cabe en las siete de `VbtMetrics`.
     * Se guarda tal cual en la bolsa JSONB. Ver src/lib/vbt/metricRegistry.ts.
     */
    extraMetrics?: Record<string, number | null | undefined>;
    /** Nombre por defecto del ejercicio, deducido del tipo elegido. */
    defaultExerciseName: string;
    /**
     * CÓMO SE ELIGE LA SERIE.
     *
     *   'quick'  — lista plana de series recientes, y enlazar es OPCIONAL.
     *              Para "guarda esto en la ficha y ya veré dónde va".
     *   'assign' — cascada macro → bloque → semana → día → ejercicio → serie,
     *              y la serie es OBLIGATORIA. Es el flujo "Asociar serie".
     *
     * Son dos intenciones distintas, no dos aspectos de la misma pantalla:
     * quien pulsa "Asociar serie" ya sabe a qué serie va, y ofrecerle
     * "guardar sin enlazar" solo le da la oportunidad de equivocarse.
     */
    mode?: 'quick' | 'assign';
    /**
     * Atleta fijo. Cuando lo usa el propio atleta desde su panel no hay nada
     * que elegir: es él, y enseñarle una lista de una persona sería absurdo.
     */
    fixedAthleteId?: string | null;
}

export function SavePwrResultModal({
    open,
    onClose,
    coachId,
    metrics,
    loadKg,
    reps,
    repVelocities,
    extraMetrics,
    defaultExerciseName,
    fixedAthleteId,
    mode = 'quick',
}: SavePwrResultModalProps) {
    const [athletes, setAthletes] = useState<AthleteOption[]>([]);
    const [athleteId, setAthleteId] = useState<string | null>(fixedAthleteId ?? null);
    const [search, setSearch] = useState('');
    const [exerciseName, setExerciseName] = useState(defaultExerciseName);
    const [notes, setNotes] = useState('');
    const [sets, setSets] = useState<AttachableSet[]>([]);
    const [setId, setSetId] = useState<string | null>(null);
    const [loadingSets, setLoadingSets] = useState(false);
    const [saving, setSaving] = useState(false);
    /** Lo elegido en la cascada. Solo en modo 'assign'. */
    const [assigned, setAssigned] = useState<AssignSetSelection | null>(null);

    const isAssign = mode === 'assign';

    // Atletas del entrenador. Solo se piden si hay que elegir.
    useEffect(() => {
        if (!open || fixedAthleteId || !coachId) return;

        let alive = true;
        supabase
            .from('coach_athletes')
            .select('athlete_id')
            .eq('coach_id', coachId)
            .then(async ({ data }) => {
                const ids = (data ?? []).map(r => r.athlete_id as string);
                if (ids.length === 0) { if (alive) setAthletes([]); return; }

                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url')
                    .in('id', ids)
                    .order('full_name');

                if (alive) setAthletes((profiles ?? []) as AthleteOption[]);
            });

        return () => { alive = false; };
    }, [open, coachId, fixedAthleteId]);

    // Series a las que se puede enganchar, del atleta elegido. La lista se
    // vacía al cambiar de atleta desde el propio manejador, no aquí: tocar el
    // estado en el cuerpo del efecto provoca un render en cascada.
    useEffect(() => {
        // En modo 'assign' la elección la lleva la cascada, que se trae sus
        // propios datos por niveles: pedir además la lista plana serían dos
        // consultas para pintar una sola pantalla.
        if (!open || !athleteId || isAssign) return;

        let alive = true;
        vbtService.getAttachableSets(athleteId)
            .then(rows => { if (alive) setSets(rows); })
            .catch(() => { if (alive) setSets([]); })
            .finally(() => { if (alive) setLoadingSets(false); });

        return () => { alive = false; };
    }, [open, athleteId, isAssign]);

    /**
     * Series que se ofrecen: las del ejercicio que se está guardando.
     *
     * Enseñar las doscientas del bloque obligaría a buscar entre ellas. Se
     * filtra por nombre de ejercicio —comparación laxa, porque "Sentadilla" y
     * "Sentadilla trasera" son el mismo movimiento para esto— y si no casa
     * ninguna se enseñan todas, que es mejor que una lista vacía.
     */
    const candidateSets = useMemo(() => {
        const needle = exerciseName.trim().toLowerCase();
        if (!needle) return sets.slice(0, 40);
        const matching = sets.filter(s => s.exerciseName.toLowerCase().includes(needle.split(' ')[0]));
        return (matching.length > 0 ? matching : sets).slice(0, 40);
    }, [sets, exerciseName]);

    const filteredAthletes = useMemo(
        () => athletes.filter(a => (a.full_name ?? '').toLowerCase().includes(search.toLowerCase())),
        [athletes, search]
    );

    if (!open) return null;

    const save = async () => {
        if (!athleteId) {
            toast.error('Elige a qué atleta pertenece este análisis');
            return;
        }
        if (!exerciseName.trim()) {
            toast.error('Escribe de qué ejercicio es');
            return;
        }
        if (isAssign && !assigned) {
            toast.error('Elige la serie a la que asociar el análisis');
            return;
        }

        setSaving(true);
        try {
            // Las dos formas de elegir acaban en la misma forma de dato: el
            // servicio no sabe —ni tiene por qué— por cuál de las dos se ha
            // llegado hasta aquí.
            const chosen: Pick<AttachableSet,
                'setId' | 'sessionExerciseId' | 'exerciseId' | 'exerciseName' | 'setNumber'
            > | null = isAssign
                ? (assigned && {
                    setId: assigned.setId,
                    sessionExerciseId: assigned.sessionExerciseId,
                    exerciseId: assigned.exerciseId,
                    exerciseName: assigned.exerciseName,
                    setNumber: assigned.setNumber,
                }) || null
                : candidateSets.find(s => s.setId === setId) ?? null;

            await vbtService.saveMeasurement({
                athleteId,
                createdBy: coachId,
                exerciseName: exerciseName.trim(),
                exerciseId: chosen?.exerciseId ?? null,
                trainingSetId: chosen?.setId ?? null,
                sessionExerciseId: chosen?.sessionExerciseId ?? null,
                setNumber: chosen?.setNumber ?? null,
                reps,
                loadKg,
                metrics,
                extraMetrics,
                repVelocities,
                // 'video' y no 'encoder': un análisis por visión artificial
                // sobre un vídeo de móvil no merece la misma confianza que una
                // medición de encoder, y al leer el perfil hay que poder
                // distinguirlos.
                source: 'video',
                notes: notes.trim() || null,
            });

            toast.success(
                chosen
                    ? `Guardado en la serie ${chosen.setNumber} de ${chosen.exerciseName}`
                    : 'Análisis guardado en el historial del atleta'
            );
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const zone = metrics.meanVelocity ? velocityZone(metrics.meanVelocity) : null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition(DURATION.fast)}
                className="fixed inset-0 z-[250] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 24, scale: 0.98 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 24, scale: 0.98 }}
                    transition={transition(DURATION.base)}
                    onClick={e => e.stopPropagation()}
                    className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                        <div>
                                <h3 className="text-t-sm font-bold text-ink">
                                {isAssign ? 'Asociar a una serie' : 'Guardar este análisis'}
                            </h3>
                            <p className="mt-0.5 text-t-2xs text-ink-subtle">
                                {metrics.meanVelocity?.toFixed(2)} m/s
                                {loadKg ? ` · ${loadKg} kg` : ''}
                                {reps ? ` · ${reps} rep${reps === 1 ? '' : 's'}` : ''}
                                {zone && <span style={{ color: zone.color }}> · {zone.label}</span>}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="rounded-field p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            <X size={16} />
                        </button>
                    </header>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                        {/* 1. De quién es */}
                        {!fixedAthleteId && (
                            <div>
                                <p className="mb-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    ¿De qué atleta es?
                                </p>

                                {athletes.length > 6 && (
                                    <div className="relative mb-2">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" size={13} aria-hidden="true" />
                                        <input
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder="Buscar…"
                                            className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken pl-8 pr-3 text-t-xs text-ink outline-none focus:border-brand"
                                        />
                                    </div>
                                )}

                                <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                                    {filteredAthletes.map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => { setAthleteId(a.id); setSetId(null); setSets([]); }}
                                            className={cn(
                                                'flex items-center gap-2 rounded-field border px-2.5 py-2 text-left text-t-xs transition-colors duration-fast',
                                                athleteId === a.id
                                                    ? 'border-brand bg-[var(--brand-quiet)] text-ink'
                                                    : 'border-[var(--border-default)] text-ink-muted hover:text-ink'
                                            )}
                                        >
                                            {a.avatar_url
                                                ? <img src={a.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-pill object-cover" />
                                                : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-overlay"><User size={12} /></span>}
                                            <span className="truncate font-semibold">{a.full_name}</span>
                                            {athleteId === a.id && <Check size={13} className="ml-auto shrink-0 text-brand" />}
                                        </button>
                                    ))}
                                    {filteredAthletes.length === 0 && (
                                        <p className="col-span-full py-3 text-center text-t-2xs text-ink-subtle">
                                            No hay atletas en tu equipo.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 2. De qué ejercicio */}
                        <div>
                            <p className="mb-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                Ejercicio
                            </p>
                            <input
                                value={exerciseName}
                                onChange={e => { setExerciseName(e.target.value); setSetId(null); }}
                                placeholder="Sentadilla"
                                className="h-9 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 text-t-sm text-ink outline-none focus:border-brand"
                            />
                        </div>

                        {/* 3. A qué serie */}
                        {athleteId && isAssign && (
                            <div>
                                <p className="mb-1 flex items-center gap-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    <Link2 size={12} aria-hidden="true" />
                                    Serie a la que se asocia
                                </p>
                                <p className="mb-2 text-t-2xs leading-relaxed text-ink-faint">
                                    Baja por el plan hasta la serie exacta. Las métricas quedarán
                                    guardadas dentro de ella.
                                </p>

                                <AssignSetPicker
                                    athleteId={athleteId}
                                    exerciseHint={exerciseName}
                                    value={assigned}
                                    onChange={setAssigned}
                                />
                            </div>
                        )}

                        {athleteId && !isAssign && (
                            <div>
                                <p className="mb-1 flex items-center gap-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                    <Link2 size={12} aria-hidden="true" />
                                    Enlazar con una serie <span className="font-normal normal-case opacity-70">(opcional)</span>
                                </p>
                                <p className="mb-2 text-t-2xs leading-relaxed text-ink-faint">
                                    Si la eliges, la velocidad aparecerá junto a esa serie en el registro
                                    del día. Si no, la medición se guarda igual en el historial del atleta.
                                </p>

                                {loadingSets ? (
                                    <p className="py-3 text-center text-t-2xs text-ink-subtle">
                                        <Loader size={14} className="mx-auto animate-spin" />
                                    </p>
                                ) : candidateSets.length === 0 ? (
                                    <p className="rounded-field bg-surface-sunken px-3 py-2 text-t-2xs text-ink-subtle">
                                        No hay series programadas recientes para enlazar. El análisis se
                                        guardará suelto, que es igual de válido.
                                    </p>
                                ) : (
                                    <div className="max-h-48 space-y-1 overflow-y-auto">
                                        <button
                                            onClick={() => setSetId(null)}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded-field border px-2.5 py-2 text-left text-t-2xs transition-colors duration-fast',
                                                setId === null
                                                    ? 'border-brand bg-[var(--brand-quiet)] text-ink'
                                                    : 'border-[var(--border-default)] text-ink-muted hover:text-ink'
                                            )}
                                        >
                                            Sin enlazar
                                        </button>
                                        {candidateSets.map(s => (
                                            <button
                                                key={s.setId}
                                                onClick={() => setSetId(s.setId)}
                                                className={cn(
                                                    'flex w-full items-baseline gap-2 rounded-field border px-2.5 py-2 text-left text-t-2xs transition-colors duration-fast',
                                                    setId === s.setId
                                                        ? 'border-brand bg-[var(--brand-quiet)] text-ink'
                                                        : 'border-[var(--border-default)] text-ink-muted hover:text-ink'
                                                )}
                                            >
                                                <span className="min-w-0 flex-1 truncate font-semibold">
                                                    {s.exerciseName}
                                                    {s.variantName && <span className="font-normal opacity-70"> · {s.variantName}</span>}
                                                </span>
                                                <span className="shrink-0 tabular-nums opacity-70">
                                                    S{s.weekNumber}·D{s.dayNumber} · serie {s.setNumber}
                                                    {s.loadKg ? ` · ${s.loadKg} kg` : ''}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <p className="mb-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                                Nota <span className="font-normal normal-case opacity-70">(opcional)</span>
                            </p>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Cámara lateral, barra con cinta reflectante…"
                                className="w-full resize-none rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-xs text-ink outline-none focus:border-brand"
                            />
                        </div>
                    </div>

                    <footer className="flex shrink-0 justify-end gap-2 border-t border-subtle px-4 py-3">
                        <button
                            onClick={onClose}
                            className="rounded-field px-3 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={save}
                            disabled={saving || !athleteId || (isAssign && !assigned)}
                            className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            Guardar
                        </button>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
