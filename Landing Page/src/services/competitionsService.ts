import { supabase } from '../lib/supabase';

export interface CompetitionAssignment {
    id: string;
    athlete_id: string;
    coach_id: string;
    name: string;
    date: string;
    end_date?: string; // Add end_date
    location?: string;
    level?: string; // Add level optional for backward compatibility
    description?: string;
    created_at: string;
}

/**
 * Clave con la que dos filas son "la misma competición".
 *
 * Mismo atleta, mismo nombre y misma fecha. El nombre se compara sin
 * mayúsculas ni espacios de sobra porque la misma competición llega escrita
 * de dos formas: la del calendario de la AEP y la que teclea el atleta al
 * auto-asignársela. Dos competiciones DISTINTAS el mismo día tendrían
 * nombres distintos, así que la clave no puede fundir nada que no toque.
 */
function competitionKey(c: { athlete_id?: string; name: string; date: string }): string {
    return `${c.athlete_id ?? ''}|${c.name.trim().toLowerCase()}|${c.date}`;
}

/**
 * De un grupo de filas repetidas, con cuál nos quedamos.
 *
 * Con la MÁS COMPLETA, no con la más antigua. La que tiene entrenador,
 * descripción y nivel es la que asignó el coach; la auto-asignada por el
 * atleta suele venir a secas, y quedarnos con ella por ser anterior haría
 * desaparecer la descripción que sale en la web pública.
 */
function completeness(c: CompetitionAssignment): number {
    return (c.coach_id ? 8 : 0)
        + (c.description?.trim() ? 4 : 0)
        + (c.level ? 2 : 0)
        + (c.location ? 1 : 0);
}

/**
 * Una fila por competición.
 *
 * Los duplicados se generan solos: el coach asigna la competición, el
 * atleta se la auto-asigna desde su panel, y el coach vuelve a asignarla al
 * añadir a un compañero al mismo campeonato. En el panel del entrenador la
 * misma competición aparecía tres y cuatro veces.
 *
 * Esto es la red del CLIENTE. La garantía de verdad es el índice único de
 * database/MEJORAS_ANALISIS_VBT.sql; mientras esa migración no esté
 * aplicada contra la base, esta función es lo único que hay.
 */
export function dedupeCompetitions<T extends CompetitionAssignment>(rows: T[]): T[] {
    const best = new Map<string, T>();

    for (const row of rows) {
        const key = competitionKey(row);
        const current = best.get(key);
        if (!current || completeness(row) > completeness(current)) {
            best.set(key, row);
        }
    }

    // Se conserva el orden en el que llegaron: la consulta ya viene ordenada
    // por fecha y reordenar aquí rompería ese criterio sin motivo.
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = competitionKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(row => best.get(competitionKey(row))!);
}

