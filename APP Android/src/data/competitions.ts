/**
 * DATOS ESTÁTICOS DE COMPETICIONES
 * 
 * El campo `name` debe coincidir EXACTAMENTE con el nombre en Supabase.
 * 
 * IMÁGENES DE PORTADA DE TARJETA:
 *   Coloca las fotos en: /public/competitions/[slug]/cover.jpg
 *   Si no hay imagen, se usará la imagen por defecto.
 * 
 * FOTOS DE ATLETAS PARA EL ROSTER (sin fondo):
 *   Coloca las fotos en: /public/athletes/roster/[nombre-normalizado].png
 *   Ejemplo: Gema Cruz → /public/athletes/roster/gema-cruz.png
 */

export interface CompetitionMeta {
    name: string;         // Debe coincidir EXACTAMENTE con el nombre en Supabase
    coverImage: string;   // Ruta a la foto de portada de la tarjeta
    accentColor?: string; // Color de acento opcional (por defecto rojo Anvil)
}

export const competitionsMeta: CompetitionMeta[] = [
    {
        name: "Campeonato de España Junior",
        coverImage: "/competitions/cespjunior/cover.jpg",
        accentColor: "#e63946",
    },
    {
        name: "SBD CUP 2025",
        coverImage: "/competitions/sbdcup2025/cover.jpg",
        accentColor: "#e63946",
    },
    {
        name: "AEP3 Las Torres de Cotillas",
        coverImage: "/competitions/aep3torrescotillas/cover.jpg",
        accentColor: "#e63946",
    },
    // ── Añade aquí más competiciones ──────────────────────────────────────────
    // {
    //     name: "Nombre exacto en Supabase",
    //     coverImage: "/competitions/[slug]/cover.jpg",
    // },
];

/**
 * Devuelve los metadatos de una competición por nombre.
 * Si no encuentra coincidencia exacta, busca por coincidencia parcial.
 * Si no hay ninguna, devuelve una imagen por defecto.
 */
export function getCompetitionMeta(name: string): CompetitionMeta {
    const exact = competitionsMeta.find(
        c => c.name.toLowerCase() === name.toLowerCase()
    );
    if (exact) return exact;

    const partial = competitionsMeta.find(
        c => name.toLowerCase().includes(c.name.toLowerCase()) ||
             c.name.toLowerCase().includes(name.toLowerCase())
    );
    if (partial) return partial;

    return {
        name,
        coverImage: "/portadaanvil2.jpg", // Imagen por defecto
        accentColor: "#e63946",
    };
}

/**
 * FOTOS DE ATLETAS PARA EL ROSTER
 * 
 * Mapea el nombre del atleta (tal como viene de Supabase full_name)
 * a la ruta de su foto sin fondo.
 * 
 * Coloca las fotos en: /public/athletes/roster/
 */
export const athleteRosterPhotos: Record<string, string> = {
    "Gema Cruz":              "/athletes/roster/gema-cruz.png",
    "Alejandro Hermosilla":   "/athletes/roster/alejandro-hermosilla.png",
    "Marc Alonso":            "/athletes/roster/marc-alonso.png",
    "Pau Rodriguez":          "/athletes/roster/pau-rodriguez.png",
    "Josep Lopez":            "/athletes/roster/josep-lopez.png",
    "Carlos Villena":         "/athletes/roster/carlos-villena.png",
    "Marina Rico":            "/athletes/roster/marina-rico.png",
    "Elsa Fernandez-Arenas":  "/athletes/roster/elsa-fernandez.png",
    "Pau Camacho":            "/athletes/roster/pau-camacho.png",
    "Santiago Badia":         "/athletes/roster/santiago-badia.png",
    "Javier Rubio":           "/athletes/roster/javier-rubio.png",
    "Masoko":                 "/athletes/roster/masoko.png",
    // ── Añade más atletas aquí ────────────────────────────────────────────────
};

/**
 * Devuelve la ruta de la foto de roster de un atleta.
 * Si no hay foto específica, devuelve null (se mostrará la inicial).
 */
export function getAthleteRosterPhoto(fullName: string): string | null {
    // Búsqueda exacta
    if (athleteRosterPhotos[fullName]) return athleteRosterPhotos[fullName];
    
    // Búsqueda flexible (primer nombre)
    const firstName = fullName.split(" ")[0].toLowerCase();
    const match = Object.entries(athleteRosterPhotos).find(
        ([key]) => key.toLowerCase().startsWith(firstName)
    );
    return match ? match[1] : null;
}
