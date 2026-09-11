/**
 * ANVIL STRENGTH — CAMPOS DE FORMULARIO
 * =====================================================================
 *
 * LAS CUATRO REGLAS QUE CUMPLE TODO CAMPO DE AQUÍ
 *
 * 1. 44px de alto como mínimo. Se usa de pie, en un gimnasio, con una mano.
 * 2. 16px de letra. Por debajo, Safari amplía la página al enfocar y NO
 *    vuelve a desampliarla.
 * 3. El error NUNCA depende solo del color: icono y texto, asociados con
 *    `aria-describedby` para que se lean al llegar al campo.
 * 4. Foco inequívoco: borde en rojo Anvil más un halo suave, como el anillo
 *    de foco de un campo de macOS pero con el acento de la marca.
 *
 * ASPECTO: campo RELLENO, sin borde en reposo (el gris translúcido del
 * sistema), que funciona igual sobre el lienzo que sobre una tarjeta.
 *
 * USO
 *
 *     const correo = useCampo({ inicial: '', validar: combinar(requerido('el correo'), email()) });
 *     <Input label="Correo" campo={correo} type="email" ayuda="Te mandamos un enlace" />
 */

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Campo } from '../../lib/validation';

// =====================================================================
// ENVOLTORIO
// =====================================================================

export interface FieldProps {
    label: ReactNode;
    /** Contexto bajo la etiqueta. Debe aportar, no repetir la etiqueta. */
    ayuda?: ReactNode;
    /** Mensaje de error a pintar. Normalmente `campo.errorVisible`. */
    error?: string | null;
    /** Marca visual de obligatorio. */
    obligatorio?: boolean;
    /** Identificadores compartidos entre etiqueta, control, ayuda y error. */
    ids: { control: string; ayuda: string; error: string };
    /** Oculta la etiqueta visualmente pero la deja para el lector. */
    labelOculta?: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * El armazón. Se exporta para controles que esta familia no cubre (un
 * selector de color, un grupo de botones) y que aun así deben tener
 * etiqueta, ayuda y error como todos los demás.
 */
export function Field({
    label,
    ayuda,
    error,
    obligatorio,
    ids,
    labelOculta,
    className,
    children,
}: FieldProps) {
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <label
                htmlFor={ids.control}
                className={cn(
                    'text-t-sm font-medium text-ink-muted',
                    labelOculta && 'sr-only'
                )}
            >
                {label}
                {obligatorio && (
                    // `aria-hidden`: quien usa lector ya lo sabe por el `required`.
                    <span className="ml-0.5 text-brand-text" aria-hidden="true">*</span>
                )}
            </label>

            {ayuda && (
                <p id={ids.ayuda} className="-mt-0.5 text-t-xs text-ink-subtle">
                    {ayuda}
                </p>
            )}

            {children}

            {/* `role="alert"`: se anuncia al aparecer. */}
            {error && (
                <p
                    id={ids.error}
                    role="alert"
                    className="flex items-start gap-1.5 text-t-xs font-medium text-danger-text"
                >
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </p>
            )}
        </div>
    );
}

// =====================================================================
// ESTILO COMÚN DEL CONTROL
// =====================================================================

/**
 * Exportado para los campos que la app escribe a mano (el registro de series,
 * el constructor): así se parecen a estos sin tener que pasar por `useCampo`.
 */
export const controlBase = (hayError: boolean) =>
    cn(
        'w-full min-h-[44px] rounded-field px-3.5 py-2',
        'bg-[var(--fill-input)] text-t-base text-ink placeholder:text-ink-subtle',
        'border transition-[background-color,border-color,box-shadow] duration-fast ease-snap',
        'focus-visible:outline-none focus-visible:border-brand focus-visible:bg-surface-raised focus-visible:shadow-[0_0_0_3px_var(--brand-quiet)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        hayError
            ? 'border-danger bg-[var(--danger-quiet)]'
            : 'border-transparent hover:bg-[var(--fill-muted)]'
    );