export const competitionsService = {
    async assignCompetition(
        competition: { name: string; date: string; end_date?: string; location?: string; level?: string; description?: string },
        athleteIds: string[],
        coachId: string
    ) {
        /**
         * Los atletas que YA la tienen no se vuelven a insertar.
         *
         * Sin esto, asignar un campeonato a los seis atletas del club cuando
         * dos ya se lo habían puesto ellos mismos dejaba a esos dos con la
         * competición duplicada. Y con el índice único aplicado, el INSERT
         * completo fallaría por esas dos filas y los otros cuatro se
         * quedarían sin asignar.
         */
        const { data: existing } = await supabase
            .from('competitions')
            .select('athlete_id, name, date')
            .in('athlete_id', athleteIds)
            .eq('date', competition.date);

        const yaAsignados = new Set(
            (existing ?? [])
                .filter(c => c.name?.trim().toLowerCase() === competition.name.trim().toLowerCase())
                .map(c => c.athlete_id as string)
        );

        const pendientes = athleteIds.filter(id => !yaAsignados.has(id));
        if (pendientes.length === 0) return [];

        const payload = pendientes.map(athleteId => ({
            athlete_id: athleteId,
            coach_id: coachId,
            name: competition.name,
            date: competition.date, // Ensure format YYYY-MM-DD
            end_date: competition.end_date, // Pass end_date (can be null)
            location: competition.location,
            level: competition.level,
            description: competition.description || null
        }));

        const { data, error } = await supabase
            .from('competitions')
            .insert(payload)
            .select();

        if (error) throw error;
        return data;
    },

    async addSelfCompetition(
        athleteId: string,
        competition: { name: string; date: string; end_date?: string; location?: string; level?: string }
    ) {
        // Si su entrenador ya se la asignó, no se crea una segunda: el atleta
        // no lo ve porque en su pantalla solo hay una tarjeta, pero el coach
        // acababa viendo la misma competición dos veces en la ficha.
        const { data: existing } = await supabase
            .from('competitions')
            .select('id, name')
            .eq('athlete_id', athleteId)
            .eq('date', competition.date);

        const yaExiste = (existing ?? []).some(
            c => c.name?.trim().toLowerCase() === competition.name.trim().toLowerCase()
        );
        if (yaExiste) return [];

        const payload = {
            athlete_id: athleteId,
            coach_id: null, // Self-assigned
            name: competition.name,
            date: competition.date,
            end_date: competition.end_date,
            location: competition.location,
            level: competition.level
        };

        const { data, error } = await supabase
            .from('competitions')
            .insert(payload)
            .select();

        if (error) throw error;
        return data;
    },

    async getNextCompetition(athleteId: string) {
        const today = new Date().toISOString().split('T')[0];

        // Optimized: filter in DB and get only 1 result
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('athlete_id', athleteId)
            .or(`date.gte.${today},end_date.gte.${today}`)
            .order('date', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data as CompetitionAssignment | null;
    },

    /**
     * Competiciones de un atleta, UNA POR COMPETICIÓN.
     *
     * Se ordenan de la más próxima a la más lejana en el tiempo pasado: lo
     * que interesa arriba es lo que viene, no lo que ya pasó.
     */
    async getAthleteCompetitions(athleteId: string) {
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('date', { ascending: false });

        if (error) throw error;
        return dedupeCompetitions((data ?? []) as CompetitionAssignment[]);
    },

    /**
     * Competiciones que ha asignado un entrenador, con el nombre del atleta.
     *
     * POR QUÉ NO ES UN SIMPLE `select` CON EMBED
     *
     * Al sacar a un atleta del equipo desaparecía el CALENDARIO ENTERO del
     * entrenador, no solo las filas de ese atleta.
     *
     * La causa es el `embed` a `profiles`. La política de lectura de perfiles
     * deja al coach ver los de SUS atletas, y "sus atletas" son las filas de
     * `coach_athletes`. Al romper el vínculo, ese perfil deja de ser legible;
     * y cuando la RLS bloquea una tabla incrustada, PostgREST no devuelve la
     * competición sin nombre: rechaza la consulta COMPLETA con 401. Las
     * competiciones seguían ahí —tienen `coach_id`, no dependen del vínculo—
     * pero la pantalla se quedaba vacía.
     *
     * Aquí las competiciones se piden SIN embed, que es una consulta que
     * depende solo de `coach_id` y no puede fallar por un vínculo roto. Los
     * nombres se piden aparte y en un segundo viaje: si alguno no es legible,
     * ese atleta sale como "Atleta" y el resto del calendario intacto.
     */
    async getCoachAssignments(coachId: string) {
        const { data, error } = await supabase
            .from('competitions')
            .select('*')
            .eq('coach_id', coachId)
            .order('date', { ascending: true });

        if (error) throw error;

        // Una fila por atleta y competición: el calendario del coach repetía
        // la misma prueba tantas veces como asignaciones sueltas hubiera.
        const assignments = dedupeCompetitions((data ?? []) as CompetitionAssignment[]);
        if (assignments.length === 0) return [];

        const athleteIds = [...new Set(assignments.map(a => a.athlete_id).filter(Boolean))];

        // Un fallo aquí NO puede tumbar el calendario: el nombre es una
        // comodidad, la competición es el dato.
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', athleteIds);

        const byId = new Map(
            (profiles ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
        );

        return assignments.map(assignment => ({
            ...assignment,
            athlete: byId.get(assignment.athlete_id) ?? null,
        }));
    },

    async removeAssignment(assignmentId: string) {
        const { error } = await supabase
            .from('competitions')
            .delete()
            .eq('id', assignmentId);

        if (error) throw error;
    },

    /**
     * Competiciones para la página pública.
     *
     * Va contra `get_public_upcoming_competitions()` (database/
     * FIX_COMPETICIONES_CLUB.sql), no contra la tabla directamente: la RLS
     * de `competitions` (database/FIX_RLS_COMPETICIONES.sql) solo deja leer
     * sin sesión las filas con `athlete_id IS NULL` — el calendario oficial
     * de la federación —, así que un `select` normal con `profiles`
     * incrustado devolvía 401 y la página se quedaba vacía para cualquier
     * visitante.
     *
     * La función es `SECURITY DEFINER` y decide ella misma, en el servidor,
     * qué enseña: solo competiciones de atletas con un vínculo
     * `coach_athletes` ACTIVO, es decir miembros reales del club — no
     * cualquier fila de `profiles` que exista. Así se evita tanto el 401
     * como colar competiciones de gente que no entrena en Anvil.
     */
    async getPublicCompetitions() {
        const { data, error } = await supabase.rpc('get_public_upcoming_competitions');

        if (error) {
            console.error(
                'Error al leer las competiciones públicas:',
                `${error.code ?? 'sin código'} — ${error.message}`
            );
            throw error;
        }

        // La página pública lista una tarjeta por atleta y competición. Un
        // duplicado ahí sale al público, no solo al coach.
        type PublicRow = CompetitionAssignment & {
            athlete_full_name: string;
            athlete_avatar_url: string | null;
        };
        return dedupeCompetitions((data ?? []) as PublicRow[]);
    },

    /**
     * RESULTADOS DE COMPETICIÓN.
     *
     * Tabla propia (`competition_results`), no columnas en `competitions`:
     * esa tabla también guarda el calendario oficial de la AEP, que no
     * disputa nada. Ver database/REESTRUCTURACION_2026-08.sql.
     */
    async getResults(athleteId: string): Promise<CompetitionResult[]> {
        const { data, error } = await supabase
            .from('competition_results')
            .select('*')
            .eq('athlete_id', athleteId);

        if (error) {
            // 42P01 = la tabla no existe todavía (migración sin ejecutar).
            if (error.code === '42P01') return [];
            throw error;
        }
        return data || [];
    },

    async upsertResult(result: Omit<CompetitionResult, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
        const { error } = await supabase
            .from('competition_results')
            .upsert(result, { onConflict: 'competition_id, athlete_id' });

        if (error) throw error;
    },
};

export interface CompetitionResult {
    id?: string;
    competition_id: string;
    athlete_id: string;
    bodyweight_kg?: number | null;
    squat_kg?: number | null;
    bench_kg?: number | null;
    deadlift_kg?: number | null;
    total_kg?: number | null;
    dots?: number | null;
    place?: string | null;
    notes?: string | null;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}
