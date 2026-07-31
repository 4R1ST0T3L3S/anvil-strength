-- =====================================================================
-- ANVIL STRENGTH — MÁXIMOS POR ATLETA Y EJERCICIO
-- =====================================================================
-- Idempotente. Ejecutar DESPUÉS de SECURITY_HARDENING.sql, porque usa la
-- función public.shares_coaching_link() que se define allí.
--
-- QUÉ RESUELVE
-- Prescribir "5x5 al 85%" necesita saber el máximo del atleta. Hoy en
-- profiles solo hay squat_pr / bench_pr / deadlift_pr, que son marcas de
-- COMPETICIÓN y solo cubren los tres básicos: no hay dónde guardar el máximo
-- de un press militar, ni distinguir la marca oficial del máximo de
-- entrenamiento con el que se programa (que suele ser distinto).
--
-- POR QUÉ SE INDEXA POR NOMBRE Y NO POR exercise_id
-- La biblioteca tiene duplicados pendientes de fusionar ("Extensión" y
-- "Extensiones de Cuádriceps", "Banca Larsen" y "Larsen Press"...). Atar los
-- máximos a un UUID concreto significaría perderlos en cuanto se limpie la
-- biblioteca. El nombre normalizado sobrevive a esa limpieza.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.athlete_exercise_maxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Nombre normalizado: minúsculas y sin acentos. Lo calcula el cliente con
    -- el mismo `exerciseKey()` que usa la analítica, para que los dos lados
    -- agrupen igual.
    exercise_key TEXT NOT NULL,
    -- Nombre tal cual se escribió, solo para mostrarlo.
    exercise_name TEXT NOT NULL,

    one_rm NUMERIC(6,2) NOT NULL CHECK (one_rm > 0 AND one_rm < 1000),

    -- De dónde sale la cifra. Importa al leerla: un máximo estimado a partir
    -- de una serie no es lo mismo que uno verificado en competición, y el
    -- coach debe poder distinguirlos antes de programar sobre él.
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'competition', 'estimated')),

    notes TEXT,
    measured_on DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un solo máximo vigente por atleta y ejercicio. El histórico de cargas
    -- ya vive en training_sets; duplicar aquí una serie temporal daría dos
    -- fuentes de verdad que acabarían discrepando.
    UNIQUE (athlete_id, exercise_key)
);

CREATE INDEX IF NOT EXISTS athlete_exercise_maxes_athlete_idx
    ON public.athlete_exercise_maxes (athlete_id);

ALTER TABLE public.athlete_exercise_maxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aem_select ON public.athlete_exercise_maxes;
DROP POLICY IF EXISTS aem_insert ON public.athlete_exercise_maxes;
DROP POLICY IF EXISTS aem_update ON public.athlete_exercise_maxes;
DROP POLICY IF EXISTS aem_delete ON public.athlete_exercise_maxes;

-- Ver: el propio atleta y el coach que lo lleva. Nadie más.
CREATE POLICY aem_select ON public.athlete_exercise_maxes
    FOR SELECT TO authenticated
    USING (athlete_id = auth.uid() OR public.shares_coaching_link(athlete_id));

-- Escribir: el atleta sobre lo suyo, y su coach. Se comprueba también en
-- USING además de en WITH CHECK para que nadie mueva una fila ajena a su
-- propio athlete_id.
CREATE POLICY aem_insert ON public.athlete_exercise_maxes
    FOR INSERT TO authenticated
    WITH CHECK (athlete_id = auth.uid() OR public.shares_coaching_link(athlete_id));

CREATE POLICY aem_update ON public.athlete_exercise_maxes
    FOR UPDATE TO authenticated
    USING (athlete_id = auth.uid() OR public.shares_coaching_link(athlete_id))
    WITH CHECK (athlete_id = auth.uid() OR public.shares_coaching_link(athlete_id));

CREATE POLICY aem_delete ON public.athlete_exercise_maxes
    FOR DELETE TO authenticated
    USING (athlete_id = auth.uid() OR public.shares_coaching_link(athlete_id));

REVOKE ALL ON public.athlete_exercise_maxes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_exercise_maxes TO authenticated;


-- ---------------------------------------------------------------------
-- Siembra desde las marcas que ya hay en profiles
-- ---------------------------------------------------------------------
-- Los tres básicos arrancan con la marca de competición que ya estaba
-- registrada, para que el % funcione desde el primer día sin que el coach
-- tenga que teclear nada. Se marcan como 'competition' para que se vea de
-- dónde vienen, y ON CONFLICT DO NOTHING hace que reejecutar el archivo
-- nunca pise un máximo ajustado a mano después.
DO $$
DECLARE
    par RECORD;
BEGIN
    FOR par IN
        SELECT * FROM (VALUES
            ('squat_pr',    'sentadilla',  'Sentadilla'),
            ('bench_pr',    'press banca', 'Press Banca'),
            ('deadlift_pr', 'peso muerto', 'Peso Muerto')
        ) AS t(col, key, nombre)
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles'
                     AND column_name = par.col) THEN

            EXECUTE format($q$
                INSERT INTO public.athlete_exercise_maxes
                    (athlete_id, exercise_key, exercise_name, one_rm, source)
                SELECT p.id, %L, %L, p.%I, 'competition'
                  FROM public.profiles p
                 WHERE p.%I IS NOT NULL AND p.%I > 0 AND p.%I < 1000
                ON CONFLICT (athlete_id, exercise_key) DO NOTHING
            $q$, par.key, par.nombre, par.col, par.col, par.col, par.col);

            RAISE NOTICE 'Sembrado % desde profiles.%', par.nombre, par.col;
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'máximos por ejercicio' AS check, exercise_name, source, count(*) AS atletas
  FROM public.athlete_exercise_maxes
 GROUP BY exercise_name, source
 ORDER BY atletas DESC;
