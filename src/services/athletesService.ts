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
        if (detail) throw new Error(explainDeploymentGap(detail));

        // Sin `context.json` no hubo respuesta HTTP que leer: es un
        // `FunctionsFetchError`, el fetch a la función ni siquiera volvió.
        // El motivo casi siempre es que `athletes` no está desplegada
        // todavía (el despliegue de funciones es manual, a diferencia del
        // resto del código — ver supabase/functions/athletes/index.ts). Un
        // "algo salió mal" genérico no le dice al coach qué hacer.
        if (error.name === 'FunctionsFetchError') {
            throw new Error(
                'No se pudo contactar con el servidor. Si esto persiste, la función "athletes" ' +
                'puede no estar desplegada en Supabase (supabase functions deploy athletes).'
            );
        }

        throw new Error(error.message);
    }

    if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error));
    }

    return data as T;
}

/**
 * Traduce los fallos que en realidad son «esto no está desplegado».
 *
 * POR QUÉ HACE FALTA
 *
 * Un `git push` despliega el CÓDIGO DEL NAVEGADOR y nada más. Las funciones de
 * borde se despliegan a mano (`supabase functions deploy athletes`) y el SQL de
 * `database/` se ejecuta a mano. Así que hay una ventana —entre que una función
 * nueva se sube al repositorio y alguien se acuerda de desplegarla— en la que la
 * aplicación pide algo que el servidor todavía no sabe hacer.
 *
 * Eso ocurrió de verdad con los enlaces de acceso: el commit `bb440d6c` trajo
 * `create_claim_link` y la tabla `athlete_claim_links`, y sin desplegar la
 * función el botón del enlace respondía **«Acción desconocida:
 * create_claim_link»** — un mensaje que, para el entrenador que está intentando
 * dar de alta a alguien, no significa absolutamente nada y no sugiere ninguna
 * salida.
 *
 * Los dos casos se distinguen solos y cada uno tiene UNA solución concreta:
 * desplegar la función, o ejecutar el SQL. Decirlo es la diferencia entre un
 * callejón sin salida y una tarea de un minuto.
 */
function explainDeploymentGap(detail: string): string {
    if (/Acci[óo]n desconocida/i.test(detail)) {
        return (
            'Esta función del servidor está desactualizada y no reconoce la acción. ' +
            'Hay que volver a desplegarla: «supabase functions deploy athletes». ' +
            `(Detalle: ${detail})`
        );
    }

    // Postgres dice `relation "public.x" does not exist` cuando falta la tabla.
    if (/does not exist|no existe la relaci[óo]n/i.test(detail) && /athlete_claim_links/i.test(detail)) {
        return (
            'Falta la tabla de enlaces de acceso en la base de datos. ' +
            'Hay que ejecutar «database/CLAIM_LINK.sql» en Supabase. ' +
            `(Detalle: ${detail})`
        );
    }

    return detail;
}

/**
 * El motivo REAL de un fallo de la función, sacado de la respuesta HTTP.
 *
 * `error.message` a secas solo dice "Edge Function returned a non-2xx status
 * code", que no le sirve de nada ni a quien mira la pantalla ni a quien
 * depura. Aquí se abre la respuesta y se saca lo que haya dentro.
 *
 * Se lee con `text()` y NO con `json()` a propósito: cuando el fallo ocurre
 * ANTES de entrar en nuestro código —el JWT no valida, la función no existe,
 * la plataforma devuelve su propia página de error— el cuerpo no es JSON, y
 * un `json()` que revienta se tragaba justo el caso que más falta hacía
 * explicar. Además `context` solo se puede consumir UNA vez.
 *
 * El código de estado se incluye siempre que se conozca: distingue de un
 * vistazo un 401 (sesión) de un 404 (no desplegada) de un 500 (dentro).
 */
