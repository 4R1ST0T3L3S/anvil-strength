import { useEffect, useState } from 'react';
import { Palette, SlidersHorizontal, CalendarClock, Save, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { useCoachPrefs, useSaveCoachPrefs } from '../../../hooks/useCoachPrefs';
import type { CoachPrefs, IntensityMetric, WeightUnit, FirstWeekday } from '../../../lib/prefs/contract';

/**
 * PERSONALIZACIÓN DEL ENTRENADOR
 * =====================================================================
 *
 * Apartado propio, no una pestaña de "Perfil": Perfil es quién eres, esto es
 * cómo funciona tu panel. Todo lo de aquí se guarda en `profiles.coach_prefs`
 * (JSONB) y lo lee cualquier pantalla a través de `useCoachPrefs()` — un
 * ajuste nuevo es una clave más en el contrato (src/lib/prefs/contract.ts),
 * nunca una migración.
 *
 * Vale para TODOS los atletas de este entrenador: es su identidad y su forma
 * de programar, no algo que se decide atleta a atleta. La única excepción,
 * decidida y cerrada, es la unidad y el primer día de la semana, que cada
 * atleta puede pisar desde su propio perfil.
 */
export function PreferencesPage({ coachId, onOpenPdfTheme }: {
    coachId: string;
    /** Abre el diseño del PDF. Vive en su propia ruta porque necesita la
     *  pantalla entera para la vista previa del documento. */
    onOpenPdfTheme?: () => void;
}) {
    const { prefs: loaded, loading } = useCoachPrefs(coachId);
    const save = useSaveCoachPrefs(coachId);

    const [prefs, setPrefs] = useState<CoachPrefs>(loaded);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (!dirty) setPrefs(loaded); }, [loaded, dirty]);

    const patch = (fn: (prev: CoachPrefs) => CoachPrefs) => {
        setPrefs(fn);
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await save(prefs);
            setDirty(false);
            toast.success('Preferencias guardadas');
        } catch (err) {
            console.error(err);
            toast.error('No se pudieron guardar las preferencias');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-ink-subtle">Cargando preferencias...</div>;
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-24 pt-4 md:px-0">
            {/* DOCUMENTO PDF.
                Va lo PRIMERO y no dentro de "Mi perfil", que es donde vivía
                su único acceso. Perfil es quién eres; el aspecto del PDF es
                cómo trabajas, y por tanto se busca aquí — la prueba es que
                aquí se buscó y no se encontró.

                Es un enlace y no una tarjeta con controles porque la pantalla
                del PDF necesita el ancho entero para la vista previa; meterla
                en esta columna de 3xl la dejaría ilegible. */}
            {onOpenPdfTheme && (
                <button
                    type="button"
                    onClick={onOpenPdfTheme}
                    className="group flex w-full items-center gap-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay md:p-6"
                >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-brand-quiet text-brand">
                        <FileText size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-t-base font-semibold text-ink">Documento PDF</span>
                        <span className="mt-0.5 block text-t-xs text-ink-subtle">
                            Colores, tipografía, logotipo y columnas de la hoja de entrenamiento que reciben tus atletas. Puedes copiar el diseño de un PDF que ya repartas.
                        </span>
                    </span>
                    <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                    />
                </button>
            )}

            {/* MARCA Y COLORES */}
            <Card icon={Palette} title="Colores" hint="El color de un ejercicio dice a qué parte del día pertenece de un vistazo.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ColorField
                        label="Calentamiento"
                        value={prefs.sectionColors.warmup}
                        onChange={(c) => patch(p => ({ ...p, sectionColors: { ...p.sectionColors, warmup: c } }))}
                    />
                    <ColorField
                        label="Trabajo principal"
                        value={prefs.sectionColors.main}
                        onChange={(c) => patch(p => ({ ...p, sectionColors: { ...p.sectionColors, main: c } }))}
                    />
                    <ColorField
                        label="Accesorios"
                        value={prefs.sectionColors.accessory}
                        onChange={(c) => patch(p => ({ ...p, sectionColors: { ...p.sectionColors, accessory: c } }))}
                    />
                </div>
            </Card>

            {/* INTENSIDAD → OPACIDAD */}
            <Card icon={SlidersHorizontal} title="Intensidad, en opacidad" hint="Cuanto más exigente la serie, más sólido su color. Apagado por defecto: hoy todo se pinta a intensidad plena.">
                <label className="flex items-center gap-2.5 text-t-sm text-ink">
                    <input
                        type="checkbox"
                        checked={prefs.intensity.enabled}
                        onChange={(e) => patch(p => ({ ...p, intensity: { ...p.intensity, enabled: e.target.checked } }))}
                        className="h-4 w-4 rounded border-[var(--border-default)] accent-[var(--brand)]"
                    />
                    Activar opacidad por intensidad
                </label>

                {prefs.intensity.enabled && (
                    <div className="mt-4 space-y-4">
                        <Field label="Criterio">
                            <select
                                value={prefs.intensity.metric}
                                onChange={(e) => patch(p => ({ ...p, intensity: { ...p.intensity, metric: e.target.value as IntensityMetric } }))}
                                className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                            >
                                <option value="rpe">RPE</option>
                                <option value="percent_1rm">% del 1RM</option>
                                <option value="relative_to_block_max">Carga relativa al máximo del bloque</option>
                            </select>
                        </Field>
                        <Field label="Curva">
                            <select
                                value={prefs.intensity.curve}
                                onChange={(e) => patch(p => ({ ...p, intensity: { ...p.intensity, curve: e.target.value as 'linear' | 'contrast' } }))}
                                className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                            >
                                <option value="linear">Lineal</option>
                                <option value="contrast">Más contraste arriba</option>
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={`Opacidad mínima (${Math.round(prefs.intensity.minAlpha * 100)}%)`}>
                                <input
                                    type="range" min={0} max={1} step={0.05}
                                    value={prefs.intensity.minAlpha}
                                    onChange={(e) => patch(p => ({ ...p, intensity: { ...p.intensity, minAlpha: Number(e.target.value) } }))}
                                    className="w-full accent-[var(--brand)]"
                                />
                            </Field>
                            <Field label={`Opacidad máxima (${Math.round(prefs.intensity.maxAlpha * 100)}%)`}>
                                <input
                                    type="range" min={0} max={1} step={0.05}
                                    value={prefs.intensity.maxAlpha}
                                    onChange={(e) => patch(p => ({ ...p, intensity: { ...p.intensity, maxAlpha: Number(e.target.value) } }))}
                                    className="w-full accent-[var(--brand)]"
                                />
                            </Field>
                        </div>
                    </div>
                )}
            </Card>

            {/* PROGRAMACIÓN */}
            <Card icon={CalendarClock} title="Programación" hint="Valores por defecto al crear un bloque nuevo. Cada bloque se puede seguir ajustando por su cuenta.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Semanas por bloque">
                        <NumberInput
                            value={prefs.programming.defaultWeeksPerBlock}
                            min={1} max={52}
                            onChange={(v) => patch(p => ({ ...p, programming: { ...p.programming, defaultWeeksPerBlock: v } }))}
                        />
                    </Field>
                    <Field label="Días por semana">
                        <NumberInput
                            value={prefs.programming.defaultDaysPerWeek}
                            min={1} max={7}
                            onChange={(v) => patch(p => ({ ...p, programming: { ...p.programming, defaultDaysPerWeek: v } }))}
                        />
                    </Field>
                    <Field label="Días de antelación al abrir cada semana">
                        <NumberInput
                            value={prefs.programming.defaultReleaseOffsetDays}
                            min={0} max={14}
                            onChange={(v) => patch(p => ({ ...p, programming: { ...p.programming, defaultReleaseOffsetDays: v } }))}
                        />
                    </Field>
                    <Field label="Descanso por defecto (segundos)">
                        <NumberInput
                            value={prefs.programming.defaultRestSeconds}
                            min={0} max={600} step={15}
                            onChange={(v) => patch(p => ({ ...p, programming: { ...p.programming, defaultRestSeconds: v } }))}
                        />
                    </Field>
                    <Field label="Redondeo de carga (kg)">
                        <select
                            value={prefs.programming.loadRoundingKg}
                            onChange={(e) => patch(p => ({ ...p, programming: { ...p.programming, loadRoundingKg: Number(e.target.value) } }))}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                        >
                            <option value={1.25}>1.25 kg</option>
                            <option value={2.5}>2.5 kg</option>
                            <option value={5}>5 kg</option>
                        </select>
                    </Field>
                    <Field label="Cómo se identifica el día">
                        <select
                            value={prefs.programming.dayLabelsByName ? 'name' : 'number'}
                            onChange={(e) => patch(p => ({ ...p, programming: { ...p.programming, dayLabelsByName: e.target.value === 'name' } }))}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                        >
                            <option value="number">Por número ("Día 1")</option>
                            <option value="name">Por nombre ("Torso pesado")</option>
                        </select>
                    </Field>
                </div>

                <div className="mt-4 space-y-2.5">
                    <label className="flex items-center gap-2.5 text-t-sm text-ink">
                        <input
                            type="checkbox"
                            checked={prefs.programming.showRpeToAthlete}
                            onChange={(e) => patch(p => ({ ...p, programming: { ...p.programming, showRpeToAthlete: e.target.checked } }))}
                            className="h-4 w-4 rounded border-[var(--border-default)] accent-[var(--brand)]"
                        />
                        Mostrar el RPE pautado al atleta
                    </label>
                    <label className="flex items-center gap-2.5 text-t-sm text-ink">
                        <input
                            type="checkbox"
                            checked={prefs.programming.showVelocityToAthlete}
                            onChange={(e) => patch(p => ({ ...p, programming: { ...p.programming, showVelocityToAthlete: e.target.checked } }))}
                            className="h-4 w-4 rounded border-[var(--border-default)] accent-[var(--brand)]"
                        />
                        Mostrar la velocidad objetivo al atleta
                    </label>
                </div>
            </Card>

            {/* UNIDADES POR DEFECTO */}
            <Card icon={SlidersHorizontal} title="Por defecto para tus atletas" hint="Cada atleta puede pisar estos dos ajustes desde su propio perfil.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Unidad de peso">
                        <select
                            value={prefs.defaultUnit}
                            onChange={(e) => patch(p => ({ ...p, defaultUnit: e.target.value as WeightUnit }))}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                        >
                            <option value="kg">Kilos (kg)</option>
                            <option value="lb">Libras (lb)</option>
                        </select>
                    </Field>
                    <Field label="Primer día de la semana">
                        <select
                            value={prefs.defaultFirstWeekday}
                            onChange={(e) => patch(p => ({ ...p, defaultFirstWeekday: e.target.value as FirstWeekday }))}
                            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm text-ink"
                        >
                            <option value="monday">Lunes</option>
                            <option value="sunday">Domingo</option>
                        </select>
                    </Field>
                </div>
            </Card>

            <div className="sticky bottom-4 flex justify-end">
                <Button variant="primary" icon={<Save size={16} />} loading={saving} disabled={!dirty} onClick={handleSave}>
                    Guardar preferencias
                </Button>
            </div>
        </div>
    );
}