// =====================================================================
// TEXTO
// =====================================================================

export interface InputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'id'> {
    label: ReactNode;
    campo: Campo<string>;
    ayuda?: ReactNode;
    obligatorio?: boolean;
    labelOculta?: boolean;
    /** Icono a la izquierda, dentro del control. */
    icono?: ReactNode;
    contenedorClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, campo, ayuda, obligatorio, labelOculta, icono, contenedorClassName, className, ...props },
    ref
) {
    const hayError = !!campo.errorVisible;

    return (
        <Field
            label={label}
            ayuda={ayuda}
            error={campo.errorVisible}
            obligatorio={obligatorio}
            ids={campo.ids}
            labelOculta={labelOculta}
            className={contenedorClassName}
        >
            <div className="relative">
                {icono && (
                    <span
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle [&>svg]:h-4 [&>svg]:w-4"
                        aria-hidden="true"
                    >
                        {icono}
                    </span>
                )}
                <input
                    ref={(nodo) => {
                        campo.asignarRef(nodo);
                        if (typeof ref === 'function') ref(nodo);
                        else if (ref) ref.current = nodo;
                    }}
                    required={obligatorio}
                    {...campo.props}
                    {...props}
                    aria-describedby={
                        [ayuda ? campo.ids.ayuda : null, hayError ? campo.ids.error : null]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    className={cn(controlBase(hayError), icono && 'pl-10', className)}
                />
            </div>
        </Field>
    );
});

// =====================================================================
// NÚMERO
// =====================================================================

export interface NumberFieldProps extends Omit<InputProps, 'type'> {
    /** `decimal` abre el teclado numérico CON coma; `numeric` sin ella. */
    modo?: 'decimal' | 'numeric';
    sufijo?: ReactNode;
}

/**
 * `type="text"` + `inputMode`, y no `type="number"`: el nativo muestra
 * flechitas que cambian el valor al hacer scroll, rechaza la coma decimal en
 * algunos idiomas y devuelve cadena vacía para lo que no sabe leer.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
    { modo = 'decimal', sufijo, className, ...props },
    ref
) {
    return (
        <div className="relative">
            <Input
                ref={ref}
                type="text"
                inputMode={modo}
                autoComplete="off"
                className={cn('tabular-nums', sufijo && 'pr-12', className)}
                {...props}
            />
            {sufijo && (
                <span
                    className="pointer-events-none absolute right-3.5 top-[calc(50%+2px)] text-t-sm text-ink-subtle"
                    aria-hidden="true"
                >
                    {sufijo}
                </span>
            )}
        </div>
    );
});

// =====================================================================
// SELECCIÓN
// =====================================================================

export interface SelectProps
    extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'onBlur' | 'id'> {
    label: ReactNode;
    campo: Campo<string>;
    ayuda?: ReactNode;
    obligatorio?: boolean;
    labelOculta?: boolean;
    contenedorClassName?: string;
    children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, campo, ayuda, obligatorio, labelOculta, contenedorClassName, className, children, ...props },
    ref
) {
    const hayError = !!campo.errorVisible;

    return (
        <Field
            label={label}
            ayuda={ayuda}
            error={campo.errorVisible}
            obligatorio={obligatorio}
            ids={campo.ids}
            labelOculta={labelOculta}
            className={contenedorClassName}
        >
            <div className="relative">
                <select
                    ref={(nodo) => {
                        campo.asignarRef(nodo);
                        if (typeof ref === 'function') ref(nodo);
                        else if (ref) ref.current = nodo;
                    }}
                    required={obligatorio}
                    {...campo.props}
                    {...props}
                    aria-describedby={
                        [ayuda ? campo.ids.ayuda : null, hayError ? campo.ids.error : null]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    // La lista nativa sigue el `color-scheme` del documento,
                    // que pone el tema: ya no hace falta forzarla a oscuro.
                    className={cn(controlBase(hayError), 'cursor-pointer appearance-none pr-10', className)}
                >
                    {children}
                </select>
                <ChevronDown
                    className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                    aria-hidden="true"
                />
            </div>
        </Field>
    );
});

// =====================================================================
// TEXTO LARGO
// =====================================================================

export interface TextareaProps
    extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur' | 'id'> {
    label: ReactNode;
    campo: Campo<string>;
    ayuda?: ReactNode;
    obligatorio?: boolean;
    labelOculta?: boolean;
    contenedorClassName?: string;
    /** Tope de caracteres. Pinta el contador cuando quedan pocos. */
    maximo?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { label, campo, ayuda, obligatorio, labelOculta, contenedorClassName, maximo, className, rows = 4, ...props },
    ref
) {
    const hayError = !!campo.errorVisible;
    const usados = String(campo.valor ?? '').length;
    // El contador solo aparece cerca del tope: desde el carácter uno
    // convierte escribir una nota en una cuenta atrás.
    const mostrarContador = maximo != null && usados > maximo * 0.8;

    return (
        <Field
            label={label}
            ayuda={ayuda}
            error={campo.errorVisible}
            obligatorio={obligatorio}
            ids={campo.ids}
            labelOculta={labelOculta}
            className={contenedorClassName}
        >
            <textarea
                ref={(nodo) => {
                    campo.asignarRef(nodo);
                    if (typeof ref === 'function') ref(nodo);
                    else if (ref) ref.current = nodo;
                }}
                rows={rows}
                required={obligatorio}
                maxLength={maximo}
                {...campo.props}
                {...props}
                aria-describedby={
                    [ayuda ? campo.ids.ayuda : null, hayError ? campo.ids.error : null]
                        .filter(Boolean)
                        .join(' ') || undefined
                }
                className={cn(controlBase(hayError), 'resize-y py-2.5 leading-relaxed', className)}
            />
            {mostrarContador && (
                <p className="text-right text-t-2xs tabular-nums text-ink-subtle" aria-live="polite">
                    {usados} / {maximo}
                </p>
            )}
        </Field>
    );
});

