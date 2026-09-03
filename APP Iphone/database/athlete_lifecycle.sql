-- =====================================================================
-- ANVIL STRENGTH — CICLO DE VIDA DEL ATLETA Y DE LA RELACIÓN
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- ORDEN: DESPUÉS de database/fix_coach_athlete_link.sql y de
-- database/coach_invites.sql. Este fichero SUSTITUYE tres funciones suyas
-- (`sync_coach_athlete_link`, `sync_profile_from_link`, `redeem_coach_invite`)
-- y cambia el índice de unicidad de `coach_athletes`. Si vuelves a ejecutar
-- aquellos ficheros después de este, hay que volver a pasar este.
--
--
-- QUÉ RESUELVE
-- ---------------------------------------------------------------------
--
-- 1. ATLETAS SIN REGISTRO. El entrenador da de alta a alguien que quizá
--    nunca abra la aplicación, le programa, y le manda el PDF.
--
-- 2. INVITACIONES QUE NO DUPLICAN. Un enlace dirigido a una persona
--    concreta: si ya tiene cuenta se vincula, y si no, se reclama la ficha
--    que el entrenador ya había creado, con todo su historial dentro.
--
-- 3. UNA RELACIÓN CON HISTORIA. `coach_athletes` deja de ser una tabla de
--    enlace de dos columnas para pasar a describir QUÉ relación, DESDE
--    cuándo y HASTA cuándo. Eso es lo que después permite varios
--    entrenadores, cambios de entrenador, archivados e históricos sin
--    volver a tocar el modelo.
--
--
-- LA DECISIÓN DE FONDO: LA CUENTA LATENTE
-- ---------------------------------------------------------------------
--
-- Un atleta gestionado ES una fila de `auth.users`, creada por el
-- entrenador, sin contraseña y con el correo sin confirmar: no se puede
-- iniciar sesión con ella.
--
-- Por qué, y no una tabla aparte de "atletas sin cuenta":
--
--   · La identidad del atleta en esta base NO es `profiles`, es
--     `auth.users`. `training_blocks.athlete_id`, `competitions.athlete_id`,
--     `notifications.user_id` y `push_subscriptions.user_id` apuntan
--     DIRECTAMENTE ahí. Un atleta sin fila en `auth.users` no puede tener
--     ni un bloque de entrenamiento: lo rechaza la clave ajena.
--
--   · Porque el `id` no se mueve nunca. Reclamar la cuenta es ponerle
--     contraseña a la que ya existía, así que el atleta hereda su historial
--     entero sin migrar una sola fila. La alternativa —crear la ficha con un
--     id propio y re-clavarlo al registrarse— obliga a reescribir en cascada
--     veinte claves ajenas justo en el momento de más riesgo.
--
--   · Y no cambia ninguna política RLS existente. Todas comparan
--     `auth.uid() = profiles.id`, y eso se sigue cumpliendo.
--
-- La creación de esa fila necesita `service_role`, así que vive en la Edge
-- Function `supabase/functions/athletes`. Aquí solo está lo que la base
-- tiene que saber y garantizar.
-- =====================================================================


-- =====================================================================
-- 1. ESTADO DE CUENTA DEL PERFIL
-- =====================================================================
--
--   managed  — la creó su entrenador. Nunca ha entrado. No puede.
--   invited  — se le ha mandado el enlace para reclamarla. Sigue sin entrar.
--   active   — tiene cuenta de verdad y la usa.
--
-- Todo lo que ya existía es `active`: son cuentas que se registraron solas.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_status_check
    CHECK (account_status IN ('managed', 'invited', 'active'));