async function readFunctionError(error: unknown): Promise<string | null> {
    const context = (error as { context?: Response })?.context;
    if (!context) return null;

    const status = typeof context.status === 'number' ? context.status : null;

    let raw = '';
    try {
        raw = typeof context.text === 'function' ? (await context.text()).trim() : '';
    } catch {
        // El cuerpo ya se había consumido o no se puede leer. Nos queda el
        // código de estado, que por sí solo ya orienta.
    }

    // El caso normal: nuestra propia función respondiendo `{ error: "..." }`.
    if (raw.startsWith('{')) {
        try {
            const body = JSON.parse(raw) as { error?: unknown; message?: unknown };
            const detail = body.error ?? body.message;
            if (detail) return String(detail);
        } catch {
            // JSON mal formado. Sigue el camino de abajo.
        }
    }

    // Errores de la PLATAFORMA, que no pasan por nuestro código. Se traducen
    // porque el texto original ("Invalid JWT", un 404 vacío) no le dice a
    // nadie qué hacer a continuación.
    if (status === 401 || status === 403) {
        return 'Tu sesión no es válida para esta operación. Cierra sesión, vuelve a entrar e inténtalo otra vez.';
    }
    if (status === 404) {
        return 'La función "athletes" no existe en este proyecto de Supabase. Despliégala con: ' +
               'npx supabase functions deploy athletes --project-ref <tu-project-ref>';
    }
    if (status === 546 || status === 504) {
        return 'La función tardó demasiado y se cortó. Vuelve a intentarlo; si se repite, revisa sus logs en Supabase.';
    }

    if (raw) return status ? `[${status}] ${raw.slice(0, 300)}` : raw.slice(0, 300);
    return status ? `La función respondió ${status} sin dar detalles.` : null;
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
     * Alternativa al correo: un enlace que el entrenador copia y manda por
     * donde quiera, para que el atleta ponga su propio email y contraseña
     * sobre la ficha que ya tiene su historial dentro. Ver InvitePage /
     * ClaimAthletePage y supabase/functions/athletes (acción
     * `create_claim_link`).
     */
    async createClaimLink(profileId: string): Promise<{ token: string; url: string }> {
        const raw = await callAthletesFunction<{ outcome: string; token: string }>({
            action: 'create_claim_link',
            profile_id: profileId,
        });
        return { token: raw.token, url: `${window.location.origin}/reclamar/${raw.token}` };
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
     * BORRA DE VERDAD la ficha de un atleta gestionado. IRREVERSIBLE.
     *
     * Es el tercer nivel de "quitar a alguien", y el único que destruye algo.
     * Los otros dos —archivar y terminar la relación— conservan todo y se
     * deshacen volviendo a `active`. Ver `setRelationStatus`.
     *
     * SOLO SIRVE PARA FICHAS QUE NUNCA HAN SIDO DE NADIE: el servidor exige
     * `account_status = 'managed'` y `claimed_at IS NULL`. En cuanto una
     * persona ha entrado en su cuenta, su entrenamiento es suyo y no hay
     * ninguna circunstancia en la que un tercero deba poder borrarlo — así
     * que la condición vive en la base de datos y no en el botón. Ver
     * database/migrations/0001_bloque1_integridad.sql.
     *
     * Existe porque sin ella un atleta ficticio creado por error se quedaba
     * para siempre: no podía entrar (nunca tuvo contraseña), su entrenador
     * dejaba de poder leerlo al cerrar la relación, y no había forma de
     * eliminarlo.
     */
    async deleteManagedProfile(athleteId: string): Promise<{ name: string | null; rows: number }> {
        const { data, error } = await supabase.rpc('delete_managed_athlete', {
            p_athlete_id: athleteId,
        });

        if (error) {
            // PGRST202 = la función no existe todavía. El resto de mensajes
            // vienen del propio servidor y ya están escritos para leerse.
            if (error.code === 'PGRST202') {
                throw new Error(
                    'Falta la migración del borrado en la base de datos. ' +
                    'Hay que ejecutar «database/migrations/0001_bloque1_integridad.sql» en Supabase.'
                );
            }
            throw new Error(error.message);
        }

        const result = (data ?? {}) as { name?: string | null; rows?: number };
        return { name: result.name ?? null, rows: result.rows ?? 0 };
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

    /**
     * NOTAS PRIVADAS DEL ENTRENADOR SOBRE ESTE ATLETA.
     *
     * Viven en `coach_athletes.notes`, no en `profiles`: son de la RELACIÓN.
     * Un atleta con entrenador de fuerza Y nutricionista tiene una nota
     * distinta para cada uno; si vivieran en el perfil del atleta, el
     * segundo en guardar pisaría la del primero. El atleta NO las ve.
     */
    async getCoachNotes(coachId: string, athleteId: string): Promise<string | null> {
        // UN par coach-atleta concreto, no una lista: aquí no hay ningún
        // filtro de estado que olvidar. Las notas de una relación terminada se
        // siguen leyendo a propósito, que es lo que las hace un histórico.
        // eslint-disable-next-line no-restricted-syntax
        const { data, error } = await supabase
            .from('coach_athletes')
            .select('notes')
            .eq('coach_id', coachId)
            .eq('athlete_id', athleteId)
            .maybeSingle();

        if (error) return null;
        return data?.notes ?? null;
    },

    async saveCoachNotes(coachId: string, athleteId: string, notes: string): Promise<void> {
        // UN par concreto, igual que getCoachNotes. Ver el comentario de arriba.
        // eslint-disable-next-line no-restricted-syntax
        const { error } = await supabase
            .from('coach_athletes')
            .update({ notes: notes.trim() || null })
            .eq('coach_id', coachId)
            .eq('athlete_id', athleteId);

        if (error) throw error;
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
