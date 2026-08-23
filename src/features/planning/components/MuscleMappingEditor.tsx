import { useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Check, RotateCcw, Target, X } from 'lucide-react';
import { MUSCLE_GROUPS, classifyExercise, type MuscleGroup } from '../../../lib/volume/muscles';
import { transition, DURATION } from '../../../lib/motion';
import { cn } from '../../../lib/utils';

/**
 * QUÉ MÚSCULOS CUENTAN, Y CÓMO, EN ESTE EJERCICIO
 * =====================================================================
 *
 * El motor de volumen clasifica por reglas sobre el nombre del ejercicio.
 * Funciona para texto libre —que es lo que escribe el coach— y acierta la
 * mayoría de las veces, pero es un valor por defecto, no una verdad: un remo
 * con barra puede programarse buscando dorsal o buscando espalda alta, y el
 * volumen resultante es distinto según cuál sea la intención.
 *
 * POR QUÉ AQUÍ Y NO EN LA BIBLIOTECA
 *
 * La biblioteca ya admitía una anulación, pero es GLOBAL: cambiarla afecta a
 * todos los atletas y a todos los bloques a la vez. La decisión que toma un
 * entrenador es local —"en ESTE bloque, este remo es espalda alta"— así que
 * la anulación vive en la prescripción. La biblioteca sigue sirviendo de
 * valor por defecto para ese ejercicio.
 *
 * POR QUÉ TRES ESTADOS Y NO DOS
 *
 * Un músculo puede estar: directo, indirecto o fuera. Con dos casillas
 * ("directo sí/no", "indirecto sí/no") habría que impedir marcar las dos, que
 * es un estado imposible que la interfaz tendría que explicar. Un solo botón
 * que cicla — · directo · indirecto · — no admite estados imposibles.
 */

type Level = 'off' | 'direct' | 'indirect';

export interface MuscleMappingEditorProps {
    exerciseName: string;
    /** Anulación guardada. `null` = heredada. */
    primary: string[] | null | undefined;
    secondary: string[] | null | undefined;
    /** `null, null` restaura la clasificación heredada. */
    onSave: (primary: string[] | null, secondary: string[] | null) => void;
    onClose: () => void;
}

