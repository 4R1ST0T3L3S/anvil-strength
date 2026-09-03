import { parseWarmupText, type ParsedWarmupExercise } from '../../../../lib/planning/warmupParser';

/**
 * PROPUESTA DE CALENTAMIENTO ESTRUCTURADO.
 *
 * Enseña lo que se va a crear ANTES de crearlo. La conversión del texto libre
 * no puede ser automática —el texto no tiene formato garantizado y un
 * analizador aplicado a ciegas acabaría inventando series de una movilidad—,
 * así que la decisión es del entrenador y esto es lo que la sostiene.
 *
 * Las líneas que el analizador NO ha entendido se marcan: son las que van a
 * quedar como ejercicio sin series, y verlo aquí evita la sorpresa.
 */
/** Exportado solo para el banco de pruebas de maquetación (`/dev/movil`). */
export function WarmupConversionPanel({
    text,
    onConvert,
    onCancel,
}: {
    text: string;
    onConvert: (items: ParsedWarmupExercise[]) => void;
    onCancel: () => void;
}) {
    const items = parseWarmupText(text);
    const unrecognised = items.filter(i => !i.recognised).length;

    return (
        <div className="rounded-card border border-[var(--brand-line)] bg-surface-raised p-3">
            <h4 className="text-t-2xs font-bold uppercase tracking-widest text-brand-text">
                Se crearán {items.length} ejercicios
            </h4>

            {items.length === 0 ? (
                <p className="mt-2 text-t-xs text-ink-subtle">
                    No se ha reconocido nada convertible en este texto.
                </p>
            ) : (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {items.map((item, i) => (
                        <li
                            key={i}
                            className="flex flex-wrap items-baseline gap-x-2 rounded-field bg-surface-sunken px-2.5 py-1.5"
                        >
                            {item.groupTag && (
                                <span className="text-t-2xs font-black uppercase tracking-wide text-info">
                                    {item.groupTag}
                                    {item.rounds ? `·${item.rounds}` : ''}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-t-sm text-ink">{item.name}</span>
                            <span className="shrink-0 text-t-xs tabular-nums text-ink-subtle">
                                {item.sets.length > 0
                                    ? `${item.sets.length}×${item.sets[0].reps}${item.sets[0].load ? ` · ${item.sets[0].load}kg` : ''}`
                                    : 'sin series'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {unrecognised > 0 && (
                <p className="mt-2 text-t-2xs text-ink-subtle">
                    {unrecognised} {unrecognised === 1 ? 'línea queda' : 'líneas quedan'} sin series. Se
                    crean igual y puedes prescribirlas después.
                </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    onClick={() => onConvert(items)}
                    disabled={items.length === 0}
                    className="flex h-10 items-center rounded-field bg-brand px-3 text-t-xs font-black uppercase tracking-wide text-brand-ink transition-colors duration-fast hover:bg-brand-hover disabled:opacity-40"
                >
                    Crear ejercicios
                </button>
                <button
                    onClick={onCancel}
                    className="flex h-10 items-center rounded-field px-3 text-t-xs font-bold uppercase tracking-wide text-ink-muted transition-colors duration-fast hover:bg-surface-overlay hover:text-ink"
                >
                    Cancelar
                </button>
            </div>

            <p className="mt-2 text-t-2xs text-ink-subtle">
                El texto no se borra. Compáralo con el resultado y quítalo tú cuando te convenza.
            </p>
        </div>
    );
}
