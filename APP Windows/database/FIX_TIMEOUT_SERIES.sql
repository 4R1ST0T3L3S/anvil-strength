-- =====================================================================
-- ANVIL STRENGTH — "STATEMENT TIMEOUT" AL GUARDAR UNA SERIE
-- =====================================================================
--
-- CÓMO SE EJECUTA
-- Supabase → SQL Editor → New query → pegar esto entero → Run.
-- Es IDEMPOTENTE: se puede ejecutar las veces que haga falta.
--
-- SÍNTOMA
-- "Error al guardar cambios: el servidor ha tardado demasiado" al pautar
-- series, repeticiones o kilos. Da igual guardar un bloque entero o UNA sola
-- serie de UN solo ejercicio: falla siempre. Añadir el ejercicio sí funciona
-- (eso escribe en session_exercises, otra tabla).
--
-- POR QUÉ LOS ÍNDICES NO LO ARREGLARON
-- Con una sola fila no hay nada que indexar. El coste no está en encontrar la
-- fila: está en COMPROBAR SI SE PUEDE ESCRIBIR EN ELLA.
--
-- LA CAUSA: POLÍTICAS DUPLICADAS Y ANIDADAS
--
-- Sobre training_sets se han ido acumulando políticas de tres migraciones
-- distintas, con nombres que se diferencian solo por las mayúsculas y que por
-- tanto NO se pisan entre sí:
--
--     "Coach manage sets"   (database/feature_efort_schema.sql)
--     "Coach Manage Sets"   (database/MASTER_DEPLOY_V3_CLEAN.sql)
--     "Athlete update sets" (database/feature_efort_schema.sql)
--     "Athlete Update Sets" (database/MASTER_DEPLOY_V3_CLEAN.sql)
--     "sets_select_athlete" (database/week_visibility_and_scheduling.sql)
--
-- Postgres evalúa TODAS las políticas permisivas de un comando y une el
-- resultado con OR. Un UPDATE de una fila pasa por las cuatro de arriba, cada
-- una con su propio EXISTS que recorre
--     session_exercises → training_sessions → training_blocks
--
-- Y ahí está el multiplicador: esas tres tablas tienen RLS activo, así que
-- cada uno de esos EXISTS dispara A SU VEZ las políticas de las tablas que
-- consulta. Las de training_sessions y session_exercises llaman a
-- week_is_released(), que es plpgsql —no se puede insertar en el plan, es una
-- llamada de verdad— y hace dos consultas más por invocación.
--
-- Cuatro políticas × tres saltos × las políticas de cada salto × dos
-- consultas por llamada a week_is_released(). Para UNA fila. Eso es lo que se
-- come los ocho segundos que PostgREST concede a una petición.
--
-- EL ARREGLO
-- Una sola política por comando, y la comprobación dentro de una función
-- SECURITY DEFINER. SECURITY DEFINER ejecuta la consulta con los permisos del
-- dueño de la tabla, así que las tablas que mira NO vuelven a evaluar sus
-- propias políticas: el anidamiento desaparece de raíz. La regla de acceso es
-- exactamente la misma que ya había —el coach dueño del bloque escribe, el
-- atleta del bloque lee y registra sus marcas—, solo que se comprueba una vez
-- y sin recursión.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. RED DE SEGURIDAD: week_is_released()
-- ---------------------------------------------------------------------
-- Las funciones de más abajo la llaman. Una función en lenguaje SQL comprueba
-- lo que referencia AL CREARSE, así que si esa función no existe —porque
-- database/week_visibility_and_scheduling.sql no se llegó a ejecutar— este
-- archivo entero fallaría en la primera línea.
--
-- Si falta, se crea una versión que no oculta nada. Es exactamente cómo se
-- comportaba la aplicación antes de existir la publicación por semanas, y la
-- sustituye sin problema el CREATE OR REPLACE del archivo de visibilidad
-- cuando se ejecute.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'week_is_released'
    ) THEN
        EXECUTE $fn$
            CREATE FUNCTION public.week_is_released(p_block_id UUID, p_week_number INTEGER)
            RETURNS BOOLEAN
            LANGUAGE SQL
            IMMUTABLE
            AS 'SELECT TRUE';
        $fn$;
        RAISE NOTICE 'Creada week_is_released() provisional (no oculta ninguna semana). Ejecuta database/week_visibility_and_scheduling.sql para la de verdad.';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 1. LAS DOS PREGUNTAS, RESUELTAS DE UNA VEZ
