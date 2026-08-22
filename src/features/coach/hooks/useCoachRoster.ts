import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import type { RelationKind, RelationStatus } from '../../../services/athletesService';

/**
 * ANVIL STRENGTH — LOS ATLETAS DE UN ENTRENADOR, POR UNA SOLA PUERTA
 * =====================================================================
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * La misma consulta —"¿quiénes son los atletas de este entrenador?"— estaba
 * escrita OCHO veces, a mano, en ocho componentes distintos. Cinco de las
 * ocho se olvidaban de filtrar por `status = 'active'`:
 *
 *     AttentionPanel · AssignCompetitionModal · DuplicateBlockModal
 *     SavePwrResultModal · chatService
 *
 * Consecuencia real, y es el fallo que se estaba pidiendo arreglar: un atleta
 * al que el entrenador había sacado del equipo desaparecía de la pestaña
 * "Atletas" —que sí filtraba— y seguía apareciendo en el INICIO del panel,
 * dentro de "Requiere tu atención". Con su nombre de verdad, además:
 * `shares_coaching_link()` (database/SECURITY_HARDENING.sql) no mira el
 * estado del vínculo, así que el perfil se sigue leyendo perfectamente. Un
 * fantasma indistinguible de un atleta de verdad.
 *
 * Un filtro que hay que acordarse de escribir en ocho sitios es un filtro que
 * alguien se va a dejar. Por eso ahora la consulta vive AQUÍ y solo aquí:
 * `.from('coach_athletes')` no debería volver a aparecer en ningún componente.
 *
 *
 * EL MODELO, EN UNA FRASE
 *
 * `coach_athletes` no es una tabla de enlace: describe QUÉ relación, DESDE
 * cuándo y HASTA cuándo. `active` cuenta ahora, `archived` es "sigue siendo
 * mío pero no entrena" y `ended` es "se acabó". Las dos últimas se conservan
 * porque el pasado de un atleta es información, no ruido —los bloques que
 * conserva son suyos y sin la relación nadie explicaría de dónde salieron—.
 * Ver database/athlete_lifecycle.sql y src/services/athletesService.ts.
 */

/**
 * Qué parte del histórico se pide.
 *
 *   active   — los que entrenan AHORA. Es lo que quiere el 95% de las
 *              pantallas, y por eso es el valor por defecto: quien no piense
 *              en el estado acierta.
 *   inactive — archivados y terminados. La pantalla de "Antiguos atletas".
 *   all      — todo. Solo para diagnóstico; no lo use una lista de la
 *              interfaz sin una razón escrita al lado.
 */
export type RosterScope = 'active' | 'inactive' | 'all';

/** Una fila de `coach_athletes`, ya tipada. */
export interface RosterLink {
    athleteId: string;
    status: RelationStatus;
    relation: RelationKind;
    startedAt: string | null;
    endedAt: string | null;
}

export interface RosterAthlete {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    weight_category: string | null;
    age_category: string | null;
    /** Suma de las tres marcas declaradas. 0 si no tiene ninguna. */
    total: number;
    /** Datos de la RELACIÓN, no del atleta. */
    status: RelationStatus;
    relation: RelationKind;
    startedAt: string | null;
    endedAt: string | null;
}

/** Clave de caché compartida. Invalidarla refresca TODAS las listas a la vez. */
export const rosterQueryKey = (coachId: string | null | undefined, scope: RosterScope) =>
    ['coach-roster', coachId ?? null, scope] as const;

const ACTIVE: RelationStatus[] = ['active'];
const INACTIVE: RelationStatus[] = ['archived', 'ended'];

/**
 * LOS VÍNCULOS. La única consulta a `coach_athletes` de la aplicación.
 *
 * Es una función suelta y no solo un hook a propósito: los servicios
 * (chat, competiciones) la necesitan fuera de un componente, y tener dos
 * copias —una para hooks y otra para servicios— reabriría exactamente el
 * problema que este archivo cierra.
 */
