import { es, type ClaveDeTraduccion, type DiccionarioTraducido, type Traducciones } from './es';
import { en } from './en';

/**
 * ANVIL STRENGTH — LA CAPA DE IDIOMAS
 * =====================================================================
 *
 * POR QUÉ ESTÁ ESCRITA A MANO Y NO ES `i18next`
 *
 * Decisión U3: cero dependencias nuevas. Y aquí no es un capricho — `i18next`
 * con su enlace de React son unos 40 KB comprimidos, y lo que esta aplicación
 * usa de él cabe en este fichero: dos idiomas, sin espacios de nombres, sin
 * carga en diferido de traducciones, sin detección por subdominio.
 *
 * Lo que sí se conserva de las librerías serias es lo que de verdad importa:
 * plurales por `Intl.PluralRules` en vez de `n === 1`, formatos por `Intl`, y
 * un contrato de tipos que impide que un diccionario se quede a medias.
 *
 *
 * LA REGLA QUE NO SE PUEDE ROMPER
 *
 * **Los datos del usuario NO se traducen nunca.** Nombres de atletas, de
 * ejercicios, títulos de bloques, notas, mensajes. `t()` solo sabe de claves
 * declaradas en `es.ts`: si algo viene de Supabase, no tiene clave, y no hay
 * forma de pasarlo por aquí ni queriendo. El tipo lo impide.
 *
 *
 * ESTADO: LA CAPA ESTÁ, LA EXTRACCIÓN NO
 *
 * Este fichero y los dos diccionarios funcionan y están probados. Lo que no
 * está hecho es sacar las varios miles de cadenas que hay repartidas por los
 * componentes: eso es un trabajo de barrido pantalla por pantalla que va con
 * el rediseño de F5, no antes. El diccionario cubre por ahora el armazón —
 * navegación, acciones, los cuatro estados, validación, tema, días, periodo—
 * que es lo que aparece en todas las pantallas a la vez.
 *
 * El orden correcto para seguir es: al tocar una pantalla en F5, sus cadenas
 * suben aquí. Traducir a ciegas lo que aún va a cambiar es trabajo doble.
 */

export type Idioma = 'es' | 'en';

const DICCIONARIOS: Record<Idioma, DiccionarioTraducido> = { es, en };

export const CLAVE_IDIOMA = 'anvil_idioma';

/**
 * Qué idioma se usa.
 *
 * Orden: lo que la persona eligió > lo que pide el navegador > español.
 *
 * El español es el respaldo y no el inglés, y eso es una decisión: el club es
 * español, la federación es española y la inmensa mayoría de quien entra
 * escribe en español. Un respaldo en inglés serviría a la minoría.
 */
export function detectarIdioma(): Idioma {
    try {
        const guardado = localStorage.getItem(CLAVE_IDIOMA);
        if (guardado === 'es' || guardado === 'en') return guardado;
    } catch { /* modo privado */ }

    try {
        // `navigator.languages` y no `language`: quien tiene el sistema en
        // inglés pero el español como segunda lengua prefiere el español a
        // que le hablemos en inglés, y ese orden solo está en la lista.
        for (const etiqueta of navigator.languages ?? [navigator.language]) {
            const base = etiqueta.toLowerCase().split('-')[0];
            if (base === 'es') return 'es';
            if (base === 'en') return 'en';
        }
    } catch { /* sin navigator */ }

    return 'es';
}

export function guardarIdioma(idioma: Idioma) {
    try {
        localStorage.setItem(CLAVE_IDIOMA, idioma);
    } catch { /* modo privado */ }
    document.documentElement.setAttribute('lang', idioma);
}

/**
 * Los huecos de una cadena, sacados del propio texto.
 *
 * `'Faltan {n} caracteres'` → `{ n: … }` obligatorio, y pasar `{ m: 1 }` es
 * un error de compilación. Sin esto, cambiar `{dias}` por `{n}` en el
 * diccionario deja `{dias}` impreso literalmente en pantalla, que es el fallo
 * clásico de las capas de traducción escritas a mano.
 */
type Huecos<S extends string> = S extends `${string}{${infer H}}${infer Resto}`
    ? { [K in H | keyof Huecos<Resto>]: string | number }
    : Record<never, never>;

type ValoresDe<K extends ClaveDeTraduccion> = Huecos<Traducciones[K]>;

/**
 * Lo que hay que pasarle a `t()` además de la clave: nada, o un objeto con
 * los huecos de esa frase concreta. Se exporta con nombre propio para que
 * quien envuelva `traducir` no tenga que repetir el condicional.
 */
export type ArgsDe<K extends ClaveDeTraduccion> =
    keyof ValoresDe<K> extends never ? [] : [ValoresDe<K>];

/** Las claves que tienen forma singular, sin el sufijo. */
export type BaseDePlural = ClaveDeTraduccion extends infer K
    ? K extends `${infer B}_una` ? B : never
    : never;

