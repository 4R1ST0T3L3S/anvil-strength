// Supabase Edge Function: athletes
//
// ALTA Y RECLAMACIÓN DE ATLETAS GESTIONADOS
// =====================================================================
//
// POR QUÉ EXISTE
//
// Un atleta gestionado es una cuenta LATENTE: una fila de `auth.users` sin
// contraseña y con el correo sin confirmar, creada por su entrenador. Eso
// es lo que le permite tener bloques, competiciones y PDF desde el primer
// día sin haber entrado nunca —`training_blocks.athlete_id` apunta a
// `auth.users`, así que sin esa fila no hay entrenamiento posible— y lo que
// hace que reclamar la cuenta más adelante NO mueva su `id` ni un solo dato.
//
// Crear usuarios exige `service_role`, que no puede salir del servidor. De
// ahí esta función. Ver database/athlete_lifecycle.sql para el resto.
//
//
// CONFIGURACIÓN (una vez):
//   supabase secrets set APP_URL=https://anvilstrength.es
//   supabase functions deploy athletes
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.
//
// OJO: se despliega SIN `--no-verify-jwt`. Esta función actúa en nombre de
// quien llama, así que necesita su sesión para saber quién es y comprobar
// que tiene permiso.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://anvilstrength.es';

/**
 * Dominio de los correos de marcador.
 *
 * Un atleta al que solo se le va a mandar el PDF puede no tener correo, y
 * `auth.users` exige uno. Se genera uno inventado sobre un subdominio que
 * NO tiene registros MX: así, si algún día algo intenta escribir ahí, el
 * mensaje muere en el emisor en vez de rebotar contra un servidor real y
 * ensuciar la reputación del dominio de verdad.
 *
 * `profiles.contact_email` se queda en NULL en ese caso, que es lo que
 * distingue "no tiene correo" de "tiene este correo".
 */
const PLACEHOLDER_DOMAIN = 'gestionado.anvil.invalid';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
});

interface Caller {
    id: string;
    role: string;
}

/**
 * Quién llama y si puede gestionar atletas.
 *
 * Se resuelve con el token del usuario, NUNCA con un `coach_id` que venga en
 * el cuerpo de la petición: si el identificador lo pusiera quien llama,
 * cualquiera podría dar de alta atletas en el equipo de otro.
 */
async function resolveCaller(req: Request): Promise<Caller | null> {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return null;

    const scoped = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error } = await scoped.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = profile?.role ?? 'athlete';
    if (!['coach', 'nutritionist', 'admin'].includes(role)) return null;

    return { id: user.id, role };
}

const relationFor = (role: string) => (role === 'nutritionist' ? 'nutritionist' : 'head_coach');

const normalizeEmail = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const clean = value.trim().toLowerCase();
    return clean.length > 3 && clean.includes('@') ? clean : null;
};

/**
 * DÓNDE VIVE EL CORREO DE UN ATLETA
 *
 * En DOS sitios, y cada uno significa una cosa distinta:
 *
 *   auth.users.email     — con qué correo INICIA SESIÓN. Obligatorio para
 *                          Supabase, así que un atleta sin correo lleva ahí
 *                          uno de marcador que no sirve para escribirle.
 *   profiles.contact_email — el correo REAL, el que se puede usar. NULL
 *                          mientras no lo haya.
 *
 * `profiles` NO tiene columna `email`. La tuvo en los borradores del esquema
 * y por eso el alta reventaba con "Could not find the 'email' column of
 * 'profiles' in the schema cache": la función escribía una columna que en la
 * base no existe. Se ha quitado en vez de crearla porque una tercera copia
 * del mismo dato solo añade una forma más de que se desincronicen.
 *
 * Consecuencia: para buscar por correo de INICIO DE SESIÓN hay que preguntar
 * a la API de administración de auth, no a `profiles`.
 */