-- Quién la creó. Es lo que decide si un entrenador puede editarla: sin
-- esto, "gestionado" no diría gestionado POR QUIÉN.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS managed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Cuándo dejó de ser gestionada. Se conserva como dato, no como marca: sirve
-- para saber cuánto tardan los atletas en entrar, que es la métrica que dice
-- si el sistema de invitaciones funciona.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- El correo real de un atleta gestionado puede no existir todavía. Cuando no
-- existe, la Edge Function pone uno de marcador en `auth.users` porque
-- Supabase lo exige, pero AQUÍ se guarda NULL: así "¿tengo forma de invitar
-- a este atleta?" es una pregunta que se responde mirando una columna.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Búsqueda por correo sin distinguir mayúsculas, que es como se evitan los
-- duplicados al invitar. Único: dos fichas con el mismo correo son la misma
-- persona dos veces, y es justo lo que hay que impedir.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_contact_email_idx
    ON public.profiles (lower(contact_email))
    WHERE contact_email IS NOT NULL;

-- La lista del entrenador filtra por estado constantemente. Con miles de
-- perfiles, sin índice cada carga recorre la tabla entera.
CREATE INDEX IF NOT EXISTS profiles_account_status_idx
    ON public.profiles (account_status)
    WHERE account_status <> 'active';

CREATE INDEX IF NOT EXISTS profiles_managed_by_idx
    ON public.profiles (managed_by)
    WHERE managed_by IS NOT NULL;


-- =====================================================================
-- 2. LA RELACIÓN ENTRENADOR ↔ ATLETA, CON CICLO DE VIDA
-- =====================================================================
--
-- `relation` — qué es este profesional para este atleta. Hoy se usan
--   'head_coach' y 'nutritionist'; 'assistant' está definido para que añadir
--   un segundo entrenador sea dar de alta una fila, no cambiar el modelo.
--
-- `status` — 'active' (cuenta ahora), 'archived' (sigue siendo suyo pero no
--   entrena: fuera de la lista principal, dentro del histórico) y 'ended'
--   (se acabó; se conserva porque el pasado de un atleta es información
--   clínica, no ruido).
--
-- `started_at` / `ended_at` — el tramo. Es lo que convierte "quién es su
--   entrenador" en "quién lo ha sido y cuándo", que es la pregunta que se
--   hace cuando un atleta vuelve dos años después.

ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT 'head_coach';

ALTER TABLE public.coach_athletes
    DROP CONSTRAINT IF EXISTS coach_athletes_relation_check;
ALTER TABLE public.coach_athletes
    ADD CONSTRAINT coach_athletes_relation_check
    CHECK (relation IN ('head_coach', 'assistant', 'nutritionist'));

ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.coach_athletes
    DROP CONSTRAINT IF EXISTS coach_athletes_status_check;
ALTER TABLE public.coach_athletes
    ADD CONSTRAINT coach_athletes_status_check
    CHECK (status IN ('active', 'archived', 'ended'));

ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Las filas que ya existían son de entrenador o de nutricionista según el rol
-- de quien está al otro lado. Sin esto, un nutricionista quedaría marcado
-- como entrenador jefe y el atleta no podría tener las dos cosas.
UPDATE public.coach_athletes ca
   SET relation = 'nutritionist'
  FROM public.profiles p
 WHERE p.id = ca.coach_id
   AND p.role = 'nutritionist'
   AND ca.relation = 'head_coach';

-- `started_at` de las filas viejas: lo que se sepa. `created_at` existe
-- desde el principio, así que el tramo no arranca hoy para todo el mundo.
UPDATE public.coach_athletes
   SET started_at = created_at
 WHERE created_at IS NOT NULL
   AND started_at > created_at;


-- ---------------------------------------------------------------------
-- 2b. UNICIDAD SOBRE LO VIVO, NO SOBRE LA HISTORIA
-- ---------------------------------------------------------------------
-- El índice antiguo era `UNIQUE (coach_id, athlete_id)` a secas, y eso hace
-- imposible el histórico: un atleta que vuelve con su antiguo entrenador
-- chocaría contra la fila del tramo anterior. El índice pasa a ser PARCIAL
-- —solo sobre las relaciones vivas—, así que puede haber tantos tramos
-- cerrados como haga falta pero solo una relación activa de cada tipo.
--
-- Se hace en dos pasos y con cuidado: primero se cierran los duplicados que
-- pudiera haber, o la creación del índice falla y no se aplica nada.

