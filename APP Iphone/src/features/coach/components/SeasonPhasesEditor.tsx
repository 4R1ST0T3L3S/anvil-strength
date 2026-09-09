import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, Trash2, ChevronUp, ChevronDown, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { seasonPhasesService } from '../../../services/seasonPhasesService';
import { resolverFases, type FaseDeTemporada, type FaseResuelta } from '../../../lib/period/fases';
import { MAIN_LIFT_LABEL, type MainLift } from '../../../lib/planning/liftSummary';
import { cn } from '../../../lib/utils';

/**
 * LAS FASES DE LA TEMPORADA — EL LADO DEL ENTRENADOR.
 * =====================================================================
 *
 * Aquí se escribe lo que el atleta lee en sus estadísticas: "HIPERTROFIA —
 * Semana 3 de 4".
 *
 *
 * NO HAY LISTA CERRADA DE FASES
 *
 * El nombre es texto libre. PREPARATORIA, HIPERTROFIA, FUERZA, VOLUMEN,
 * PEAKING, COMPETICIÓN es una SUGERENCIA que se puede insertar de un golpe,
 * no un menú del que haya que elegir: cada entrenador nombra los tramos de
 * su temporada como quiere, y una lista cerrada obligaría a llamar "Fuerza"
 * a lo que uno llama "Intensificación".
 *
 *
 * LA FECHA SOLO HACE FALTA EN LA PRIMERA
 *
 * Las demás se encadenan solas al final de la anterior (ver
 * `resolverFases`). Escribir seis fechas a mano para una temporada de seis
 * fases es justo el trabajo que hace que esto no se rellene nunca. Quien
 * quiera una fecha concreta en una fase intermedia la escribe y esa manda.
 *
 *
 * POR MOVIMIENTO, OPCIONAL
 *
 * Una fase puede ser de toda la temporada o solo de la sentadilla. Es lo
 * normal en los meses previos a competir: la banca sigue acumulando cuando
 * la sentadilla ya está afilando. Sin marcar movimiento, vale para todo.
 */

const PLANTILLA = [
    { name: 'Preparatoria', weeks: 3 },
    { name: 'Hipertrofia', weeks: 4 },
    { name: 'Fuerza', weeks: 4 },
    { name: 'Volumen', weeks: 4 },
    { name: 'Peaking', weeks: 3 },
    { name: 'Competición', weeks: 1 },
];

export const CLAVE_FASES = (athleteId: string) => ['fases-temporada', athleteId] as const;

