-- =====================================================================
-- ANVIL STRENGTH — VISIBILIDAD POR SEMANA + AGENDA POR DÍA DE LA SEMANA
-- =====================================================================
-- Idempotente. Ejecutar entero en Supabase Dashboard -> SQL Editor.
-- Requiere haber ejecutado antes database/FIX_ENTRENAMIENTO.sql.
--
-- QUÉ AÑADE
--
-- 1. training_weeks.is_visible
--    Interruptor del coach por semana. TRUE por defecto: las semanas que ya
--    existen no cambian de comportamiento.
--
-- 2. training_blocks.release_offset_days
--    Cuántos días ANTES del lunes se le abre la semana al atleta.
--    1 = el domingo anterior (por defecto). 0 = el mismo lunes.
--    7 = una semana entera antes.
--
-- 3. training_sessions.day_of_week
--    Día concreto de la semana, OPCIONAL. Si está, la app muestra "Lunes"
--    en vez de "Día 1" y ordena la semana por el calendario real.
--
-- 4. Las políticas de lectura del ATLETA pasan a respetar 1 y 2.
--    Esto es lo que convierte el interruptor en un control de verdad: una
--    semana no publicada no se puede leer ni llamando a la API a mano.
--    Las políticas del COACH no se tocan: él sigue viéndolo todo siempre.
-- =====================================================================


-- =====================================================================
-- 1. COLUMNAS
-- =====================================================================
ALTER TABLE public.training_weeks
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.training_weeks.is_visible IS
    'Si es FALSE, el atleta no ve esta semana aunque su fecha ya haya llegado. No hay fila en training_weeks para la mayoría de semanas: la ausencia equivale a TRUE.';

ALTER TABLE public.training_blocks
    ADD COLUMN IF NOT EXISTS release_offset_days INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.training_blocks
    DROP CONSTRAINT IF EXISTS training_blocks_release_offset_check;

ALTER TABLE public.training_blocks
    ADD CONSTRAINT training_blocks_release_offset_check
    CHECK (release_offset_days BETWEEN 0 AND 28);

COMMENT ON COLUMN public.training_blocks.release_offset_days IS
    'Días antes del lunes en que la semana se le abre al atleta. 1 = el domingo anterior.';

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS day_of_week TEXT;

ALTER TABLE public.training_sessions
    DROP CONSTRAINT IF EXISTS training_sessions_day_of_week_check;

ALTER TABLE public.training_sessions
    ADD CONSTRAINT training_sessions_day_of_week_check
    CHECK (day_of_week IS NULL OR day_of_week IN
        ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'));

COMMENT ON COLUMN public.training_sessions.day_of_week IS
    'Día de la semana asignado, opcional. NULL = el día se identifica por day_number (Día 1, Día 2...).';


-- =====================================================================
-- 2. ¿ESTÁ PUBLICADA ESTA SEMANA PARA EL ATLETA?
-- =====================================================================
-- SECURITY DEFINER para poder leer training_weeks y training_blocks desde
-- dentro de una política sin provocar recursión.
--
-- El lunes de una semana ISO se calcula desde el 4 de enero, que por
-- definición cae siempre en la semana 1. El año sale de start_date del
-- bloque; si no lo tiene, del año en curso.
--
-- Devuelve TRUE si NO hay nada que ocultar: sin fila en training_weeks la
-- semana se considera visible, que es como se ha comportado la app hasta
-- ahora. Un bloque sin fecha de inicio tampoco se bloquea nunca: preferimos
-- enseñar de más antes que dejar a un atleta sin su entrenamiento por un
-- dato que el coach no rellenó.
CREATE OR REPLACE FUNCTION public.week_is_released(p_block_id UUID, p_week_number INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visible     BOOLEAN;
    v_offset      INTEGER;
    v_start       DATE;
    v_year        INTEGER;
    v_jan4        DATE;
    v_week1_monday DATE;
    v_week_monday DATE;
BEGIN
    -- 2.A Interruptor manual del coach. Manda sobre la fecha.
    SELECT is_visible INTO v_visible
      FROM public.training_weeks
     WHERE block_id = p_block_id AND week_number = p_week_number;

    IF v_visible IS NOT NULL AND v_visible = FALSE THEN
        RETURN FALSE;
    END IF;

    -- 2.B Puerta por fecha.
    SELECT COALESCE(release_offset_days, 1), start_date
      INTO v_offset, v_start
      FROM public.training_blocks
     WHERE id = p_block_id;

    IF NOT FOUND THEN
        RETURN FALSE;   -- bloque inexistente: no hay nada que enseñar
    END IF;

    IF v_start IS NULL THEN
        RETURN TRUE;    -- sin fecha de inicio no se puede calcular: no se bloquea
    END IF;

    v_year := EXTRACT(YEAR FROM v_start)::INTEGER;
    v_jan4 := make_date(v_year, 1, 4);
    v_week1_monday := v_jan4 - (EXTRACT(ISODOW FROM v_jan4)::INTEGER - 1);
    v_week_monday  := v_week1_monday + ((p_week_number - 1) * 7);

    RETURN CURRENT_DATE >= (v_week_monday - v_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) TO authenticated;


-- =====================================================================
-- 3. POLÍTICAS DE LECTURA DEL ATLETA
-- =====================================================================
-- Se sustituyen las tres políticas de SELECT del atleta para que pasen por
-- week_is_released(). Los nombres viejos varían según qué MASTER_*.sql se
-- ejecutó en su día, así que se eliminan todas las variantes conocidas.

-- 3.A training_sessions
DROP POLICY IF EXISTS "Athlete view sessions via block"  ON public.training_sessions;
DROP POLICY IF EXISTS "Athlete Read Sessions"            ON public.training_sessions;
DROP POLICY IF EXISTS "sessions_select_athlete"          ON public.training_sessions;

CREATE POLICY "sessions_select_athlete" ON public.training_sessions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.training_blocks tb
             WHERE tb.id = training_sessions.block_id
               AND tb.athlete_id = auth.uid()
        )
        AND public.week_is_released(training_sessions.block_id, training_sessions.week_number)
    );