UPDATE public.coach_athletes a
   SET status = 'ended', ended_at = COALESCE(a.ended_at, NOW())
  FROM public.coach_athletes b
 WHERE a.ctid < b.ctid
   AND a.coach_id = b.coach_id
   AND a.athlete_id = b.athlete_id
   AND a.relation = b.relation
   AND a.status = 'active'
   AND b.status = 'active';

DROP INDEX IF EXISTS public.coach_athletes_pair_idx;

CREATE UNIQUE INDEX IF NOT EXISTS coach_athletes_active_idx
    ON public.coach_athletes (coach_id, athlete_id, relation)
    WHERE status = 'active';

-- La lista del entrenador y el panel de atención preguntan siempre lo mismo:
-- "dame mis atletas vivos". Con miles de relaciones, este índice es la
-- diferencia entre leer 20 filas y recorrer la tabla.
CREATE INDEX IF NOT EXISTS coach_athletes_coach_active_idx
    ON public.coach_athletes (coach_id, status, relation);

CREATE INDEX IF NOT EXISTS coach_athletes_athlete_active_idx
    ON public.coach_athletes (athlete_id, status, relation);


-- =====================================================================
-- 3. `profiles.coach_id` PASA A SER UNA COLUMNA DERIVADA
-- =====================================================================
--
-- Hoy el vínculo vive en dos sitios y los dos se escriben a mano. Con varios
-- entrenadores por atleta eso deja de tener arreglo: `profiles.coach_id` es
-- una sola casilla y no admite dos.
--
-- A partir de aquí la FUENTE DE VERDAD es `coach_athletes`, y `coach_id` /
-- `nutritionist_id` son un reflejo de la relación ACTIVA que mantiene un
-- disparador. No se eliminan porque las leen cuarenta consultas y el panel
-- del atleta saca de ahí el nombre, el color y el logo de su entrenador:
-- quitarlas ahora sería una migración enorme a cambio de nada. Dejan de ser
-- verdad y pasan a ser caché, que es un cambio de significado, no de datos.

CREATE OR REPLACE FUNCTION public.sync_profile_from_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_athlete UUID := COALESCE(NEW.athlete_id, OLD.athlete_id);
    v_coach   UUID;
    v_nutri   UUID;
BEGIN
    SELECT
        (SELECT ca.coach_id FROM public.coach_athletes ca
          WHERE ca.athlete_id = v_athlete AND ca.status = 'active'
            AND ca.relation IN ('head_coach', 'assistant')
          ORDER BY (ca.relation = 'head_coach') DESC, ca.started_at DESC LIMIT 1),
        (SELECT ca.coach_id FROM public.coach_athletes ca
          WHERE ca.athlete_id = v_athlete AND ca.status = 'active'
            AND ca.relation = 'nutritionist'
          ORDER BY ca.started_at DESC LIMIT 1)
    INTO v_coach, v_nutri;

    -- Se recalculan las dos casillas ENTERAS a partir de las relaciones
    -- vivas, en vez de ir aplicando el cambio concreto. Es más barato de
    -- razonar y no puede desincronizarse: cualquier INSERT, UPDATE o DELETE
    -- deja el perfil describiendo exactamente lo que hay en la tabla.
    --
    -- El `IS DISTINCT FROM` del WHERE no es una optimización menor: escribir
    -- en `profiles` despierta al disparador del camino contrario, y si se
    -- escribiera siempre —aunque el valor ya coincidiera— cada vínculo daría
    -- una vuelta de ida y vuelta entre las dos tablas por nada.
    UPDATE public.profiles p
       SET coach_id        = v_coach,
           nutritionist_id = v_nutri
     WHERE p.id = v_athlete
       AND (p.coach_id IS DISTINCT FROM v_coach
            OR p.nutritionist_id IS DISTINCT FROM v_nutri);

    RETURN NULL; -- AFTER trigger: el valor devuelto se ignora.
END;
$$;

DROP TRIGGER IF EXISTS coach_athletes_sync_profile_trg ON public.coach_athletes;
CREATE TRIGGER coach_athletes_sync_profile_trg
    AFTER INSERT OR UPDATE OR DELETE ON public.coach_athletes
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_from_link();

