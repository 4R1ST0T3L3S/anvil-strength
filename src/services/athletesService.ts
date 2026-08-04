import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — ATLETAS Y SU RELACIÓN CON EL ENTRENADOR
 * =====================================================================
 *
 * EL MODELO, EN DOS FRASES
 *
 * Un atleta es una ficha (`profiles`) que puede tener cuenta o no tenerla:
 * eso es `account_status`. Y la relación con un profesional (`coach_athletes`)
 * tiene tipo, estado y fechas: eso es lo que permite varios entrenadores,
 * cambios de entrenador, archivados e históricos sin volver a tocar el
 * modelo.
 *
 * Ver database/athlete_lifecycle.sql, que es donde están las garantías de
 * verdad. Esto es solo la puerta desde la interfaz.
 */

// =====================================================================
// TIPOS
// =====================================================================

/**
 * En qué punto está la CUENTA del atleta.
 *
 *   managed — la creó su entrenador. No puede iniciar sesión.
 *   invited — se le ha mandado el acceso. Sigue sin haber entrado.
 *   active  — es suya y la usa.
 *
 * Es del atleta, no de su relación con nadie: un atleta gestionado sigue
 * siendo gestionado aunque cambie de entrenador.
 */
export type AccountStatus = 'managed' | 'invited' | 'active';

/**
 * Qué es este profesional para este atleta.
 *
 * `assistant` todavía no lo usa ninguna pantalla. Está definido porque el
 * día que haya un segundo entrenador sea dar de alta una fila y no cambiar
 * el modelo de datos.
 */
export type RelationKind = 'head_coach' | 'assistant' | 'nutritionist';

/**
 * En qué punto está la RELACIÓN.
 *
 *   active   — cuenta ahora. Sale en la lista.
 *   archived — sigue siendo suyo pero no entrena. Fuera de la lista, dentro
 *              del histórico. (Aún sin pantalla: la base ya lo soporta.)
 *   ended    — se acabó. Se conserva porque el pasado de un atleta es
 *              información, no ruido.
 */
export type RelationStatus = 'active' | 'archived' | 'ended';

/** Qué ha pasado al intentar dar de alta a alguien. */
export type CreateOutcome =
    /** Ficha nueva con su cuenta latente. */
    | 'created'
    /** Ya existía con ese correo y ya estaba en tu equipo. */
    | 'existing'
    /** Ya existía pero no es tuyo: hay que invitarle, no engancharle. */
    | 'needs_invite';

export interface CreateAthleteResult {
    outcome: CreateOutcome;
    profileId: string;
    fullName: string;
    accountStatus: AccountStatus;
    /** Solo en `created`. Sin correo no se le puede invitar todavía. */
    hasEmail: boolean;
}

export interface NewAthleteInput {
    fullName: string;
    /** Opcional a propósito: el caso "solo le mando el PDF" no tiene correo. */
    email?: string | null;
    gender?: 'male' | 'female' | null;
    weightCategory?: string | null;
    ageCategory?: string | null;
}

// =====================================================================
// LLAMADA A LA EDGE FUNCTION
// =====================================================================

/**
 * Crear una cuenta latente exige `service_role`, que jamás puede salir del
 * servidor. Por eso el alta y la invitación pasan por una función de borde
 * (supabase/functions/athletes) en vez de escribir desde aquí.
 *
 * La sesión viaja en la cabecera y el servidor resuelve QUIÉN llama a partir
 * de ella: aquí no se manda ningún `coach_id`. Si lo mandáramos, cualquiera
 * podría dar de alta atletas en el equipo de otro sin más que cambiar un
 * número en la petición.
 */
async function callAthletesFunction<T>(payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('athletes', { body: payload });

    if (error) {
        // El cuerpo de un error de función trae el motivo real; `error.message`
        // a secas solo dice "Edge Function returned a non-2xx status code",
        // que no le sirve de nada a quien está mirando la pantalla.
        const detail = await readFunctionError(error);
        throw new Error(detail ?? error.message);
    }

    if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error));
    }

    return data as T;
}

async function readFunctionError(error: unknown): Promise<string | null> {
    const response = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (!response?.json) return null;
    try {
        const body = await response.json();
        if (body && typeof body === 'object' && 'error' in body) {
            return String((body as { error: unknown }).error);
        }
    } catch {
        // La respuesta no era JSON. Nos quedamos con el mensaje genérico.
    }
    return null;
}

// =====================================================================
// SERVICIO
// =====================================================================

