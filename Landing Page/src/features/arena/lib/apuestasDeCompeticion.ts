import { normalizarNombre } from '../../../lib/atletas';

/**
 * QUÉ APUESTAS DE LA ARENA SON DE UNA COMPETICIÓN
 * =====================================================================
 *
 * Desde la zona del club, cada competición lleva a la Arena "a apostar en
 * este campeonato". Pero `arena_bets` no sabe de competiciones: es un título
 * y una descripción que escribe a mano quien abre la apuesta ("Europeo: ¿Marc
 * pasa de 830?"). Así que se casan por el TEXTO.
 *
 * Las palabras que todas las competiciones comparten ("campeonato",
 * "powerlifting", "junior"…) no distinguen nada; las que sí ("europeo",
 * "chiva", "aep3") bastan con que aparezca una. Si una competición no tiene
 * ninguna palabra propia ("Campeonato de España Junior"), tienen que estar
 * todas las genéricas, con sus sinónimos ("nacional" vale por "España").
 */

const VACIAS = new Set(['de', 'del', 'la', 'el', 'y', 'and', 'the', 'of', 'en', 'a']);

const GENERICAS = new Set([
    'campeonato', 'campeonatos', 'championship', 'championships', 'powerlifting', 'classic', 'clasico',
    'equipped', 'equipado', 'open', 'absoluto', 'sub', 'junior', 'subjunior', 'master', 'cup', 'copa',
    'espana', 'nacional', 'spain', 'spanish',
]);

/** Lo que también vale por una palabra: el nombre en inglés de la base y el de la web. */
const SINONIMOS: Record<string, string[]> = {
    espana: ['espana', 'nacional', 'nacionales'],
    european: ['european', 'europeo', 'europa', 'euro'],
    europeo: ['europeo', 'european', 'europa', 'euro'],
    world: ['world', 'mundial'],
    mundial: ['mundial', 'world'],
    subjunior: ['subjunior', 'sbj'],
    junior: ['junior', 'jnr', 'jr'],
};

const palabras = (texto: string) =>
    normalizarNombre(texto)
        .split(' ')
        .filter((p) => p && !VACIAS.has(p) && !/^(19|20)\d\d$/.test(p));

const aparece = (palabra: string, enTexto: Set<string>) =>
    (SINONIMOS[palabra] ?? [palabra]).some((s) => enTexto.has(s));

export interface ApuestaConTexto {
    title: string;
    description?: string | null;
}

/**
 * ¿Es esta apuesta de la competición? `nombres` son las formas en que se
 * llama: la oficial de la base y la corta del cartel.
 */
export function esDeLaCompeticion(apuesta: ApuestaConTexto, nombres: (string | null | undefined)[]): boolean {
    const enTexto = new Set(palabras(`${apuesta.title} ${apuesta.description ?? ''}`));
    // "sub-junior" llega partido en dos: se junta para que case con "subjunior".
    if (enTexto.has('sub') && enTexto.has('junior')) enTexto.add('subjunior');

    const todas = [...new Set(nombres.filter(Boolean).flatMap((n) => palabras(n as string)))];
    if (todas.length === 0) return false;

    const propias = todas.filter((p) => !GENERICAS.has(p));
    if (propias.length > 0) return propias.some((p) => aparece(p, enTexto));
    return todas.filter((p) => p !== 'campeonato' && p !== 'powerlifting').every((p) => aparece(p, enTexto));
}
