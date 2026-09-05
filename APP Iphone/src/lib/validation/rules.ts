/**
 * ANVIL STRENGTH — REGLAS DE VALIDACIÓN
 * =====================================================================
 *
 * POR QUÉ NO HAY UNA LIBRERÍA AQUÍ
 *
 * Decisión U3 del 23/08/2026. `zod` + `react-hook-form` son unos 25 KB y,
 * sobre todo, un segundo modelo mental para 157 campos que hoy son
 * `useState` sueltos: migrarlos obligaría a reescribir el formulario
 * entero, no solo a añadirle validación. El proyecto ya tiene el patrón de
 * "contrato en código" funcionando en `lib/prefs/contract.ts` y
 * `lib/forms/axes.ts`, y esto es lo mismo.
 *
 *
 * QUÉ ES UN VALIDADOR AQUÍ
 *
 * Una función pura que recibe un valor y devuelve `null` si está bien o el
 * mensaje de error si está mal. Nada más. Eso las hace triviales de probar
 * —hay pruebas en `rules.test.ts`— y de componer.
 *
 * El mensaje va DENTRO del validador y no fuera porque un error tiene que
 * decir qué pasa Y cómo se arregla, y eso depende de la regla concreta:
 * "Escribe un correo" no ayuda; "Falta la arroba" sí.
 *
 *
 * ESTO NO ES SEGURIDAD
 *
 * Es experiencia de uso: sirve para que la persona se entere antes de
 * enviar. Quien manda de verdad son las políticas RLS y las funciones de
 * Supabase. Ninguna regla de este fichero sustituye a una de allí.
 */

/** Devuelve `null` si el valor es válido, o el mensaje de error si no. */
export type Validador<T = string> = (valor: T) => string | null;

/**
 * Encadena validadores y devuelve el PRIMER error.
 *
 * Uno y no todos: una lista de tres quejas debajo de un campo no se lee, se
 * ignora. Se arregla el primer problema, se vuelve a validar, y aparece el
 * siguiente si lo hay.
 */
export function combinar<T>(...validadores: Array<Validador<T> | null | false | undefined>): Validador<T> {
    return (valor: T) => {
        for (const v of validadores) {
            if (!v) continue;
            const error = v(valor);
            if (error) return error;
        }
        return null;
    };
}

const vacio = (v: unknown) =>
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Campo obligatorio.
 *
 * `que` nombra la cosa que falta, en minúscula y sin artículo: "el nombre",
 * "una fecha". Se usa para que el mensaje sea específico sin tener que
 * escribirlo entero en cada campo.
 */
export const requerido = <T,>(que = 'este dato'): Validador<T> =>
    (valor) => (vacio(valor) ? `Falta ${que}.` : null);

/**
 * Correo electrónico.
 *
 * La expresión es deliberadamente PERMISIVA. Validar direcciones de correo
 * de verdad es imposible con una expresión regular (el estándar admite
 * comillas, comentarios y direcciones IP entre corchetes), y las expresiones
 * "estrictas" que circulan por internet rechazan direcciones válidas —
 * cualquier cosa con un `+`, dominios nuevos de más de cuatro letras. Un
 * campo que rechaza un correo bueno es peor que uno que acepta uno malo:
 * el malo lo caza el correo de confirmación, el bueno deja fuera a alguien.
 *
 * Aquí solo se comprueba la forma mínima: algo, arroba, algo, punto, algo.
 */
export const email = (): Validador<string> => (valor) => {
    if (vacio(valor)) return null; // De lo vacío se encarga `requerido`.
    const v = valor.trim();
    if (!v.includes('@')) return 'Falta la arroba.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Ese correo no parece completo.';
    return null;
};

/**
 * Longitud mínima. Para contraseñas y nombres.
 *
 * El mensaje dice cuánto falta, no cuánto hace falta: "faltan 3 caracteres"
 * es accionable, "mínimo 8" obliga a contar.
 */
