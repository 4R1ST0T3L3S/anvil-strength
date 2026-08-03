import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gauge, MessageSquare, MessageSquareText } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TrainingSet, TargetMetric, SET_TYPES } from '../../../types/training';
import { writeQueue } from '../../../lib/offlineQueue';
import { DURATION, EASE_OUT, prefersReducedMotion } from '../../../lib/motion';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

/**
 * Cuánto se espera desde la última tecla antes de encolar el cambio.
 *
 * 500ms y no 800: la cola ya es tolerante a fallos, así que encolar de más
 * no cuesta nada, y medio segundo es el punto donde el guardado deja de
 * notarse como una espera. Cada casilla lleva su propio temporizador: con
 * uno compartido, escribir el RPE cancelaba el guardado pendiente del peso.
 */
const COMMIT_DELAY = 500;

interface LoggerSetRowProps {
    set: TrainingSet;
    /** Número visible de la serie dentro del ejercicio, empezando en 1. */
    displayIndex: number;
    /** Repeticiones que pautó el coach para esta serie. */
    targetReps: string | null;
    onStartTimer: (seconds: number) => void;
    defaultRestSeconds?: number | null;
    /**
     * La serie viene de un grupo sin separar ("4x8"). Antes de escribir hay
     * que convertirla en filas reales o los cuatro renglones compartirían el
     * mismo `id` y se pisarían entre ellos.
     */
    needsExpansion?: boolean;
    /**
     * Separa el grupo y devuelve el id de la fila que corresponde a ESTE
     * renglón. Devolver el id es lo que evita el fallo evidente: sin él, el
     * renglón seguiría escribiendo contra `set.id`, que tras la separación
     * es la primera serie del grupo — o sea, marcar la serie 3 volvería a
     * escribir en la 1, que es justo lo que veníamos a arreglar.
     */
    onExpand?: (groupIndex: number) => Promise<string | null>;
    /** Posición de este renglón dentro de su grupo, empezando en 0. */
    groupIndex?: number;
    /** Lo que ya está registrado se propaga al pie de la sesión. */
    onChange?: (setId: string, completed: boolean) => void;
    /**
     * Abre la ficha de velocidad de esta serie. Ausente cuando la serie
     * todavía forma parte de un grupo sin separar: los renglones comparten
     * fila y la medición se asignaría a todos.
     */
    onOpenVbt?: () => void;
}

