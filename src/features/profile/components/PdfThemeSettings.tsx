import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader, Plus, Save, Trash2, Undo2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import {
    DEFAULT_COLUMNS, DEFAULT_THEME, FONT_FAMILIES, PAGE_SIZES, PDF_PRESETS,
    pageDimensions, resolveTheme,
    type FontFamily, type PageFormat, type PdfSheetColumn, type PdfThemeInput,
} from '../../../lib/export/pdfTheme';
import type { TemplateScanReport } from '../../../lib/export/pdfTemplateScan';
import { buildWeekPdf } from '../../../lib/export/weekPdf';

/**
 * AJUSTES DEL PDF DEL ENTRENADOR
 * =====================================================================
 *
 * Todo lo que aquí se toca es DATO, no código: colores, tipografía,
 * logotipo, cabecera, columnas de la tabla y estilo se guardan en `profiles`
 * y los lee `weekPdf.ts` (vía `useCoachPdfTheme`) al generar cualquier
 * documento. Cambiar el diseño del PDF de todo un equipo es rellenar un
 * formulario.
 *
 * Y hay una puerta más corta todavía: subir el PDF que el entrenador YA
 * reparte. `pdfTemplateScan.ts` lo mide y rellena este formulario entero de
 * una vez —colores, letra, logotipo, columnas—, que es lo que hace que
 * "quiero que salga como el mío" no sea un proyecto.
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

/** Cuánto puede pesar el PDF de ejemplo. Por encima, ni se abre. */
const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;