/**
 * Busca una cuenta por su correo de inicio de sesión.
 *
 * Va contra el endpoint de administración de GoTrue porque el cliente de JS
 * no expone "dame el usuario de este correo": `listUsers()` solo pagina, y
 * recorrer la tabla entera de usuarios en cada alta no es una opción.
 *
 * `filter` hace una búsqueda PARCIAL, así que el resultado se compara aquí de
 * forma exacta: sin eso, dar de alta a "ana@club.es" encontraría a
 * "mariana@club.es" y bloquearía el alta por un duplicado que no existe.
 *
 * Si el endpoint falla, devuelve `null` en vez de reventar: el alta sigue
 * adelante y, si de verdad había un duplicado, `createUser` lo rechazará
 * después. Perder la comprobación degrada el mensaje de error, no la
 * integridad.
 */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`,
            {
                headers: {
                    apikey: SERVICE_ROLE,
                    Authorization: `Bearer ${SERVICE_ROLE}`,
                },
            },
        );
        if (!res.ok) return null;

        const body = await res.json() as { users?: Array<{ id: string; email?: string }> };
        const match = (body.users ?? []).find(u => (u.email ?? '').toLowerCase() === email);
        return match ? { id: match.id } : null;
    } catch {
        return null;
    }
}

// =====================================================================
// ACCIÓN: crear un atleta gestionado
// =====================================================================
/**
 * Devuelve siempre el mismo tipo de respuesta, y el campo `outcome` dice qué
 * ha pasado de verdad:
 *
 *   created  — ficha nueva, cuenta latente incluida.
 *   linked   — ya existía alguien con ese correo y se ha vinculado.
 *   existing — ya existía Y ya estaba en tu equipo. No se toca nada.
 *
 * La comprobación por correo va ANTES de crear nada: es la única forma de no
 * acabar con dos fichas de la misma persona, que es el problema que arrastra
 * cualquier sistema donde una parte da de alta y la otra se registra sola.
 */
async function createManagedAthlete(caller: Caller, body: Record<string, unknown>) {
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    if (fullName.length < 2) {
        return json({ error: 'Hace falta el nombre del atleta.' }, 400);
    }

    const email = normalizeEmail(body.email);
    const relation = relationFor(caller.role);

    // --- ¿Ya existe? -------------------------------------------------
    if (email) {
        // Se mira en los DOS sitios donde puede estar ese correo, porque
        // responden a preguntas distintas (ver la nota de arriba):
        //
        //   auth.users     — "esta persona ya se registró por su cuenta".
        //   contact_email  — "otro entrenador ya le dio de alta y anotó su
        //                     correo, pero todavía no ha entrado nunca".
        //
        // Mirar solo uno deja fuera la mitad de los duplicados, que es
        // justo el problema que esta comprobación existe para evitar.
        const authUser = await findAuthUserByEmail(email);

        const found = authUser
            ? (await admin
                .from('profiles').select('id, full_name, account_status')
                .eq('id', authUser.id).maybeSingle()).data
            : (await admin
                .from('profiles').select('id, full_name, account_status')
                .eq('contact_email', email).limit(1).maybeSingle()).data;

        if (found) {
            const { data: link } = await admin
                .from('coach_athletes')
                .select('id')
                .eq('coach_id', caller.id)
                .eq('athlete_id', found.id)
                .eq('status', 'active')
                .maybeSingle();

            if (link) {
                return json({
                    outcome: 'existing',
                    profile_id: found.id,
                    full_name: found.full_name,
                    account_status: found.account_status,
                });
            }

            // Existe pero no es tuyo. NO se vincula por las bravas: enganchar
            // la cuenta de alguien a un entrenador sin que esa persona diga
            // nada es exactamente lo que una invitación viene a evitar. Se
            // devuelve para que la interfaz ofrezca mandarle el enlace.
            return json({
                outcome: 'needs_invite',
                profile_id: found.id,
                full_name: found.full_name,
                account_status: found.account_status,
            });
        }
    }

    // --- Cuenta latente ----------------------------------------------
    const authEmail = email ?? `atleta-${crypto.randomUUID()}@${PLACEHOLDER_DOMAIN}`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        // Sin confirmar y sin contraseña: no se puede iniciar sesión con
        // esta cuenta hasta que su dueño la reclame por el enlace mágico.
        email_confirm: false,
        user_metadata: { full_name: fullName, managed: true },
    });

    if (createError || !created?.user) {
        // Red de seguridad de la comprobación de duplicados: si `filter` no
        // encontró a esa persona pero Supabase sí la tiene, se traduce a algo
        // accionable en vez de soltar el error en inglés de la plataforma.
        const yaExiste = /already|registered|duplicate/i.test(createError?.message ?? '');
        if (yaExiste) {
            return json({
                error: 'Ya hay una cuenta con ese correo. Déjalo en blanco para crear la ficha ' +
                       'igualmente, o pídele a esa persona que acepte tu invitación.',
            }, 409);
        }
        return json({ error: `No se pudo crear la cuenta: ${createError?.message ?? 'desconocido'}` }, 500);
    }

    const athleteId = created.user.id;

    // El perfil se crea aquí y no se deja al cliente: `useUser` solo lo crea
    // para la sesión que está abierta, y esta cuenta no va a abrir ninguna.
    // OJO: aquí NO va ninguna columna `email`. `profiles` no la tiene, y
    // escribirla es lo que rompía el alta entera. El correo de inicio de
    // sesión ya está en `auth.users`; el de contacto, en `contact_email`.
    //
    // UPSERT y no INSERT, y esto es lo que arregla el
    // "duplicate key value violates unique constraint profiles_pkey": el
    // proyecto tiene un disparador `handle_new_user` (de la plantilla de
    // Supabase) que crea la fila de `profiles` en el MISMO instante en que
    // `createUser` mete la de `auth.users`. Cuando esta función llegaba a
    // insertar, la fila ya existía y el alta reventaba. Con `upsert` sobre
    // `id`, exista o no ese disparador, la ficha queda con NUESTROS campos
    // (gestionada, vinculada, con `managed_by`) en vez de con los del
    // disparador. Es idempotente: da igual quién llegue primero.
    const { error: profileError } = await admin.from('profiles').upsert({
        id: athleteId,
        contact_email: email,
        full_name: fullName,
        nickname: fullName.split(' ')[0],
        role: 'athlete',
        account_status: 'managed',
        managed_by: caller.id,
        has_access: true, // Lo entrena su coach: sin acceso no vería su plan.
        gender: body.gender === 'male' || body.gender === 'female' ? body.gender : null,
        weight_category: typeof body.weight_category === 'string' ? body.weight_category : null,
        age_category: typeof body.age_category === 'string' ? body.age_category : null,
    }, { onConflict: 'id' });

    if (profileError) {
        // Si el perfil no entra, la cuenta latente se queda huérfana y su
        // correo bloqueado para siempre. Se deshace.
        await admin.auth.admin.deleteUser(athleteId).catch(() => { /* ya da igual */ });
        return json({ error: `No se pudo crear la ficha: ${profileError.message}` }, 500);
    }

    const { error: linkError } = await admin.rpc('upsert_coach_athlete', {
        p_coach_id: caller.id,
        p_athlete_id: athleteId,
        p_relation: relation,
    });

    if (linkError) {
        return json({ error: `Ficha creada pero sin vincular: ${linkError.message}` }, 500);
    }

    return json({
        outcome: 'created',
        profile_id: athleteId,
        full_name: fullName,
        account_status: 'managed',
        has_email: Boolean(email),
    });
}

// =====================================================================
// ACCIÓN: invitar a un atleta gestionado a reclamar su cuenta
// =====================================================================
/**
 * Manda el enlace mágico a la PROPIA cuenta latente del atleta.
 *
 * Esto es lo que hace que no haya nada que fusionar: la persona entra en la
 * cuenta que ya tenía su ficha, con su historial dentro, en vez de crear una
 * segunda y tener que juntarlas después.
 *
 * Si el atleta todavía no tenía correo, se le pone ahora —en `auth.users` y
 * en la ficha— y con eso deja de ser inalcanzable.
 */
async function inviteManagedAthlete(caller: Caller, body: Record<string, unknown>) {
    const athleteId = typeof body.profile_id === 'string' ? body.profile_id : '';
    if (!athleteId) return json({ error: 'Falta el atleta.' }, 400);

    const { data: link } = await admin
        .from('coach_athletes')
        .select('id')
        .eq('coach_id', caller.id)
        .eq('athlete_id', athleteId)
        .eq('status', 'active')
        .maybeSingle();

    if (!link) return json({ error: 'Ese atleta no está en tu equipo.' }, 403);

    const { data: profile } = await admin
        .from('profiles')
        .select('id, contact_email, account_status')
        .eq('id', athleteId)
        .single();

    if (!profile) return json({ error: 'No se encontró la ficha.' }, 404);

    if (profile.account_status === 'active') {
        return json({ error: 'Ese atleta ya tiene su cuenta activa.' }, 409);
    }

    const email = normalizeEmail(body.email) ?? profile.contact_email;
    if (!email) {
        return json({ error: 'Hace falta un correo para poder mandarle el acceso.' }, 400);
    }

    // El correo de INICIO DE SESIÓN se lee de `auth.users`, que es donde vive
    // (ver la nota de arriba). Si el atleta se dio de alta sin correo, aquí
    // hay todavía uno de marcador y hay que sustituirlo: el enlace mágico se
    // manda a la dirección de auth, así que sin cambiarla el acceso saldría
    // hacia un dominio que no existe.
    const { data: authUser } = await admin.auth.admin.getUserById(athleteId);
    const loginEmail = (authUser?.user?.email ?? '').toLowerCase();

    // `email_confirm` da la dirección por buena sin pedir confirmación previa
    // porque quien la aporta es su entrenador y el enlace mágico que va justo
    // después ya comprueba que existe de verdad.
    if (email !== loginEmail) {
        const { error: updateError } = await admin.auth.admin.updateUserById(athleteId, {
            email,
            email_confirm: true,
        });
        if (updateError) {
            return json({ error: `No se pudo asignar ese correo: ${updateError.message}` }, 409);
        }
    }

    // `contact_email` se escribe siempre, no solo cuando cambia el de auth:
    // puede estar en NULL aunque la dirección de inicio de sesión ya sea la
    // correcta, y es la columna por la que se buscan los duplicados.
    if (email !== profile.contact_email) {
        await admin.from('profiles').update({ contact_email: email }).eq('id', athleteId);
    }

    /**
     * El correo lo manda Supabase.
     *
     * `signInWithOtp` y NO `admin.generateLink`: generateLink DEVUELVE el
     * enlace pero no lo envía, y ese enlace da entrada a la cuenta del
     * atleta — pasárselo al entrenador sería darle una llave que no le
     * corresponde. `inviteUserByEmail` tampoco vale: falla porque la cuenta
     * ya existe, que es justo el punto de todo esto.
     *
     * `shouldCreateUser: false` es el cinturón: si por lo que sea el correo
     * no corresponde a ninguna cuenta, se falla en vez de crear una segunda
     * ficha por la puerta de atrás.
     */
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: linkError } = await anon.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/auth/callback` },
    });

    if (linkError) {
        return json({ error: `No se pudo mandar el acceso: ${linkError.message}` }, 500);
    }

    await admin.from('profiles').update({ account_status: 'invited' }).eq('id', athleteId);

    return json({ outcome: 'invited', profile_id: athleteId, email });
}

