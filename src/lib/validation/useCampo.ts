/**
 * ANVIL STRENGTH — ESTADO DE UN CAMPO
 * =====================================================================
 *
 * CUÁNDO SE ENSEÑA UN ERROR, QUE ES TODA LA GRACIA
 *
 * Un formulario que valida en cada tecla te grita "falta la arroba" cuando
 * llevas escrito "m". Uno que solo valida al enviar te deja rellenar seis
 * campos para decirte al final que el segundo estaba mal. Las dos formas son
 * malas por el mismo motivo: el momento no coincide con lo que la persona
 * está haciendo.
 *
 * La regla aquí:
 *
 *   · Mientras escribe por primera vez  → NADA. Aún está en ello.
 *   · Al salir del campo (`blur`)       → se valida y se enseña.
 *   · Al enviar                         → se validan todos.
 *   · Ya enseñado, mientras corrige     → se actualiza EN VIVO, así que el
 *                                         error desaparece en cuanto está
 *                                         bien. Corregir da premio inmediato.
 *
 * Es decir: el error aparece tarde y se va pronto, nunca al revés.
 *
 *
 * POR QUÉ EL ERROR SE CALCULA Y NO SE GUARDA
 *
 * `error` es una función del valor, así que se deriva en cada render en vez
 * de vivir en su propio `useState`. Guardarlo obligaría a un `useEffect` que
 * lo sincronice, y eso es exactamente el `set-state-in-effect` que F2 viene
 * a quitar de otros cuarenta sitios.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { Validador } from './rules';

export interface CampoOpciones<T> {
    /**
     * `NoInfer` es lo que evita tener que anotar el tipo en cada uso.
     *
     * Sin él, `useCampo({ inicial: '' })` hace que TypeScript deduzca `T` del
     * valor inicial y se quede con el tipo LITERAL `''` en vez de `string`.
     * Todo compila dentro del hook y luego el campo no encaja en `<Input>`,
     * que espera `Campo<string>`, con un error incomprensible sobre `""`.
     *
     * Con esto, `inicial` deja de participar en la deducción: el tipo sale
     * del validador si lo hay (`aceptado()` es `Validador<boolean>`, así que
     * una casilla se deduce sola) y si no, del valor por defecto `string`.
     */
    inicial: NoInfer<T>;
    /** Validador, normalmente montado con `combinar(...)`. */
    validar?: Validador<T>;
    /**
     * Enseñar el error desde el primer momento, sin esperar al `blur`.
     * Para campos que se rellenan solos o vienen de fuera y ya llegan mal.
     */
    mostrarDesdeElPrincipio?: boolean;
}

export interface Campo<T> {
    valor: T;
    ponValor: (v: T) => void;
    /** El error que hay AHORA, se esté enseñando o no. */
    error: string | null;
    /** El error que debe pintarse. `null` mientras no toque enseñarlo. */
    errorVisible: string | null;
    tocado: boolean;
    /** Fuerza el error a la vista. Lo llama el envío del formulario. */
    revelar: () => void;
    /** Vuelve al valor inicial y oculta el error. */
    reiniciar: () => void;
    /**
     * Engancha el control, para poder llevarle el foco al enviar.
     *
     * OJO: aquí NO se devuelve el `RefObject`, solo el enganche y `enfocar()`.
     * No es una manía de encapsulación: si el objeto que devuelve este hook
     * contiene una referencia, el analizador de React concluye que el objeto
     * ENTERO es una referencia, y entonces leer `campo.valor` al pintar pasa a
     * ser "acceder a una referencia durante el render" — doce errores en el
     * componente que solo lo estaba usando. Con la referencia dentro y dos
     * funciones fuera, el problema no existe.
     */
    asignarRef: (nodo: HTMLElement | null) => void;
    /** Lleva el foco al control y lo trae a la vista. */
    enfocar: () => void;
    /**
     * Todo lo que necesita `Field` y su control: identificadores,
     * manejadores y los atributos de accesibilidad ya resueltos.
     */
    props: {
        id: string;
        value: T;
        onChange: (e: { target: { value: string; checked?: boolean } }) => void;
        onBlur: () => void;
        'aria-invalid': boolean | undefined;
        'aria-describedby': string | undefined;
    };
    /** Identificadores que `Field` usa para el texto de ayuda y el de error. */
    ids: { control: string; ayuda: string; error: string };
}

export function useCampo<T extends string | number | boolean = string>(
    opciones: CampoOpciones<T>
): Campo<T> {
    const { inicial, validar, mostrarDesdeElPrincipio = false } = opciones;

    const [valor, setValor] = useState<T>(inicial);
    const [tocado, setTocado] = useState(false);
    const [revelado, setRevelado] = useState(mostrarDesdeElPrincipio);
    const ref = useRef<HTMLElement | null>(null);

    const base = useId();
    const ids = useMemo(
        () => ({ control: base, ayuda: `${base}-ayuda`, error: `${base}-error` }),
        [base]
    );

    // Derivado, no guardado. Ver la cabecera.
    const error = useMemo(() => (validar ? validar(valor) : null), [validar, valor]);
    const errorVisible = revelado && error ? error : null;

    const ponValor = useCallback((v: T) => setValor(v), []);

    const asignarRef = useCallback((nodo: HTMLElement | null) => {
        ref.current = nodo;
    }, []);

    const enfocar = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.focus?.();
        // `block: 'center'` y no `'start'`: con una cabecera pegajosa encima,
        // alinear arriba deja el campo justo debajo de ella y no se ve.
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, []);

    const onChange = useCallback(
        (e: { target: { value: string; checked?: boolean } }) => {
            const t = e.target;
            // Una casilla comunica por `checked`; todo lo demás por `value`.
            setValor((typeof t.checked === 'boolean' ? t.checked : t.value) as T);
        },
        []
    );

    const onBlur = useCallback(() => {
        setTocado(true);
        setRevelado(true);
    }, []);

    const revelar = useCallback(() => setRevelado(true), []);

    const reiniciar = useCallback(() => {
        setValor(inicial);
        setTocado(false);
        setRevelado(mostrarDesdeElPrincipio);
    }, [inicial, mostrarDesdeElPrincipio]);

    return {
        valor,
        ponValor,
        error,
        errorVisible,
        tocado,
        revelar,
        reiniciar,
        asignarRef,
        enfocar,
        ids,
        props: {
            id: ids.control,
            value: valor,
            onChange,
            onBlur,
            // `undefined` y no `false`: un `aria-invalid="false"` explícito es
            // ruido para el lector de pantalla en un campo que nadie ha tocado.
            'aria-invalid': errorVisible ? true : undefined,
            'aria-describedby': errorVisible ? ids.error : undefined,
        },
    };
}

/**
 * Valida un formulario entero al enviar.
 *
 * Devuelve `true` si todo está bien. Si no, revela todos los errores y
 * **lleva el foco al primer campo que falla**, que es la parte que casi
 * ningún formulario hace y la que de verdad importa: sin eso, en un
 * formulario largo el error puede estar fuera de la pantalla y la persona
 * solo ve que el botón "no hace nada".
 */
type CampoCualquiera = Campo<string> | Campo<number> | Campo<boolean>;

export function validarFormulario(campos: CampoCualquiera[]): boolean {
    let primeroConError: CampoCualquiera | null = null;

    for (const campo of campos) {
        campo.revelar();
        if (campo.error && !primeroConError) primeroConError = campo;
    }

    if (!primeroConError) return true;

    primeroConError.enfocar();
    return false;
}