function Card({ icon: Icon, title, hint, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
            <div className="mb-1 flex items-center gap-2">
                <Icon size={16} className="text-brand" />
                <h3 className="text-t-base font-semibold text-ink">{title}</h3>
            </div>
            {hint && <p className="mb-4 text-t-xs text-ink-subtle">{hint}</p>}
            {children}
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</label>
            {children}
        </div>
    );
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2 text-t-sm tabular-nums text-ink"
        />
    );
}

function ColorField({ label, value, onChange }: {
    label: string;
    value: { hue: number; saturation: number };
    onChange: (v: { hue: number; saturation: number }) => void;
}) {
    return (
        <div className="rounded-field border border-[var(--border-default)] bg-surface-sunken p-3">
            <div
                className="mb-2 h-8 w-full rounded-field"
                style={{ backgroundColor: `hsl(${value.hue}deg ${value.saturation}% 55%)` }}
                aria-hidden="true"
            />
            <p className="mb-2 text-t-xs font-semibold text-ink">{label}</p>
            <label className="mb-1 block text-t-2xs text-ink-faint">Matiz ({value.hue}°)</label>
            <input
                type="range" min={0} max={360} step={1}
                value={value.hue}
                onChange={(e) => onChange({ ...value, hue: Number(e.target.value) })}
                className="mb-2 w-full"
            />
            <label className="mb-1 block text-t-2xs text-ink-faint">Saturación ({value.saturation}%)</label>
            <input
                type="range" min={0} max={100} step={1}
                value={value.saturation}
                onChange={(e) => onChange({ ...value, saturation: Number(e.target.value) })}
                className="w-full"
            />
        </div>
    );
}