export function MuscleMappingEditor({
    exerciseName,
    primary,
    secondary,
    onSave,
    onClose,
}: MuscleMappingEditorProps) {
    /**
     * De dónde sale lo que se ve al abrir.
     *
     * Si hay anulación, esa. Si no, LA HEREDADA, no una pantalla en blanco:
     * el coach viene a corregir un reparto, no a inventarlo desde cero, y
     * enseñárselo vacío le obligaría a marcar los ocho músculos que ya
     * estaban bien para cambiar uno.
     */
    const inherited = useMemo(() => classifyExercise(exerciseName), [exerciseName]);

    const hasOverride = Array.isArray(primary);

    const [draft, setDraft] = useState<Record<string, Level>>(() => {
        const base: Record<string, Level> = {};
        const dir = hasOverride ? primary! : inherited.primary;
        const ind = hasOverride ? (secondary ?? []) : inherited.secondary;
        dir.forEach(m => { base[m] = 'direct'; });
        ind.forEach(m => { if (!base[m]) base[m] = 'indirect'; });
        return base;
    });

    const cycle = (muscle: MuscleGroup) => {
        setDraft(prev => {
            const current = prev[muscle] ?? 'off';
            const next: Level = current === 'off' ? 'direct' : current === 'direct' ? 'indirect' : 'off';
            const copy = { ...prev };
            if (next === 'off') delete copy[muscle];
            else copy[muscle] = next;
            return copy;
        });
    };

    const directCount = Object.values(draft).filter(v => v === 'direct').length;
    const indirectCount = Object.values(draft).filter(v => v === 'indirect').length;

    const save = () => {
        onSave(
            MUSCLE_GROUPS.filter(m => draft[m] === 'direct'),
            MUSCLE_GROUPS.filter(m => draft[m] === 'indirect')
        );
        onClose();
    };

    return (
        <AnimatePresence>
            <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition(DURATION.fast)}
                className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                onClick={onClose}
            >
                <m.div
                    initial={{ y: 24, scale: 0.98 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: 24, scale: 0.98 }}
                    transition={transition(DURATION.base)}
                    onClick={e => e.stopPropagation()}
                    className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-subtle bg-surface-raised shadow-overlay sm:rounded-card"
                >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 text-t-sm font-bold text-ink">
                                <Target size={15} className="shrink-0 text-brand" aria-hidden="true" />
                                Volumen de este ejercicio
                            </h3>
                            <p className="mt-0.5 truncate text-t-2xs text-ink-subtle">{exerciseName}</p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="shrink-0 rounded-field p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                        >
                            <X size={16} />
                        </button>
                    </header>

                    <p className="shrink-0 px-4 pt-3 text-t-2xs leading-relaxed text-ink-subtle">
                        Pulsa un músculo para recorrer{' '}
                        <span className="font-semibold text-brand">directo</span> →{' '}
                        <span className="font-semibold text-ink-muted">indirecto</span> → fuera.
                        {!hasOverride && ' Parte de la clasificación automática por el nombre.'}
                    </p>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="flex flex-wrap gap-1.5">
                            {MUSCLE_GROUPS.map(muscle => {
                                const level = draft[muscle] ?? 'off';
                                return (
                                    <button
                                        key={muscle}
                                        onClick={() => cycle(muscle)}
                                        aria-pressed={level !== 'off'}
                                        className={cn(
                                            'rounded-chip border px-2.5 py-1.5 text-t-2xs font-semibold transition-colors duration-fast ease-snap',
                                            level === 'direct' &&
                                                'border-transparent bg-brand text-brand-ink',
                                            level === 'indirect' &&
                                                'border-[var(--brand-line)] bg-[var(--brand-quiet)] text-brand',
                                            level === 'off' &&
                                                'border-[var(--border-default)] bg-surface-sunken text-ink-subtle hover:text-ink'
                                        )}
                                    >
                                        {muscle}
                                        {level === 'indirect' && (
                                            <span className="ml-1 opacity-70">ind.</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {directCount === 0 && (
                            <p className="mt-3 rounded-field bg-[var(--warning-quiet)] px-3 py-2 text-t-2xs text-warning">
                                Sin músculos directos, este ejercicio no aportará volumen a nadie.
                                Es lo correcto para una movilidad metida como ejercicio; para
                                cualquier otra cosa, probablemente falte marcar alguno.
                            </p>
                        )}
                    </div>

                    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-4 py-3">
                        <span className="text-t-2xs tabular-nums text-ink-subtle">
                            {directCount} directo{directCount === 1 ? '' : 's'} · {indirectCount} indirecto
                            {indirectCount === 1 ? '' : 's'}
                        </span>

                        <div className="flex items-center gap-2">
                            {/* Volver a lo heredado tiene que ser posible SIEMPRE.
                                Una anulación equivocada que no se pueda quitar es
                                peor que no tener anulación. */}
                            {hasOverride && (
                                <button
                                    onClick={() => { onSave(null, null); onClose(); }}
                                    className="flex items-center gap-1.5 rounded-field px-2.5 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                                >
                                    <RotateCcw size={13} aria-hidden="true" />
                                    Automático
                                </button>
                            )}
                            <button
                                onClick={save}
                                className="flex items-center gap-1.5 rounded-field bg-brand px-3.5 py-2 text-t-2xs font-bold text-brand-ink transition-colors duration-fast hover:opacity-90"
                            >
                                <Check size={13} aria-hidden="true" />
                                Guardar
                            </button>
                        </div>
                    </footer>
                </m.div>
            </m.div>
        </AnimatePresence>
    );
}
