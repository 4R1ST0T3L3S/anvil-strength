import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Camera, Check, Dumbbell, Pencil } from 'lucide-react';
import {
    BAR_TYPES,
    DEFAULT_SETUP,
    EXERCISE_LABEL,
    VIDEO_REQUIREMENTS,
    barTypeById,
    canAnalyse,
    setupCaveats,
    validateSetup,
    type ExerciseType,
    type PwrSetup,
} from '../../../../lib/cv/pwrSetup';

/**
 * ANVIL STRENGTH — EL PASO PREVIO AL ANÁLISIS (Fase 3)
 * =====================================================================
 *
 * Pregunta lo que hay que saber ANTES de mirar el vídeo. Las reglas —qué carga
 * es imposible, qué barra invalida qué métrica— viven en `lib/cv/pwrSetup.ts`,
 * no aquí: aquí solo se pintan.
 *
 * POR QUÉ ES UNA PANTALLA APARTE Y NO UNOS CAMPOS ENCIMA DEL VÍDEO
 *
 * Porque tiene que **bloquear**. Unos campos al lado del botón de subir son
 * unos campos que se saltan, y saltárselos es volver a los 100 kg por defecto
 * que esta fase existe para quitar. Cuesta un paso, y ese paso se cobra una vez
 * por vídeo mientras que el error se paga en cada cifra de fuerza, potencia y
 * 1RM que salga de él.
 */

// =====================================================================
// PIEZAS
// =====================================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <label className="block text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                {label}
            </label>
            {hint && <p className="mt-0.5 text-t-2xs leading-relaxed text-ink-faint">{hint}</p>}
            <div className="mt-1.5">{children}</div>
        </div>
    );
}

// =====================================================================
// EL FORMULARIO
// =====================================================================

export interface AnalysisSetupProps {
    /** Lo que ya se sabe. Al entrar desde una serie, casi todo. */
    initial?: Partial<PwrSetup>;
    /**
     * De dónde sale lo precargado, para poder decirlo.
     *
     * Un campo que aparece relleno sin explicación se corrige a ciegas o se
     * acepta a ciegas; sabiendo que viene de la serie pautada, se comprueba.
     */
    prefillNote?: string;
    onReady: (setup: PwrSetup) => void;
    /** Texto del botón. Cambia entre "empezar" y "guardar el cambio". */
    submitLabel?: string;
    onCancel?: () => void;
}