// =====================================================================
// ACCIÓN: crear un enlace de reclamación (email + contraseña)
// =====================================================================
/**
 * La alternativa al correo: un enlace que el entrenador puede copiar y
 * mandar por donde quiera (WhatsApp, en persona) para que el atleta ponga
 * su propio email y contraseña sobre la cuenta latente que ya tiene la
 * ficha dentro.
 *
 * 30 días de caducidad, igual que `coach_invites` — ver la nota de
 * `invitesService.create` sobre por qué un enlace nunca es eterno.
 */
async function createClaimLink(caller: Caller, body: Record<string, unknown>) {
    const profileId = typeof body.profile_id === 'string' ? body.profile_id : '';
    if (!profileId) return json({ error: 'Falta el atleta.' }, 400);

    const { data: link } = await admin
        .from('coach_athletes')
        .select('id')
        .eq('coach_id', caller.id)
        .eq('athlete_id', profileId)
        .eq('status', 'active')
        .maybeSingle();

    if (!link) return json({ error: 'Ese atleta no está en tu equipo.' }, 403);

    const { data: profile } = await admin
        .from('profiles')
        .select('id, account_status')
        .eq('id', profileId)
        .single();

    if (!profile) return json({ error: 'No se encontró la ficha.' }, 404);
    if (profile.account_status === 'active') {
        return json({ error: 'Ese atleta ya tiene su cuenta activa.' }, 409);
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const { error: insertError } = await admin.from('athlete_claim_links').insert({
        token,
        profile_id: profileId,
        coach_id: caller.id,
        expires_at: expiresAt,
    });

    if (insertError) {
        return json({ error: `No se pudo crear el enlace: ${insertError.message}` }, 500);
    }

    return json({ outcome: 'claim_link_created', token });
}

// =====================================================================
// ACCIONES PÚBLICAS: previsualizar y canjear un enlace de reclamación
// =====================================================================
/**
 * SIN `resolveCaller`: quien reclama todavía no tiene sesión — es
 * literalmente el problema que este enlace resuelve. La validez del token
 * (existe, no caducó, no se usó) es la única puerta.
 */
async function peekClaimLink(body: Record<string, unknown>) {
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token) return json({ valid: false, reason: 'no_existe' });

    const { data: claim } = await admin
        .from('athlete_claim_links')
        .select('profile_id, coach_id, expires_at, used_at')
        .eq('token', token)
        .maybeSingle();

    if (!claim) return json({ valid: false, reason: 'no_existe' });
    if (claim.used_at) return json({ valid: false, reason: 'usado' });
    if (new Date(claim.expires_at).getTime() < Date.now()) return json({ valid: false, reason: 'caducado' });

    const [{ data: athlete }, { data: coach }] = await Promise.all([
        admin.from('profiles').select('full_name, account_status').eq('id', claim.profile_id).single(),
        admin.from('profiles').select('full_name').eq('id', claim.coach_id).single(),
    ]);

    if (!athlete) return json({ valid: false, reason: 'no_existe' });
    if (athlete.account_status === 'active') return json({ valid: false, reason: 'ya_reclamado' });

    return json({
        valid: true,
        athleteName: athlete.full_name ?? null,
        coachName: coach?.full_name ?? null,
    });
}