-- El disparador de `fix_coach_athlete_link.sql` que hacía el camino contrario
-- (`clear_profile_on_unlink`) ya no hace falta: el de arriba cubre también el
-- DELETE. Mantenerlo provocaría dos escrituras sobre la misma fila.
DROP TRIGGER IF EXISTS coach_athletes_clear_profile_trg ON public.coach_athletes;


-- ---------------------------------------------------------------------
-- 3b. EL CAMINO DE VUELTA: ESCRIBIR `coach_id` A MANO SIGUE FUNCIONANDO
-- ---------------------------------------------------------------------
-- El panel de administración asigna entrenador escribiendo `profiles.coach_id`
-- (adminService.updateUserCoach), y hay años de costumbre de hacerlo a mano
-- desde el panel de Supabase. Ese camino tiene que seguir creando la relación
-- de verdad, o volveríamos al problema original: el atleta ve a su entrenador
-- y el entrenador no ve al atleta.
--
-- La diferencia con la versión anterior es que ahora CIERRA el tramo viejo en
-- vez de borrarlo.

CREATE OR REPLACE FUNCTION public.sync_coach_athlete_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    coach_anterior UUID := NULL;
    nutri_anterior UUID := NULL;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        coach_anterior := OLD.coach_id;
        nutri_anterior := OLD.nutritionist_id;
    END IF;

    IF NEW.coach_id IS DISTINCT FROM coach_anterior THEN
        IF coach_anterior IS NOT NULL THEN
            UPDATE public.coach_athletes
               SET status = 'ended', ended_at = NOW()
             WHERE coach_id = coach_anterior
               AND athlete_id = NEW.id
               AND relation IN ('head_coach', 'assistant')
               AND status = 'active';
        END IF;

        IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.id THEN
            PERFORM public.upsert_coach_athlete(NEW.coach_id, NEW.id, 'head_coach');
        END IF;
    END IF;

    IF NEW.nutritionist_id IS DISTINCT FROM nutri_anterior THEN
        IF nutri_anterior IS NOT NULL THEN
            UPDATE public.coach_athletes
               SET status = 'ended', ended_at = NOW()
             WHERE coach_id = nutri_anterior
               AND athlete_id = NEW.id
               AND relation = 'nutritionist'
               AND status = 'active';
        END IF;

        IF NEW.nutritionist_id IS NOT NULL AND NEW.nutritionist_id <> NEW.id THEN
            PERFORM public.upsert_coach_athlete(NEW.nutritionist_id, NEW.id, 'nutritionist');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- El disparador se mantiene tal cual estaba: mismo nombre, mismas columnas.
DROP TRIGGER IF EXISTS profiles_sync_coach_athlete_trg ON public.profiles;
CREATE TRIGGER profiles_sync_coach_athlete_trg
    AFTER INSERT OR UPDATE OF coach_id, nutritionist_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_coach_athlete_link();

-- NOTA SOBRE LA RECURSIÓN ENTRE LOS DOS DISPARADORES
-- Sigue cortándose sola: el de `coach_athletes` recalcula el perfil, y si el
-- valor ya coincide el UPDATE no cambia nada, así que el de `profiles` ve
-- `IS NOT DISTINCT FROM` y no vuelve a escribir. Dos vueltas como mucho.


-- =====================================================================
-- 4. ALTA Y BAJA DE RELACIONES
-- =====================================================================
-- Una sola puerta para crear o revivir una relación. Existe para que
-- "vincular" signifique lo mismo lo llame quien lo llame: el canje de una
-- invitación, el panel de administración o la Edge Function.