export function SeasonPhasesEditor({
    athleteId,
    coachId,
}: {
    athleteId: string;
    coachId: string;
}) {
    const queryClient = useQueryClient();
    const [creando, setCreando] = useState(false);

    const consulta = useQuery({
        queryKey: CLAVE_FASES(athleteId),
        queryFn: () => seasonPhasesService.listForAthlete(athleteId),
    });

    const fases = useMemo(() => consulta.data ?? [], [consulta.data]);
    const resueltas = useMemo(() => resolverFases(fases), [fases]);

    const invalidar = () => queryClient.invalidateQueries({ queryKey: CLAVE_FASES(athleteId) });

    const crear = useMutation({
        mutationFn: (entrada: { name: string; weeks: number; startDate: string | null; movement: string | null }) =>
            seasonPhasesService.create({
                coachId,
                athleteId,
                name: entrada.name,
                weeks: entrada.weeks,
                orderIndex: fases.length,
                startDate: entrada.startDate,
                movement: entrada.movement,
            }),
        onSuccess: () => { invalidar(); setCreando(false); toast.success('Fase añadida'); },
        onError: (e: Error) => toast.error(e.message),
    });

    const sembrar = useMutation({
        mutationFn: async () => {
            // La primera lleva la fecha de hoy; las demás se encadenan solas.
            const hoy = new Date();
            const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
            for (let i = 0; i < PLANTILLA.length; i++) {
                await seasonPhasesService.create({
                    coachId,
                    athleteId,
                    name: PLANTILLA[i].name,
                    weeks: PLANTILLA[i].weeks,
                    orderIndex: fases.length + i,
                    startDate: i === 0 ? iso : null,
                });
            }
        },
        onSuccess: () => { invalidar(); toast.success('Temporada creada. Ajusta lo que no encaje.'); },
        onError: (e: Error) => toast.error(e.message),
    });

    const borrar = useMutation({
        mutationFn: (id: string) => seasonPhasesService.remove(id),
        onSuccess: () => { invalidar(); toast.success('Fase eliminada'); },
        onError: (e: Error) => toast.error(e.message),
    });

    const mover = useMutation({
        mutationFn: async ({ desde, hacia }: { desde: number; hacia: number }) => {
            const ids = fases.map(f => f.id);
            const [sacado] = ids.splice(desde, 1);
            ids.splice(hacia, 0, sacado);
            await seasonPhasesService.reordenar(ids);
        },
        onSuccess: invalidar,
        onError: (e: Error) => toast.error(e.message),
    });

    const editar = useMutation({
        mutationFn: ({ id, cambios }: { id: string; cambios: Parameters<typeof seasonPhasesService.update>[1] }) =>
            seasonPhasesService.update(id, cambios),
        onSuccess: invalidar,
        onError: (e: Error) => toast.error(e.message),
    });

    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-t-lg font-black uppercase tracking-display text-ink">
                    <CalendarRange size={18} className="text-brand-text" aria-hidden="true" />
                    Fases de la temporada
                </h3>
                <div className="flex gap-2">
                    {fases.length === 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => sembrar.mutate()}
                            disabled={sembrar.isPending}
                            icon={sembrar.isPending ? <Loader size={14} className="animate-spin" /> : undefined}
                        >
                            Usar plantilla
                        </Button>
                    )}
                    <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setCreando(v => !v)}>
                        Añadir
                    </Button>
                </div>
            </div>

            <p className="mt-1.5 text-t-xs leading-relaxed text-ink-muted">
                Es lo que tu atleta ve en sus estadísticas. Solo hace falta la fecha de la
                primera: las demás se encadenan solas.
            </p>

            {creando && (
                <FormularioDeFase
                    onCancelar={() => setCreando(false)}
                    onGuardar={(v) => crear.mutate(v)}
                    guardando={crear.isPending}
                    sugerirFecha={fases.length === 0}
                />
            )}

            {consulta.isPending ? (
                <p className="mt-4 text-t-sm text-ink-subtle">Cargando…</p>
            ) : fases.length === 0 && !creando ? (
                <p className="mt-4 rounded-field border border-dashed border-[var(--border-strong)] p-5 text-center text-t-sm text-ink-subtle">
                    Todavía no hay temporada. «Usar plantilla» crea seis fases corrientes que
                    puedes renombrar y reordenar.
                </p>
            ) : (
                <ul className="mt-4 space-y-2">
                    {resueltas.map((r, i) => (
                        <FilaDeFase
                            key={r.fase.id}
                            resuelta={r}
                            primera={i === 0}
                            ultima={i === resueltas.length - 1}
                            onSubir={() => mover.mutate({ desde: i, hacia: i - 1 })}
                            onBajar={() => mover.mutate({ desde: i, hacia: i + 1 })}
                            onBorrar={() => borrar.mutate(r.fase.id)}
                            onEditar={(cambios) => editar.mutate({ id: r.fase.id, cambios })}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

// =====================================================================

function FilaDeFase({
    resuelta,
    primera,
    ultima,
    onSubir,
    onBajar,
    onBorrar,
    onEditar,
}: {
    resuelta: FaseResuelta;
    primera: boolean;
    ultima: boolean;
    onSubir: () => void;
    onBajar: () => void;
    onBorrar: () => void;
    onEditar: (cambios: { name?: string; weeks?: number; startDate?: string | null; movement?: string | null }) => void;
}) {
    const { fase, inicio, fin, semanaActual, estado } = resuelta;

    return (
        <li
            className={cn(
                'rounded-field border p-3',
                estado === 'actual'
                    ? 'border-[var(--brand-line)] bg-brand-quiet'
                    : estado === 'pasada'
                        ? 'border-[var(--border-subtle)] bg-surface-sunken/60 opacity-70'
                        : 'border-[var(--border-default)] bg-surface-sunken'
            )}
        >
            <div className="flex items-start gap-2">
                {/* Reordenar. Dos botones y no arrastrar: en el móvil el
                    arrastre compite con el desplazamiento de la página, y una
                    temporada tiene seis filas, no sesenta. */}
                <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                        onClick={onSubir}
                        disabled={primera}
                        aria-label={`Subir ${fase.name}`}
                        className="rounded p-0.5 text-ink-faint transition-colors hover:text-ink disabled:opacity-25"
                    >
                        <ChevronUp size={14} aria-hidden="true" />
                    </button>
                    <button
                        onClick={onBajar}
                        disabled={ultima}
                        aria-label={`Bajar ${fase.name}`}
                        className="rounded p-0.5 text-ink-faint transition-colors hover:text-ink disabled:opacity-25"
                    >
                        <ChevronDown size={14} aria-hidden="true" />
                    </button>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            defaultValue={fase.name}
                            onBlur={e => {
                                const v = e.target.value.trim();
                                if (v && v !== fase.name) onEditar({ name: v });
                            }}
                            aria-label="Nombre de la fase"
                            className="min-w-0 flex-1 rounded-field border border-transparent bg-transparent px-1.5 py-1 text-t-sm font-black uppercase tracking-wide text-ink transition-colors hover:border-[var(--border-default)] focus:border-brand"
                        />
                        {estado === 'actual' && (
                            <span className="shrink-0 rounded-chip bg-brand px-2 py-0.5 text-t-2xs font-black uppercase tracking-wide text-brand-ink">
                                Ahora
                            </span>
                        )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <label className="flex items-center gap-1.5 text-t-2xs text-ink-subtle">
                            Semanas
                            <input
                                type="number"
                                min={1}
                                max={52}
                                defaultValue={fase.weeks}
                                onBlur={e => {
                                    const v = Number(e.target.value);
                                    if (Number.isFinite(v) && v >= 1 && v <= 52 && v !== fase.weeks) {
                                        onEditar({ weeks: v });
                                    }
                                }}
                                className="w-14 rounded-field border border-[var(--border-default)] bg-surface-overlay px-1.5 py-1 text-center text-t-xs tabular-nums text-ink focus:border-brand"
                            />
                        </label>

                        <label className="flex items-center gap-1.5 text-t-2xs text-ink-subtle">
                            Empieza
                            <input
                                type="date"
                                defaultValue={fase.start_date ?? ''}
                                onChange={e => onEditar({ startDate: e.target.value || null })}
                                className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-1.5 py-1 text-t-xs text-ink focus:border-brand"
                            />
                        </label>

                        <label className="flex items-center gap-1.5 text-t-2xs text-ink-subtle">
                            Movimiento
                            <select
                                defaultValue={fase.movement ?? ''}
                                onChange={e => onEditar({ movement: e.target.value || null })}
                                className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-1.5 py-1 text-t-xs text-ink focus:border-brand"
                            >
                                <option value="">Toda la temporada</option>
                                {(['SQ', 'BP', 'DL'] as MainLift[]).map(l => (
                                    <option key={l} value={l}>{MAIN_LIFT_LABEL[l]}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <p className="mt-1.5 text-t-2xs tabular-nums text-ink-faint">
                        {inicio && fin
                            ? `${formatoCorto(inicio)} → ${formatoCorto(fin)}${semanaActual ? ` · semana ${semanaActual} de ${fase.weeks}` : ''}`
                            : 'Sin fechas: se encadenará cuando la fase anterior tenga la suya.'}
                    </p>
                </div>

                <button
                    onClick={onBorrar}
                    aria-label={`Eliminar ${fase.name}`}
                    title="Eliminar fase"
                    className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:text-danger-text"
                >
                    <Trash2 size={14} aria-hidden="true" />
                </button>
            </div>
        </li>
    );
}

function formatoCorto(d: Date): string {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getDate()} ${meses[d.getMonth()]}`;
}

// =====================================================================

function FormularioDeFase({
    onGuardar,
    onCancelar,
    guardando,
    sugerirFecha,
}: {
    onGuardar: (v: { name: string; weeks: number; startDate: string | null; movement: string | null }) => void;
    onCancelar: () => void;
    guardando: boolean;
    sugerirFecha: boolean;
}) {
    const [name, setName] = useState('');
    const [weeks, setWeeks] = useState('4');
    const [startDate, setStartDate] = useState('');
    const [movement, setMovement] = useState('');

    const valido = name.trim().length > 0 && Number(weeks) >= 1 && Number(weeks) <= 52;

    return (
        <div className="mt-4 rounded-field border border-[var(--border-default)] bg-surface-sunken p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_5rem_9rem]">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nombre de la fase"
                    autoFocus
                    className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-2.5 py-2 text-t-sm text-ink placeholder:text-ink-faint focus:border-brand"
                />
                <input
                    type="number"
                    min={1}
                    max={52}
                    value={weeks}
                    onChange={e => setWeeks(e.target.value)}
                    aria-label="Semanas"
                    className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-2.5 py-2 text-center text-t-sm tabular-nums text-ink focus:border-brand"
                />
                <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    aria-label="Fecha de inicio"
                    className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-2.5 py-2 text-t-sm text-ink focus:border-brand"
                />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <select
                    value={movement}
                    onChange={e => setMovement(e.target.value)}
                    aria-label="Movimiento de la fase"
                    className="rounded-field border border-[var(--border-default)] bg-surface-overlay px-2.5 py-2 text-t-xs text-ink focus:border-brand"
                >
                    <option value="">Toda la temporada</option>
                    {(['SQ', 'BP', 'DL'] as MainLift[]).map(l => (
                        <option key={l} value={l}>Solo {MAIN_LIFT_LABEL[l]}</option>
                    ))}
                </select>

                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
                    <Button
                        size="sm"
                        variant="primary"
                        disabled={!valido || guardando}
                        onClick={() => onGuardar({
                            name: name.trim(),
                            weeks: Number(weeks),
                            startDate: startDate || null,
                            movement: movement || null,
                        })}
                    >
                        Añadir
                    </Button>
                </div>
            </div>

            {sugerirFecha && !startDate && (
                <p className="mt-2 text-t-2xs text-ink-faint">
                    Es la primera fase: sin fecha, ni esta ni las siguientes podrán decir en
                    qué semana está el atleta.
                </p>
            )}
        </div>
    );
}

export type { FaseDeTemporada };
