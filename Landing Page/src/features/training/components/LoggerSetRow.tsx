import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Check, Gauge, MessageSquare, MessageSquareText } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TrainingSet, TargetMetric, SET_TYPES } from '../../../types/training';
import { writeQueue } from '../../../lib/offlineQueue';
import { rpeFromTarget } from '../../../lib/stats/executionLog';
import { DURATION, EASE_OUT, prefersReducedMotion } from '../../../lib/motion';
import { toDisplay, fromInput } from '../../../lib/units';
import type { WeightUnit } from '../../../lib/prefs/contract';

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
    /**
     * Unidad del atleta (src/lib/prefs/contract.ts). SOLO afecta a lo que se
     * ENSEÑA y a lo que se ESCRIBE en esta casilla — `actual_load` y
     * `target_load` siguen viajando y guardándose en kilos siempre; convertir
     * el almacenamiento invalidaría el histórico y las métricas de VBT, que
     * dependen de la masa en kg. Por defecto 'kg': el comportamiento de
     * siempre para quien no ha tocado sus preferencias.
     */
    unit?: WeightUnit;
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
    unit = 'kg',
}: LoggerSetRowProps) {
    /** kg guardado → texto en la unidad del atleta, para pintar. */
    const kgToDisplayText = (kg: number | null | undefined): string => {
        const shown = toDisplay(kg, unit);
        return shown != null ? String(Math.round(shown * 100) / 100) : '';
    };
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
    // Guardado en kg siempre; se muestra en la unidad del atleta.
    const [load, setLoad] = useState(() => kgToDisplayText(set.actual_load));
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
    const commit = async (patch: Partial<TrainingSet>): Promise<string | null> => {
        if (needsExpansion && onExpand) {
            // La separación se pide siempre al padre, que la desduplica: los
            // cuatro renglones de un "4x8" comparten una sola llamada. Aquí
            // solo se recuerda la promesa para no volver a pedirla desde este
            // mismo renglón mientras está en vuelo.
            expanding.current ??= onExpand(groupIndex);
            const realId = await expanding.current;

            /**
             * SIN FILA PROPIA NO SE ESCRIBE. Esto es lo que hacía que de un
             * "4x8" solo se guardara la última serie.
             *
             * Antes, si la separación fallaba, este renglón seguía escribiendo
             * contra `targetId.current`, que en un grupo sin separar es el id
             * COMPARTIDO por los cuatro: las cuatro series se machacaban entre
             * sí en la misma fila y ganaba la última que se tocara. Y la
             * separación fallaba SIEMPRE para el atleta, porque se intentaba
             * desde el navegador contra una tabla donde no tiene permiso de
             * INSERT (ver database/expand_grouped_set.sql).
             *
             * Ahora se aborta y se deja reintentar. Perder una escritura y
             * decirlo es reparable; escribirla encima de otra serie no.
             */
            if (!realId) {
                expanding.current = null;
                return null;
            }

            targetId.current = realId;
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

        // Si la escritura no llega a hacerse, la marca vuelve atrás. Una
        // serie que se ve en verde y no está guardada es peor que una sin
        // marcar: el atleta no la vuelve a tocar.
        const settle = (completed: boolean) => (id: string | null) => {
            if (id) onChange?.(id, completed);
            else setDone(!completed);
        };

        if (!next) {
            void commit({ is_completed: false }).then(settle(false));
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
        // `load` está en la unidad del atleta; se convierte a kg ANTES de
        // mezclarlo con `target_load`, que siempre viaja en kg desde la base.
        const loadValueKg =
            fromInput(toNumber(load), unit) ??
            (metric === 'kg' && set.target_load != null ? Number(set.target_load) : null);

        if (repsValue !== null && !reps) setReps(String(repsValue));
        if (loadValueKg !== null && !load) setLoad(kgToDisplayText(loadValueKg));

        void commit({
            is_completed: true,
            actual_reps: repsValue,
            actual_load: loadValueKg,
            actual_rpe: toNumber(rpe),
        }).then(settle(true));

        const rest = set.rest_seconds || defaultRestSeconds;
        if (rest && rest > 0) onStartTimer(rest);
    };

    /**
     * LO QUE PAUTÓ EL COACH, SIEMPRE VISIBLE.
     *
     * Antes la prescripción vivía únicamente en el `placeholder` de cada
     * casilla, así que DESAPARECÍA en cuanto el atleta escribía encima: en el
     * momento exacto en que la comparación importa —"me pedían 8 a 100, he
     * hecho 6"— el plan ya no estaba en pantalla. Y quien no ve el objetivo
     * no sabe si se está desviando.
     *
     * Ahora el objetivo es un renglón fijo encima de cada casilla y el
     * `placeholder` pasa a ser la unidad. Plan arriba, ejecución abajo, en la
     * misma columna: se leen los dos de un vistazo.
     */
    const metric: TargetMetric = set.target_metric ?? 'kg';
    // Solo se convierte cuando lo pautado es de verdad un peso: un target al
    // 20% de pérdida de velocidad o en RPE no es una cifra en kg y no debe
    // pasar por la conversión de unidad.
    const targetLoadText = metric === 'kg'
        ? (kgToDisplayText(set.target_load) || null)
        : (set.target_load != null ? String(set.target_load) : null);
    // La columna de kilos enseña el objetivo del coach en SU unidad: si pautó
    // al 20% de pérdida de velocidad, ahí pone 20, no 20 kg.
    const loadTarget = metric === 'kg'
        ? targetLoadText
        : (metric === 'rpe' ? set.target_rpe : targetLoadText);
    const rpeTarget = set.target_rpe;

    // El renglón de objetivos solo existe si hay algo que poner. Cuando lo
    // hay, se reserva en las tres columnas aunque alguna esté vacía: si no,
    // las casillas de la misma fila quedarían a distinta altura.
    const hasTargets = Boolean(targetReps || loadTarget || rpeTarget);

    /**
     * DESVIACIÓN DEL RPE, en el momento de escribirlo.
     *
     * Es la comparación con la que el entrenador decide la semana siguiente, y
     * hasta ahora solo existía en su panel: el atleta escribía un 7 donde
     * ponía 8 sin que nada se lo señalara, y por tanto sin motivo para pararse
     * a pensar si el número que acababa de poner era el que quería poner.
     *
     * Se lee del BORRADOR (`rpe`) y no de la fila guardada: el guardado va con
     * retardo, y esperar a que confirme dejaría el dato medio segundo por
     * detrás de lo que se está tecleando.
     *
     * Un rango pautado ("7-8") se compara por su extremo ALTO, igual que en el
     * análisis del entrenador — de ahí que la regla se importe de allí en vez
     * de reescribirse aquí (ver src/lib/stats/executionLog.ts).
     */
    const rpeDelta = (() => {
        const target = rpeFromTarget(rpeTarget);
        const actual = toNumber(rpe);
        if (target === null || actual === null) return null;

        const delta = Math.round((actual - target) * 10) / 10;
        // Medio punto es la resolución real del RPE: marcar 0,5 como
        // desviación llenaría la columna de avisos que no significan nada.
        if (Math.abs(delta) < 0.75) return null;

        return {
            text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
            tone: delta > 0 ? ('over' as const) : ('under' as const),
        };
    })();

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
                        done ? 'text-success' : 'text-ink-subtle'
                    )}
                >
                    {displayIndex}
                </span>

                {/* REPETICIONES REALES — editable. Lo pautado es el placeholder:
                    grande y translúcido dentro de la propia casilla, no un
                    renglón aparte. Desaparece solo en cuanto se escribe. */}
                <SetInput
                    value={reps}
                    onChange={(value) => {
                        setReps(value);
                        commitDebounced('reps', { actual_reps: toNumber(value) });
                    }}
                    placeholder={targetReps || 'reps'}
                    bigPlaceholder={hasTargets && Boolean(targetReps)}
                    ariaLabel={`Repeticiones hechas en la serie ${displayIndex}${targetReps ? ` (pautadas: ${targetReps})` : ''}`}
                    filled={Boolean(reps)}
                    step="1"
                />

                {/* PESO MOVIDO — siempre kilos, lo escribe el atleta. Cuando la
                    prescripción no va en kilos (RPE, RIR, velocidad), lo que se
                    enseña de fondo es ese objetivo y la casilla queda libre para
                    los kilos de verdad. */}
                <SetInput
                    value={load}
                    onChange={(value) => {
                        setLoad(value);
                        // Lo que escribe el atleta está en SU unidad;
                        // se convierte a kg justo antes de encolar el guardado.
                        commitDebounced('load', { actual_load: fromInput(toNumber(value), unit) });
                    }}
                    placeholder={loadTarget || unit}
                    bigPlaceholder={hasTargets && Boolean(loadTarget)}
                    ariaLabel={`Peso movido en la serie ${displayIndex}${loadTarget ? ` (pautado: ${loadTarget})` : ''}`}
                    filled={Boolean(load)}
                    step={unit === 'lb' ? '1' : '0.5'}
                />

                {/* RPE real, con la DESVIACIÓN sobre lo pautado de fondo.
                    Es la comparación con la que se decide la semana siguiente,
                    y hasta ahora había que hacerla de cabeza serie a serie. El
                    delta sustituye al objetivo pautado en cuanto hay con qué
                    compararlo — "8" pasa a "+1" en rojo/verde de fondo. */}
                <SetInput
                    value={rpe}
                    onChange={(value) => {
                        setRpe(value);
                        commitDebounced('rpe', { actual_rpe: toNumber(value) });
                    }}
                    placeholder={(rpeDelta ? rpeDelta.text : rpeTarget) || '–'}
                    bigPlaceholder={hasTargets && Boolean(rpeDelta ? rpeDelta.text : rpeTarget)}
                    placeholderTone={rpeDelta?.tone}
                    ariaLabel={`RPE de la serie ${displayIndex}${rpeTarget ? ` (pautado: ${rpeTarget})` : ''}`}
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
                            ? 'text-brand-text hover:bg-[var(--brand-quiet)]'
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
                            : 'border border-[var(--border-default)] bg-surface-overlay text-ink-subtle hover:text-ink'
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
                    <span className="shrink-0 rounded-chip bg-[var(--warning-quiet)] px-1.5 py-0.5 text-t-2xs font-black uppercase tracking-wider text-warning">
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
                            'inline-flex items-center gap-1.5 rounded-chip px-1.5 py-0.5 text-t-2xs font-semibold transition-colors duration-fast ease-snap',
                            set.vbt_mean_velocity != null
                                ? 'bg-[var(--info-quiet)] text-info'
                                : 'text-ink-subtle hover:bg-surface-overlay hover:text-ink-muted'
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
                    <m.div
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
                                // text-t-base (16px): por debajo, iOS hace zoom al enfocar.
                                className="w-full resize-none rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-t-base leading-relaxed text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                            />
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/**
 * Casilla numérica de una serie.
 *
 * `inputMode="decimal"` para que el móvil abra el teclado numérico: sin él
 * el atleta tiene que cambiar de teclado en cada serie. `type="number"
                            inputMode="decimal"` y no
 * `text` para las flechas de escritorio, pero sin spinner visible, que en
 * una fila de 60px de alto no cabe y se pulsa sin querer.
 *
 * EL OBJETIVO VIVE DENTRO DE LA CASILLA, NO ENCIMA.
 *
 * Antes lo pautado se pintaba en un renglón (`TargetLabel`) por encima de
 * cada casilla, chico y siempre presente. Ahora es el `placeholder` del
 * propio campo — grande y translúcido — que es lo que hace que DESAPAREZCA
 * en cuanto el atleta escribe encima: el placeholder de un input nunca
 * convive con un valor. Es el mismo comportamiento de siempre (mostrar el
 * plan hasta que hay algo real que enseñar), con menos elementos en pantalla
 * y el número donde se escribe, no en una fila aparte.
 */
function SetInput({
    value,
    onChange,
    placeholder,
    ariaLabel,
    filled,
    step,
    tone = 'neutral',
    bigPlaceholder = false,
    placeholderTone,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
    filled: boolean;
    step: string;
    tone?: 'neutral' | 'brand';
    /** El placeholder es el OBJETIVO pautado, no una pista de unidad: se pinta grande y translúcido. */
    bigPlaceholder?: boolean;
    /** Color del placeholder grande cuando es una desviación de RPE. */
    placeholderTone?: 'over' | 'under';
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
                //
                // `text-t-base` (16px) y NO `text-t-sm` (14px): por debajo de
                // 16px, iOS Safari hace zoom automático al enfocar un campo, y
                // en una fila de series eso significa que la pantalla entera
                // da un salto y se descoloca cada vez que el atleta toca una
                // casilla. Es la mitad de por qué el registro se sentía "mal
                // puesto" en móvil.
                'h-11 w-full rounded-field border bg-surface-sunken px-0 text-center text-t-base font-extrabold tabular-nums transition-colors duration-fast [appearance:textfield] focus:border-brand [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                filled
                    ? tone === 'brand'
                        ? 'border-[var(--brand-line)] text-brand-text'
                        : 'border-[var(--border-strong)] text-ink'
                    : 'border-subtle text-ink-muted',
                !filled && bigPlaceholder
                    ? cn(
                        'placeholder:text-t-2xl placeholder:font-black placeholder:tabular-nums',
                        placeholderTone === 'over'
                            ? 'placeholder:text-warning/45'
                            : placeholderTone === 'under'
                                ? 'placeholder:text-success/45'
                                : 'placeholder:text-ink/25'
                    )
                    : 'placeholder:font-semibold placeholder:text-ink-subtle'
            )}
        />
    );
}