-- ---------------------------------------------------------------------
-- STABLE: dentro de una misma sentencia el resultado no puede cambiar, así
-- que el planificador puede reutilizarlo en vez de repetirlo.
--
-- SECURITY DEFINER: es lo que corta el anidamiento de RLS. No abre nada — la
-- función solo devuelve un booleano y la condición que comprueba es la misma
-- que estaba escrita en las políticas.
--
-- search_path fijo: sin él, un search_path manipulado podría hacer que la
-- función mirase tablas distintas de las que cree. Obligatorio en cualquier
-- SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.set_es_de_mi_bloque_como_coach(p_session_exercise_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.session_exercises se
          JOIN public.training_sessions ts ON ts.id = se.session_id
          JOIN public.training_blocks   tb ON tb.id = ts.block_id
         WHERE se.id = p_session_exercise_id
           AND tb.coach_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.set_es_de_mi_bloque_como_atleta(p_session_exercise_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.session_exercises se
          JOIN public.training_sessions ts ON ts.id = se.session_id
          JOIN public.training_blocks   tb ON tb.id = ts.block_id
         WHERE se.id = p_session_exercise_id
           AND tb.athlete_id = auth.uid()
           -- La semana sin publicar sigue oculta para el atleta: esta
           -- condición estaba en "sets_select_athlete" y se conserva igual.
           AND public.week_is_released(ts.block_id, ts.week_number)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.set_es_de_mi_bloque_como_coach(UUID)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_es_de_mi_bloque_como_atleta(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_es_de_mi_bloque_como_coach(UUID)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_es_de_mi_bloque_como_atleta(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 2. UNA POLÍTICA POR COMANDO
-- ---------------------------------------------------------------------
-- Se eliminan TODAS las variantes conocidas, incluidas las que solo se
-- diferencian por las mayúsculas, y se dejan tres.

DROP POLICY IF EXISTS "Coach manage sets"    ON public.training_sets;
DROP POLICY IF EXISTS "Coach Manage Sets"    ON public.training_sets;
DROP POLICY IF EXISTS "sets_coach_all"       ON public.training_sets;

DROP POLICY IF EXISTS "Athlete view sets"    ON public.training_sets;
DROP POLICY IF EXISTS "Athlete Read Sets"    ON public.training_sets;
DROP POLICY IF EXISTS "Athlete read sets"    ON public.training_sets;
DROP POLICY IF EXISTS "sets_select_athlete"  ON public.training_sets;

DROP POLICY IF EXISTS "Athlete update sets"  ON public.training_sets;
DROP POLICY IF EXISTS "Athlete Update Sets"  ON public.training_sets;
DROP POLICY IF EXISTS "sets_update_athlete"  ON public.training_sets;

ALTER TABLE public.training_sets ENABLE ROW LEVEL SECURITY;

-- 2.A El coach dueño del bloque hace todo: leer, crear, modificar y borrar.
CREATE POLICY sets_coach_all ON public.training_sets
    FOR ALL TO authenticated
    USING      (public.set_es_de_mi_bloque_como_coach(session_exercise_id))
    WITH CHECK (public.set_es_de_mi_bloque_como_coach(session_exercise_id));

-- 2.B El atleta del bloque lee sus series de las semanas ya publicadas.
CREATE POLICY sets_select_athlete ON public.training_sets
    FOR SELECT TO authenticated
    USING (public.set_es_de_mi_bloque_como_atleta(session_exercise_id));

-- 2.C Y registra sus marcas. Lo que NO puede tocar —lo que le pautó el
--     coach— lo sigue impidiendo el trigger protect_target_fields(), que no
--     se toca aquí: sigue siendo la única defensa de los campos target y
--     funciona igual.
CREATE POLICY sets_update_athlete ON public.training_sets
    FOR UPDATE TO authenticated
    USING      (public.set_es_de_mi_bloque_como_atleta(session_exercise_id))
    WITH CHECK (public.set_es_de_mi_bloque_como_atleta(session_exercise_id));


-- ---------------------------------------------------------------------
-- 3. LO MISMO EN LAS TABLAS DE ENCIMA
-- ---------------------------------------------------------------------
-- session_exercises y training_sessions tienen el mismo problema —son las que
-- consultaban las políticas de training_sets— y además se escriben al añadir
-- o reordenar ejercicios. Se dejan igual de planas.

CREATE OR REPLACE FUNCTION public.sesion_es_de_mi_bloque_como_coach(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.training_sessions ts
          JOIN public.training_blocks   tb ON tb.id = ts.block_id
         WHERE ts.id = p_session_id
           AND tb.coach_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.sesion_es_de_mi_bloque_como_atleta(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.training_sessions ts
          JOIN public.training_blocks   tb ON tb.id = ts.block_id
         WHERE ts.id = p_session_id
           AND tb.athlete_id = auth.uid()
           AND public.week_is_released(ts.block_id, ts.week_number)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.sesion_es_de_mi_bloque_como_coach(UUID)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sesion_es_de_mi_bloque_como_atleta(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sesion_es_de_mi_bloque_como_coach(UUID)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.sesion_es_de_mi_bloque_como_atleta(UUID) TO authenticated;

DROP POLICY IF EXISTS "Coach manage session exercises"  ON public.session_exercises;
DROP POLICY IF EXISTS "Coach Manage Exercises"          ON public.session_exercises;
DROP POLICY IF EXISTS "Athlete view session exercises"  ON public.session_exercises;
DROP POLICY IF EXISTS "Athlete Read Exercises"          ON public.session_exercises;
DROP POLICY IF EXISTS "Athlete read session exercises"  ON public.session_exercises;
DROP POLICY IF EXISTS "exercises_select_athlete"        ON public.session_exercises;
DROP POLICY IF EXISTS "exercises_coach_all"             ON public.session_exercises;
DROP POLICY IF EXISTS "exercises_update_athlete"        ON public.session_exercises;

/*
 * "Athletes can update their session exercises" — USING (auth.uid() IS NOT NULL)
 *
 * Esa política no comprobaba de QUIÉN es la fila: solo que hubiera sesión
 * iniciada. Cualquier usuario autenticado podía modificar el ejercicio de
 * cualquier atleta de cualquier coach. No está en ningún archivo de database/,
 * así que se creó a mano en el panel.
 *
 * Se sustituye por la equivalente acotada al bloque del atleta. Lo único que
 * el atleta escribe aquí es `vbt_file_url`, al subir el archivo del encoder
 * (ver WorkoutLogger.tsx), y eso sigue funcionando igual.
 */
DROP POLICY IF EXISTS "Athletes can update their session exercises" ON public.session_exercises;

ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY exercises_coach_all ON public.session_exercises
    FOR ALL TO authenticated
    USING      (public.sesion_es_de_mi_bloque_como_coach(session_id))
    WITH CHECK (public.sesion_es_de_mi_bloque_como_coach(session_id));

CREATE POLICY exercises_select_athlete ON public.session_exercises
    FOR SELECT TO authenticated
    USING (public.sesion_es_de_mi_bloque_como_atleta(session_id));

CREATE POLICY exercises_update_athlete ON public.session_exercises
    FOR UPDATE TO authenticated
    USING      (public.sesion_es_de_mi_bloque_como_atleta(session_id))
    WITH CHECK (public.sesion_es_de_mi_bloque_como_atleta(session_id));


-- ---------------------------------------------------------------------
-- 4. ESTADÍSTICAS
-- ---------------------------------------------------------------------
ANALYZE public.training_sets;
ANALYZE public.session_exercises;
ANALYZE public.training_sessions;
ANALYZE public.training_blocks;


-- ---------------------------------------------------------------------
-- 5. VERIFICACIÓN
-- ---------------------------------------------------------------------
-- 5.0 Cualquier política que NO sea una de las seis que crea este archivo.
--
--     Las políticas de estas dos tablas se han creado desde tres migraciones
--     distintas Y a mano desde el panel de Supabase, así que el repositorio no
--     es la única fuente. Este aviso es lo que hace que una política suelta se
--     vea en vez de quedarse cobrando peaje en cada fila. No se borra sola: si
--     alguien la creó a propósito (un rol de administrador, por ejemplo),
--     borrarla a ciegas rompería ese acceso.
DO $$
DECLARE
    p RECORD;
    n INT := 0;
BEGIN
    FOR p IN
        SELECT tablename, policyname, cmd
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('training_sets', 'session_exercises')
           AND policyname NOT IN (
               'sets_coach_all', 'sets_select_athlete', 'sets_update_athlete',
               'exercises_coach_all', 'exercises_select_athlete', 'exercises_update_athlete'
           )
    LOOP
        n := n + 1;
        RAISE WARNING 'Política desconocida en %: "%" (%). Revísala: si duplica a las de este archivo, bórrala.',
              p.tablename, p.policyname, p.cmd;
    END LOOP;

    IF n = 0 THEN
        RAISE NOTICE 'Sin políticas sueltas. Las dos tablas están limpias.';
    END IF;
END $$;

-- 5.1 Cuántas políticas quedan por comando. training_sets tiene que tener
--     UNA de cada: ALL, SELECT y UPDATE. Si sale alguna repetida, quedó una
--     variante con un nombre que este archivo no conocía — mira la 5.2.
SELECT tablename, cmd, count(*) AS politicas, string_agg(policyname, ', ') AS cuales
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('training_sets', 'session_exercises')
 GROUP BY tablename, cmd
 ORDER BY tablename, cmd;

-- 5.2 El detalle, por si hay que borrar alguna a mano.
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('training_sets', 'session_exercises')
 ORDER BY tablename, cmd, policyname;