export function PdfThemeSettings({ user, onBack }: { user: UserProfile; onBack: () => void }) {
    const initial = useMemo(() => (user.pdf_theme ?? {}) as PdfThemeInput, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const [theme, setTheme] = useState<PdfThemeInput>(initial);
    const [brandColor, setBrandColor] = useState(user.brand_color || DEFAULT_THEME.palette.accent);
    const [logoUrl, setLogoUrl] = useState<string | null>(user.logo_url || null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // El escaneo de una plantilla ajena. `undo` guarda lo que había antes
    // para que probar un PDF no sea una decisión irreversible. Va en estado
    // y no en una `ref` porque el botón de deshacer SE PINTA a partir de él.
    const [scanning, setScanning] = useState(false);
    const [scanReport, setScanReport] = useState<TemplateScanReport | null>(null);
    const [undo, setUndo] = useState<{ theme: PdfThemeInput; brandColor: string; logoUrl: string | null } | null>(null);

    const fileInput = useRef<HTMLInputElement>(null);
    const templateInput = useRef<HTMLInputElement>(null);

    const resolved = useMemo(
        () => resolveTheme({ ...theme, palette: { accent: brandColor, ...theme.palette } }),
        [theme, brandColor]
    );
    const isSheet = resolved.layout.sheet === 'table';

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
        if (!preset) return;
        setTheme(preset.theme);
        setScanReport(null);
    };

    // -----------------------------------------------------------------
    // COPIAR UN PDF DE EJEMPLO
    // -----------------------------------------------------------------

    /**
     * El escáner arrastra pdf.js —cerca de un mega— y solo lo usa quien
     * sube una plantilla. Se carga al pulsar, no al abrir la pantalla.
     */
    const handleTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (templateInput.current) templateInput.current.value = '';
        if (!file) return;

        if (file.size > MAX_TEMPLATE_BYTES) {
            toast.error('El PDF pesa demasiado (máx. 15 MB)');
            return;
        }

        setScanning(true);
        try {
            const { scanPdfTemplate } = await import('../../../lib/export/pdfTemplateScan');
            const scan = await scanPdfTemplate(file);

            setUndo({ theme, brandColor, logoUrl });

            // El tema escaneado SUSTITUYE al anterior en vez de fundirse con
            // él: mezclar dos diseños distintos no da un diseño, da un
            // híbrido con la letra de uno y los colores del otro.
            setTheme(scan.theme);
            if (scan.theme.palette?.accent) setBrandColor(scan.theme.palette.accent);
            if (scan.logoDataUrl) setLogoUrl(scan.logoDataUrl);
            setScanReport(scan.report);

            toast.success('Diseño copiado de tu PDF. Revísalo en la vista previa.');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo leer ese PDF. ¿Está protegido con contraseña?');
        } finally {
            setScanning(false);
        }
    };

    const undoScan = () => {
        if (!undo) return;
        setTheme(undo.theme);
        setBrandColor(undo.brandColor);
        setLogoUrl(undo.logoUrl);
        setScanReport(null);
        setUndo(null);
    };

    // -----------------------------------------------------------------
    // LOGOTIPO
    // -----------------------------------------------------------------

    /** Sube un archivo al bucket y devuelve su URL pública. */
    const uploadLogo = async (blob: Blob, ext: string): Promise<string> => {
        // El id del dueño va SIEMPRE al principio del nombre: es lo que
        // comprueba la política del bucket (database/profiles_storage_policies.sql).
        const path = `logos/${user.id}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('profiles').upload(path, blob, {
            contentType: blob.type || `image/${ext}`,
        });
        if (error) throw error;
        return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl;
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
            setLogoUrl(await uploadLogo(file, file.name.split('.').pop() || 'png'));
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
            // Un logotipo recortado de un PDF vive de momento como data URL,
            // dentro del navegador. Al guardar sube al almacenamiento: en el
            // perfil solo puede ir una dirección (`pdf_theme` tiene 8 KB de
            // tope, ver database/pdf_theme.sql), y además el atleta también
            // tiene que poder descargarlo desde su lado.
            let url = logoUrl;
            if (url?.startsWith('data:')) {
                const blob = await (await fetch(url)).blob();
                url = await uploadLogo(blob, 'png');
                setLogoUrl(url);
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    brand_color: brandColor,
                    logo_url: url,
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

    // -----------------------------------------------------------------
    // COLUMNAS
    // -----------------------------------------------------------------

    const columns = resolved.sheet.columns;

    const setColumns = (next: PdfSheetColumn[]) => patch({ sheet: { columns: next } });

    const editColumn = (index: number, change: Partial<PdfSheetColumn>) =>
        setColumns(columns.map((c, i) => (i === index ? { ...c, ...change } : c)));

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
                    <Section title="Copiar un PDF que ya usas">
                        <p className="-mt-1 text-t-xs leading-relaxed text-ink-muted">
                            Sube la hoja que ya le mandas a tus atletas y Anvil la mide: sus colores, su
                            tipografía, su logotipo y las columnas de su tabla. A partir de ahí, cada semana
                            que descargues sale con ese diseño.
                        </p>

                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => templateInput.current?.click()}
                                disabled={scanning}
                                className="flex items-center gap-2 rounded-field bg-surface-sunken px-4 py-2.5 text-t-xs font-bold text-ink transition-colors duration-fast ease-snap hover:bg-surface-raised disabled:opacity-40"
                            >
                                {scanning ? <Loader size={15} className="animate-spin" /> : <FileUp size={15} />}
                                {scanning ? 'Leyendo el PDF…' : 'Subir un PDF de ejemplo'}
                            </button>
                            {undo && (
                                <button
                                    type="button"
                                    onClick={undoScan}
                                    className="flex items-center gap-2 rounded-field px-3 py-2.5 text-t-xs font-bold text-ink-muted transition-colors duration-fast hover:text-ink"
                                >
                                    <Undo2 size={15} />
                                    Deshacer
                                </button>
                            )}
                            <input
                                ref={templateInput}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={handleTemplate}
                            />
                        </div>

                        {scanReport && <ScanSummary report={scanReport} onClose={() => setScanReport(null)} />}

                        <p className="text-t-2xs leading-relaxed text-ink-faint">
                            El PDF no se guarda en ningún sitio: se lee en tu navegador, se copia el diseño y se
                            descarta. La tipografía se sustituye por la más parecida de las tres que admite el
                            formato.
                        </p>
                    </Section>

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
                                        { value: 'stacked', label: 'Centrado' },
                                        { value: 'bar', label: 'Franja' },
                                        { value: 'minimal', label: 'Mínimo' },
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
                                    className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink transition-colors duration-fast focus:border-brand"
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
                            <Field label="Maqueta" hint={isSheet ? 'Una fila por ejercicio, como la hoja de papel' : 'Un bloque por ejercicio, para leer en el móvil'}>
                                <SegmentedControl
                                    value={resolved.layout.sheet}
                                    onChange={v => patch({ layout: { sheet: v as 'table' | 'blocks' } })}
                                    options={[
                                        { value: 'table', label: 'Tabla' },
                                        { value: 'blocks', label: 'Bloques' },
                                    ]}
                                />
                            </Field>

                            <Field label="Formato de página">
                                <SegmentedControl
                                    value={resolved.page}
                                    onChange={v => patch({ page: v as PageFormat })}
                                    options={[
                                        ...(Object.keys(PAGE_SIZES) as ('mobile' | 'a4')[]).map(k => ({
                                            value: k as PageFormat, label: PAGE_SIZES[k].label,
                                        })),
                                        ...(resolved.pageSize
                                            ? [{ value: 'custom' as PageFormat, label: 'Del PDF' }]
                                            : []),
                                    ]}
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
                            {!isSheet && (
                                <Toggle
                                    label="Filete de color junto a cada ejercicio"
                                    checked={resolved.layout.accentBar}
                                    onChange={v => patch({ layout: { accentBar: v } })}
                                />
                            )}
                            <Toggle
                                label="Notas del entrenador bajo cada ejercicio"
                                checked={resolved.layout.showNotes}
                                onChange={v => patch({ layout: { showNotes: v } })}
                            />
                            <Toggle
                                label="Fondo alterno en las filas"
                                checked={resolved.layout.zebra}
                                onChange={v => patch({ layout: { zebra: v } })}
                            />
                            <Toggle
                                label="Número de página en el pie"
                                checked={resolved.footer.showPageNumbers}
                                onChange={v => patch({ footer: { showPageNumbers: v } })}
                            />
                        </div>
                    </Section>

                    {isSheet && (
                        <Section title="La hoja">
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                                <Field label="Rótulo del día">
                                    <TextInput value={resolved.sheet.dayLabel} onChange={v => patch({ sheet: { dayLabel: v } })} placeholder="Día" />
                                </Field>
                                <Field label="Rótulo del atleta">
                                    <TextInput value={resolved.sheet.athleteLabel} onChange={v => patch({ sheet: { athleteLabel: v } })} placeholder="Nombre" />
                                </Field>
                                <Field label="Rótulo del bloque">
                                    <TextInput value={resolved.sheet.blockLabel} onChange={v => patch({ sheet: { blockLabel: v } })} placeholder="Información bloque" />
                                </Field>
                            </div>

                            {/* ------------------------------------- Columnas */}
                            <div className="space-y-2">
                                <div className="flex items-end justify-between gap-3">
                                    <div>
                                        <span className="block text-t-xs font-semibold text-ink-muted">Columnas de la tabla</span>
                                        <span className="block text-t-2xs text-ink-faint">
                                            «Libre» dibuja la columna y la deja vacía para rellenar a mano.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setColumns([...columns, { key: 'blank', label: 'Nueva', width: 15 }])}
                                        disabled={columns.length >= 8}
                                        className="flex items-center gap-1.5 rounded-field border border-[var(--border-default)] px-2.5 py-1.5 text-t-2xs font-bold text-ink-muted transition-colors duration-fast hover:text-ink disabled:opacity-40"
                                    >
                                        <Plus size={13} /> Añadir
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    {columns.map((col, i) => (
                                        <div key={i} className="flex items-center gap-2 rounded-field bg-surface-sunken p-1.5">
                                            <input
                                                type="text"
                                                value={col.label}
                                                maxLength={32}
                                                onChange={e => editColumn(i, { label: e.target.value })}
                                                className="h-9 min-w-0 flex-1 rounded-chip bg-transparent px-2 text-t-sm text-ink placeholder:text-ink-subtle"
                                                placeholder="Rótulo"
                                            />
                                            <select
                                                value={col.key}
                                                onChange={e => editColumn(i, { key: e.target.value as PdfSheetColumn['key'] })}
                                                className="h-9 shrink-0 rounded-chip border border-subtle bg-surface-raised px-1.5 text-t-2xs font-bold text-ink-muted"
                                            >
                                                <option value="name">Ejercicio</option>
                                                <option value="series">Series</option>
                                                <option value="reps">Reps</option>
                                                <option value="rest">Descanso</option>
                                                <option value="intensity">Carga</option>
                                                <option value="blank">Libre</option>
                                            </select>
                                            <div className="flex h-9 w-16 shrink-0 items-center rounded-chip border border-subtle bg-surface-raised px-2">
                                                <input
                                                    type="number"
                            inputMode="decimal"
                                                    min={4}
                                                    max={80}
                                                    value={Math.round(col.width)}
                                                    onChange={e => editColumn(i, { width: Number(e.target.value) || 15 })}
                                                    className="w-full bg-transparent text-t-2xs font-bold text-ink"
                                                    aria-label="Ancho relativo"
                                                />
                                                <span className="text-t-2xs text-ink-faint">%</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                                                disabled={columns.length <= 2}
                                                aria-label={`Quitar la columna ${col.label}`}
                                                className="shrink-0 rounded-chip p-2 text-ink-faint transition-colors duration-fast hover:text-danger disabled:opacity-30"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setColumns(DEFAULT_COLUMNS)}
                                    className="text-t-2xs font-bold text-ink-subtle underline-offset-4 transition-colors hover:text-ink hover:underline"
                                >
                                    Volver a las cinco de siempre
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                <Field label={`Alto de fila · ${(resolved.sheet.rowUnits * 4).toFixed(0)} mm`} hint="El sitio que queda para apuntar a mano">
                                    <input
                                        type="range"
                                        min={26}
                                        max={140}
                                        step={2}
                                        value={Math.round(resolved.sheet.rowUnits * 10)}
                                        onChange={e => patch({ sheet: { rowUnits: Number(e.target.value) / 10 } })}
                                        className="h-11 w-full accent-brand"
                                    />
                                </Field>

                                <Field label={`Grosor de la rejilla · ${resolved.sheet.rule.toFixed(2)} mm`}>
                                    <input
                                        type="range"
                                        min={10}
                                        max={100}
                                        step={5}
                                        value={Math.round(resolved.sheet.rule * 100)}
                                        onChange={e => patch({ sheet: { rule: Number(e.target.value) / 100 } })}
                                        className="h-11 w-full accent-brand"
                                    />
                                </Field>
                            </div>

                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                <Field label="Rótulo de la caja de texto" hint="Vacío = la caja sin título">
                                    <TextInput
                                        value={resolved.sheet.notesBox.label}
                                        onChange={v => patch({ sheet: { notesBox: { label: v } } })}
                                        placeholder="Indicaciones y calentamiento"
                                    />
                                </Field>
                                <Field label="Rótulo dentro del pie" hint="Vacío = solo la firma y la fecha">
                                    <TextInput
                                        value={resolved.sheet.footerBox.label}
                                        onChange={v => patch({ sheet: { footerBox: { label: v } } })}
                                        placeholder="Pie de página"
                                    />
                                </Field>
                            </div>

                            <div className="space-y-0.5">
                                <Toggle
                                    label="Caja de indicaciones y calentamiento"
                                    checked={resolved.sheet.notesBox.show}
                                    onChange={v => patch({ sheet: { notesBox: { show: v } } })}
                                />
                                <Toggle
                                    label="Recuadro del pie"
                                    checked={resolved.sheet.footerBox.show}
                                    onChange={v => patch({ sheet: { footerBox: { show: v } } })}
                                />
                                <Toggle
                                    label="Estirar las filas hasta llenar la hoja"
                                    checked={resolved.sheet.stretchRows}
                                    onChange={v => patch({ sheet: { stretchRows: v } })}
                                />
                            </div>
                        </Section>
                    )}
                </div>

                {/* ------------------------------------------------- Vista previa */}
                <div className="lg:order-2">
                    <div className="lg:sticky lg:top-6">
                        <p className="mb-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Vista previa
                        </p>
                        <div
                            className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-sunken"
                            style={{ aspectRatio: `${pageDimensions(resolved).w} / ${pageDimensions(resolved).h}` }}
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

/**
 * Lo que se ha sacado del PDF del entrenador, en cristiano.
 *
 * Enseñarlo no es cortesía: el escaneo ACIERTA casi siempre y falla a veces,
 * y la diferencia entre las dos cosas hay que poder verla antes de mandarle
 * la hoja a treinta atletas. Cada línea de aquí es un sitio donde mirar en
 * la vista previa.
 */
function ScanSummary({ report, onClose }: { report: TemplateScanReport; onClose: () => void }) {
    const rows: [string, string][] = [
        ['Página', report.pageLabel],
        ['Tipografía', report.fontLabel],
        ['Tabla', report.foundTable ? `${report.columns.length} columnas: ${report.columns.join(' · ')}` : 'no encontrada'],
        ['Alto de fila', report.rowHeightMm ? `${report.rowHeightMm} mm` : '—'],
        ['Logotipo', report.foundLogo ? 'recortado de la cabecera' : 'no encontrado'],
    ];

    return (
        <div className="relative rounded-card border border-[var(--border-default)] bg-surface-sunken p-3.5">
            <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar el resumen"
                className="absolute right-2 top-2 rounded-chip p-1.5 text-ink-faint transition-colors hover:text-ink"
            >
                <X size={14} />
            </button>

            <dl className="space-y-1.5 pr-6">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex gap-2 text-t-xs">
                        <dt className="w-24 shrink-0 font-bold text-ink-subtle">{label}</dt>
                        <dd className="min-w-0 flex-1 text-ink">{value}</dd>
                    </div>
                ))}
            </dl>

            {report.notes.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--border-default)] pt-2.5">
                    {report.notes.map((note, i) => (
                        <li key={i} className="text-t-2xs leading-relaxed text-ink-muted">· {note}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

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
            className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
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
                className="w-full bg-transparent text-t-sm font-bold uppercase tracking-wide text-ink"
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
