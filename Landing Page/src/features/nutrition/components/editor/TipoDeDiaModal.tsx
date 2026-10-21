import { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import type { ObjetivoAjuste } from '../../../../lib/nutricion/ajuste';
import { kcalDeMacros } from '../../../../lib/nutricion/macros';
import { COLOR_MACRO, ETIQUETA_MACRO, formatear } from './comun';

/**
 * NUEVO TIPO DE DÍA (o cambiar uno)
 * =====================================================================
 *
 * Parte de los objetivos del día base con un punto de partida típico —un
 * día de descanso baja hidrato, una recarga lo sube— y, al crear, calcula
 * los gramos de TODOS los alimentos para ese día con el ajuste automático.
 * Así un tipo de día nuevo nace ya cuadrado, no como una copia del base que
 * luego hay que corregir comida a comida.
 */

interface Plantilla {
    nombre: string;
    explicacion: string;
    aplicar: (base: ObjetivoAjuste) => ObjetivoAjuste;
}

const conKcal = (o: Omit<ObjetivoAjuste, 'kcal'>): ObjetivoAjuste => ({ ...o, kcal: Math.round(kcalDeMacros(o)) });
const r = (v: number) => Math.round(v);

const PLANTILLAS: Plantilla[] = [
    {
        nombre: 'Día de descanso',
        explicacion: '−30 % de hidrato, +10 % de grasa',
        aplicar: (b) => conKcal({ proteina: r(b.proteina), carbos: r(b.carbos * 0.7), grasas: r(b.grasas * 1.1) }),
    },
    {
        nombre: 'Recarga',
        explicacion: '+40 % de hidrato, −10 % de grasa',
        aplicar: (b) => conKcal({ proteina: r(b.proteina), carbos: r(b.carbos * 1.4), grasas: r(b.grasas * 0.9) }),
    },
    {
        nombre: 'Día de competición',
        explicacion: '+20 % de hidrato, −25 % de grasa',
        aplicar: (b) => conKcal({ proteina: r(b.proteina), carbos: r(b.carbos * 1.2), grasas: r(b.grasas * 0.75) }),
    },
];

export function TipoDeDiaModal({
    abierto,
    base,
    inicial,
    onGuardar,
    onCerrar,
    onEliminar,
    guardando,
}: {
    abierto: boolean;
    base: ObjetivoAjuste;
    /** Si viene, se está editando un tipo de día existente. */
    inicial?: { nombre: string; objetivo: ObjetivoAjuste };
    onGuardar: (nombre: string, objetivo: ObjetivoAjuste, recalcular: boolean) => void;
    onCerrar: () => void;
    onEliminar?: () => void;
    guardando?: boolean;
}) {
    const [nombre, setNombre] = useState(inicial?.nombre ?? '');
    const [objetivo, setObjetivo] = useState<ObjetivoAjuste>(inicial?.objetivo ?? base);
    const [recalcular, setRecalcular] = useState(true);
    const editando = !!inicial;
    const kcalMacros = Math.round(kcalDeMacros(objetivo));

    return (
        <Modal
            open={abierto}
            onClose={onCerrar}
            title={editando ? `Editar ${inicial!.nombre}` : 'Nuevo tipo de día'}
            description="Los mismos alimentos del plan, con otros objetivos: lo que cambia son los gramos."
            size="md"
            footer={
                <>
                    {editando && onEliminar && (
                        <Button variant="danger" onClick={onEliminar} className="sm:mr-auto">Eliminar</Button>
                    )}
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button
                        variant="primary"
                        loading={guardando}
                        disabled={!nombre.trim()}
                        onClick={() => onGuardar(nombre.trim(), objetivo, recalcular)}
                    >
                        {editando ? 'Guardar' : 'Crear'}
                    </Button>
                </>
            }
        >
            {!editando && (
                <div className="mb-4">
                    <p className="text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Punto de partida</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {PLANTILLAS.map((p) => (
                            <button
                                key={p.nombre}
                                type="button"
                                onClick={() => { setNombre(p.nombre); setObjetivo(p.aplicar(base)); }}
                                className={`rounded-card border px-3 py-2.5 text-left transition-colors duration-fast ease-snap ${nombre === p.nombre ? 'border-brand bg-[var(--brand-quiet)]' : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'}`}
                            >
                                <span className="block text-t-sm font-semibold text-ink">{p.nombre}</span>
                                <span className="block text-t-xs text-ink-subtle">{p.explicacion}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <label className="block">
                <span className="text-t-xs font-semibold text-ink-muted">Nombre</span>
                <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Día de descanso"
                    className="mt-1 h-11 w-full rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['kcal', 'proteina', 'carbos', 'grasas'] as const).map((k) => (
                    <label key={k} className="block rounded-card bg-[var(--fill-input)] px-3 py-2 focus-within:ring-2 focus-within:ring-brand">
                        <span className={`block text-t-xs font-semibold ${COLOR_MACRO[k]}`}>{ETIQUETA_MACRO[k].larga}</span>
                        <span className="flex items-baseline gap-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={objetivo[k] || ''}
                                onChange={(e) => setObjetivo((o) => ({ ...o, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                                className="w-full bg-transparent text-t-lg font-semibold tabular-nums text-ink focus-visible:outline-none"
                            />
                            <span className="text-t-xs text-ink-subtle">{ETIQUETA_MACRO[k].unidad}</span>
                        </span>
                    </label>
                ))}
            </div>
            {Math.abs(kcalMacros - objetivo.kcal) > 10 && (
                <p className="mt-2 text-t-xs text-ink-muted">
                    Los macros suman <strong className="text-ink">{formatear(kcalMacros)} kcal</strong>.{' '}
                    <button type="button" className="font-semibold text-brand-text underline underline-offset-2" onClick={() => setObjetivo((o) => ({ ...o, kcal: kcalMacros }))}>
                        Usar ese valor
                    </button>
                </p>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-card bg-[var(--fill-muted)] p-3">
                <input
                    type="checkbox"
                    checked={recalcular}
                    onChange={(e) => setRecalcular(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                />
                <span>
                    <span className="block text-t-sm font-semibold text-ink">Calcular los gramos para este día</span>
                    <span className="block text-t-xs text-ink-subtle">
                        Ajusta automáticamente las cantidades de todas las comidas a estos objetivos, respetando lo que esté bloqueado. Luego puedes retocar a mano.
                    </span>
                </span>
            </label>
        </Modal>
    );
}