/**
 * Pone email + contraseña sobre la cuenta latente y la activa.
 *
 * `updateUserById` sobre el `profile_id` DEL ENLACE, no sobre uno que venga
 * suelto en el cuerpo: el token es lo único que demuestra "este enlace es
 * para ESTA ficha en concreto". Sin esa comprobación, cualquiera con
 * conocimientos mínimos podría intentar reclamar la ficha de otro atleta
 * cambiando un id en la petición.
 */
async function claimViaLink(body: Record<string, unknown>) {
    const token = typeof body.token === 'string' ? body.token : '';
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token) return json({ error: 'Enlace no válido.' }, 400);
    if (!email) return json({ error: 'Escribe un correo válido.' }, 400);
    if (password.length < 8) return json({ error: 'La contraseña necesita al menos 8 caracteres.' }, 400);

    const { data: claim } = await admin
        .from('athlete_claim_links')
        .select('profile_id, expires_at, used_at')
        .eq('token', token)
        .maybeSingle();

    if (!claim) return json({ error: 'Este enlace no existe o ya no es válido.' }, 404);
    if (claim.used_at) return json({ error: 'Este enlace ya se usó. Inicia sesión con tu correo y contraseña.' }, 409);
    if (new Date(claim.expires_at).getTime() < Date.now()) {
        return json({ error: 'Este enlace ha caducado. Pide a tu entrenador uno nuevo.' }, 410);
    }

    const { data: profile } = await admin
        .from('profiles')
        .select('id, account_status')
        .eq('id', claim.profile_id)
        .single();

    if (!profile) return json({ error: 'No se encontró la ficha.' }, 404);
    if (profile.account_status === 'active') {
        return json({ error: 'Esta ficha ya tiene cuenta activa. Inicia sesión normalmente.' }, 409);
    }

    const existing = await findAuthUserByEmail(email);
    if (existing && existing.id !== profile.id) {
        return json({ error: 'Ya hay una cuenta con ese correo. Usa otro o inicia sesión con ese.' }, 409);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
        email,
        password,
        email_confirm: true,
    });

    if (updateError) {
        return json({ error: `No se pudo activar la cuenta: ${updateError.message}` }, 500);
    }

    await admin.from('profiles').update({
        account_status: 'active',
        contact_email: email,
    }).eq('id', profile.id);

    await admin.from('athlete_claim_links').update({ used_at: new Date().toISOString() }).eq('token', token);

    return json({ outcome: 'claimed', email });
}

// =====================================================================

/** Acciones que no requieren sesión: las usa quien todavía no tiene cuenta. */
const PUBLIC_ACTIONS = new Set(['peek_claim', 'claim']);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return json({ error: 'La función no está configurada.' }, 500);
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Cuerpo no válido.' }, 400);
    }

    if (PUBLIC_ACTIONS.has(String(body.action))) {
        switch (body.action) {
            case 'peek_claim': return await peekClaimLink(body);
            case 'claim': return await claimViaLink(body);
        }
    }

    const caller = await resolveCaller(req);
    if (!caller) return json({ error: 'No autorizado.' }, 401);

    switch (body.action) {
        case 'create': return await createManagedAthlete(caller, body);
        case 'invite': return await inviteManagedAthlete(caller, body);
        case 'create_claim_link': return await createClaimLink(caller, body);
        default: return json({ error: `Acción desconocida: ${String(body.action)}` }, 400);
    }
});