-- 3.B session_exercises
DROP POLICY IF EXISTS "Athlete view session exercises" ON public.session_exercises;
DROP POLICY IF EXISTS "Athlete Read Exercises"         ON public.session_exercises;
DROP POLICY IF EXISTS "exercises_select_athlete"       ON public.session_exercises;

CREATE POLICY "exercises_select_athlete" ON public.session_exercises
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.training_sessions ts
              JOIN public.training_blocks   tb ON tb.id = ts.block_id
             WHERE ts.id = session_exercises.session_id
               AND tb.athlete_id = auth.uid()
               AND public.week_is_released(ts.block_id, ts.week_number)
        )
    );

-- 3.C training_sets
DROP POLICY IF EXISTS "Athlete view sets"    ON public.training_sets;
DROP POLICY IF EXISTS "Athlete Read Sets"    ON public.training_sets;
DROP POLICY IF EXISTS "sets_select_athlete"  ON public.training_sets;

CREATE POLICY "sets_select_athlete" ON public.training_sets
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.session_exercises se
              JOIN public.training_sessions ts ON ts.id = se.session_id
              JOIN public.training_blocks   tb ON tb.id = ts.block_id
             WHERE se.id = training_sets.session_exercise_id
               AND tb.athlete_id = auth.uid()
               AND public.week_is_released(ts.block_id, ts.week_number)
        )
    );

-- La política de UPDATE del atleta (registrar sus marcas) se deja intacta:
-- solo puede escribir en lo que puede leer, y ya está limitada por el
-- trigger protect_target_fields().


-- =====================================================================
-- 4. VERIFICACIÓN
-- =====================================================================

-- 4.1 Columnas nuevas.
SELECT 'columnas nuevas' AS check, table_name, column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (table_name, column_name) IN (
        ('training_weeks',    'is_visible'),
        ('training_blocks',   'release_offset_days'),
        ('training_sessions', 'day_of_week'))
 ORDER BY table_name;

-- 4.2 Qué semanas están publicadas ahora mismo en cada bloque activo.
SELECT 'semanas publicadas' AS check,
       tb.name                                   AS bloque,
       ts.week_number                            AS semana,
       public.week_is_released(tb.id, ts.week_number) AS publicada
  FROM public.training_blocks tb
  JOIN public.training_sessions ts ON ts.block_id = tb.id
 WHERE tb.is_active
 GROUP BY tb.id, tb.name, ts.week_number
 ORDER BY tb.name, ts.week_number;

-- 4.3 Políticas de SELECT resultantes sobre las tres tablas.
SELECT 'políticas de lectura' AS check, tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('training_sessions', 'session_exercises', 'training_sets')
   AND cmd IN ('SELECT', 'ALL')
 ORDER BY tablename, policyname;
