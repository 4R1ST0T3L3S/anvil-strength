import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { MAIN_LIFTS, MAIN_LIFT_LABEL, type MainLift } from '../../../../lib/planning/liftSummary';
import {
    METRICA_INFO,
    objetivosVigentes,
    type MetricaDeVolumen,
    type ObjetivoDeVolumen,
} from '../../../../lib/volume/objetivos';
import { volumeTargetsService } from '../../../../services/volumeTargetsService';
import { cn } from '../../../../lib/utils';

/**
 * PONER EL PRESUPUESTO DE VOLUMEN DE LA SEMANA.
 * =====================================================================
 *
 * "Sentadilla: 12 series y 100 repeticiones". El constructor lo va
 * descontando solo mientras se programa — ver CurrentWeekLifts.
 *
 *
 * TRES ÁMBITOS, Y POR QUÉ SE ELIGEN AQUÍ Y NO EN TRES PANTALLAS
 *
 *   Siempre       — el volumen habitual de este atleta, valga el bloque
 *                   que valga. Es el que se pone una vez y no se toca.
 *   Este bloque   — un mesociclo que va con más o menos trabajo.
 *   Solo semana N — la descarga, o la semana de choque.
 *
 * Gana el más específico, así que se pueden tener los tres a la vez sin
 * contradecirse: "12 series siempre, 8 en este bloque, 6 en la semana de
 * descarga". Elegir el ámbito es una fila más del mismo formulario porque
 * es la MISMA decisión ("cuánto") con distinto alcance; separarlo en
 * pantallas obligaría a saber de antemano cuál se quiere.
 *
 *
 * SERIES Y REPETICIONES, Y LO DEMÁS CUANDO SE PUEDA CONTAR
 *
 * La tabla admite tonelaje, distancia y duración desde ya (ver el SQL),
 * pero aquí solo se ofrecen las dos que el constructor sabe descontar hoy.
 * Ofrecer una casilla que se guarda y nunca enseña progreso sería peor que
 * no ofrecerla.
 */

const METRICAS_EDITABLES: MetricaDeVolumen[] = ['series', 'reps'];

type Ambito = 'siempre' | 'bloque' | 'semana';

const AMBITO_INFO: Record<Ambito, { etiqueta: string; ayuda: string }> = {
    siempre: { etiqueta: 'Siempre', ayuda: 'El volumen habitual de este atleta, en cualquier bloque.' },
    bloque: { etiqueta: 'Este bloque', ayuda: 'Solo mientras dure el mesociclo que estás programando.' },
    semana: { etiqueta: 'Solo esta semana', ayuda: 'Para una descarga o una semana de choque.' },
};

export const CLAVE_OBJETIVOS_VOLUMEN = (athleteId: string) =>
    ['objetivos-volumen', athleteId] as const;

interface Props {
    open: boolean;
    onClose: () => void;
    athleteId: string;
    coachId: string | null;
    blockId: string | null;
    week: number;
    /** Todos los del atleta, sin filtrar. */
    objetivos: readonly ObjetivoDeVolumen[];
}

