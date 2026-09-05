-- =====================================================================
-- ANVIL STRENGTH — REPARACIÓN DEL MÓDULO DE ENTRENAMIENTO
-- =====================================================================
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- Ejecutar ENTERO en Supabase Dashboard -> SQL Editor.
--
-- QUÉ ARREGLA
--
-- 1. "Cannot read properties of null (reading 'name')" al abrir la
--    programación como ATLETA.
--    Causa: SECURITY_HARDENING.sql sustituyó la política de lectura de
--    exercise_library —que era `USING (true)`— por `exlib_select`, que solo
--    deja ver un ejercicio si es público o si pertenece a tu coach. Los
--    ejercicios creados antes de esa migración tienen coach_id NULL (la
--    columna ni siquiera existía) y is_public FALSE, así que dejaron de ser
--    visibles PARA TODO EL MUNDO. PostgREST no da error en ese caso: devuelve
--    `exercise: null` dentro del join y la interfaz reventaba al leer .name.
--
-- 2. El coach no puede guardar series / kg / reps.
--    Causa: falta la columna training_sets.target_metric, que el selector de
--    métrica del constructor escribe desde hace dos versiones. Sin ella,
--    PostgREST rechaza el lote entero (PGRST204) y no se guarda NADA.
--
-- Deja además una segunda vía de lectura para exercise_library: si un
-- ejercicio está prescrito en un bloque tuyo, puedes leerlo. Sin eso, un
-- atleta cuya fila en coach_athletes se pierda o cambie vuelve a ver
-- ejercicios en blanco.
-- =====================================================================


-- =====================================================================
-- 1. training_sets.target_metric  (arregla el guardado del coach)
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='training_sets') THEN
        RAISE EXCEPTION 'No existe public.training_sets; revisa el esquema antes de migrar';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='training_sets'
                     AND column_name='target_metric') THEN

        -- DEFAULT 'kg': todas las series ya escritas siguen significando
        -- exactamente lo mismo, sin ventana en la que el tonelaje salga mal.
        ALTER TABLE public.training_sets
            ADD COLUMN target_metric TEXT NOT NULL DEFAULT 'kg';

        RAISE NOTICE '✅ Añadida training_sets.target_metric';
    ELSE
        RAISE NOTICE 'ℹ️  training_sets.target_metric ya existía';
    END IF;
END $$;

ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_target_metric_check;

ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_target_metric_check
    CHECK (target_metric IN ('kg', 'rir', 'rpe', 'vel', 'vel_loss'));

COMMENT ON COLUMN public.training_sets.target_metric IS
    'Unidad de la prescripción de la serie. El valor está en target_rpe si es ''rpe'', y en target_load en el resto de casos.';

-- Columna que también escribe el constructor y que falta en algunos
-- despliegues (venía de MASTER_DEPLOY_V3 pero no de feature_efort_schema).
ALTER TABLE public.training_sets ADD COLUMN IF NOT EXISTS notes TEXT;


-- =====================================================================
-- 2. exercise_library: columnas que exigen las políticas
-- =====================================================================
ALTER TABLE public.exercise_library
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='exercise_library'
                     AND column_name='coach_id') THEN
        ALTER TABLE public.exercise_library
            ADD COLUMN coach_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Añadida exercise_library.coach_id';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS exercise_library_coach_id_idx
    ON public.exercise_library (coach_id);

-- Lo usa la política nueva de la sección 4, que hace un EXISTS por fila.
CREATE INDEX IF NOT EXISTS session_exercises_exercise_id_idx
    ON public.session_exercises (exercise_id);


-- =====================================================================
-- 3. Adopción de los ejercicios huérfanos
-- =====================================================================
-- 3.A Un ejercicio sin dueño que SOLO usa un coach pasa a ser suyo. Así
--     recupera visibilidad por la vía normal (coach_id) y el coach puede
--     además editarlo o borrarlo.
WITH duenyo AS (
    SELECT se.exercise_id,
           MIN(tb.coach_id::TEXT)::UUID   AS coach_id,
           COUNT(DISTINCT tb.coach_id)    AS cuantos
      FROM public.session_exercises se
      JOIN public.training_sessions ts ON ts.id = se.session_id
      JOIN public.training_blocks   tb ON tb.id = ts.block_id
     GROUP BY se.exercise_id
    HAVING COUNT(DISTINCT tb.coach_id) = 1
)
UPDATE public.exercise_library el
   SET coach_id = d.coach_id
  FROM duenyo d
 WHERE el.id = d.exercise_id
   AND el.coach_id IS NULL;