export const athletesService = {
    /**
     * ¿Existe ya alguien con este correo?
     *
     * Se pregunta ANTES de crear nada. Es la regla que evita los duplicados,
     * y tiene que vivir en el servidor: la RLS de `profiles` no deja a un
     * entrenador leer perfiles ajenos, y abrirla para esto convertiría la
     * tabla de usuarios en un directorio consultable por cualquiera.
     *
     * Devuelve `null` cuando no hay nadie.
     */
    async findByEmail(email: string): Promise<{
        profileId: string;
        fullName: string | null;
        accountStatus: AccountStatus;
        alreadyLinked: boolean;
    } | null> {
        const clean = email.trim().toLowerCase();
        if (!clean.includes('@')) return null;

        const { data, error } = await supabase.rpc('find_athlete_by_email', { p_email: clean });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return null;

        return {
            profileId: row.profile_id,
            fullName: row.full_name ?? null,
            accountStatus: (row.account_status as AccountStatus) ?? 'active',
            alreadyLinked: Boolean(row.already_linked),
        };
    },

    /**
     * Da de alta a un atleta que quizá nunca abra la aplicación.
     *
     * Queda con ficha, cuenta latente y vínculo, así que se le puede
     * programar y exportar el PDF desde el minuto uno. El día que entre,
     * entra en ESTA cuenta: no hay nada que fusionar ni historial que migrar.
     */
    async create(input: NewAthleteInput): Promise<CreateAthleteResult> {
        const name = input.fullName.trim();
        if (name.length < 2) throw new Error('Escribe el nombre del atleta.');

        const raw = await callAthletesFunction<{
            outcome: CreateOutcome;
            profile_id: string;
            full_name: string;
            account_status: AccountStatus;
            has_email?: boolean;
        }>({
            action: 'create',
            full_name: name,
            email: input.email?.trim().toLowerCase() || null,
            gender: input.gender ?? null,
            weight_category: input.weightCategory ?? null,
            age_category: input.ageCategory ?? null,
        });

        return {
            outcome: raw.outcome,
            profileId: raw.profile_id,
            fullName: raw.full_name,
            accountStatus: raw.account_status,
            hasEmail: Boolean(raw.has_email),
        };
    },

    /**
     * Manda al atleta el acceso a SU cuenta.
     *
     * Es la pieza que hace que reclamar no duplique nada: el enlace entra en
     * la cuenta latente que ya tiene su historial dentro, en vez de crear una
     * segunda ficha que después habría que juntar con la primera.
     *
     * `email` solo hace falta la primera vez, cuando el atleta se dio de alta
     * sin correo.
     */
    async invite(profileId: string, email?: string): Promise<{ email: string }> {
        const raw = await callAthletesFunction<{ outcome: string; email: string }>({
            action: 'invite',
            profile_id: profileId,
            email: email?.trim().toLowerCase() || null,
        });
        return { email: raw.email };
    },

    /**
     * Cambia el estado de la relación con un atleta.
     *
     * Sustituye al DELETE que hacía antes "sacar del equipo". Borrar la fila
     * tiraba la única prueba de que ese atleta estuvo con ese entrenador, y
     * como sus bloques y su historial se conservan —son suyos, no del coach—
     * quedaban años de entrenamientos sin nadie que explicara de dónde
     * salieron.
     *
     * `archived` es "sigue siendo mío pero ahora no entrena"; `ended` es "se
     * acabó". Las dos se pueden deshacer volviendo a `active`.
     */
    async setRelationStatus(
        athleteId: string,
        status: RelationStatus,
        relation?: RelationKind
    ): Promise<void> {
        const { data, error } = await supabase.rpc('set_coach_athlete_status', {
            p_athlete_id: athleteId,
            p_status: status,
            p_relation: relation ?? null,
        });

        if (error) throw error;

        // Cero filas con la RLS de por medio significa "no era tuyo" o "ya
        // estaba así". Hay que decirlo: si no, la tarjeta desaparece de la
        // lista y reaparece en la siguiente carga.
        if (typeof data === 'number' && data === 0) {
            throw new Error('No se pudo actualizar el vínculo. Recarga la página e inténtalo otra vez.');
        }
    },

    /**
     * Marca la ficha como reclamada.
     *
     * La llama el propio atleta la primera vez que entra de verdad. No mueve
     * ni un dato —la ficha ya era suya—: lo que cambia es que a partir de
     * ahora manda él y su entrenador deja de poder editarle el perfil.
     */
    async claimOwnProfile(): Promise<boolean> {
        const { data, error } = await supabase.rpc('claim_managed_profile');
        if (error) throw error;
        return Boolean(data);
    },
};

// =====================================================================
// AYUDAS PARA LA INTERFAZ
// =====================================================================

/** Cómo se llama cada estado de cuenta en pantalla. */
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
    managed: 'Sin cuenta',
    invited: 'Invitado',
    active: 'Activo',
};

/**
 * ¿Este atleta puede entrar en la aplicación?
 *
 * Sirve para no ofrecerle al coach cosas que no van a llegar a ninguna parte
 * —chat, avisos, check-ins— con alguien que solo recibe un PDF.
 */
export const hasAccount = (status?: AccountStatus | null): boolean => status === 'active';
