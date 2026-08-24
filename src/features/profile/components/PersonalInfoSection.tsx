import { useCallback, useEffect, useState } from 'react';
import { Check, Loader, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import {
    personalInfoService,
    mergeFields,
    currentValues,
    ageFrom,
    DEFAULT_PERSONAL_FIELDS,
    SUGGESTED_PERSONAL_FIELDS,
    type PersonalField,
    type PersonalValues,
    type PersonalValue,
} from '../../../services/personalInfoService';

/**
 * INFORMACIÓN PERSONAL
 * =====================================================================
 *
 * UNA PANTALLA, DOS LECTURAS. La misma que ve el atleta en su perfil y la que
 * ve su entrenador en la ficha, con la única diferencia de quién puede tocar
 * qué. Escribir dos componentes habría significado que el atleta y su
 * entrenador vieran cosas distintas la primera vez que alguien arreglara un
 * campo en uno solo de los dos.
 *
 * Los CAMPOS los decide el entrenador (`athlete_profile_schemas`) y pueden ser
 * distintos para cada atleta: la envergadura importa en press de banca y no
 * dice nada de un lifter de sumo. Los VALORES llevan fecha
 * (`athlete_profile_data`), así que el peso corporal es una serie desde el
 * primer día sin haber tenido que diseñar una tabla para el peso.
 *
 * Ver database/INFORMACION_PERSONAL.sql y src/services/personalInfoService.ts.
 */

interface PersonalInfoSectionProps {
    athleteId: string;
    /** Quién está mirando. Decide qué se puede escribir y si hay configuración. */
    mode: 'athlete' | 'coach';
    /**
     * El entrenador cuya plantilla manda. En modo atleta es su entrenador; en
     * modo entrenador, él mismo. Sin entrenador se usa el juego predefinido y
     * no se puede configurar nada.
     */
    coachId: string | null;
    /** Quién guarda. Se anota en `updated_by`. */
    editorId: string;
}

export function PersonalInfoSection({ athleteId, mode, coachId, editorId }: PersonalInfoSectionProps) {
    const [fields, setFields] = useState<PersonalField[]>([]);
    const [values, setValues] = useState<PersonalValues>({});
    const [draft, setDraft] = useState<PersonalValues>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [configuring, setConfiguring] = useState(false);

    /**
     * Se recarga cambiando esta clave, no llamando a una función.
     *
     * La carga vive DENTRO del efecto y `setLoading(true)` solo lo hacen los
     * manejadores de evento: un efecto que escribe estado de forma síncrona
     * dispara un render en cascada, y el compilador de React lo rechaza.
     */
    const [reloadKey, setReloadKey] = useState(0);
    const reload = useCallback(() => {
        setLoading(true);
        setReloadKey(k => k + 1);
    }, []);

    useEffect(() => {
        let alive = true;

        Promise.all([
            personalInfoService.getFields(coachId, athleteId),
            personalInfoService.getHistory(athleteId),
        ])
            .then(([template, history]) => {
                if (!alive) return;
                const current = currentValues(history);
                // La plantilla más lo que se contestó a campos ya retirados: si
                // el entrenador quita "envergadura", lo medido en enero no
                // puede desaparecer de la pantalla.
                setFields(mergeFields(template, current));
                setValues(current);
                setDraft(current);
            })
            .catch(err => {
                if (!alive) return;
                console.error('Información personal:', err);
                toast.error('No se pudo cargar la información personal');
            })
            .finally(() => { if (alive) setLoading(false); });

        return () => { alive = false; };
    }, [athleteId, coachId, reloadKey]);

    /** Qué campos puede tocar quien está mirando. */
    const canEdit = (field: PersonalField) => mode === 'coach' || field.athleteCanEdit;

    const dirty = fields.some(f => canEdit(f) && (draft[f.id] ?? '') !== (values[f.id] ?? ''));

    const handleSave = async () => {
        setSaving(true);
        try {
            // Solo lo que ha cambiado Y se puede tocar. Mandar la bolsa entera
            // reescribiría con los valores heredados de tomas anteriores lo que
            // no se ha tocado hoy, y la fecha de esos datos dejaría de ser la
            // suya.
            const changes: PersonalValues = {};
            for (const field of fields) {
                if (!canEdit(field)) continue;
                const next = draft[field.id] ?? null;
                if ((next ?? '') !== (values[field.id] ?? '')) changes[field.id] = next;
            }

            if (Object.keys(changes).length === 0) return;

            await personalInfoService.saveValues(athleteId, changes, editorId);
            reload();
            toast.success('Información guardada');
        } catch (err) {
            console.error(err);
            toast.error('No se pudo guardar. ¿Está aplicada la migración INFORMACION_PERSONAL.sql?');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised py-12">
                <Loader className="animate-spin text-brand-text" size={22} />
            </div>
        );
    }

    if (configuring && coachId) {
        return (
            <FieldEditor
                coachId={coachId}
                athleteId={athleteId}
                fields={fields}
                onClose={() => setConfiguring(false)}
                onSaved={() => { setConfiguring(false); reload(); }}
            />
        );
    }

    const age = ageFrom(values.birth_date ?? null);

    return (
        <section className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
            <header className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3 md:px-5">
                <div className="min-w-0">
                    <h3 className="text-t-base font-black uppercase tracking-display text-ink">
                        Información personal
                    </h3>
                    {/* La edad se CALCULA de la fecha de nacimiento y no se
                        pide aparte: así no caduca y no hay dos versiones del
                        mismo dato conviviendo. */}
                    {age !== null && (
                        <p className="mt-0.5 text-t-xs text-ink-subtle">{age} años</p>
                    )}
                </div>

                {mode === 'coach' && coachId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Settings2 size={14} aria-hidden="true" />}
                        onClick={() => setConfiguring(true)}
                    >
                        Qué le pido
                    </Button>
                )}
            </header>

            {fields.length === 0 ? (
                <p className="px-4 py-8 text-center text-t-sm text-ink-subtle md:px-5">
                    {mode === 'coach'
                        ? 'No le pides ningún dato personal. Púlsalo en «Qué le pido» para elegir.'
                        : 'Tu entrenador no te pide ningún dato personal.'}
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:p-5">
                        {fields.map(field => (
                            <FieldRow
                                key={field.id}
                                field={field}
                                value={draft[field.id] ?? null}
                                editable={canEdit(field)}
                                onChange={v => setDraft(d => ({ ...d, [field.id]: v }))}
                            />
                        ))}
                    </div>

                    {/* El botón solo aparece cuando hay algo que guardar: un
                        "Guardar" permanente en una ficha que se abre sobre todo
                        para mirar invita a pulsarlo sin haber cambiado nada. */}
                    {dirty && (
                        <div className="flex items-center gap-2 border-t border-subtle bg-surface-sunken px-4 py-3 md:px-5">
                            <Button
                                variant="primary"
                                size="md"
                                icon={<Check size={15} aria-hidden="true" />}
                                onClick={handleSave}
                                loading={saving}
                            >
                                Guardar
                            </Button>
                            <Button variant="ghost" size="md" onClick={() => setDraft(values)}>
                                Descartar
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

// =====================================================================
// UN CAMPO
// =====================================================================

function FieldRow({
    field,
    value,
    editable,
    onChange,
}: {
    field: PersonalField;
    value: PersonalValue;
    editable: boolean;
    onChange: (value: PersonalValue) => void;
}) {
    const id = `personal-${field.id}`;

    // Lo que no se puede tocar se enseña como TEXTO y no como una casilla
    // deshabilitada: una casilla gris invita a pulsarla y no explica por qué
    // no responde.
    if (!editable) {
        return (
            <div className="rounded-field bg-surface-sunken px-3 py-2.5">
                <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                    {field.label}
                </p>
                <p className="mt-1 break-words text-t-sm text-ink">
                    {value !== null && value !== '' ? (
                        <>
                            {value}
                            {field.unit && <span className="ml-1 text-t-xs text-ink-subtle">{field.unit}</span>}
                        </>
                    ) : (
                        <span className="text-ink-subtle">Sin dato</span>
                    )}
                </p>
            </div>
        );
    }

    return (
        <div>
            <label
                htmlFor={id}
                className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle"
            >
                {field.label}
                {field.unit && <span className="ml-1 normal-case text-ink-subtle">({field.unit})</span>}
            </label>

            {field.type === 'select' ? (
                <select
                    id={id}
                    value={(value as string) ?? ''}
                    onChange={e => onChange(e.target.value || null)}
                    className="mt-1.5 h-11 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 text-t-sm text-ink focus:border-[var(--brand-line)]"
                >
                    <option value="">Sin especificar</option>
                    {(field.options ?? []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : field.type === 'text' ? (
                <textarea
                    id={id}
                    value={(value as string) ?? ''}
                    onChange={e => onChange(e.target.value || null)}
                    rows={2}
                    maxLength={500}
                    className="mt-1.5 w-full resize-none rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 py-2.5 text-t-sm text-ink placeholder:text-ink-subtle focus:border-[var(--brand-line)]"
                />
            ) : (
                <input
                    id={id}
                    // `date` abre el calendario nativo; `number` con
                    // `inputMode="decimal"` abre el teclado numérico del móvil,
                    // que es donde se rellena esto.
                    type={field.type === 'date' ? 'date' : 'number'}
                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                    step={field.type === 'number' ? '0.1' : undefined}
                    value={(value as string | number) ?? ''}
                    onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') return onChange(null);
                        onChange(field.type === 'number' ? Number(raw) : raw);
                    }}
                    className="mt-1.5 h-11 w-full rounded-field border border-[var(--border-default)] bg-surface-sunken px-3 text-t-sm tabular-nums text-ink focus:border-[var(--brand-line)]"
                />
            )}
        </div>
    );
}

// =====================================================================
// QUÉ SE LE PIDE — SOLO ENTRENADOR
// =====================================================================

/**
 * Elegir los campos.
 *
 * Se guarda PARA ESTE ATLETA y no como plantilla general: es el caso concreto
 * el que se está mirando, y una pantalla que cambiara sin avisar lo que se le
 * pide a los otros veinte atletas sería una trampa. Quien quiera cambiarlos
 * para todos tiene el botón de abajo, que lo dice.
 */
function FieldEditor({
    coachId,
    athleteId,
    fields,
    onClose,
    onSaved,
}: {
    coachId: string;
    athleteId: string;
    fields: PersonalField[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState<PersonalField[]>(fields);
    const [saving, setSaving] = useState(false);

    const present = new Set(draft.map(f => f.id));
    const available = [...DEFAULT_PERSONAL_FIELDS, ...SUGGESTED_PERSONAL_FIELDS]
        .filter(f => !present.has(f.id));

    const save = async (scope: 'athlete' | 'all') => {
        setSaving(true);
        try {
            await personalInfoService.saveFields(
                coachId,
                scope === 'athlete' ? athleteId : null,
                draft
            );
            toast.success(
                scope === 'athlete'
                    ? 'Guardado para este atleta'
                    : 'Guardado para todos tus atletas'
            );
            onSaved();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo guardar. ¿Está aplicada la migración INFORMACION_PERSONAL.sql?');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
            <header className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3 md:px-5">
                <h3 className="text-t-base font-black uppercase tracking-display text-ink">
                    Qué le pido
                </h3>
                <button
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="flex h-9 w-9 items-center justify-center rounded-field text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                >
                    <X size={17} />
                </button>
            </header>

            <div className="space-y-2 p-4 md:p-5">
                {draft.length === 0 && (
                    <p className="py-4 text-center text-t-sm text-ink-subtle">
                        No le pides nada. Añade campos de la lista de abajo.
                    </p>
                )}

                {draft.map((field, i) => (
                    <div
                        key={field.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field bg-surface-sunken px-3 py-2.5"
                    >
                        <span className="min-w-0 flex-1 truncate text-t-sm font-medium text-ink">
                            {field.label}
                            {field.unit && <span className="ml-1 text-t-xs text-ink-subtle">({field.unit})</span>}
                        </span>

                        {/* Quién lo rellena. El caso que lo justifica: la
                            longitud de fémur la mide el entrenador con una
                            cinta, y ponerla como campo a rellenar en el móvil
                            del atleta solo consigue que se invente un número. */}
                        <label className="flex shrink-0 items-center gap-1.5 text-t-2xs font-bold uppercase tracking-wide text-ink-subtle">
                            <input
                                type="checkbox"
                                checked={field.athleteCanEdit}
                                onChange={e => setDraft(d => d.map((f, j) =>
                                    j === i ? { ...f, athleteCanEdit: e.target.checked } : f
                                ))}
                                className="h-4 w-4 accent-[var(--brand)]"
                            />
                            Lo rellena él
                        </label>

                        <button
                            onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                            aria-label={`Quitar ${field.label}`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-ink-faint transition-colors duration-fast hover:bg-[var(--danger-quiet)] hover:text-danger-text"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}

                {available.length > 0 && (
                    <div className="pt-2">
                        <p className="mb-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Añadir
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {available.map(field => (
                                <button
                                    key={field.id}
                                    onClick={() => setDraft(d => [...d, field])}
                                    className="flex min-h-[36px] items-center gap-1.5 rounded-chip border border-[var(--border-default)] px-2.5 py-1 text-t-xs font-medium text-ink-muted transition-colors duration-fast hover:border-[var(--brand-line)] hover:text-ink"
                                >
                                    <Plus size={13} aria-hidden="true" />
                                    {field.label}
                                </button>
                            ))}
                        </div>
                        {/* Los campos salen de una lista y no de un campo de
                            texto libre a propósito: dos entrenadores que
                            escriban "femur" y "femur_cm" para lo mismo crean
                            dos series que ya no se pueden comparar nunca. */}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-subtle bg-surface-sunken px-4 py-3 md:px-5">
                <Button variant="primary" size="md" onClick={() => save('athlete')} loading={saving}>
                    Guardar para este atleta
                </Button>
                <Button variant="secondary" size="md" onClick={() => save('all')} loading={saving}>
                    Para todos mis atletas
                </Button>
                <Button
                    variant="ghost"
                    size="md"
                    icon={<RotateCcw size={14} aria-hidden="true" />}
                    onClick={() => setDraft(DEFAULT_PERSONAL_FIELDS)}
                >
                    Restablecer
                </Button>
            </div>
        </section>
    );
}
