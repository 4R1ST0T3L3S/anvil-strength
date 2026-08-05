-- =====================================================================
-- ANVIL STRENGTH — HARDENING DE SEGURIDAD (F1)
-- =====================================================================
-- Cierra las vulnerabilidades detectadas en la auditoría del proyecto.
-- Idempotente: se puede ejecutar varias veces sin romper nada.
--
-- CÓMO EJECUTARLO
--   1. Supabase Dashboard -> SQL Editor -> pegar este archivo entero.
--   2. Ejecutar. Al final hay un bloque de VERIFICACIÓN que imprime el
--      estado resultante; revísalo antes de dar por buena la migración.
--
-- IMPORTANTE: ejecutar DESPUÉS de todos los MASTER_*.sql existentes,
-- porque este archivo revoca y sustituye políticas creadas por aquellos.
-- =====================================================================


-- =====================================================================
-- 0.A REQUISITOS DE ESQUEMA
-- =====================================================================
-- Las políticas de más abajo necesitan columnas que en la base real no
-- estaban. Se crean aquí, antes que nada, para que el archivo se pueda
-- ejecutar de una sola pasada sobre una base ya existente.
--
-- Diagnóstico del 2026-07-30 (ver 00_DIAGNOSTICO_ESQUEMA.sql): TODAS las
-- tablas existían; faltaban únicamente columnas sueltas. Este bloque
-- resuelve las que son requisito de este archivo. Las demás que reportó el
-- diagnóstico NO se tocan aquí a propósito:
--   · messages.attachments   -> la crea database/chat_media.sql (F7)
--   · athlete_reviews.athlete_id -> no existe ni hace falta; la tabla usa
--     user_id + athlete_name, y aquí solo se le hace REVOKE a anon
--   · profiles.nutritionist_id -> solo aparece en un comentario

-- exercise_library.coach_id: sin ella, las políticas exlib_* de la sección
-- 3 fallaban con "42703: column coach_id does not exist", que es lo que
-- abortaba el script entero. La app ya la da por hecha —
-- src/types/training.ts la declara y trainingService la escribe al crear un
-- ejercicio— así que su ausencia también rompía la creación de ejercicios
-- personalizados. NULL significa "ejercicio del sistema, de nadie".
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='exercise_library')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='exercise_library'
                         AND column_name='coach_id') THEN
        ALTER TABLE public.exercise_library
            ADD COLUMN coach_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

        RAISE NOTICE 'Añadida exercise_library.coach_id';
    END IF;
END $$;

-- Índice para la política de SELECT, que filtra por coach_id en cada
-- consulta de la biblioteca.
CREATE INDEX IF NOT EXISTS exercise_library_coach_id_idx
    ON public.exercise_library (coach_id);


-- =====================================================================
-- 0. FUNCIONES AUXILIARES
-- =====================================================================
-- Leen profiles saltándose RLS (SECURITY DEFINER) para poder usarse
-- dentro de políticas sin provocar recursión infinita.
-- search_path fijado: evita secuestro de la resolución de nombres.

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'coach'
    );
$$;

-- ¿Existe relación coach <-> atleta entre auth.uid() y el usuario dado?
CREATE OR REPLACE FUNCTION public.shares_coaching_link(other_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.coach_athletes
        WHERE (coach_id = auth.uid() AND athlete_id = other_id)
           OR (athlete_id = auth.uid() AND coach_id = other_id)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.auth_role()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_coach()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_coaching_link(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auth_role()               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_coach()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.shares_coaching_link(UUID) TO authenticated;


-- =====================================================================
-- 1. PROFILES — bloqueo a nivel de COLUMNA
-- =====================================================================
-- PROBLEMA (críticos C2, C5, C6):
--   La política de UPDATE era `USING (auth.uid() = id)` sin restricción
--   de columnas. RLS filtra FILAS, nunca COLUMNAS. Por tanto cualquier
--   usuario podía hacer:
--     supabase.from('profiles').update({ role: 'coach' })        -> C2
--     supabase.from('profiles').update({ has_access: true })     -> C5 (bypass de acceso)
--     supabase.from('profiles').update({ anvil_coins: 999999 })  -> C6 (economía Arena)
--     supabase.from('profiles').update({ is_developer: true })   -> C6
--   El control de columnas se hace con GRANT/REVOKE, no con RLS.

-- 1.1 Defaults para las columnas que dejarán de poder escribirse
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'athlete';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='has_access') THEN
        ALTER TABLE public.profiles ALTER COLUMN has_access SET DEFAULT FALSE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='anvil_coins') THEN
        ALTER TABLE public.profiles ALTER COLUMN anvil_coins SET DEFAULT 0;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='is_developer') THEN
        ALTER TABLE public.profiles ALTER COLUMN is_developer SET DEFAULT FALSE;
    END IF;
