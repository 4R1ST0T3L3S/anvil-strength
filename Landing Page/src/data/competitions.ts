import { normalizarNombre } from '../lib/atletas';

/**
 * DATOS ESTÁTICOS DE COMPETICIONES — lo que la base de datos no sabe
 * =====================================================================
 *
 * Las competiciones y sus convocados salen de Supabase. Lo único que vive
 * aquí es lo que es de MARCA y no de calendario: cómo se dice el nombre en
 * la web. Los nombres oficiales de la EPF y la IPF son larguísimos ("EUROPEAN
 * Sub-Junior & Junior Classic Powerlifting Championships"), y a tamaño de
 * cartel ocupan cinco líneas; aquí se les da un nombre corto, en los dos
 * idiomas de la web. El oficial se sigue enseñando debajo, en pequeño.
 *
 * `coincide` se compara con el nombre de la base SIN tildes ni mayúsculas, y
 * basta con que esté contenido: "european sub junior" casa con el nombre
 * oficial entero.
 *
 * Las fotos de los atletas ya no van aquí: cada ficha de data/athletes.ts
 * lleva su `recorte`.
 */

export interface CompetitionMeta {
    coincide: string;
    nombreCorto: { es: string; en: string };
}

export const competitionsMeta: CompetitionMeta[] = [
    {
        coincide: 'european sub junior junior',
        // El guion lleva detrás una unión de palabra (U+2060): sin ella, a tamaño
        // de cartel el nombre se partía en "SUB-" / "JUNIOR".
        nombreCorto: { es: 'Europeo Sub-\u2060junior y Junior', en: 'European Sub-\u2060junior & Junior' },
    },
    {
        coincide: 'world open equipped',
        nombreCorto: { es: 'Mundial Open Equipado', en: 'World Open Equipped' },
    },
    // ── Añade aquí más competiciones ────────────────────────────────────────
];

/** El nombre corto de una competición, o `null` si no tiene. */
export function nombreCorto(nombre: string, idioma: 'es' | 'en'): string | null {
    const n = normalizarNombre(nombre);
    const meta = competitionsMeta.find((c) => n.includes(c.coincide));
    return meta ? meta.nombreCorto[idioma] : null;
}