CREATE OR REPLACE FUNCTION public.upsert_coach_athlete(
    p_coach_id   UUID,
    p_athlete_id UUID,
    p_relation   TEXT DEFAULT 'head_coach'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_coach_id = p_athlete_id THEN
        RAISE EXCEPTION 'Un usuario no puede ser su propio entrenador.';
    END IF;

    -- ¿Ya está viva? Pulsar dos veces no es un error.
    SELECT id INTO v_id
      FROM public.coach_athletes
     WHERE coach_id = p_coach_id AND athlete_id = p_athlete_id
       AND relation = p_relation AND status = 'active';

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- ¿Estuvo y se acabó? Se abre un tramo NUEVO en vez de resucitar el
    -- viejo: si se reutilizara la fila, el tramo anterior desaparecería y con
    -- él la respuesta a "¿cuándo estuvo conmigo la primera vez?".
    --
    -- El `EXCEPTION` cubre la carrera real: el atleta canjeando la invitación
    -- en el mismo instante en que el entrenador lo vincula desde el panel.
    -- El índice parcial garantiza que solo entre uno; el que pierde lee la
    -- fila del que ganó en vez de reventar con un error de duplicado.
    BEGIN
        INSERT INTO public.coach_athletes (coach_id, athlete_id, relation, status, started_at)
        VALUES (p_coach_id, p_athlete_id, p_relation, 'active', NOW())
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_id
          FROM public.coach_athletes
         WHERE coach_id = p_coach_id AND athlete_id = p_athlete_id
           AND relation = p_relation AND status = 'active';
    END;

    RETURN v_id;
END;
$$;

-- Ni `anon` ni `authenticated`: vincular a alguien es una decisión que se
-- toma en una invitación o en el alta, no una llamada suelta desde el
-- navegador. La usan los disparadores (que corren como dueños) y la Edge
-- Function con `service_role`.
REVOKE EXECUTE ON FUNCTION public.upsert_coach_athlete(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_coach_athlete(UUID, UUID, TEXT) TO service_role;


/**
 * Cambiar el estado de una relación: archivarla, cerrarla o reabrirla.
 *
 * Sustituye al DELETE que hacía el front. Borrar la fila tiraba la única
 * prueba de que ese atleta estuvo con ese entrenador; y como el atleta
 * conserva sus bloques y su historial —que son suyos, no del coach—, quedaba
 * un montón de entrenamientos sin nadie que explicara de dónde salieron.
 */
CREATE OR REPLACE FUNCTION public.set_coach_athlete_status(
    p_athlete_id UUID,
    p_status     TEXT,
    p_relation   TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me UUID := auth.uid();
    afectadas INTEGER;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Sin sesión.';
    END IF;

    IF p_status NOT IN ('active', 'archived', 'ended') THEN
        RAISE EXCEPTION 'Estado no válido: %', p_status;
    END IF;

    UPDATE public.coach_athletes
       SET status   = p_status,
           ended_at = CASE WHEN p_status = 'ended' THEN NOW() ELSE NULL END
     WHERE coach_id = me
       AND athlete_id = p_athlete_id
       AND (p_relation IS NULL OR relation = p_relation)
       AND status <> p_status;

    GET DIAGNOSTICS afectadas = ROW_COUNT;
    RETURN afectadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_coach_athlete_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_coach_athlete_status(UUID, TEXT, TEXT) TO authenticated;


-- =====================================================================
-- 5. QUÉ PUEDE TOCAR UN ENTRENADOR DEL PERFIL DE SU ATLETA
-- =====================================================================
--
-- Hasta ahora: nada. La única política de UPDATE sobre `profiles` es
-- `id = auth.uid()`, y por eso el vínculo se apañaba con disparadores.
--
-- Un atleta gestionado no tiene a nadie que rellene su ficha, así que su
-- entrenador tiene que poder hacerlo. Pero SOLO mientras esté gestionado:
-- en cuanto la persona reclama su cuenta, su perfil vuelve a ser
-- exclusivamente suyo. Ese es el límite y está en la propia política.

CREATE OR REPLACE FUNCTION public.gestiono_este_perfil(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.coach_athletes ca
          ON ca.athlete_id = p.id
         AND ca.status = 'active'
        WHERE p.id = p_profile_id
          AND p.account_status IN ('managed', 'invited')
          AND ca.coach_id = (SELECT auth.uid())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.gestiono_este_perfil(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.gestiono_este_perfil(UUID) TO authenticated;

DROP POLICY IF EXISTS "coach_reads_managed_profile" ON public.profiles;
CREATE POLICY "coach_reads_managed_profile"
    ON public.profiles FOR SELECT TO authenticated
    USING (public.gestiono_este_perfil(id));

DROP POLICY IF EXISTS "coach_updates_managed_profile" ON public.profiles;
CREATE POLICY "coach_updates_managed_profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (public.gestiono_este_perfil(id))
    WITH CHECK (public.gestiono_este_perfil(id));


-- ---------------------------------------------------------------------
-- 5b. Y QUÉ NO PUEDE TOCAR
-- ---------------------------------------------------------------------
-- La política de arriba abre la FILA entera, y la RLS de Postgres no sabe de
-- columnas. Sin este cerrojo, un entrenador podría poner `role = 'admin'` en
-- el perfil de un atleta gestionado y esperar a que lo reclamara: el día que
-- esa persona entrase, entraría como administrador.
--
-- Se prohíbe tocar las columnas de identidad y permiso en perfiles AJENOS.
-- Editar el propio no pasa por aquí, y el administrador sí puede (es lo que
-- usa el panel para asignar entrenador).

CREATE OR REPLACE FUNCTION public.protect_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me       UUID := auth.uid();
    mi_rol   TEXT;
BEGIN
    -- Sin sesión = disparadores internos y `service_role` (la Edge Function).
    -- Ahí no hay nada que proteger: es código nuestro.
    IF me IS NULL OR me = NEW.id THEN
        RETURN NEW;
    END IF;

    SELECT role INTO mi_rol FROM public.profiles WHERE id = me;
    IF mi_rol = 'admin' THEN
        RETURN NEW;
    END IF;

    -- SIN `NEW.email`: `profiles` no tiene esa columna en la base real, y
    -- plpgsql no resuelve los nombres hasta la primera ejecución. Estaba
    -- aquí, y hacía fallar TODA edición de la ficha de un atleta gestionado
    -- con «record "new" has no field "email"». Ver database/FIX_ATLETA_SIN_EMAIL.sql,
    -- que además hace opcional `is_developer` por el mismo motivo.
    IF (NEW.role           IS DISTINCT FROM OLD.role)
    OR (NEW.has_access     IS DISTINCT FROM OLD.has_access)
    OR (NEW.account_status IS DISTINCT FROM OLD.account_status)
    OR (NEW.is_developer   IS DISTINCT FROM OLD.is_developer) THEN
        RAISE EXCEPTION 'Acceso Denegado: no puedes cambiar el rol, el acceso ni el estado de cuenta de otro usuario.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_identity_trg ON public.profiles;
CREATE TRIGGER profiles_protect_identity_trg
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_identity_fields();


-- =====================================================================
-- 6. INVITACIONES DIRIGIDAS
-- =====================================================================
-- Una invitación puede apuntar a una ficha concreta. Es lo que convierte
-- "únete a mi equipo" en "reclama TU ficha, la que tu entrenador ya ha
-- rellenado", y lo que evita que el atleta acabe con dos.

ALTER TABLE public.coach_invites
    ADD COLUMN IF NOT EXISTS target_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.coach_invites
    ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT 'head_coach';

ALTER TABLE public.coach_invites
    DROP CONSTRAINT IF EXISTS coach_invites_relation_check;
ALTER TABLE public.coach_invites
    ADD CONSTRAINT coach_invites_relation_check
    CHECK (relation IN ('head_coach', 'assistant', 'nutritionist'));

-- Una invitación dirigida es para UNA persona. Un enlace nominal con diez
-- usos reenviado en un grupo engancharía a diez desconocidos a la ficha de
-- otro.
ALTER TABLE public.coach_invites
    DROP CONSTRAINT IF EXISTS coach_invites_target_single_use;
ALTER TABLE public.coach_invites
    ADD CONSTRAINT coach_invites_target_single_use
    CHECK (target_profile_id IS NULL OR max_uses = 1);

CREATE INDEX IF NOT EXISTS coach_invites_target_idx
    ON public.coach_invites (target_profile_id)
    WHERE target_profile_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 6b. CANJEAR
-- ---------------------------------------------------------------------
-- Reemplaza a la de database/coach_invites.sql. Dos cambios:
--
--   · Escribe el vínculo por `upsert_coach_athlete`, así que respeta el
--     ciclo de vida y ya no toca `profiles` a mano (lo hace el disparador).
--
--   · Entiende las invitaciones dirigidas. Si el enlace apunta a una ficha
--     gestionada Y quien lo canjea NO es esa ficha, se rechaza: significa
--     que el enlace nominal de alguien ha acabado en otras manos. La ficha
--     gestionada solo puede reclamarla su propia cuenta latente, y para eso
--     está el enlace mágico que manda la Edge Function.

CREATE OR REPLACE FUNCTION public.redeem_coach_invite(p_code TEXT)
RETURNS TABLE (ok BOOLEAN, reason TEXT, coach_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    inv public.coach_invites%ROWTYPE;
    me UUID := auth.uid();
    coach_rol TEXT;
    coach_full_name TEXT;
    rel TEXT;
BEGIN
    IF me IS NULL THEN
        RETURN QUERY SELECT FALSE, 'sin_sesion'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    SELECT * INTO inv
    FROM public.coach_invites
    WHERE code = upper(trim(p_code))
    FOR UPDATE;

    IF inv.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'no_existe'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    SELECT p.role, p.full_name INTO coach_rol, coach_full_name
    FROM public.profiles p WHERE p.id = inv.coach_id;

    IF inv.revoked_at IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'revocada'::TEXT, coach_full_name; RETURN;
    END IF;

    IF inv.expires_at IS NOT NULL AND inv.expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, 'caducada'::TEXT, coach_full_name; RETURN;
    END IF;

    IF inv.uses >= inv.max_uses THEN
        RETURN QUERY SELECT FALSE, 'agotada'::TEXT, coach_full_name; RETURN;
    END IF;

    IF inv.coach_id = me THEN
        RETURN QUERY SELECT FALSE, 'es_tuya'::TEXT, coach_full_name; RETURN;
    END IF;

    -- Enlace nominal en manos de otra persona.
    IF inv.target_profile_id IS NOT NULL AND inv.target_profile_id <> me THEN
        RETURN QUERY SELECT FALSE, 'no_es_para_ti'::TEXT, coach_full_name; RETURN;
    END IF;

    -- La relación la manda la invitación; si es antigua y no la trae, el rol
    -- de quien invita.
    rel := COALESCE(
        NULLIF(inv.relation, ''),
        CASE WHEN coach_rol = 'nutritionist' THEN 'nutritionist' ELSE 'head_coach' END
    );

    IF EXISTS (
        SELECT 1 FROM public.coach_athletes
        WHERE coach_id = inv.coach_id AND athlete_id = me
          AND relation = rel AND status = 'active'
    ) THEN
        RETURN QUERY SELECT TRUE, 'ya_vinculado'::TEXT, coach_full_name; RETURN;
    END IF;

    PERFORM public.upsert_coach_athlete(inv.coach_id, me, rel);

    UPDATE public.coach_invites SET uses = uses + 1 WHERE id = inv.id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, coach_full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coach_invite(TEXT) TO authenticated;


-- =====================================================================
-- 7. BUSCAR ANTES DE CREAR (la regla anti-duplicados)
-- =====================================================================
-- Antes de dar de alta a nadie hay que saber si ya existe. No se puede hacer
-- con un SELECT desde el navegador: la RLS de `profiles` no deja a un
-- entrenador leer perfiles que no son suyos, y abrirla para esto significaría
-- convertir la tabla de usuarios en un directorio consultable.
--
-- Esta función responde a UNA pregunta sobre UN correo exacto, y solo dice lo
-- imprescindible para decidir qué hacer. Nunca lista.

CREATE OR REPLACE FUNCTION public.find_athlete_by_email(p_email TEXT)
RETURNS TABLE (
    profile_id     UUID,
    full_name      TEXT,
    account_status TEXT,
    already_linked BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me UUID := auth.uid();
    mi_rol TEXT;
    correo TEXT := lower(trim(p_email));
BEGIN
    IF me IS NULL OR correo = '' THEN
        RETURN;
    END IF;

    SELECT role INTO mi_rol FROM public.profiles WHERE id = me;
    IF mi_rol NOT IN ('coach', 'nutritionist', 'admin') THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id,
           p.full_name,
           p.account_status,
           EXISTS (
               SELECT 1 FROM public.coach_athletes ca
                WHERE ca.athlete_id = p.id AND ca.coach_id = me AND ca.status = 'active'
           )
      FROM public.profiles p
      -- `auth.users` y NO `p.email`: esa columna no existe en la base real.
      -- Aquí está el correo de INICIO DE SESIÓN, que es la otra mitad de los
      -- duplicados. Ver database/FIX_ATLETA_SIN_EMAIL.sql.
      LEFT JOIN auth.users u ON u.id = p.id
     WHERE lower(p.contact_email) = correo
        OR lower(u.email) = correo
     LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_athlete_by_email(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_athlete_by_email(TEXT) TO authenticated;


-- =====================================================================
-- 8. RECLAMAR LA CUENTA
-- =====================================================================
-- Lo llama la propia cuenta latente la primera vez que entra de verdad. No
-- mueve ni un dato: la ficha ya era suya, lo único que cambia es que a partir
-- de ahora manda ella y su entrenador deja de poder editarla.

CREATE OR REPLACE FUNCTION public.claim_managed_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me UUID := auth.uid();
    afectadas INTEGER;
BEGIN
    IF me IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles
       SET account_status = 'active',
           claimed_at     = NOW()
     WHERE id = me
       AND account_status IN ('managed', 'invited');

    GET DIAGNOSTICS afectadas = ROW_COUNT;
    RETURN afectadas > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_managed_profile() TO authenticated;


-- =====================================================================
-- 9. NO MOLESTAR A QUIEN NO TIENE APLICACIÓN
-- =====================================================================
-- Un atleta gestionado no tiene dispositivo ni correo real. Mandarle avisos
-- es, en el mejor de los casos, ruido en una bandeja que no existe; en el
-- peor, correos a una dirección de marcador que rebotan y ensucian la
-- reputación del dominio.

CREATE OR REPLACE FUNCTION public.skip_notifications_for_managed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = NEW.user_id AND account_status IN ('managed', 'invited')
    ) THEN
        RETURN NULL; -- BEFORE INSERT: se descarta la fila sin error.
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'notifications') THEN
        DROP TRIGGER IF EXISTS notifications_skip_managed_trg ON public.notifications;
        CREATE TRIGGER notifications_skip_managed_trg
            BEFORE INSERT ON public.notifications
            FOR EACH ROW
            EXECUTE FUNCTION public.skip_notifications_for_managed();
    END IF;
END $$;


-- =====================================================================
-- 10. COMPROBACIÓN
-- =====================================================================
DO $$
DECLARE
    descuadrados INT;
    gestionados  INT;
BEGIN
    SELECT count(*) INTO descuadrados
      FROM public.profiles p
     WHERE p.coach_id IS DISTINCT FROM (
               SELECT ca.coach_id FROM public.coach_athletes ca
                WHERE ca.athlete_id = p.id AND ca.status = 'active'
                  AND ca.relation IN ('head_coach', 'assistant')
                ORDER BY (ca.relation = 'head_coach') DESC, ca.started_at DESC
                LIMIT 1
           );

    SELECT count(*) INTO gestionados
      FROM public.profiles WHERE account_status <> 'active';

    IF descuadrados > 0 THEN
        RAISE WARNING 'Hay % perfiles cuyo coach_id no coincide con su relación activa. Se corregirán al primer cambio; para forzarlo: UPDATE public.coach_athletes SET status = status;', descuadrados;
    ELSE
        RAISE NOTICE 'Vínculos coherentes. Perfiles no activos: %.', gestionados;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