function rellenar(plantilla: string, valores?: Record<string, string | number>): string {
    if (!valores) return plantilla;
    return plantilla.replace(/\{(\w+)\}/g, (entero, nombre: string) =>
        // Si falta un valor se deja el hueco tal cual. Es feo A PROPÓSITO: un
        // `{nombre}` en pantalla se ve y se arregla; una cadena vacía pasa
        // desapercibida y deja una frase sin sentido.
        nombre in valores ? String(valores[nombre]) : entero
    );
}

/** Traduce una clave. Es la única puerta: lo que no tenga clave, no pasa. */
export function traducir<K extends ClaveDeTraduccion>(
    idioma: Idioma,
    clave: K,
    ...resto: ArgsDe<K>
): string {
    const dic = DICCIONARIOS[idioma] ?? es;
    return rellenar(dic[clave] ?? es[clave] ?? clave, resto[0] as Record<string, string | number> | undefined);
}

/**
 * Plurales con `Intl.PluralRules`, no con `n === 1`.
 *
 * En español y en inglés el `n === 1` acierta casi siempre, así que la
 * tentación es escribirlo a mano. No se hace por dos motivos: «0 series» y
 * «1,5 series» ya caen en la rama plural en las dos lenguas —cosa que un
 * `=== 1` acierta por casualidad, no por saberlo—, y el día que entre una
 * tercera lengua con más de dos formas (el polaco tiene tres, el árabe seis)
 * esto sigue funcionando sin reescribir ninguna llamada.
 *
 * Las claves se nombran `algo_una` y `algo_varias`, y `BaseDePlural` saca la
 * lista de bases del propio diccionario: escribir `plural(i, 'entreno.seri',
 * 3)` no compila, y añadir un plural nuevo lo añade a la lista solo.
 */
export function plural(
    idioma: Idioma,
    base: BaseDePlural,
    n: number,
    extra?: Record<string, string | number>
): string {
    const forma = new Intl.PluralRules(idioma).select(n);
    const sufijo = forma === 'one' ? '_una' : '_varias';
    const clave = `${base}${sufijo}` as ClaveDeTraduccion;
    const dic = DICCIONARIOS[idioma] ?? es;
    return rellenar(dic[clave] ?? es[clave] ?? clave, { n, ...extra });
}

/* =====================================================================
   FORMATOS
   =====================================================================
   Todo por `Intl`. Escribir `${dia}/${mes}/${anyo}` a mano funciona en
   España y produce una fecha equivocada —o directamente al revés— en cuanto
   alguien la lee en otro sitio: 03/04 es el 3 de abril aquí y el 4 de marzo
   en Estados Unidos. `Intl` sabe eso y nosotros no.

   Los formateadores se guardan en caché porque crear un `Intl.DateTimeFormat`
   es caro y estas funciones se llaman dentro de listas de cientos de filas.  */

const cacheFecha = new Map<string, Intl.DateTimeFormat>();
const cacheNumero = new Map<string, Intl.NumberFormat>();

function localeDe(idioma: Idioma): string {
    // `es-ES` y no `es` a secas: decide la coma decimal y el formato de fecha
    // de España, no el de México ni el de Argentina.
    return idioma === 'en' ? 'en-GB' : 'es-ES';
}

export function formatearFecha(
    idioma: Idioma,
    fecha: Date | string,
    opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
    if (Number.isNaN(d.getTime())) return '';
    const clave = localeDe(idioma) + JSON.stringify(opciones);
    let f = cacheFecha.get(clave);
    if (!f) {
        f = new Intl.DateTimeFormat(localeDe(idioma), opciones);
        cacheFecha.set(clave, f);
    }
    return f.format(d);
}

export function formatearNumero(
    idioma: Idioma,
    n: number,
    opciones: Intl.NumberFormatOptions = {}
): string {
    const clave = localeDe(idioma) + JSON.stringify(opciones);
    let f = cacheNumero.get(clave);
    if (!f) {
        f = new Intl.NumberFormat(localeDe(idioma), opciones);
        cacheNumero.set(clave, f);
    }
    return f.format(n);
}

/**
 * Un peso, con las decimales que hagan falta y ni una más.
 *
 * 100 se escribe «100 kg» y no «100,0 kg»; 97,5 se escribe «97,5 kg». La
 * unidad NO cambia con el idioma: ver la nota de `en.ts`.
 */
export function formatearPeso(idioma: Idioma, kg: number): string {
    return `${formatearNumero(idioma, kg, { maximumFractionDigits: 1 })} kg`;
}

/** El día de la semana en formato ISO: 1 = lunes … 7 = domingo. */
export const DIAS_ISO = [
    'dia.lunes', 'dia.martes', 'dia.miercoles', 'dia.jueves',
    'dia.viernes', 'dia.sabado', 'dia.domingo',
] as const satisfies readonly ClaveDeTraduccion[];

export const DIAS_ISO_CORTOS = [
    'diaCorto.lunes', 'diaCorto.martes', 'diaCorto.miercoles', 'diaCorto.jueves',
    'diaCorto.viernes', 'diaCorto.sabado', 'diaCorto.domingo',
] as const satisfies readonly ClaveDeTraduccion[];

export type { ClaveDeTraduccion, Traducciones };