export function VolumeTargetsEditor({
    open,
    onClose,
    athleteId,
    coachId,
    blockId,
    week,
    objetivos,
}: Props) {
    const queryClient = useQueryClient();
    const [ambito, setAmbito] = useState<Ambito>('bloque');

    /** El ámbito elegido, traducido a las dos columnas que guarda la tabla. */
    const alcance = useMemo(() => ({
        blockId: ambito === 'siempre' ? null : blockId,
        weekNumber: ambito === 'semana' ? week : null,
    }), [ambito, blockId, week]);

    /**
     * Lo que hay guardado EN ESTE ÁMBITO EXACTO, para rellenar las casillas.
     *
     * No se usa `objetivosVigentes` aquí: aquella resuelve "qué manda", y lo
     * que hace falta para editar es "qué hay escrito justo en este nivel".
     * Si el formulario enseñara el valor heredado, guardar sin tocar nada
     * crearía una copia del objetivo del bloque en la semana, y a partir de
     * ahí los dos dejarían de ir juntos sin que nadie lo hubiera pedido.
     */
    const enEsteAmbito = useMemo(() => {
        const mapa = new Map<string, ObjetivoDeVolumen>();
        for (const o of objetivos) {
            if ((o.block_id ?? null) !== alcance.blockId) continue;
            if ((o.week_number ?? null) !== alcance.weekNumber) continue;
            mapa.set(`${o.scope_key}:${o.metric}`, o);
        }
        return mapa;
    }, [objetivos, alcance]);

    /** Lo que MANDARÍA hoy, para poder decir de dónde se hereda. */
    const vigentes = useMemo(() => {
        const mapa = new Map<string, ObjetivoDeVolumen>();
        for (const o of objetivosVigentes(objetivos, blockId, week)) {
            mapa.set(`${o.scope_key}:${o.metric}`, o);
        }
        return mapa;
    }, [objetivos, blockId, week]);

    const [borrador, setBorrador] = useState<Record<string, string>>({});
    const claveDe = (lift: MainLift, metric: MetricaDeVolumen) => `${lift}:${metric}`;

    const valorDe = (lift: MainLift, metric: MetricaDeVolumen): string => {
        const clave = claveDe(lift, metric);
        if (clave in borrador) return borrador[clave];
        const guardado = enEsteAmbito.get(clave);
        return guardado ? String(guardado.target) : '';
    };

    const invalidar = () =>
        queryClient.invalidateQueries({ queryKey: CLAVE_OBJETIVOS_VOLUMEN(athleteId) });

    const guardar = useMutation({
        mutationFn: async () => {
            if (!coachId) throw new Error('No se sabe quién es el entrenador de esta sesión.');

            for (const lift of MAIN_LIFTS) {
                for (const metric of METRICAS_EDITABLES) {
                    const clave = claveDe(lift, metric);
                    if (!(clave in borrador)) continue;      // no se ha tocado

                    const bruto = borrador[clave].trim().replace(',', '.');
                    const guardado = enEsteAmbito.get(clave);

                    // Vaciar la casilla BORRA el objetivo de este ámbito. No
                    // lo pone a cero: un objetivo de cero series no significa
                    // nada, y "quitar el presupuesto" tiene que poder decirse.
                    if (bruto === '') {
                        if (guardado) await volumeTargetsService.remove(guardado.id);
                        continue;
                    }

                    const valor = Number(bruto);
                    if (!Number.isFinite(valor) || valor <= 0) {
                        throw new Error(`"${bruto}" no es un objetivo válido para ${MAIN_LIFT_LABEL[lift]}.`);
                    }

                    await volumeTargetsService.upsert({
                        coachId,
                        athleteId,
                        blockId: alcance.blockId,
                        weekNumber: alcance.weekNumber,
                        scope: 'lift',
                        scopeKey: lift,
                        label: MAIN_LIFT_LABEL[lift],
                        metric,
                        target: valor,
                    });
                }
            }
        },
        onSuccess: () => {
            setBorrador({});
            invalidar();
            toast.success('Objetivos de volumen guardados');
            onClose();
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const borrarAmbito = useMutation({
        mutationFn: async () => {
            for (const o of enEsteAmbito.values()) await volumeTargetsService.remove(o.id);
        },
        onSuccess: () => {
            setBorrador({});
            invalidar();
            toast.success('Objetivos de este ámbito eliminados');
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const hayCambios = Object.keys(borrador).length > 0;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Objetivo de volumen semanal"
            description="Lo que quieres que sume cada movimiento en una semana. El planificador lo va descontando mientras programas."
            size="md"
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    {enEsteAmbito.size > 0 ? (
                        <button
                            onClick={() => borrarAmbito.mutate()}
                            disabled={borrarAmbito.isPending}
                            className="flex items-center gap-1.5 text-t-xs font-bold text-ink-subtle transition-colors duration-fast hover:text-danger-text disabled:opacity-50"
                        >
                            <Trash2 size={13} aria-hidden="true" />
                            Quitar los de «{AMBITO_INFO[ambito].etiqueta}»
                        </button>
                    ) : <span />}

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button
                            variant="primary"
                            onClick={() => guardar.mutate()}
                            disabled={!hayCambios || guardar.isPending}
                            icon={guardar.isPending ? <Loader size={14} className="animate-spin" /> : undefined}
                        >
                            Guardar
                        </Button>
                    </div>
                </div>
            }
        >
            {/* ÁMBITO */}
            <div className="mb-5">
                <p className="mb-2 text-t-2xs font-semibold text-ink-subtle">
                    A qué se aplica
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(AMBITO_INFO) as Ambito[]).map(a => {
                        const deshabilitado = a !== 'siempre' && !blockId;
                        return (
                            <button
                                key={a}
                                onClick={() => { setAmbito(a); setBorrador({}); }}
                                disabled={deshabilitado}
                                className={cn(
                                    'rounded-field border px-2 py-2 text-t-2xs font-bold transition-colors duration-fast ease-snap disabled:opacity-40',
                                    ambito === a
                                        ? 'border-brand bg-brand-quiet text-brand-text'
                                        : 'border-[var(--border-default)] text-ink-muted hover:text-ink'
                                )}
                            >
                                {a === 'semana' ? `Semana ${week}` : AMBITO_INFO[a].etiqueta}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 text-t-2xs leading-relaxed text-ink-subtle">
                    {AMBITO_INFO[ambito].ayuda} Manda siempre el más concreto: una semana
                    pisa al bloque, y el bloque a «Siempre».
                </p>
            </div>

            {/* LOS TRES BÁSICOS */}
            <div className="space-y-2">
                <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 px-1">
                    <span />
                    {METRICAS_EDITABLES.map(m => (
                        <span key={m} className="text-center text-t-2xs font-semibold text-ink-subtle">
                            {METRICA_INFO[m].corto}
                        </span>
                    ))}
                </div>

                {MAIN_LIFTS.map(lift => (
                    <div key={lift} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 rounded-field bg-surface-sunken px-3 py-2.5">
                        <span className="truncate text-t-sm font-bold text-ink">
                            {MAIN_LIFT_LABEL[lift]}
                        </span>
                        {METRICAS_EDITABLES.map(metric => {
                            const clave = claveDe(lift, metric);
                            const heredado = !enEsteAmbito.has(clave) ? vigentes.get(clave) : null;
                            return (
                                <input
                                    key={metric}
                                    type="text"
                                    inputMode="numeric"
                                    value={valorDe(lift, metric)}
                                    onChange={e => setBorrador(p => ({ ...p, [clave]: e.target.value }))}
                                    // El heredado se enseña como MARCADOR y no como
                                    // valor: así se ve de dónde viene la cifra que
                                    // manda hoy sin que guardar sin tocar nada la
                                    // copie a este ámbito.
                                    placeholder={heredado ? String(heredado.target) : '—'}
                                    aria-label={`${METRICA_INFO[metric].nombre} de ${MAIN_LIFT_LABEL[lift]}`}
                                    className={cn(
                                        'w-full rounded-field border bg-surface-overlay px-2 py-1.5 text-center text-t-sm tabular-nums text-ink transition-colors duration-fast placeholder:text-ink-faint focus:border-brand',
                                        enEsteAmbito.has(clave)
                                            ? 'border-[var(--brand-line)]'
                                            : 'border-transparent hover:border-[var(--border-default)]'
                                    )}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            <p className="mt-4 text-t-2xs leading-relaxed text-ink-subtle">
                Una casilla en gris hereda del ámbito de arriba. Vaciar una casilla
                escrita quita el objetivo de este ámbito; no lo pone a cero.
            </p>
        </Modal>
    );
}
