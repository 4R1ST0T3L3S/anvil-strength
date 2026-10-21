import { athletes, type Athlete } from '../data/athletes';

/**
 * DE UN NOMBRE DE LA BASE DE DATOS A LA FICHA DEL CLUB
 * =====================================================================
 *
 * La convocatoria trae `profiles.full_name` ("Pau Rodríguez ", con tilde y
 * espacio final; "Marc Alonso Pascual", con el segundo apellido), y la ficha
 * con foto, categoría y marcas vive en `data/athletes.ts` con el nombre
 * corto ("Pau Rodriguez", "Marc Alonso").
 *
 * Antes se buscaba por coincidencia exacta y, si fallaba, por el PRIMER
 * NOMBRE. Con dos Paus en el club eso era una lotería: "Pau Rodríguez", con
 * tilde, no coincidía exacto y caía en el primer "Pau" de la lista. Que
 * acertara era cuestión del orden del fichero.
 *
 * Ahora se compara sin tildes, sin mayúsculas y sin espacios sobrantes, y
 * una ficha casa con un nombre solo si TODAS sus palabras están en él. Nunca
 * por una sola palabra: "Pau" no basta para decidir quién es.
 */

export function normalizarNombre(nombre: string): string {
    return nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9ñ]+/g, ' ')
        .trim();
}

const palabras = (nombre: string) => normalizarNombre(nombre).split(' ').filter(Boolean);

/**
 * La ficha del club que corresponde a un nombre completo, o `undefined`.
 *
 * Si varias fichas casan, gana la que tiene más palabras en común: "Pau
 * Rodriguez" le gana a un hipotético "Pau" a secas.
 */
export function buscarAtleta(nombreCompleto: string | null | undefined, lista: Athlete[] = athletes): Athlete | undefined {
    if (!nombreCompleto) return undefined;
    const buscadas = new Set(palabras(nombreCompleto));
    if (buscadas.size === 0) return undefined;

    let mejor: Athlete | undefined;
    let mejorPeso = 0;
    for (const atleta of lista) {
        const suyas = palabras(atleta.name);
        // Una sola palabra en la ficha ("Masoko", "Alejandro") solo casa si el
        // nombre buscado es exactamente esa palabra.
        if (suyas.length < 2 && !(buscadas.size === 1 && buscadas.has(suyas[0]))) continue;
        if (!suyas.every((p) => buscadas.has(p))) continue;
        if (suyas.length > mejorPeso) {
            mejor = atleta;
            mejorPeso = suyas.length;
        }
    }
    return mejor;
}

/** La ficha por su identificador de URL. */
export function atletaPorSlug(slug: string | null | undefined): Athlete | undefined {
    if (!slug) return undefined;
    return athletes.find((a) => a.slug === slug);
}

/**
 * Nombre y apellidos para un rótulo: la primera palabra va pequeña y el
 * resto en grande, como en los rótulos de presentación. "Marc Alonso
 * Pascual" → { nombre: "Marc", apellidos: "Alonso Pascual" }.
 */
export function partirNombre(nombre: string): { nombre: string; apellidos: string } {
    const limpias = nombre.trim().split(/\s+/);
    if (limpias.length === 1) return { nombre: '', apellidos: limpias[0] };
    return { nombre: limpias[0], apellidos: limpias.slice(1).join(' ') };
}

/**
 * La categoría de peso tal cual la escribimos ("-105kg SBJ", "-69 JNR",
 * "+120kg Open") partida en sus dos datos: el número para el rótulo grande y
 * la división en palabras.
 */
export function leerCategoria(categoria: string): { peso: string | null; division: string | null } {
    const peso = categoria.match(/[-+]\s?\d{2,3}/)?.[0]?.replace(/\s/g, '') ?? null;
    const resto = categoria.toUpperCase();
    const division = /\bSBJ\b|SUB-?JUNIOR/.test(resto)
        ? 'Sub-junior'
        : /\bJNR\b|JUNIOR/.test(resto)
            ? 'Junior'
            : /\bOPEN\b|ABSOLUT/.test(resto)
                ? 'Open'
                : /MASTER/.test(resto)
                    ? 'Máster'
                    : null;
    return { peso, division };
}