// =====================================================================
// CASILLA
// =====================================================================

export interface CheckboxProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'id' | 'type'> {
    label: ReactNode;
    campo: Campo<boolean>;
    ayuda?: ReactNode;
    contenedorClassName?: string;
}

/**
 * La casilla NO usa `Field`: su etiqueta va al lado y la zona pulsable es la
 * fila entera, no el cuadradito de 18px.
 */
export function Checkbox({ label, campo, ayuda, contenedorClassName, className, ...props }: CheckboxProps) {
    const idAyuda = useId();
    const hayError = !!campo.errorVisible;

    return (
        <div className={cn('flex flex-col gap-1.5', contenedorClassName)}>
            <label
                className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2"
                htmlFor={campo.ids.control}
            >
                <input
                    // Envuelto en una flecha: pasando la función a pelo, el
                    // analizador de React marca `campo` entero como referencia.
                    ref={(nodo) => campo.asignarRef(nodo)}
                    type="checkbox"
                    id={campo.ids.control}
                    checked={campo.valor}
                    onChange={campo.props.onChange}
                    onBlur={campo.props.onBlur}
                    aria-invalid={campo.props['aria-invalid']}
                    aria-describedby={
                        [ayuda ? idAyuda : null, hayError ? campo.ids.error : null]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    {...props}
                    className={cn(
                        'mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px]',
                        'accent-[var(--brand)]',
                        hayError && 'outline outline-1 outline-danger',
                        className
                    )}
                />
                <span className="text-t-sm leading-snug text-ink">{label}</span>
            </label>

            {ayuda && (
                <p id={idAyuda} className="pl-[30px] text-t-xs text-ink-subtle">
                    {ayuda}
                </p>
            )}

            {campo.errorVisible && (
                <p
                    id={campo.ids.error}
                    role="alert"
                    className="flex items-start gap-1.5 pl-[30px] text-t-xs font-medium text-danger-text"
                >
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{campo.errorVisible}</span>
                </p>
            )}
        </div>
    );
}
