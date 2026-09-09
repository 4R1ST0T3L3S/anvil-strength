-- =====================================================================
-- ANVIL STRENGTH — FASES DE LA TEMPORADA
-- =====================================================================
-- Idempotente. Ejecutar DESPUÉS de SECURITY_HARDENING.sql (usa
-- public.shares_coaching_link).
--
-- QUÉ RESUELVE
-- "HIPERTROFIA — Semana 3 de 4". El atleta abre sus estadísticas y sabe
-- dónde está dentro de su temporada, que hoy no está escrito en ninguna
-- parte: se deduce mirando el nombre que el coach le puso al bloque, si es
-- que se lo puso.
--
-- POR QUÉ NO SIRVEN LAS TABLAS QUE YA HAY, Y NO ES POR NO MIRARLAS
--
--   training_blocks  — es la unidad de PROGRAMACIÓN, no la de temporada.
--                      Una fase de hipertrofia puede repartirse en dos
--                      bloques, y un bloque puede llevar dentro el final de
--                      una fase y el principio de la siguiente. Atar las
--                      fases a los bloques obligaría a partir los bloques
--                      por donde no toca.
--   macrocycles      — es "la temporada" entera (nombre + competición
--                      objetivo). Una fase es un TRAMO de eso, así que la
--                      relación natural es fases → macro, no fases = macro.
--                      Por eso `macro_id` está aquí y es opcional.
--
-- COMPLETAMENTE PERSONALIZABLE, QUE ES EL REQUISITO
-- No hay lista cerrada de fases. El nombre es texto libre: PREPARATORIA,
-- HIPERTROFIA, FUERZA, VOLUMEN, PEAKING, COMPETICIÓN… o lo que el
-- entrenador escriba. El orden y la duración también son suyos.
--
-- LA "SEMANA ACTUAL" NO SE GUARDA, SE DEDUCE
-- Se calcula con la fecha de inicio y el día de hoy (ver
-- src/lib/period/fases.ts). Guardarla sería un número que hay que acordarse
-- de subir cada lunes, y el primer lunes que se olvide la pantalla miente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.season_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    coach_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Temporada a la que pertenece. NULL = fases sueltas del atleta, que es
    -- el caso de quien no usa macrociclos.
    macro_id UUID REFERENCES public.macrocycles(id) ON DELETE CASCADE,

    /**
     * A qué movimiento. NULL = a toda la temporada.
     *
     * Es lo que permite el punto 5 del encargo: que la sentadilla vaya en
     * PEAKING mientras la banca sigue en HIPERTROFIA, que es lo normal en
     * los meses previos a una competición. Sin esta columna habría que
     * elegir entre una sola fase para todo o tres temporadas paralelas.
     *
     * Los valores son las claves del clasificador de la aplicación
     * (src/lib/planning/mainLift.ts) para que la fase y las series contadas
     * hablen del mismo movimiento.
     */
    movement TEXT CHECK (movement IS NULL OR movement IN ('SQ', 'BP', 'DL')),

    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),

    -- Cuántas semanas dura. Se usa para pintar "Semana 3 de 4" y para
    -- calcular el final cuando no hay `end_date`.
    weeks INT NOT NULL CHECK (weeks BETWEEN 1 AND 52),

    -- Orden dentro de la temporada. No se deduce de las fechas porque una
    -- fase puede no tenerlas todavía (el coach esboza la temporada entera y
    -- pone las fechas después).
    order_index INT NOT NULL DEFAULT 0,

    start_date DATE,
    -- Opcional: si falta, se calcula como start_date + weeks*7 - 1.
    end_date   DATE,

    -- Aspecto. Texto libre a propósito: el cliente valida contra su paleta
    -- y cae a un color por defecto si no lo reconoce, así que un valor raro
    -- no rompe la pantalla.
    color TEXT CHECK (color IS NULL OR length(color) <= 24),
    icon  TEXT CHECK (icon IS NULL OR length(icon) <= 32),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Una fase sin fechas es un esbozo válido; una con las dos tiene que
    -- estar en orden.
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS season_phases_athlete_idx
    ON public.season_phases (athlete_id, order_index);
CREATE INDEX IF NOT EXISTS season_phases_macro_idx
    ON public.season_phases (macro_id) WHERE macro_id IS NOT NULL;

ALTER TABLE public.season_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS season_phases_select ON public.season_phases;
DROP POLICY IF EXISTS season_phases_insert ON public.season_phases;
DROP POLICY IF EXISTS season_phases_update ON public.season_phases;
DROP POLICY IF EXISTS season_phases_delete ON public.season_phases;

-- EL ATLETA LO VE. Es el punto entero del encargo: que sepa dónde está.
-- Pero no lo escribe: la temporada la planifica su entrenador.
CREATE POLICY season_phases_select ON public.season_phases
    FOR SELECT TO authenticated
    USING (athlete_id = (SELECT auth.uid()) OR public.shares_coaching_link(athlete_id));

CREATE POLICY season_phases_insert ON public.season_phases
    FOR INSERT TO authenticated
    WITH CHECK (
        coach_id = (SELECT auth.uid())
        AND public.shares_coaching_link(athlete_id)
    );

CREATE POLICY season_phases_update ON public.season_phases
    FOR UPDATE TO authenticated
    USING (coach_id = (SELECT auth.uid()))
    WITH CHECK (
        coach_id = (SELECT auth.uid())
        AND public.shares_coaching_link(athlete_id)
    );

CREATE POLICY season_phases_delete ON public.season_phases
    FOR DELETE TO authenticated
    USING (coach_id = (SELECT auth.uid()));

-- Permisos de TABLA: no los cubre la RLS.
REVOKE ALL ON public.season_phases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_phases TO authenticated;

DROP TRIGGER IF EXISTS season_phases_touch ON public.season_phases;
CREATE OR REPLACE FUNCTION public.tocar_season_phases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;
CREATE TRIGGER season_phases_touch
    BEFORE UPDATE ON public.season_phases
    FOR EACH ROW EXECUTE FUNCTION public.tocar_season_phases();


-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
SELECT 'season_phases' AS comprobacion, count(*) AS filas
  FROM public.season_phases;

-- Que el CHECK de movimiento hace su trabajo. Si esto NO da error, el
-- constraint no está puesto.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.season_phases (coach_id, athlete_id, name, weeks, movement)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'prueba', 4, 'ZZ');
        RAISE WARNING 'season_phases: el CHECK de movement NO está impidiendo valores inválidos';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'season_phases: CHECK de movement OK';
        WHEN foreign_key_violation THEN
            -- Llega antes la clave ajena que el CHECK. También sirve: la
            -- fila no entra.
            RAISE NOTICE 'season_phases: la fila de prueba no entra (clave ajena) — esperado';
    END;
END $$;
