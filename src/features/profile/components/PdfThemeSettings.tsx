import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    DEFAULT_THEME, FONT_FAMILIES, PAGE_SIZES, PDF_PRESETS,
    resolveTheme, type FontFamily, type PageFormat, type PdfThemeInput,
} from '../../../lib/export/pdfTheme';
import { buildWeekPdf } from '../../../lib/export/weekPdf';

/**
 * AJUSTES DEL PDF DEL ENTRENADOR
 * =====================================================================
 *
 * Todo lo que aquí se toca es DATO, no código: colores, tipografía,
 * logotipo, cabecera y estilo se guardan en `profiles` y los lee
 * `weekPdf.ts` (vía `useCoachPdfTheme`) al generar cualquier documento.
 * Cambiar el diseño del PDF de todo un equipo es rellenar un formulario.
 *
 * LA VISTA PREVIA ES EL PDF DE VERDAD
 *
 * No una maqueta HTML que se parece al documento: es el mismo `buildWeekPdf`
 * que genera la descarga real, con una semana de ejemplo, mostrado en un
 * `<iframe>`. Lo que se ve aquí es exactamente lo que va a recibir el
 * atleta — nunca hay sorpresa entre el ajuste y la descarga.
 */

const SAMPLE_WEEK = {
    blockName: 'Bloque de fuerza',
    athleteName: 'Nombre del atleta',
    weekLabel: 'Semana 3 · Acumulación',
    dateRange: '4 – 10 de agosto',
    days: [{
        title: 'Lunes',
        date: '4 de agosto',
        warmup: 'Movilidad de cadera, 5 min.\nBarra vacía, 2 series de 10.',
        extras: 'Plancha, 3 series de 45 segundos.',
        exercises: [
            {
                name: 'Sentadilla trasera',
                variant: 'Con pausa de 2 segundos',
                series: '4', reps: '5', rest: "3'", intensity: '140 kg',
                notes: 'Sube el peso si la última serie sale limpia.',
            },
            {
                name: 'Press banca con agarre cerrado',
                series: '5', reps: '3', rest: "2'30\"", intensity: 'RPE 8',
            },
            {
                name: 'Peso muerto rumano',
                series: '3', reps: '8', rest: "2'", intensity: '100 kg',
            },
        ],
    }],
};