export function LoggerSetRow({
    set,
    displayIndex,
    targetReps,
    onStartTimer,
    defaultRestSeconds,
    needsExpansion = false,
    onExpand,
    groupIndex = 0,
    onChange,
    onOpenVbt,
}: LoggerSetRowProps) {
    /**
     * Las repeticiones REALES ahora se escriben.
     *
     * Antes esta columna era de solo lectura y enseñaba lo que había pautado
     * el coach, y al marcar la serie como hecha se copiaba ese objetivo como
     * si fuera lo ejecutado. Es decir: si te pedían 10 y hacías 8, quedaba
     * escrito 10. Y ese 10 falso entraba después en el tonelaje, en el
     * historial de cargas y en la estimación de 1RM del atleta.
     *
     * Un AMRAP, una serie que se corta o un fallo técnico son información —
     * probablemente la más útil que genera una sesión— y no existían.
     */
    const [reps, setReps] = useState(set.actual_reps?.toString() ?? '');
    const [load, setLoad] = useState(set.actual_load?.toString() ?? '');
    const [rpe, setRpe] = useState(set.actual_rpe?.toString() ?? '');
    const [note, setNote] = useState(set.notes ?? '');
    const [noteOpen, setNoteOpen] = useState(false);

    /**
     * `is_completed` es una columna de la base de datos y manda sobre
     * cualquier deducción. Antes se adivinaba con `actual_reps && actual_load`,
     * lo que hacía imposible dar por hecha una serie corporal (sin kilos) y
     * daba por hecha una serie en la que solo se había tocado el peso.
     */
    const [done, setDone] = useState(
        set.is_completed ?? Boolean(set.actual_reps && set.actual_load)
    );

    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    /**
     * Id real contra el que escribe este renglón.
     *
     * Coincide con `set.id` salvo en un caso: un grupo "4x8" recién separado,
     * donde cada renglón pasa a tener su propia fila. Se guarda en una `ref`
     * y no en el estado porque `commit` la lee justo después de un `await` y
     * necesita el valor de AHORA, no el del render en el que se creó.
     */
    const targetId = useRef(set.id);
    const expanding = useRef<Promise<string | null> | null>(null);
    const reduced = prefersReducedMotion();

    // Si el padre re-renderiza con otra fila (tras separar el grupo), el
    // destino de las escrituras se mueve con ella.
    useEffect(() => { targetId.current = set.id; }, [set.id]);

    useEffect(() => {
        const pending = timers.current;
        return () => { Object.values(pending).forEach(clearTimeout); };
    }, []);

    /**
     * Escribe un cambio.
     *
     * Optimista siempre: el estado local ya se ha pintado antes de llegar
     * aquí y esto solo se ocupa de que acabe subiendo. La cola sobrevive a
     * quedarse sin cobertura y a cerrar la app, que en un gimnasio es el
     * caso normal y no el raro. Ver src/lib/offlineQueue.ts.
     */
    const commit = async (patch: Partial<TrainingSet>): Promise<string> => {
        if (needsExpansion && onExpand) {
            // La separación se pide siempre al padre, que la desduplica: los
            // cuatro renglones de un "4x8" comparten una sola llamada. Aquí
            // solo se recuerda la promesa para no volver a pedirla desde este
            // mismo renglón mientras está en vuelo.
            expanding.current ??= onExpand(groupIndex);
            const realId = await expanding.current;
            if (realId) targetId.current = realId;
        }
        writeQueue.enqueue('training_sets', targetId.current, patch as Record<string, unknown>);
        // Devuelve la fila contra la que se ha escrito DE VERDAD. Quien avisa
        // al resto de la pantalla necesita ese id y no `set.id`: en un grupo
        // sin separar los cuatro renglones comparten `set.id`, y decir "esta
        // está hecha" con él daría por hechas las cuatro.
        return targetId.current;
    };

    /** Guarda pasado `COMMIT_DELAY` sin escribir, con un reloj por casilla. */
    const commitDebounced = (field: string, patch: Partial<TrainingSet>) => {
        clearTimeout(timers.current[field]);
        timers.current[field] = setTimeout(() => { void commit(patch); }, COMMIT_DELAY);
    };

    const toNumber = (value: string): number | null => {
        const parsed = Number.parseFloat(value.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    };

    /**
     * Marca o desmarca la serie.
     *
     * EL AVISO AL RESTO DE LA PANTALLA VA DESPUÉS DE ESCRIBIR, no antes.
     *
     * Antes se llamaba a `onChange(set.id, …)` de forma síncrona, y en un
     * "4x8" todavía sin separar los cuatro renglones comparten `set.id`: el
     * contador del día daba las cuatro series por hechas en cuanto se marcaba
     * la primera. En press banca, que es donde el coach pauta agrupado, marcar
     * una serie completaba el ejercicio entero.
     *
     * `commit` devuelve la fila REAL —separando el grupo si hacía falta—, así
     * que el aviso llega con el id que corresponde a ESTE renglón.
     */
    const toggleDone = () => {
        const next = !done;
        setDone(next);

        if (!next) {
            void commit({ is_completed: false }).then(id => onChange?.(id, false));
            return;
        }

        /**
         * Al marcar, se rellena lo que falte con lo pautado — pero SOLO lo
         * que se puede deducir sin inventar.
         *
         * Las repeticiones sí: si el atleta marca sin tocar nada, hizo las
         * que le pedían. El peso solo si el coach pautó en KILOS: copiar el
         * objetivo sin mirar la unidad grababa 0,45 kg en una serie pautada
         * a 0,45 m/s, o 20 kg en una pautada al 20% de pérdida de velocidad.
         */
        const metric: TargetMetric = set.target_metric ?? 'kg';
        const repsValue = toNumber(reps) ?? toNumber(targetReps ?? '');
        const loadValue =
            toNumber(load) ??
            (metric === 'kg' && set.target_load != null ? Number(set.target_load) : null);

        if (repsValue !== null && !reps) setReps(String(repsValue));
        if (loadValue !== null && !load) setLoad(String(loadValue));

        void commit({
            is_completed: true,
            actual_reps: repsValue,
            actual_load: loadValue,
            actual_rpe: toNumber(rpe),
        }).then(id => onChange?.(id, true));

        const rest = set.rest_seconds || defaultRestSeconds;
        if (rest && rest > 0) onStartTimer(rest);
    };

    // Qué pautó el coach, para enseñarlo sin ocupar la casilla del atleta.
    const metric: TargetMetric = set.target_metric ?? 'kg';
    const prescribedLoad =
        metric === 'kg' && set.target_load != null ? String(set.target_load) : null;
    const otherMetricTarget =
        metric !== 'kg'
            ? (metric === 'rpe' ? set.target_rpe : set.target_load != null ? String(set.target_load) : null)
            : null;

    const hasNote = note.trim().length > 0;
    const setType = SET_TYPES.find(t => t.key === set.set_type) ?? null;

    return (
        <div className={cn('transition-colors duration-fast', done && 'bg-[var(--success-quiet)]')}>
            {/* Rejilla medida sobre un móvil de 375px, que es el estrecho de
                verdad: 317px de contenido tras los márgenes.

                Los dos botones eran de 28 y 32px. El mínimo para un pulgar son
                44px, y esta pantalla se usa DE PIE, entre series, con el móvil
                moviéndose y a veces con las manos sudadas. Cada fallo de
                pulsación aquí son tres segundos y una serie sin marcar.

                El ancho sale de los botones hacia dentro: 44+40+36 fijos, y lo
                que sobra se reparte entre repeticiones y kilos, que son las
                dos casillas donde de verdad se escribe. */}
            <div className="grid grid-cols-[1rem_1fr_1fr_2.75rem_2.25rem_2.75rem] items-center gap-1 px-2.5 py-2 sm:gap-1.5 sm:px-3">
                {/* Número de serie */}
                <span
                    className={cn(
                        'text-t-xs font-extrabold tabular-nums',
                        done ? 'text-success' : 'text-ink-faint'
                    )}
                >
                    {displayIndex}
                </span>

                {/* REPETICIONES REALES — editable. El objetivo es el marcador
                    de posición, así que la casilla vacía ya dice qué toca. */}
                <SetInput
                    value={reps}
                    onChange={(value) => {
                        setReps(value);
                        commitDebounced('reps', { actual_reps: toNumber(value) });
                    }}
                    placeholder={targetReps ?? 'reps'}
                    ariaLabel={`Repeticiones hechas en la serie ${displayIndex}`}
                    filled={Boolean(reps)}
                    step="1"
                />

                {/* PESO MOVIDO — siempre kilos, lo escribe el atleta. Cuando la
                    prescripción no va en kilos (RPE, RIR, velocidad), el
                    objetivo se enseña encima en pequeño y la casilla queda
                    libre para los kilos de verdad. */}
                <div>
                    {otherMetricTarget && (
                        <span className="block text-center text-[9px] font-bold uppercase leading-none text-ink-subtle">
                            {otherMetricTarget}
                        </span>
                    )}
                    <SetInput
                        value={load}
                        onChange={(value) => {
                            setLoad(value);
                            commitDebounced('load', { actual_load: toNumber(value) });
                        }}
                        placeholder={prescribedLoad ?? 'kg'}
                        ariaLabel={`Peso movido en la serie ${displayIndex}`}
                        filled={Boolean(load)}
                        step="0.5"
                    />
                </div>

                {/* RPE real */}
                <SetInput
                    value={rpe}
                    onChange={(value) => {
                        setRpe(value);
                        commitDebounced('rpe', { actual_rpe: toNumber(value) });
                    }}
                    placeholder={set.target_rpe ?? '–'}
                    ariaLabel={`RPE de la serie ${displayIndex}`}
                    filled={Boolean(rpe)}
                    step="0.5"
                    tone="brand"
                />

                {/* NOTA DE LA SERIE.
                    Un icono y no una columna de texto: la nota es la excepción
                    (una serie de cada veinte la lleva) y darle ancho fijo le
                    robaría sitio a las tres casillas que se usan siempre. El
                    icono cambia de forma cuando hay algo escrito, así que se
                    ve de un vistazo qué series tienen nota sin abrirlas. */}
                <button
                    onClick={() => setNoteOpen(v => !v)}
                    aria-expanded={noteOpen}
                    aria-label={hasNote ? `Ver la nota de la serie ${displayIndex}` : `Añadir nota a la serie ${displayIndex}`}
                    className={cn(
                        // 36x44 de zona sensible (40 visibles + 2px arriba y
                        // abajo con el pseudo-elemento). Se queda en 36 de
                        // ANCHO a propósito: llegar a 44 obligaría a robarle
                        // 8px a la casilla de kilos, que en un móvil de 320px
                        // ya va justa. Es una acción secundaria —una serie de
                        // cada veinte lleva nota— al lado de un objetivo
                        // primario de 44 completos, así que el reparto es ese.
                        'relative flex h-10 w-9 items-center justify-center rounded-field transition-colors duration-fast ease-snap',
                        'before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[""]',
                        hasNote
                            ? 'text-brand hover:bg-[var(--brand-quiet)]'
                            : 'text-ink-faint hover:bg-surface-overlay hover:text-ink-muted',
                        noteOpen && 'bg-surface-overlay text-ink'
                    )}
                >
                    {hasNote
                        ? <MessageSquareText size={16} aria-hidden="true" />
                        : <MessageSquare size={16} aria-hidden="true" />}
                </button>

                {/* Hecho */}
                <button
                    onClick={toggleDone}
                    aria-pressed={done}
                    aria-label={`Marcar la serie ${displayIndex} como hecha`}
                    className={cn(
                        // El control más pulsado de toda la aplicación: 44px
                        // de alto reales y la zona sensible estirada hasta el
                        // borde derecho de la fila, para que valga cualquier
                        // toque en esa esquina y no solo el que acierta en el
                        // círculo.
                        'relative flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-fast ease-snap active:scale-[0.92]',
                        'before:absolute before:-inset-y-1 before:-left-1 before:-right-2.5 before:content-[""]',
                        done
                            ? 'bg-success text-[var(--surface-sunken)]'
                            : 'border border-[var(--border-default)] bg-surface-overlay text-ink-faint hover:text-ink'
                    )}
                >
                    <Check size={17} strokeWidth={3.5} aria-hidden="true" />
                </button>
            </div>

            {/* TÉCNICA DE INTENSIDAD.
                Debajo de la fila y no dentro: la rejilla ya va justa en un
                móvil de 320px, y meter aquí un chip obligaría a robarle ancho
                a las casillas de repeticiones o kilos, que se usan siempre.
                Esto aparece en una serie de cada veinte.

                Alineado con la primera casilla, no con el número de serie: se
                lee como una nota al pie de ESA serie. */}
            {setType && (
                <div className="flex items-baseline gap-2 px-2.5 pb-2 pl-[1.75rem] sm:px-3 sm:pl-[2rem]">
                    <span className="shrink-0 rounded-chip bg-[var(--warning-quiet)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-warning">
                        {setType.short}
                    </span>
                    <span className="min-w-0 text-t-2xs leading-snug text-ink-subtle">
                        {set.set_detail?.trim() || setType.hint}
                    </span>
                </div>
            )}

            {/* VELOCIDAD DE LA SERIE.
                Debajo de la fila y no dentro, por lo mismo que la técnica: la
                rejilla ya va justa en un móvil de 320px. Cuando hay medición se
                enseña el número; cuando no, un botón discreto para añadirla.
                Solo aparece si el ejercicio admite medición (`onOpenVbt`). */}
            {onOpenVbt && (
                <div className="px-2.5 pb-1.5 pl-[1.75rem] sm:px-3 sm:pl-[2rem]">
                    <button
                        onClick={onOpenVbt}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-chip px-1.5 py-0.5 text-[10px] font-semibold transition-colors duration-fast ease-snap',
                            set.vbt_mean_velocity != null
                                ? 'bg-[var(--info-quiet)] text-info'
                                : 'text-ink-faint hover:bg-surface-overlay hover:text-ink-muted'
                        )}
                    >
                        <Gauge size={11} aria-hidden="true" />
                        {set.vbt_mean_velocity != null ? (
                            <>
                                <span className="tabular-nums">{set.vbt_mean_velocity}</span> m/s
                                {set.vbt_velocity_loss != null && (
                                    <span className="opacity-70">· −{set.vbt_velocity_loss}%</span>
                                )}
                            </>
                        ) : (
                            'Añadir velocidad'
                        )}
                    </button>
                </div>
            )}

            {/* La nota se despliega DEBAJO de su serie, no en un modal: sigue
                estando claro a qué serie pertenece y no se pierde el sitio en
                la lista. La altura se anima porque un salto seco de 60px
                desplaza las series de abajo sin avisar. */}
            <AnimatePresence initial={false}>
                {noteOpen && (
                    <motion.div
                        initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduced ? 0.01 : DURATION.fast, ease: EASE_OUT }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pl-[2.25rem]">
                            <textarea
                                value={note}
                                autoFocus
                                rows={2}
                                onChange={(e) => {
                                    setNote(e.target.value);
                                    commitDebounced('note', { notes: e.target.value || null });
                                }}
                                placeholder="Cómo ha ido esta serie…"
                                className="w-full resize-none rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-t-sm leading-relaxed text-ink outline-none transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/**
 * Casilla numérica de una serie.
 *
 * `inputMode="decimal"` para que el móvil abra el teclado numérico: sin él
 * el atleta tiene que cambiar de teclado en cada serie. `type="number"` y no
 * `text` para las flechas de escritorio, pero sin spinner visible, que en
 * una fila de 60px de alto no cabe y se pulsa sin querer.
 */
function SetInput({
    value,
    onChange,
    placeholder,
    ariaLabel,
    filled,
    step,
    tone = 'neutral',
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
    filled: boolean;
    step: string;
    tone?: 'neutral' | 'brand';
}) {
    return (
        <input
            type="number"
            inputMode="decimal"
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            // Al enfocar se selecciona lo que hay: corregir un peso es
            // reescribirlo entero, no editar un dígito en medio.
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
                // `h-11` (44px) y no un `py`: la altura fija hace que las tres
                // casillas y los dos botones de la fila midan lo mismo, que es
                // lo que hace que la fila se lea como una sola pieza en vez de
                // como cinco controles de alturas parecidas.
                'h-11 w-full rounded-field border bg-surface-sunken px-0 text-center text-t-sm font-extrabold tabular-nums outline-none transition-colors duration-fast [appearance:textfield] focus:border-brand [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                filled
                    ? tone === 'brand'
                        ? 'border-[var(--brand-line)] text-brand'
                        : 'border-[var(--border-strong)] text-ink'
                    : 'border-subtle text-ink-muted placeholder:font-semibold placeholder:text-ink-subtle'
            )}
        />
    );
}