export function AnalysisSetup({ initial, prefillNote, onReady, submitLabel = 'Continuar al vídeo', onCancel }: AnalysisSetupProps) {
    const [setup, setSetup] = useState<PwrSetup>({ ...DEFAULT_SETUP, ...initial });
    /** No se enseñan errores hasta que se intenta pasar. */
    const [attempted, setAttempted] = useState(false);

    const issues = useMemo(() => validateSetup(setup), [setup]);
    const caveats = useMemo(() => setupCaveats(setup), [setup]);
    const ready = canAnalyse(setup);

    const errorFor = (field: string) =>
        attempted ? issues.find(i => i.field === field && i.level === 'error') : undefined;
    const warnings = issues.filter(i => i.level === 'warning');

    const patch = (p: Partial<PwrSetup>) => setSetup(s => ({ ...s, ...p }));

    const submit = () => {
        setAttempted(true);
        if (ready) onReady(setup);
    };

    const bar = barTypeById(setup.barTypeId);

    return (
        <div className="mx-auto w-full max-w-2xl space-y-4">
            <div>
                <h4 className="text-t-sm font-bold text-ink">Antes de analizar</h4>
                <p className="mt-1 text-t-2xs leading-relaxed text-ink-subtle">
                    El recorrido y la velocidad salen del vídeo. La fuerza, la potencia y el 1RM
                    estimado se calculan multiplicando por la carga, así que salen de aquí.
                </p>
                {prefillNote && (
                    <p className="mt-1.5 text-t-2xs leading-relaxed text-ink-faint">{prefillNote}</p>
                )}
            </div>

            <div className="space-y-4 rounded-card border border-subtle bg-surface-raised p-4">
                {/* ---------------------------------------------------- */}
                {/* MOVIMIENTO                                            */}
                {/* ---------------------------------------------------- */}
                <Field
                    label="Movimiento"
                    hint="Cada levantamiento termina a una velocidad distinta, y de ahí sale el 1RM estimado."
                >
                    <div className="grid grid-cols-3 gap-2">
                        {(Object.keys(EXERCISE_LABEL) as ExerciseType[]).map(key => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => patch({ exerciseType: key })}
                                aria-pressed={setup.exerciseType === key}
                                className={`rounded-field border px-3 py-2 text-t-2xs font-semibold transition-colors duration-fast ${
 setup.exerciseType === key
 ? 'border-brand-line bg-brand-quiet text-ink'
 : 'border-subtle bg-surface-sunken text-ink-muted hover:text-ink'
 }`}
                            >
                                {EXERCISE_LABEL[key]}
                            </button>
                        ))}
                    </div>
                </Field>

                {/* ---------------------------------------------------- */}
                {/* CARGA                                                 */}
                {/* ---------------------------------------------------- */}
                <Field label="Carga total en la barra" hint="Barra incluida, en kilos.">
                    <div className="flex items-center gap-2">
                        <div className="flex overflow-hidden rounded-field border border-subtle bg-surface-sunken">
                            <button
                                type="button"
                                onClick={() => patch({ loadKg: Math.max(0, setup.loadKg - 5) })}
                                aria-label="Restar 5 kg"
                                className="px-3 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                            >
                                −
                            </button>
                            {/* `text-base` en el móvil: por debajo de 16 px iOS
                                hace zoom al enfocar el campo y descoloca la
                                pantalla entera. */}
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={2.5}
                                value={setup.loadKg || ''}
                                placeholder="0"
                                onChange={e => patch({ loadKg: Number(e.target.value) })}
                                className="w-24 bg-transparent text-center text-base font-bold tabular-nums text-ink sm:text-t-sm"
                            />
                            <button
                                type="button"
                                onClick={() => patch({ loadKg: setup.loadKg + 5 })}
                                aria-label="Sumar 5 kg"
                                className="px-3 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                            >
                                +
                            </button>
                        </div>
                        <span className="text-t-2xs font-semibold text-ink-subtle">kg</span>
                    </div>
                    {errorFor('loadKg') && (
                        <p className="mt-1.5 text-t-2xs font-semibold leading-relaxed text-danger">
                            {errorFor('loadKg')!.message}
                        </p>
                    )}
                </Field>

                {/* ---------------------------------------------------- */}
                {/* BARRA                                                 */}
                {/* ---------------------------------------------------- */}
                <Field
                    label="Barra"
                    hint="Sirve para comprobar que la carga es posible y para saber si el disco viaja igual que la barra."
                >
                    <select
                        value={setup.barTypeId}
                        onChange={e => patch({ barTypeId: e.target.value })}
                        className="w-full rounded-field border border-subtle bg-surface-sunken px-3 py-2 text-base font-semibold text-ink transition-colors duration-fast focus:border-brand-line sm:text-t-xs"
                    >
                        {BAR_TYPES.map(b => (
                            <option key={b.id} value={b.id}>
                                {b.label}
                            </option>
                        ))}
                    </select>
                    {bar.massKg !== null && (
                        <p className="mt-1 flex items-center gap-1.5 text-t-2xs text-ink-faint">
                            <Dumbbell size={12} aria-hidden="true" />
                            Pesa {bar.massKg} kg vacía.
                        </p>
                    )}
                </Field>

                {/* ---------------------------------------------------- */}
                {/* EL VÍDEO                                              */}
                {/* ---------------------------------------------------- */}
                <div>
                    <p className="flex items-center gap-1.5 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        <Camera size={12} aria-hidden="true" />
                        El vídeo
                    </p>
                    <ul className="mt-2 space-y-1.5">
                        {VIDEO_REQUIREMENTS.map(r => (
                            <li key={r.title} className="flex gap-2">
                                <Check size={13} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
                                <span className="min-w-0 text-t-2xs leading-relaxed text-ink-muted">
                                    {r.title}
                                    <span className="block text-ink-faint">{r.why}</span>
                                </span>
                            </li>
                        ))}
                    </ul>

                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-field bg-surface-sunken p-3">
                        <input
                            type="checkbox"
                            checked={setup.lateralConfirmed}
                            onChange={e => patch({ lateralConfirmed: e.target.checked })}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]"
                        />
                        <span className="text-t-2xs font-semibold leading-relaxed text-ink-muted">
                            El vídeo que voy a analizar cumple las cuatro condiciones.
                        </span>
                    </label>
                    {errorFor('lateralConfirmed') && (
                        <p className="mt-1.5 text-t-2xs font-semibold leading-relaxed text-danger">
                            {errorFor('lateralConfirmed')!.message}
                        </p>
                    )}
                </div>
            </div>

            {/* Los avisos NO bloquean: se enseñan siempre, se pasa igual. */}
            {(warnings.length > 0 || caveats.length > 0) && (
                <div className="space-y-2 rounded-card border border-warning/25 bg-warning/10 p-3">
                    {[...warnings.map(w => w.message), ...caveats].map(text => (
                        <p key={text} className="flex gap-2 text-t-2xs leading-relaxed text-ink-muted">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            <span>{text}</span>
                        </p>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-field px-3 py-2 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    type="button"
                    onClick={submit}
                    className="flex items-center gap-1.5 rounded-field bg-brand px-4 py-2 text-t-2xs font-bold text-brand-ink transition-opacity duration-fast hover:opacity-90"
                >
                    {submitLabel}
                    <ArrowRight size={13} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

// =====================================================================
// EL RESUMEN, UNA VEZ CONTESTADO
// =====================================================================

/**
 * La franja que recuerda con qué se está analizando.
 *
 * Existe porque el ajuste deja de estar a la vista en cuanto empieza el vídeo,
 * y una carga equivocada es invisible justo cuando más daño hace. Con el botón
 * de editar al lado: cambiar los kilos no obliga a repetir el análisis, solo a
 * recalcular fuerza, potencia y 1RM.
 */
export function SetupSummary({ setup, onEdit }: { setup: PwrSetup; onEdit?: () => void }) {
    const bar = barTypeById(setup.barTypeId);

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field border border-subtle bg-surface-sunken px-3 py-2">
            <span className="text-t-2xs font-bold text-ink">{EXERCISE_LABEL[setup.exerciseType]}</span>
            <span className="text-t-2xs font-bold tabular-nums text-brand">{setup.loadKg} kg</span>
            <span className="text-t-2xs text-ink-subtle">{bar.label}</span>
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="ml-auto flex items-center gap-1 rounded-field px-2 py-1 text-t-2xs font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                >
                    <Pencil size={11} aria-hidden="true" />
                    Editar
                </button>
            )}
        </div>
    );
}