export function PdfThemeSettings({ user, onBack }: { user: UserProfile; onBack: () => void }) {
    const initial = useMemo(() => (user.pdf_theme ?? {}) as PdfThemeInput, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const [theme, setTheme] = useState<PdfThemeInput>(initial);
    const [brandColor, setBrandColor] = useState(user.brand_color || DEFAULT_THEME.palette.accent);
    const [logoUrl, setLogoUrl] = useState<string | null>(user.logo_url || null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const resolved = useMemo(
        () => resolveTheme({ ...theme, palette: { accent: brandColor, ...theme.palette } }),
        [theme, brandColor]
    );

    // La vista previa se regenera con cada ajuste, pero no en cada tecla: el
    // logotipo puede pesar varios cientos de KB y jsPDF no es instantáneo.
    // 250ms es el punto donde deja de notarse como demora y ya no se
    // regenera dos veces por el mismo cambio.
    useEffect(() => {
        const timer = setTimeout(() => {
            const url = buildWeekPdf({
                ...SAMPLE_WEEK,
                theme: { ...theme, palette: { accent: brandColor, ...theme.palette }, header: { logoDataUrl: logoUrl, ...theme.header } },
            }).output('datauristring');
            setPreviewUrl(url);
        }, 250);
        return () => clearTimeout(timer);
    }, [theme, brandColor, logoUrl]);

    const patch = (partial: PdfThemeInput) => setTheme(prev => deepMerge(prev, partial));

    const applyPreset = (key: string) => {
        const preset = PDF_PRESETS.find(p => p.key === key);
        if (preset) setTheme(preset.theme);
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileInput.current) fileInput.current.value = '';
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            toast.error('El logotipo pesa demasiado (máx. 2 MB)');
            return;
        }

        setUploadingLogo(true);
        try {
            const ext = file.name.split('.').pop();
            const path = `logos/${user.id}-${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('profiles').upload(path, file);
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('profiles').getPublicUrl(path);
            setLogoUrl(data.publicUrl);
        } catch (err) {
            console.error(err);
            toast.error('No se pudo subir el logotipo');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    brand_color: brandColor,
                    logo_url: logoUrl,
                    pdf_theme: theme,
                })
                .eq('id', user.id);

            if (error) throw error;
            toast.success('Guardado. Los próximos PDF saldrán con este diseño.');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo guardar. Inténtalo otra vez.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-10">
            <header className="mb-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <button
                        onClick={onBack}
                        className="mb-2 text-t-xs font-bold uppercase tracking-widest text-ink-subtle transition-colors hover:text-ink"
                    >
                        ← Mi perfil
                    </button>
                    <h1 className="text-t-2xl font-black uppercase tracking-display text-ink">Documento PDF</h1>
                    <p className="mt-1 text-t-sm text-ink-muted">
                        Así verán tus atletas el PDF que les mandas cada semana.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex shrink-0 items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                >
                    {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                    Guardar
                </button>
            </header>

            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                {/* ------------------------------------------------- Ajustes */}
                <div className="space-y-5 lg:order-1">
                    <Section title="Punto de partida">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            {PDF_PRESETS.map(preset => (
                                <button
                                    key={preset.key}
                                    onClick={() => applyPreset(preset.key)}
                                    title={preset.hint}
                                    className="rounded-field border border-[var(--border-default)] px-3 py-2.5 text-left text-t-xs font-bold text-ink transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-raised"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </Section>

                    <Section title="Marca">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Field label="Color de acento">
                                <ColorInput value={brandColor} onChange={setBrandColor} />
                            </Field>

                            <Field label="Logotipo">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field border border-[var(--border-default)] bg-surface-sunken">
                                        {logoUrl
                                            ? <img src={logoUrl} alt="" className="h-8 w-8 object-contain" />
                                            : <Upload size={16} className="text-ink-faint" aria-hidden="true" />}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInput.current?.click()}
                                        disabled={uploadingLogo}
                                        className="rounded-field border border-[var(--border-default)] px-3 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast hover:border-[var(--border-strong)] hover:text-ink disabled:opacity-40"
                                    >
                                        {uploadingLogo ? 'Subiendo…' : logoUrl ? 'Cambiar' : 'Subir'}
                                    </button>
                                    {logoUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setLogoUrl(null)}
                                            aria-label="Quitar logotipo"
                                            className="rounded-field p-2 text-ink-faint transition-colors duration-fast hover:bg-[var(--danger-quiet)] hover:text-danger"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                </div>
                            </Field>
                        </div>
                    </Section>

                    <Section title="Cabecera">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Field label="Estilo">
                                <SegmentedControl
                                    value={resolved.header.style}
                                    onChange={v => patch({ header: { style: v as typeof resolved.header.style } })}
                                    options={[
                                        { value: 'bar', label: 'Franja' },
                                        { value: 'minimal', label: 'Mínimo' },
                                        { value: 'stacked', label: 'Centrado' },
                                    ]}
                                />
                            </Field>

                            <Field label="Nombre del club">
                                <TextInput
                                    value={theme.header?.title ?? ''}
                                    placeholder={user.full_name || 'Anvil Strength'}
                                    onChange={v => patch({ header: { title: v || null } })}
                                />
                            </Field>

                            <Field label="Subtítulo" hint="Web, lema o contacto — opcional">
                                <TextInput
                                    value={theme.header?.subtitle ?? ''}
                                    placeholder="anvilstrength.es"
                                    onChange={v => patch({ header: { subtitle: v || null } })}
                                />
                            </Field>

                            <Field label="Firma del pie" hint="Vacío = el nombre del club">
                                <TextInput
                                    value={theme.footer?.text ?? ''}
                                    placeholder={theme.header?.title || user.full_name || 'Anvil Strength'}
                                    onChange={v => patch({ footer: { text: v || null } })}
                                />
                            </Field>
                        </div>
                    </Section>

                    <Section title="Tipografía">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Field label="Familia">
                                <select
                                    value={resolved.typography.family}
                                    onChange={e => patch({ typography: { family: e.target.value as FontFamily } })}
                                    className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink outline-none transition-colors duration-fast focus:border-brand"
                                >
                                    {FONT_FAMILIES.map(f => (
                                        <option key={f.key} value={f.key}>{f.label} — {f.hint}</option>
                                    ))}
                                </select>
                            </Field>

                            <Field label={`Tamaño del texto · ${Math.round(resolved.typography.scale * 100)}%`}>
                                <input
                                    type="range"
                                    min={85}
                                    max={125}
                                    step={5}
                                    value={Math.round(resolved.typography.scale * 100)}
                                    onChange={e => patch({ typography: { scale: Number(e.target.value) / 100 } })}
                                    className="h-11 w-full accent-brand"
                                />
                            </Field>
                        </div>

                        <Toggle
                            label="Títulos en mayúsculas"
                            checked={resolved.typography.upperHeadings}
                            onChange={v => patch({ typography: { upperHeadings: v } })}
                        />
                    </Section>

                    <Section title="Composición">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Field label="Formato de página">
                                <SegmentedControl
                                    value={resolved.page}
                                    onChange={v => patch({ page: v as PageFormat })}
                                    options={(Object.keys(PAGE_SIZES) as PageFormat[]).map(k => ({
                                        value: k, label: PAGE_SIZES[k].label,
                                    }))}
                                />
                            </Field>

                            <Field label="Densidad">
                                <SegmentedControl
                                    value={resolved.layout.density}
                                    onChange={v => patch({ layout: { density: v as typeof resolved.layout.density } })}
                                    options={[
                                        { value: 'compact', label: 'Compacta' },
                                        { value: 'normal', label: 'Normal' },
                                        { value: 'relaxed', label: 'Amplia' },
                                    ]}
                                />
                            </Field>
                        </div>

                        <div className="mt-1 space-y-0.5">
                            <Toggle
                                label="Filete de color junto a cada ejercicio"
                                checked={resolved.layout.accentBar}
                                onChange={v => patch({ layout: { accentBar: v } })}
                            />
                            <Toggle
                                label="Notas del entrenador bajo cada ejercicio"
                                checked={resolved.layout.showNotes}
                                onChange={v => patch({ layout: { showNotes: v } })}
                            />
                            <Toggle
                                label="Número de página en el pie"
                                checked={resolved.footer.showPageNumbers}
                                onChange={v => patch({ footer: { showPageNumbers: v } })}
                            />
                        </div>
                    </Section>
                </div>

                {/* ------------------------------------------------- Vista previa */}
                <div className="lg:order-2">
                    <div className="lg:sticky lg:top-6">
                        <p className="mb-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Vista previa
                        </p>
                        <div
                            className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-sunken"
                            style={{ aspectRatio: `${resolved.page === 'a4' ? 210 : 210} / ${PAGE_SIZES[resolved.page].h}` }}
                        >
                            {previewUrl ? (
                                <iframe
                                    title="Vista previa del PDF"
                                    src={`${previewUrl}#toolbar=0&navpanes=0`}
                                    className="h-full w-full border-0"
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center">
                                    <Loader size={20} className="animate-spin text-ink-faint" />
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-t-xs leading-relaxed text-ink-subtle">
                            Es el mismo documento que descargará el atleta, con datos de ejemplo.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =====================================================================
// PIEZAS
// =====================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
            <h2 className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{title}</h2>
            {children}
        </section>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="block text-t-xs font-semibold text-ink-muted">{label}</span>
            {children}
            {hint && <span className="block text-t-2xs text-ink-faint">{hint}</span>}
        </label>
    );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={60}
            className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
        />
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex h-11 items-center gap-2 rounded-field border border-subtle bg-surface-sunken px-3">
            <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="h-7 w-7 shrink-0 cursor-pointer rounded-chip border-0 bg-transparent p-0"
                aria-label="Elegir color de acento"
            />
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                maxLength={7}
                className="w-full bg-transparent text-t-sm font-bold uppercase tracking-wide text-ink outline-none"
            />
        </div>
    );
}

function SegmentedControl<T extends string>({
    value, onChange, options,
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <div className="flex rounded-field bg-surface-sunken p-1">
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={`flex-1 rounded-chip px-2 py-2 text-t-xs font-bold transition-colors duration-fast ease-snap ${
                        value === opt.value ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex w-full items-center justify-between gap-3 rounded-field px-1 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken"
        >
            <span className="text-t-sm text-ink">{label}</span>
            <span
                aria-hidden="true"
                className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-fast ${
                    checked ? 'bg-brand' : 'bg-surface-sunken'
                }`}
            >
                <span
                    className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white shadow-raise transition-transform duration-fast ${
                        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                />
            </span>
        </button>
    );
}

// =====================================================================

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: Partial<T>): T {
    const out = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        out[key] = isObject(value) && isObject(out[key]) ? deepMerge(out[key], value) : value;
    }
    return out as T;
}