END $$;

-- 1.2 El email lo rellena el servidor desde auth.users, nunca el cliente.
--
-- CONDICIONADO A QUE profiles.email EXISTA. En la base real NO existe, y
-- este bloque era la trampa peor del archivo: PostgreSQL no valida el cuerpo
-- de una función plpgsql al crearla, así que el CREATE FUNCTION y el CREATE
-- TRIGGER habrían pasado sin una sola queja... y luego habría fallado
-- TODA alta de perfil, en producción, con el registro de usuarios roto.
--
-- Si algún día se añade profiles.email, este bloque se activa solo al
-- volver a ejecutar el archivo. Y si no se añade, se limpia cualquier
-- trigger que hubiera quedado de un intento anterior.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles'
                 AND column_name='email') THEN

        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.profiles_fill_email()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public, pg_temp
            AS $body$
            BEGIN
                IF NEW.email IS NULL OR NEW.email = '' THEN
                    SELECT u.email INTO NEW.email FROM auth.users u WHERE u.id = NEW.id;
                END IF;
                RETURN NEW;
            END;
            $body$;
        $fn$;

        DROP TRIGGER IF EXISTS profiles_fill_email_trg ON public.profiles;
        CREATE TRIGGER profiles_fill_email_trg
            BEFORE INSERT ON public.profiles
            FOR EACH ROW EXECUTE FUNCTION public.profiles_fill_email();

        RAISE NOTICE 'Trigger de email instalado';
    ELSE
        DROP TRIGGER IF EXISTS profiles_fill_email_trg ON public.profiles;
        DROP FUNCTION IF EXISTS public.profiles_fill_email();

        RAISE NOTICE 'profiles.email no existe: se omite el trigger de email (correcto, no es un fallo)';
    END IF;
END $$;

-- 1.3 Revocar TODO y devolver solo lo que el usuario puede tocar de verdad.
--     Se usa un bloque dinámico porque el conjunto de columnas varía según
--     qué migraciones se hayan aplicado ya.
DO $$
DECLARE
    -- Columnas que el propio usuario SÍ puede editar de su perfil.
    editable TEXT[] := ARRAY[
        'full_name','nickname','avatar_url','gender',
        'weight_category','age_category',
        'squat_pr','bench_pr','deadlift_pr','total_pr',
        'biography','brand_color','logo_url','instagram_url','bio',
        'max_sushi_pieces','pdf_theme'
    ];
    present TEXT[];
    col_list TEXT;
BEGIN
    SELECT array_agg(quote_ident(column_name))
      INTO present
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  = ANY(editable);

    EXECUTE 'REVOKE INSERT, UPDATE ON public.profiles FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.profiles FROM anon';

    IF present IS NOT NULL THEN
        col_list := array_to_string(present, ', ');
        EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', col_list);
        -- El INSERT de arranque necesita además el id (autoreferencia a auth.uid()).
        EXECUTE format('GRANT INSERT (id, %s) ON public.profiles TO authenticated', col_list);
    ELSE
        RAISE NOTICE 'profiles: no se encontró ninguna columna editable esperada';
    END IF;
END $$;

-- 1.4 Políticas de fila (ahora sí, solo filas — las columnas ya están cerradas)
DROP POLICY IF EXISTS "Users can view own profile"                  ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"                ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"                ON public.profiles;
DROP POLICY IF EXISTS "Athletes can view all athletes for ranking"  ON public.profiles;  -- C3: filtraba emails
DROP POLICY IF EXISTS "Profiles are viewable by everyone"           ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone"    ON public.profiles;
-- Los tres nombres de abajo son los que pone ESTE script. Sin dropearlos
-- antes de recrearlos, volver a ejecutar el archivo —como hace falta cada
-- vez que se añade una columna a `editable`, arriba— fallaba con
-- "policy ... already exists" y dejaba el resto del script sin correr.
DROP POLICY IF EXISTS "profiles_select_self_or_linked"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self"                         ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"                         ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ver: uno mismo, sus atletas (si es coach), y su coach (si es atleta).
CREATE POLICY "profiles_select_self_or_linked" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR public.shares_coaching_link(id)
    );