-- 3.B El resto de huérfanos son ejercicios "del sistema": los sembró una
--     migración o los usan varios coaches. Se marcan públicos, que es
--     exactamente lo que eran antes del hardening (política `USING (true)`).
--     Ojo: esto NO abre los ejercicios privados de ningún coach — solo toca
--     filas cuyo coach_id sigue siendo NULL después de 3.A.
UPDATE public.exercise_library
   SET is_public = TRUE
 WHERE coach_id IS NULL
   AND COALESCE(is_public, FALSE) = FALSE;


-- =====================================================================
-- 4. Políticas de exercise_library
-- =====================================================================
-- is_coach() la crea SECURITY_HARDENING.sql. Se redefine aquí para que este
-- archivo funcione aunque aquel no se haya ejecutado todavía: sin ella, el
-- CREATE POLICY de más abajo falla y el script se queda a medias.
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

REVOKE EXECUTE ON FUNCTION public.is_coach() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coach() TO authenticated;

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exlib_select"            ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_select_prescrito"  ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_insert_own"        ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_update_own"        ON public.exercise_library;
DROP POLICY IF EXISTS "exlib_delete_own"        ON public.exercise_library;

-- 4.A Vía normal: público, propio, o del coach que me entrena.
CREATE POLICY "exlib_select" ON public.exercise_library
    FOR SELECT TO authenticated
    USING (
        is_public = TRUE
        OR coach_id = auth.uid()
        OR coach_id IN (SELECT coach_id FROM public.coach_athletes WHERE athlete_id = auth.uid())
    );

-- 4.B Red de seguridad: si el ejercicio está PRESCRITO en un bloque en el que
--     participo (como coach o como atleta), puedo leerlo. Es la garantía de
--     que la pantalla de entrenamiento nunca vuelva a recibir `exercise: null`
--     aunque el vínculo coach_athletes se pierda o el ejercicio cambie de
--     dueño. No filtra nada: solo alcanza a lo que ya tengo derecho a ver en
--     mi propia programación.
CREATE POLICY "exlib_select_prescrito" ON public.exercise_library
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.session_exercises se
              JOIN public.training_sessions ts ON ts.id = se.session_id
              JOIN public.training_blocks   tb ON tb.id = ts.block_id
             WHERE se.exercise_id = exercise_library.id
               AND (tb.coach_id = auth.uid() OR tb.athlete_id = auth.uid())
        )
    );

-- Un coach solo crea ejercicios a su nombre, y nunca públicos
-- (los públicos los siembra el admin vía service_role).
-- COALESCE: las filas antiguas podían tener is_public NULL y el WITH CHECK
-- las rechazaba con un NULL que no es TRUE.
CREATE POLICY "exlib_insert_own" ON public.exercise_library
    FOR INSERT TO authenticated
    WITH CHECK (
        coach_id = auth.uid()
        AND public.is_coach()
        AND COALESCE(is_public, FALSE) = FALSE
    );

CREATE POLICY "exlib_update_own" ON public.exercise_library
    FOR UPDATE TO authenticated
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid() AND COALESCE(is_public, FALSE) = FALSE);

CREATE POLICY "exlib_delete_own" ON public.exercise_library
    FOR DELETE TO authenticated
    USING (coach_id = auth.uid());


-- =====================================================================
-- 5. VERIFICACIÓN — revisa esta salida
-- =====================================================================

-- 5.1 No debe quedar NINGÚN ejercicio invisible (sin dueño y sin ser público).
SELECT 'ejercicios huérfanos (debe ser 0)' AS check, COUNT(*) AS total
  FROM public.exercise_library
 WHERE coach_id IS NULL AND COALESCE(is_public, FALSE) = FALSE;

-- 5.2 Ejercicios prescritos que apuntan a una fila inexistente de la
--     biblioteca. Si sale algo, hay que recrear esos ejercicios a mano:
--     el borrado se hizo saltándose la FK.
SELECT 'prescripciones rotas (debe ser 0)' AS check, COUNT(*) AS total
  FROM public.session_exercises se
  LEFT JOIN public.exercise_library el ON el.id = se.exercise_id
 WHERE el.id IS NULL;

-- 5.3 Reparto de la biblioteca.
SELECT 'biblioteca' AS check,
       COUNT(*) FILTER (WHERE is_public)                          AS publicos,
       COUNT(*) FILTER (WHERE coach_id IS NOT NULL)               AS de_coach,
       COUNT(*)                                                   AS total
  FROM public.exercise_library;

-- 5.4 Métricas de prescripción en uso.
SELECT 'reparto de métricas' AS check, target_metric, COUNT(*) AS series
  FROM public.training_sets
 GROUP BY target_metric
 ORDER BY series DESC;

-- 5.5 Políticas resultantes sobre exercise_library.
SELECT 'políticas exercise_library' AS check, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'exercise_library'
 ORDER BY cmd, policyname;