export const minimoLargo = (min: number, que = 'Esto'): Validador<string> => (valor) => {
    if (vacio(valor)) return null;
    const faltan = min - valor.length;
    if (faltan > 0) {
        return faltan === 1
            ? `${que} necesita 1 carácter más.`
            : `${que} necesita ${faltan} caracteres más.`;
    }
    return null;
};

export const maximoLargo = (max: number, que = 'Esto'): Validador<string> => (valor) => {
    if (vacio(valor)) return null;
    const sobran = valor.length - max;
    return sobran > 0
        ? `${que} se pasa por ${sobran} ${sobran === 1 ? 'carácter' : 'caracteres'}.`
        : null;
};

/**
 * Contraseña.
 *
 * Solo longitud, y ocho caracteres. Nada de exigir mayúscula, número y
 * símbolo: eso no produce contraseñas más difíciles de romper, produce
 * `Contrasena1!` y un post-it. Supabase ya rechaza las conocidas por
 * filtraciones, que es la comprobación que sí sirve.
 */
export const contrasena = (): Validador<string> => (valor) => {
    if (vacio(valor)) return null;
    if (valor.length < 8) {
        const faltan = 8 - valor.length;
        return `La contraseña necesita ${faltan} ${faltan === 1 ? 'carácter' : 'caracteres'} más.`;
    }
    return null;
};

/** Que dos campos coincidan. Para repetir la contraseña. */
export const igualA = (otro: () => string, que = 'Las contraseñas'): Validador<string> =>
    (valor) => (vacio(valor) || valor === otro() ? null : `${que} no coinciden.`);

/**
 * Número dentro de un rango.
 *
 * Acepta cadena porque los `<input>` siempre devuelven cadena, y admite la
 * coma decimal: en España se teclea "97,5", y `Number("97,5")` es `NaN`.
 * Ese detalle es la diferencia entre "no puedo escribir mi peso" y que
 * funcione.
 */
export const numeroEnRango = (
    min: number,
    max: number,
    { unidad = '', que = 'El valor' }: { unidad?: string; que?: string } = {}
): Validador<string | number> => (valor) => {
    if (vacio(valor)) return null;
    const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(n)) return `${que} tiene que ser un número.`;
    const u = unidad ? ` ${unidad}` : '';
    if (n < min) return `${que} no puede ser menos de ${min}${u}.`;
    if (n > max) return `${que} no puede pasar de ${max}${u}.`;
    return null;
};

/** Entero, para repeticiones y series. */
export const entero = (que = 'El valor'): Validador<string | number> => (valor) => {
    if (vacio(valor)) return null;
    const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(n)) return `${que} tiene que ser un número.`;
    return Number.isInteger(n) ? null : `${que} tiene que ser un número entero.`;
};

/**
 * Fecha en formato ISO (`aaaa-mm-dd`), que es lo que devuelve
 * `<input type="date">` y lo que guarda la base.
 *
 * `desde`/`hasta` son opcionales y sirven para lo que de verdad se equivoca
 * la gente: teclear el año con dos dígitos y acabar en 0025, o poner la
 * competición del año pasado.
 */
export const fecha = (
    { desde, hasta, que = 'La fecha' }: { desde?: Date; hasta?: Date; que?: string } = {}
): Validador<string> => (valor) => {
    if (vacio(valor)) return null;
    const d = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(d.getTime())) return `${que} no es válida.`;
    const comoTexto = (x: Date) => x.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    if (desde && d < desde) return `${que} no puede ser anterior al ${comoTexto(desde)}.`;
    if (hasta && d > hasta) return `${que} no puede ser posterior al ${comoTexto(hasta)}.`;
    return null;
};

/** Al menos una opción marcada. Para grupos de casillas. */
export const alMenosUno = (que = 'una opción'): Validador<unknown[]> =>
    (valor) => (Array.isArray(valor) && valor.length > 0 ? null : `Elige al menos ${que}.`);

/** Casilla que hay que marcar: términos, consentimiento. */
export const aceptado = (mensaje = 'Tienes que aceptarlo para continuar.'): Validador<boolean> =>
    (valor) => (valor === true ? null : mensaje);