CREATE POLICY "profiles_insert_self" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 1.5 Vista pública para el ranking: SIN email, SIN has_access, SIN coins.
--     Es intencionadamente SECURITY DEFINER (security_invoker = false):
--     la propia vista ES el control de acceso — expone solo columnas seguras
--     de atletas, y por eso puede saltarse la RLS de profiles.
-- La lista de columnas se construye a partir de las que EXISTEN de verdad.
-- Escribirla fija haría fallar el archivo entero por una sola columna que no
-- estuviera, y estas ocho vienen de migraciones antiguas que no se sabe si
-- se aplicaron todas. La lista blanca sigue siendo fija: aquí se decide qué
-- es seguro publicar, y lo que no esté en ella no puede colarse nunca.
DO $$
DECLARE
    permitidas TEXT[] := ARRAY[
        'id','full_name','nickname','avatar_url','role','gender',
        'weight_category','age_category','squat_pr','bench_pr',
        'deadlift_pr','total_pr'
    ];
    cols TEXT;
BEGIN
    SELECT string_agg('p.' || quote_ident(c.column_name), ', ' ORDER BY c.column_name)
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = 'profiles'
       AND c.column_name  = ANY(permitidas);

    IF cols IS NULL THEN
        RAISE EXCEPTION 'profiles no tiene ninguna de las columnas publicables; revisa el esquema';
    END IF;

    EXECUTE 'DROP VIEW IF EXISTS public.public_profiles CASCADE';
    EXECUTE format(
        'CREATE VIEW public.public_profiles WITH (security_invoker = false) AS
         SELECT %s FROM public.profiles p WHERE p.role = ''athlete''',
        cols
    );

    RAISE NOTICE 'public_profiles creada con: %', cols;
END $$;

REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
    'Proyección segura de profiles para rankings y comparativas. Nunca añadir aquí email, has_access, anvil_coins, is_developer ni coach_id.';


-- =====================================================================
-- 2. NOTIFICATIONS — fin de la inyección (crítico C4)
-- =====================================================================
-- PROBLEMA: `FOR INSERT ... WITH CHECK (TRUE)` permitía a cualquier
-- usuario crear notificaciones para cualquier otro, con un `link`
-- arbitrario -> phishing dentro de la propia app.
-- SOLUCIÓN: el cliente no inserta nunca. Solo los triggers SECURITY
-- DEFINER (PRs, mensajes, anuncios) y el service_role.

DROP POLICY IF EXISTS "System can insert notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications"    ON public.notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications"   ON public.notifications;

REVOKE INSERT, DELETE ON public.notifications FROM authenticated;
REVOKE ALL             ON public.notifications FROM anon;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- =====================================================================
-- 3. EXERCISE_LIBRARY — fin de la escalada por user_metadata (crítico C1)
-- =====================================================================
-- PROBLEMA: la política usaba
--     (auth.jwt() -> 'user_metadata' ->> 'role') = 'coach'
-- y `user_metadata` lo edita el propio usuario con auth.updateUser().
-- Cualquier atleta se declaraba coach y obtenía FOR ALL (UPDATE + DELETE)
-- sobre TODA la biblioteca, incluidos los ejercicios del sistema.
-- Además no tenía WITH CHECK, así que el INSERT quedaba sin restringir.
-- SOLUCIÓN: usar profiles.role, que ya no es autoeditable (sección 1).

DROP POLICY IF EXISTS "Coaches write exercises"                    ON public.exercise_library;
DROP POLICY IF EXISTS "Public read exercises"                      ON public.exercise_library;
DROP POLICY IF EXISTS "Public Read Exercises"                      ON public.exercise_library;
DROP POLICY IF EXISTS "Athletes view public and designated exercises" ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_select"                                ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_insert_own"                            ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_update_own"                            ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_delete_own"                            ON public.exercise_library;

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exlib_select" ON public.exercise_library
    FOR SELECT TO authenticated
    USING (
        is_public = TRUE
        OR coach_id = auth.uid()
        OR coach_id IN (SELECT coach_id FROM public.coach_athletes WHERE athlete_id = auth.uid())
    );

-- Un coach solo crea ejercicios a su nombre, y nunca públicos
-- (los públicos los siembra el admin vía service_role).
CREATE POLICY "exlib_insert_own" ON public.exercise_library
    FOR INSERT TO authenticated
    WITH CHECK (coach_id = auth.uid() AND public.is_coach() AND is_public = FALSE);

CREATE POLICY "exlib_update_own" ON public.exercise_library
    FOR UPDATE TO authenticated
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid() AND is_public = FALSE);

CREATE POLICY "exlib_delete_own" ON public.exercise_library
    FOR DELETE TO authenticated
    USING (coach_id = auth.uid());


-- =====================================================================
-- 4. MESSAGES — solo entre coach y sus atletas
-- =====================================================================
-- PROBLEMA: las políticas solo comprobaban sender/recipient, así que
-- cualquier usuario podía escribir un DM a cualquier otro usuario cuyo
-- UUID conociera (y los UUID se filtraban por el ranking, ver C3).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='messages') THEN

        EXECUTE 'DROP POLICY IF EXISTS "messages_select_own"         ON public.messages';
        EXECUTE 'DROP POLICY IF EXISTS "messages_insert_own"         ON public.messages';
        EXECUTE 'DROP POLICY IF EXISTS "messages_update_read"        ON public.messages';
        EXECUTE 'DROP POLICY IF EXISTS "messages_select_participant" ON public.messages';
        EXECUTE 'DROP POLICY IF EXISTS "messages_insert_linked"      ON public.messages';

        EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';

        EXECUTE $p$
            CREATE POLICY "messages_select_participant" ON public.messages
                FOR SELECT TO authenticated
                USING (auth.uid() = sender_id OR auth.uid() = recipient_id)
        $p$;

        -- Solo se puede iniciar conversación con alguien con quien
        -- existe relación de entrenamiento.
        EXECUTE $p$
            CREATE POLICY "messages_insert_linked" ON public.messages
                FOR INSERT TO authenticated
                WITH CHECK (
                    auth.uid() = sender_id
                    AND public.shares_coaching_link(recipient_id)
                )
        $p$;

        -- El receptor solo marca como leído; nadie edita el contenido.
        EXECUTE $p$
            CREATE POLICY "messages_update_read" ON public.messages
                FOR UPDATE TO authenticated
                USING (auth.uid() = recipient_id)
                WITH CHECK (auth.uid() = recipient_id)
        $p$;

        EXECUTE 'REVOKE UPDATE ON public.messages FROM authenticated';
        EXECUTE 'GRANT UPDATE (is_read) ON public.messages TO authenticated';
        EXECUTE 'REVOKE ALL ON public.messages FROM anon';

        -- Límite de tamaño: evita usar el chat como almacenamiento gratis.
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_len') THEN
            EXECUTE 'ALTER TABLE public.messages ADD CONSTRAINT messages_content_len
                     CHECK (char_length(content) BETWEEN 1 AND 5000)';
        END IF;
    END IF;
END $$;


-- =====================================================================
-- 5. ARENA — la economía deja de vivir en el cliente
-- =====================================================================
-- PROBLEMA: ArenaView.tsx descontaba y abonaba anvil_coins con UPDATE
-- directos desde el navegador. Con la sección 1 esos UPDATE ya no son
-- posibles (columna revocada), así que la lógica se mueve al servidor
-- en funciones SECURITY DEFINER, que además la hacen atómica.
--
-- Efecto colateral que conviene saber: los pagos a OTROS usuarios que
-- hacía el cliente (`update profiles ... eq('id', uid)` de otro usuario)
-- ya venían siendo NO-OPS silenciosos, porque la RLS los filtraba sin
-- devolver error. Es decir: los premios de la Arena nunca se pagaron.
-- Estas funciones lo arreglan de paso.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='arena_fights') THEN
        RAISE NOTICE 'Arena no instalada; se omite la sección 5.';
        RETURN;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arena_place_bet(
    p_fight_id UUID,
    p_side     TEXT,
    p_amount   INTEGER
)
RETURNS TABLE (new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user    UUID := auth.uid();
    v_balance INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;
    IF p_side NOT IN ('a','b') THEN
        RAISE EXCEPTION 'Lado inválido';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
        RAISE EXCEPTION 'Importe inválido';
    END IF;

    -- Bloquea la fila del combate: sin esto, dos apuestas simultáneas
    -- pisarían el pool la una a la otra.
    PERFORM 1 FROM public.arena_fights
     WHERE id = p_fight_id AND status = 'open'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El combate no está abierto';
    END IF;

    UPDATE public.profiles
       SET anvil_coins = anvil_coins - p_amount
     WHERE id = v_user AND anvil_coins >= p_amount
    RETURNING anvil_coins INTO v_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Saldo insuficiente';
    END IF;

    IF p_side = 'a' THEN
        UPDATE public.arena_fights SET pool_a = pool_a + p_amount WHERE id = p_fight_id;
    ELSE
        UPDATE public.arena_fights SET pool_b = pool_b + p_amount WHERE id = p_fight_id;
    END IF;

    INSERT INTO public.arena_fight_bets (fight_id, user_id, amount, selected_side)
    VALUES (p_fight_id, v_user, p_amount, p_side);

    RETURN QUERY SELECT v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.arena_resolve_fight(
    p_fight_id UUID,
    p_side     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total       INTEGER;
    v_winner_pool INTEGER;
BEGIN
    -- Resolver combates es privilegio de desarrollador, comprobado en
    -- servidor. Antes bastaba con poner is_developer = true desde el cliente.
    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND COALESCE(is_developer, FALSE)) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;
    IF p_side NOT IN ('a','b') THEN
        RAISE EXCEPTION 'Lado inválido';
    END IF;

    SELECT pool_a + pool_b,
           CASE WHEN p_side = 'a' THEN pool_a ELSE pool_b END
      INTO v_total, v_winner_pool
      FROM public.arena_fights
     WHERE id = p_fight_id AND status = 'open'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El combate no está abierto';
    END IF;

    IF v_winner_pool > 0 THEN
        UPDATE public.profiles p
           SET anvil_coins = p.anvil_coins + w.payout
          FROM (
                SELECT b.user_id,
                       FLOOR(SUM(b.amount)::NUMERIC / v_winner_pool * v_total)::INTEGER AS payout
                  FROM public.arena_fight_bets b
                 WHERE b.fight_id = p_fight_id AND b.selected_side = p_side
                 GROUP BY b.user_id
               ) w
         WHERE p.id = w.user_id;
    END IF;

    UPDATE public.arena_fights
       SET status = 'resolved', winner_side = p_side
     WHERE id = p_fight_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.arena_cancel_fight(p_fight_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND COALESCE(is_developer, FALSE)) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    PERFORM 1 FROM public.arena_fights WHERE id = p_fight_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Combate inexistente';
    END IF;

    UPDATE public.profiles p
       SET anvil_coins = p.anvil_coins + r.refund
      FROM (
            SELECT b.user_id, SUM(b.amount)::INTEGER AS refund
              FROM public.arena_fight_bets b
             WHERE b.fight_id = p_fight_id
             GROUP BY b.user_id
           ) r
     WHERE p.id = r.user_id;

    DELETE FROM public.arena_fight_bets WHERE fight_id = p_fight_id;
    DELETE FROM public.arena_fights     WHERE id = p_fight_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.arena_place_bet(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.arena_resolve_fight(UUID, TEXT)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.arena_cancel_fight(UUID)             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.arena_place_bet(UUID, TEXT, INTEGER) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.arena_resolve_fight(UUID, TEXT)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.arena_cancel_fight(UUID)             TO authenticated;

-- Los pools y el estado del combate solo cambian por las funciones de arriba.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='arena_fights') THEN
        EXECUTE 'REVOKE UPDATE, DELETE ON public.arena_fights FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.arena_fights FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='arena_fight_bets') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.arena_fight_bets FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.arena_fight_bets FROM anon';
    END IF;
END $$;

-- 5.1 RLS sobre las tablas de Arena
--
-- El bloque de arriba solo hacía REVOKE, y la verificación 7.3 las delataba
-- como "sin RLS". Con permisos pero sin RLS hay una sola línea de defensa:
-- el día que alguien re-otorgue un GRANT —o que Supabase lo haga al crear
-- una tabla desde el panel— la tabla queda abierta de par en par sin que
-- nada avise.
--
-- Los tres RPC son SECURITY DEFINER, así que se saltan estas políticas y
-- siguen funcionando igual. Lo que se cierra es el acceso DIRECTO.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='arena_fights') THEN

        EXECUTE 'ALTER TABLE public.arena_fights ENABLE ROW LEVEL SECURITY';

        EXECUTE 'DROP POLICY IF EXISTS arena_fights_select ON public.arena_fights';
        EXECUTE 'DROP POLICY IF EXISTS arena_fights_insert_dev ON public.arena_fights';

        -- El cartel de combates es público para los usuarios registrados:
        -- sin poder verlos no habría nada que apostar.
        EXECUTE $p$
            CREATE POLICY arena_fights_select ON public.arena_fights
                FOR SELECT TO authenticated USING (TRUE)
        $p$;

        -- Crear peleas: solo desarrolladores. La app ya escondía el
        -- formulario tras `isDev`, pero eso es la INTERFAZ: cualquiera con la
        -- consola abierta podía insertar una pelea y montarse una economía.
        EXECUTE $p$
            CREATE POLICY arena_fights_insert_dev ON public.arena_fights
                FOR INSERT TO authenticated
                WITH CHECK (
                    EXISTS (SELECT 1 FROM public.profiles
                             WHERE id = auth.uid() AND is_developer = TRUE)
                )
        $p$;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='arena_fight_bets') THEN

        EXECUTE 'ALTER TABLE public.arena_fight_bets ENABLE ROW LEVEL SECURITY';

        EXECUTE 'DROP POLICY IF EXISTS arena_bets_select_own ON public.arena_fight_bets';

        -- Cada uno ve sus apuestas y nadie más. Los botes agregados viven en
        -- arena_fights.pool_a / pool_b, así que la pantalla no pierde nada.
        -- Sin esto, cualquiera podía leer quién apostó a quién y cuánto.
        EXECUTE $p$
            CREATE POLICY arena_bets_select_own ON public.arena_fight_bets
                FOR SELECT TO authenticated USING (user_id = auth.uid())
        $p$;
    END IF;
END $$;


-- =====================================================================
-- 6. LIMPIEZA DE POLÍTICAS HEREDADAS PELIGROSAS
-- =====================================================================
-- Los MASTER_DEPLOY_V2 / database_schema_complete dejaron políticas
-- `USING (TRUE)` sobre tablas que sí contienen datos de entrenamiento.
-- Se eliminan; las tablas modernas (training_*) ya tienen políticas
-- correctas en feature_efort_schema.sql.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('workouts', 'exercises', 'training_plans', 'weekly_plans')
           AND (qual = 'true' OR with_check = 'true')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        RAISE NOTICE 'Eliminada política permisiva % en %', r.policyname, r.tablename;
    END LOOP;
END $$;

-- Las competiciones y reseñas sí son públicas por diseño, pero solo
-- para usuarios autenticados (antes también para `anon`).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='athlete_reviews') THEN
        EXECUTE 'REVOKE ALL ON public.athlete_reviews FROM anon';
    END IF;
END $$;


-- =====================================================================
-- 7. VERIFICACIÓN — revisa esta salida
-- =====================================================================

-- 7.1 Columnas de profiles que `authenticated` todavía puede escribir.
--     NO deben aparecer: role, has_access, anvil_coins, is_developer,
--     email, coach_id, nutritionist_id.
SELECT 'profiles escribibles' AS check, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columnas
  FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'authenticated'
   AND privilege_type IN ('INSERT','UPDATE')
 GROUP BY privilege_type;

-- 7.2 Políticas que siguen siendo totalmente permisivas. Idealmente vacío
--     salvo competitions (público por diseño).
SELECT 'políticas permisivas' AS check, tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename;

-- 7.3 Tablas públicas SIN RLS activada. Debe salir vacío.
SELECT 'sin RLS' AS check, c.relname AS tabla
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
 ORDER BY c.relname;
