-- =====================================================================
-- ANVIL STRENGTH — 0001 · INTEGRIDAD DEL ATLETA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Verificar después con `npm run db:check`.
--
-- Trae dos cosas independientes del bloque 1 (ver docs/DECISIONES_2026-08-21.md):
--
--   1. BORRADO REAL de la ficha de un atleta gestionado (decisión K2).
--   2. Las políticas DUPLICADAS de `training_blocks`, consolidadas.
--
-- =====================================================================
-- 1. BORRAR DE VERDAD UNA FICHA GESTIONADA
-- =====================================================================
--
-- EL AGUJERO QUE CIERRA
--
-- Un atleta ficticio —`account_status = 'managed'`, una cuenta LATENTE de
-- `auth.users` sin contraseña que su entrenador creó para poder programarle y
-- mandarle el PDF— quedaba, al cerrar la relación, en un estado sin salida:
--
--   · no puede iniciar sesión: nunca tuvo contraseña;
--   · su entrenador ya no puede leerlo ni editarlo, porque
--     `gestiono_este_perfil()` exige una relación ACTIVA;
--   · nadie más lo ve;
--   · y no existía ninguna forma de borrarlo.
--
-- O sea: una fila en `auth.users` y otra en `profiles`, para siempre, que
-- además seguía apareciendo en el panel del entrenador porque cinco consultas
-- del cliente se olvidaban de filtrar por estado. Eso último ya está
-- arreglado en el cliente (src/features/coach/hooks/useCoachRoster.ts); esto
-- es la otra mitad.
--
--
-- LOS DOS CANDADOS, Y POR QUÉ ESTÁN EN EL SERVIDOR
--
--   account_status = 'managed'   — nunca ha sido de nadie más que del coach.
--   claimed_at IS NULL           — NUNCA la ha reclamado una persona.
--
-- El segundo es el importante y es innegociable: en cuanto alguien reclama su
-- cuenta, sus entrenamientos son SUYOS, no del entrenador, y no hay ninguna
-- circunstancia en la que un tercero deba poder borrarlos. Que la interfaz
-- oculte el botón no basta: la interfaz se puede saltar con una petición a
-- mano. La condición vive aquí.
--
--
-- POR QUÉ HACE FALTA BORRAR A MANO ANTES DE TOCAR `auth.users`
--
-- `profiles.id` sí tiene `REFERENCES auth.users(id) ON DELETE CASCADE`, así
-- que la ficha se iría sola. Pero varias tablas apuntan a `auth.users` SIN
-- cascada —`training_blocks.athlete_id` entre ellas, que es justo la que un
-- atleta gestionado tiene llena— así que un `DELETE FROM auth.users` a secas
-- fallaría con una violación de clave ajena en el caso NORMAL.
--
-- La limpieza se descubre del catálogo en vez de escribirse a mano: una
-- lista de tablas escrita a mano se queda corta la primera vez que alguien
-- añade una tabla nueva, y entonces el borrado empieza a fallar sin que nadie
-- entienda por qué. Se recorren las claves ajenas que apuntan a `profiles` o
-- a `auth.users` por una columna que SIGNIFIQUE "esta fila es de esta
-- persona".
--
-- `coach_id`, `created_by`, `nutritionist_id` y `updated_by` quedan FUERA a
-- propósito: describen a otra persona. Da igual en la práctica —alguien que
-- nunca ha iniciado sesión no ha creado nada ni entrena a nadie— pero la
-- lista dice lo que quiere decir, y el día que esto se reutilice para otra
-- cosa la diferencia importará.
--
-- Todo ocurre dentro de UNA transacción: si algo falla, no queda nada a
-- medias. Es la única garantía aceptable en una operación irreversible.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_managed_athlete(p_athlete_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    me            UUID := auth.uid();
    v_nombre      TEXT;
    v_estado      TEXT;
    v_reclamado   TIMESTAMPTZ;
    v_es_mio      BOOLEAN;
    v_col         RECORD;
    v_borradas    INT;
    v_total       INT := 0;
    v_tablas      INT := 0;
    v_pendientes  TEXT[] := ARRAY[]::TEXT[];
    v_pasada      INT;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Sin sesión.';
    END IF;

    SELECT p.full_name, p.account_status, p.claimed_at
      INTO v_nombre, v_estado, v_reclamado
      FROM public.profiles p
     WHERE p.id = p_athlete_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese atleta ya no existe.';
    END IF;

    -- CANDADO 1: es tuyo, y AHORA. Una relación terminada no da derecho a
    -- borrar: si ya la cerraste y te arrepientes, la reactivas primero.
    SELECT EXISTS (
        SELECT 1 FROM public.coach_athletes ca
         WHERE ca.athlete_id = p_athlete_id
           AND ca.coach_id   = me
           AND ca.status     = 'active'
    ) INTO v_es_mio;

    IF NOT v_es_mio THEN
        RAISE EXCEPTION 'Este atleta no está en tu equipo ahora mismo.';
    END IF;

    -- CANDADO 2: nunca ha sido de una persona.
    IF v_estado <> 'managed' OR v_reclamado IS NOT NULL THEN
        RAISE EXCEPTION
            'La ficha de % ya tiene dueño: solo se puede sacar del equipo, nunca borrar. Su entrenamiento es suyo.',
            COALESCE(v_nombre, 'este atleta');
    END IF;

    -- -----------------------------------------------------------------
    -- LIMPIEZA, EN PASADAS
    -- -----------------------------------------------------------------
    -- El grafo de dependencias es un DAG y no se conoce de antemano, así que
    -- en vez de ordenarlo se repite: lo que hoy falla por tener hijos, mañana
    -- ya no los tiene. Cinco pasadas sobran para la profundidad real (la
    -- cadena más larga es bloque → sesión → ejercicio → serie, y esa además
    -- cascadea sola).
    FOR v_pasada IN 1..5 LOOP
        v_pendientes := ARRAY[]::TEXT[];

        FOR v_col IN
            SELECT c.relname AS tabla, a.attname AS columna
              FROM pg_constraint con
              JOIN pg_class       c  ON c.oid  = con.conrelid
              JOIN pg_namespace   n  ON n.oid  = c.relnamespace
              JOIN pg_class       rc ON rc.oid = con.confrelid
              JOIN pg_namespace   rn ON rn.oid = rc.relnamespace
              JOIN unnest(con.conkey) AS k(attnum) ON TRUE
              JOIN pg_attribute   a  ON a.attrelid = c.oid AND a.attnum = k.attnum
             WHERE con.contype = 'f'
               AND n.nspname   = 'public'
               AND array_length(con.conkey, 1) = 1
               AND (   (rn.nspname = 'public' AND rc.relname = 'profiles')
                    OR (rn.nspname = 'auth'   AND rc.relname = 'users') )
               -- Columnas que significan "esta fila ES de esta persona".
               AND a.attname IN (
                   'athlete_id', 'user_id', 'profile_id', 'target_profile_id',
                   'sender_id', 'receiver_id', 'recipient_id'
               )
        LOOP
            BEGIN
                EXECUTE format('DELETE FROM public.%I WHERE %I = $1', v_col.tabla, v_col.columna)
                  USING p_athlete_id;
                GET DIAGNOSTICS v_borradas = ROW_COUNT;
                IF v_borradas > 0 THEN
                    v_total  := v_total + v_borradas;
                    v_tablas := v_tablas + 1;
                END IF;
            EXCEPTION
                -- Tiene hijos que todavía no se han ido. Vuelve en la
                -- siguiente pasada.
                WHEN foreign_key_violation THEN
                    v_pendientes := v_pendientes || v_col.tabla;
            END;
        END LOOP;

        EXIT WHEN array_length(v_pendientes, 1) IS NULL;
    END LOOP;

    IF array_length(v_pendientes, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'No se pudo limpiar todo: quedan referencias en %. No se ha borrado nada.',
            array_to_string(v_pendientes, ', ');
    END IF;

    -- -----------------------------------------------------------------
    -- Y LA CUENTA
    -- -----------------------------------------------------------------
    -- `profiles` se va sola por la cascada de `profiles.id`. Si esta línea no
    -- tiene permiso, la transacción entera se deshace y no queda NADA a
    -- medias: es exactamente el comportamiento que se quiere.
    BEGIN
        DELETE FROM auth.users WHERE id = p_athlete_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE EXCEPTION
                'Esta función no tiene permiso para borrar cuentas. Hay que hacerlo desde la función de borde «athletes» (acción delete_managed). No se ha borrado nada.';
    END;

    RETURN jsonb_build_object(
        'deleted',  true,
        'name',     v_nombre,
        'tables',   v_tablas,
        'rows',     v_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_managed_athlete(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_managed_athlete(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_managed_athlete(UUID) IS
    'Borra DE VERDAD la ficha de un atleta gestionado que nunca ha sido reclamada. Irreversible. Exige relación activa con quien llama, account_status = managed y claimed_at NULL.';


-- =====================================================================
-- 2. `training_blocks` — UNA POLÍTICA POR COMANDO
-- =====================================================================
--
-- Sobre esta tabla se habían acumulado políticas de dos migraciones cuyos
-- nombres solo se diferencian por las MAYÚSCULAS, así que no se pisaban:
-- coexistían y sumaban su coste.
--
--     "Coach manage own blocks"  (database/feature_efort_schema.sql)
--     "Coach Manage Blocks"      (database/MASTER_DEPLOY_V3_CLEAN.sql)
--     "Athlete view own blocks"  (database/feature_efort_schema.sql)
--     "Athlete Read Own Blocks"  (database/MASTER_DEPLOY_V3_CLEAN.sql)
--
-- Es EXACTAMENTE el patrón que hizo que guardar una sola serie tardara ocho
-- segundos (ver database/FIX_TIMEOUT_SERIES.sql). Allí se arregló para
-- `training_sets`, `session_exercises` y `training_sessions`, y
-- `training_blocks` se quedó sin tocar — que es la tabla que consultan la
-- lista de atletas, el panel de atención y todas las estadísticas.
--
-- Y además llevan `auth.uid()` SIN envolver, así que se evalúa una vez POR
-- FILA en lugar de una vez por consulta.
--
-- La regla de acceso NO cambia: el coach dueño del bloque hace todo, el
-- atleta del bloque lo lee. Lo único que cambia es cuántas veces se comprueba.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Coach manage own blocks" ON public.training_blocks;
DROP POLICY IF EXISTS "Coach Manage Blocks"     ON public.training_blocks;
DROP POLICY IF EXISTS "blocks_coach_all"        ON public.training_blocks;

DROP POLICY IF EXISTS "Athlete view own blocks" ON public.training_blocks;
DROP POLICY IF EXISTS "Athlete Read Own Blocks" ON public.training_blocks;
DROP POLICY IF EXISTS "Athlete read own blocks" ON public.training_blocks;
DROP POLICY IF EXISTS "blocks_select_athlete"   ON public.training_blocks;

ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocks_coach_all ON public.training_blocks
    FOR ALL TO authenticated
    USING      (coach_id = (SELECT auth.uid()))
    WITH CHECK (coach_id = (SELECT auth.uid()));

-- El atleta LEE los suyos. No escribe: el plan lo hace su entrenador.
--
-- Sin `week_is_released()` aquí a propósito: esa función decide qué SEMANAS
-- ve, y vive en las políticas de `training_sessions` y sus hijas. Un bloque
-- cuyas semanas están todas sin publicar tiene que seguir siendo visible como
-- objeto —su nombre, sus fechas, sus objetivos— o el atleta vería la
-- planificación vacía sin ninguna explicación.
CREATE POLICY blocks_select_athlete ON public.training_blocks
    FOR SELECT TO authenticated
    USING (athlete_id = (SELECT auth.uid()));


-- =====================================================================
-- COMPROBACIÓN
-- =====================================================================
DO $$
DECLARE
    n_pol        INT;
    puede_borrar BOOLEAN;
BEGIN
    SELECT count(*) INTO n_pol
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'training_blocks';

    IF n_pol = 2 THEN
        RAISE NOTICE 'training_blocks: 2 políticas (una por rol). Correcto.';
    ELSE
        RAISE WARNING 'training_blocks: hay % políticas, se esperaban 2. Revisa cuáles con: SELECT policyname FROM pg_policies WHERE tablename = ''training_blocks'';', n_pol;
    END IF;

    -- Se comprueba AHORA y no el día que alguien pulse "Borrar ficha": si el
    -- permiso no está, más vale saberlo con el SQL Editor abierto.
    SELECT has_table_privilege('auth.users', 'DELETE') INTO puede_borrar;
    IF puede_borrar THEN
        RAISE NOTICE 'delete_managed_athlete(): creada, y hay permiso para borrar cuentas.';
    ELSE
        RAISE WARNING 'delete_managed_athlete(): creada, pero este rol NO puede borrar de auth.users. El borrado fallará de forma limpia (sin dejar nada a medias) y habrá que hacerlo desde la función de borde «athletes».';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
