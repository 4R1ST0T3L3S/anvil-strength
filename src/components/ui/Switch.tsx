import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * INTERRUPTOR
 * =====================================================================
 *
 * Para ajustes que se aplican AL MOMENTO (sin botón de guardar): avisos,
 * preferencias. Si el cambio necesita confirmación, no es un interruptor.
 *
 * Encendido en rojo Anvil: el acento marca el estado activo, que es justo
 * para lo que existe. El pomo es blanco en los dos temas, como un objeto
 * físico, y se desliza con la curva del sistema.
 *
 * `role="switch"` + `aria-checked`: un lector lo anuncia como "interruptor,
 * activado", no como una casilla.
 */

export interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Nombre accesible si no va dentro de `SwitchRow`. */
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    disabled?: boolean;
    id?: string;
    className?: string;
}

export function Switch({ checked, onChange, disabled, className, id, ...aria }: SwitchProps) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            data-no-press
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-[28px] w-[46px] shrink-0 items-center rounded-pill p-[2px]',
                'transition-colors duration-base ease-snap',
                "before:absolute before:-inset-2 before:content-['']",
                'disabled:cursor-not-allowed disabled:opacity-40',
                checked ? 'bg-brand' : 'bg-[var(--fill-strong)]',
                className
            )}
            {...aria}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'h-6 w-6 rounded-pill bg-white shadow-[0_2px_5px_oklch(0_0_0/0.22),0_0_0_0.5px_oklch(0_0_0/0.06)]',
                    'transition-transform duration-base ease-snap',
                    checked ? 'translate-x-[18px]' : 'translate-x-0'
                )}
            />
        </button>
    );
}

/**
 * Una fila de ajustes con su interruptor: título, explicación y el control a
 * la derecha. Toda la fila es pulsable, no solo el control.
 */
export function SwitchRow({
    titulo,
    descripcion,
    checked,
    onChange,
    disabled,
    icono,
}: {
    titulo: ReactNode;
    descripcion?: ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    icono?: ReactNode;
}) {
    const idTitulo = useId();
    const idDesc = useId();

    return (
        <div
            className={cn(
                'flex min-h-[56px] items-center gap-3 px-4 py-3',
                !disabled && 'cursor-pointer'
            )}
            onClick={() => { if (!disabled) onChange(!checked); }}
        >
            {icono && (
                <span
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--fill-muted)] text-ink-muted [&>svg]:h-4 [&>svg]:w-4"
                    aria-hidden="true"
                >
                    {icono}
                </span>
            )}
            <div className="min-w-0 flex-1">
                <p id={idTitulo} className="text-t-base text-ink">{titulo}</p>
                {descripcion && (
                    <p id={idDesc} className="mt-0.5 text-t-sm leading-snug text-ink-subtle">
                        {descripcion}
                    </p>
                )}
            </div>
            {/* El clic del interruptor no debe llegar a la fila: la fila
                también lo conmutaría y se anularían entre los dos. */}
            <span onClick={(e) => e.stopPropagation()} className="flex">
                <Switch
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    aria-labelledby={idTitulo}
                    aria-describedby={descripcion ? idDesc : undefined}
                />
            </span>
        </div>
    );
}
