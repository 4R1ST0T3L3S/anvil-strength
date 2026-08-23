/**
 * ANVIL STRENGTH — CAMPOS DE FORMULARIO
 * =====================================================================
 *
 * QUÉ SUSTITUYE
 *
 * 157 `<input>`, 33 `<select>` y 19 `<textarea>` escritos a mano, cada uno
 * con sus clases. Ninguno tenía `aria-invalid` ni `aria-describedby` — cero
 * usos de los dos en toda la aplicación —, así que ningún error de
 * formulario estaba asociado a su campo para un lector de pantalla. El error
 * vivía en una franja al principio del formulario o en un aviso flotante,
 * nunca al lado de lo que había que corregir.
 *
 *
 * LAS CUATRO REGLAS QUE CUMPLE TODO CAMPO DE AQUÍ
 *
 * 1. 44px de alto como mínimo. Se usa de pie, en un gimnasio, con una mano.
 *
 * 2. 16px de tamaño de letra en móvil. Por debajo, Safari amplía la página
 *    al enfocar Y NO VUELVE A DESAMPLIARLA. `index.css` ya lo impone de
 *    forma global; aquí se declara además de forma explícita para que se vea
 *    al leer el componente y nadie lo baje sin querer.
 *
 * 3. El error NUNCA depende solo del color. Lleva icono y texto, y va
 *    asociado con `aria-describedby` para que se lea al llegar al campo.
 *
 * 4. El anillo de foco es el del sistema, en `focus-visible`. Nada de
 *    `outline-none` — ver la regla de eslint que lo prohíbe.
 *
 *
 * CÓMO SE USA
 *
 *     const correo = useCampo({ inicial: '', validar: combinar(requerido('el correo'), email()) });
 *     <Input label="Correo" campo={correo} type="email" ayuda="Te mandamos un enlace" />
 *
 * El control y su envoltorio son la MISMA pieza a propósito: separarlos
 * obliga a escribir el `campo` dos veces y a acordarse de enlazar los
 * identificadores, que es justo de lo que esto libera.
 */

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
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
 * El armazón. Se exporta para los controles que esta familia no cubre —un
 * selector de color, un grupo de botones— y que aun así deben tener etiqueta,
 * ayuda y error como todos los demás.
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
                    'text-t-sm font-semibold text-ink-muted',
                    labelOculta && 'sr-only'
                )}
            >
                {label}
                {obligatorio && (
                    // `aria-hidden` porque quien navega con lector ya lo sabe
                    // por el `required` del control: oírlo dos veces molesta.
                    <span className="ml-1 text-brand" aria-hidden="true">*</span>
                )}
            </label>

            {ayuda && (
                <p id={ids.ayuda} className="text-t-xs text-ink-subtle">
                    {ayuda}
                </p>
            )}

            {children}

            {/* `role="alert"` para que se anuncie al aparecer. Sin él, alguien
                que navega con lector corrige a ciegas. */}
            {error && (
                <p
                    id={ids.error}
                    role="alert"
                    className="flex items-start gap-1.5 text-t-xs font-medium text-danger"
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
 * `text-t-base` es 16px y NO se baja en móvil. Ver la regla 2 de la cabecera.
 *
 * El borde en error se acompaña SIEMPRE del icono y el texto de abajo: un
 * borde rojo por sí solo no lo distingue quien no ve el rojo.
 */
const controlBase = (hayError: boolean) =>
    cn(
        'w-full min-h-[44px] rounded-field px-3 py-2',
        'bg-surface-sunken text-t-base text-ink placeholder:text-ink-faint',
        'border transition-colors duration-fast ease-snap',
        'focus-visible:border-brand',
        'disabled:cursor-not-allowed disabled:opacity-45',
        hayError
            ? 'border-danger'
            : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
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
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle [&>svg]:h-4 [&>svg]:w-4"
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
                    // `aria-describedby` se compone aquí porque puede haber
                    // ayuda Y error a la vez, y `useCampo` solo conoce el error.
                    aria-describedby={
                        [ayuda ? campo.ids.ayuda : null, hayError ? campo.ids.error : null]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    className={cn(controlBase(hayError), icono && 'pl-9', className)}
                />
            </div>
        </Field>
    );
});

// =====================================================================
// NÚMERO
// =====================================================================

export interface NumberFieldProps extends Omit<InputProps, 'type'> {
    /**
     * `decimal` abre el teclado numérico CON coma; `numeric` sin ella.
     * Un peso lleva decimales (97,5) y unas repeticiones no.
     */
    modo?: 'decimal' | 'numeric';
    sufijo?: ReactNode;
}

/**
 * Campo numérico.
 *
 * POR QUÉ `type="text"` Y NO `type="number"
                            inputMode="decimal"`. El campo numérico nativo:
 *   · Muestra unas flechitas que en móvil no se pueden pulsar bien y en
 *     escritorio cambian el valor al hacer scroll por encima sin querer.
 *   · Rechaza la coma decimal en algunos idiomas del sistema, así que un
 *     atleta español no puede escribir 97,5.
 *   · Devuelve cadena vacía para cualquier cosa que no sepa leer, así que se
 *     pierde lo que la persona escribió y no se le puede decir qué estaba mal.
 *
 * Con `inputMode` se consigue el teclado correcto sin ninguno de los tres
 * problemas, y la validación la hace `numeroEnRango`, que sí entiende la coma.
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
                    className="pointer-events-none absolute right-3 top-[calc(50%+2px)] text-t-sm text-ink-subtle"
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
                // `[color-scheme:dark]` hace que el desplegable NATIVO se pinte
                // oscuro. Sin él, en Windows la lista sale blanca sobre una app
                // negra, que es el detalle que delata que esto es una web.
                className={cn(controlBase(hayError), 'cursor-pointer [color-scheme:dark]', className)}
            >
                {children}
            </select>
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
    // El contador solo aparece cerca del tope: enseñarlo desde el carácter
    // uno convierte escribir una nota en una cuenta atrás.
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
                className={cn(controlBase(hayError), 'resize-y leading-relaxed', className)}
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
 * La casilla NO usa `Field`: su etiqueta va al lado y no encima, y el área
 * pulsable tiene que ser la fila entera, no el cuadradito de 16px.
 */
export function Checkbox({ label, campo, ayuda, contenedorClassName, className, ...props }: CheckboxProps) {
    const idAyuda = useId();
    const hayError = !!campo.errorVisible;

    return (
        <div className={cn('flex flex-col gap-1.5', contenedorClassName)}>
            {/* `min-h-[44px]` en la ETIQUETA: así toda la fila —texto incluido—
                es zona pulsable, en vez de obligar a acertar en 16px. */}
            <label
                className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2"
                htmlFor={campo.ids.control}
            >
                <input
                    // Envuelto en una flecha y no `ref={campo.asignarRef}` a
                    // secas: pasando la función directamente, el analizador de
                    // React la marca como referencia y de rebote marca el
                    // objeto `campo` entero, con lo que leer `campo.valor` al
                    // pintar pasa a ser un error. Con la envoltura, no.
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
                        'mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-chip',
                        'accent-[var(--brand)]',
                        hayError && 'outline outline-1 outline-danger',
                        className
                    )}
                />
                <span className="text-t-sm leading-snug text-ink-muted">{label}</span>
            </label>

            {ayuda && (
                <p id={idAyuda} className="pl-8 text-t-xs text-ink-subtle">
                    {ayuda}
                </p>
            )}

            {campo.errorVisible && (
                <p
                    id={campo.ids.error}
                    role="alert"
                    className="flex items-start gap-1.5 pl-8 text-t-xs font-medium text-danger"
                >
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{campo.errorVisible}</span>
                </p>
            )}
        </div>
    );
}