export async function fetchRosterLinks(
    coachId: string,
    scope: RosterScope = 'active'
): Promise<RosterLink[]> {
    let query = supabase
        .from('coach_athletes')
        .select('athlete_id, status, relation, started_at, ended_at')
        .eq('coach_id', coachId);

    // `all` no lleva filtro; los otros dos van por lista y no por `.eq()`
    // para que `inactive` sea una sola consulta en vez de dos.
    if (scope === 'active') query = query.in('status', ACTIVE);
    else if (scope === 'inactive') query = query.in('status', INACTIVE);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(row => ({
        athleteId: row.athlete_id as string,
        // Las filas anteriores a database/athlete_lifecycle.sql no traen
        // estado ni tipo: son las que ya existían, o sea vínculos vivos de
        // entrenador. Tomarlas por inactivas vaciaría la lista de golpe.
        status: (row.status as RelationStatus) ?? 'active',
        relation: (row.relation as RelationKind) ?? 'head_coach',
        startedAt: (row.started_at as string) ?? null,
        endedAt: (row.ended_at as string) ?? null,
    }));
}

/** Solo los identificadores. Atajo para quien no necesita el resto. */
export async function fetchRosterIds(
    coachId: string,
    scope: RosterScope = 'active'
): Promise<string[]> {
    const links = await fetchRosterLinks(coachId, scope);
    return links.map(l => l.athleteId);
}

/**
 * EL OTRO LADO DE LA MISMA TABLA: el entrenador ACTIVO de un atleta.
 *
 * Vive aquí y no en un servicio de chat —que es donde estaba— porque es la
 * misma pregunta sobre la misma tabla, y estaba escrita sin filtrar por
 * estado: un atleta al que su entrenador había sacado del equipo seguía
 * recibiendo la plantilla de check-in de ese entrenador.
 *
 * `relation` distingue al entrenador del nutricionista: los dos son filas de
 * `coach_athletes` y sin el filtro un atleta con nutricionista podía acabar
 * recibiendo el formulario de quien no le programa.
 */
export async function fetchActiveCoach(
    athleteId: string,
    relation: RelationKind = 'head_coach'
): Promise<{ id: string; full_name: string | null; avatar_url: string | null } | null> {
    const { data: link, error } = await supabase
        .from('coach_athletes')
        .select('coach_id')
        .eq('athlete_id', athleteId)
        .eq('status', 'active')
        .eq('relation', relation)
        .limit(1)
        .maybeSingle();

    if (error || !link?.coach_id) return null;

    const { data: coach } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', link.coach_id as string)
        .maybeSingle();

    return coach
        ? {
            id: coach.id as string,
            full_name: coach.full_name as string | null,
            avatar_url: coach.avatar_url as string | null,
        }
        : null;
}

/**
 * Los atletas con sus datos de ficha, ordenados por nombre.
 *
 * Dos consultas y no una incrustación (`profiles!athlete_id (...)`) porque la
 * incrustación obliga a PostgREST a resolver la RLS de `profiles` dentro de la
 * de `coach_athletes`, que es el anidamiento que costó ocho segundos por
 * escritura en su día (ver database/FIX_TIMEOUT_SERIES.sql).
 */
export async function fetchRoster(
    coachId: string,
    scope: RosterScope = 'active'
): Promise<RosterAthlete[]> {
    const links = await fetchRosterLinks(coachId, scope);
    if (links.length === 0) return [];

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, weight_category, age_category, squat_pr, bench_pr, deadlift_pr')
        .in('id', links.map(l => l.athleteId))
        .order('full_name', { ascending: true });

    if (error) throw error;

    const linkById = new Map(links.map(l => [l.athleteId, l]));

    return (profiles ?? []).map(p => {
        const link = linkById.get(p.id as string)!;
        return {
            id: p.id as string,
            full_name: p.full_name as string | null,
            avatar_url: p.avatar_url as string | null,
            weight_category: p.weight_category as string | null,
            age_category: p.age_category as string | null,
            total: (p.squat_pr || 0) + (p.bench_pr || 0) + (p.deadlift_pr || 0),
            status: link.status,
            relation: link.relation,
            startedAt: link.startedAt,
            endedAt: link.endedAt,
        };
    });
}

/**
 * Lista ligera de atletas para la interfaz, con caché compartida.
 *
 * El desplegable de la ficha de un atleta, la lista de la pestaña "Atletas" y
 * el panel de atención piden lo mismo: con la clave común, la piden una vez.
 */
export function useCoachRoster(
    coachId: string | null | undefined,
    options: { scope?: RosterScope; enabled?: boolean } = {}
) {
    const scope = options.scope ?? 'active';

    const query = useQuery({
        queryKey: rosterQueryKey(coachId, scope),
        queryFn: () => fetchRoster(coachId as string, scope),
        enabled: !!coachId && options.enabled !== false,
        staleTime: 60 * 1000,
    });

    return {
        athletes: query.data ?? [],
        loading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}
