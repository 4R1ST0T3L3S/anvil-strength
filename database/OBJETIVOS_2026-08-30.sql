-- =====================================================================
-- ANVIL STRENGTH — OBJETIVOS DE PROGRAMACIÓN POR MOVIMIENTO
-- =====================================================================
-- Idempotente. Ejecutar DESPUÉS de SECURITY_HARDENING.sql (usa
-- shares_coaching_link, aunque aquí no se concede al atleta — ver abajo).
--
-- QUÉ GUARDA
-- Hacia dónde se lleva a un atleta en un movimiento: "Sentadilla, 5x5x270kg".
-- Estructurado (series, reps, métrica, valor) y no en texto libre — decisión
-- cerrada del 30 de agosto de 2026 — para poder comparar cifra contra cifra
-- con lo programado, lo realizado y las mejores marcas.
--
-- A QUÉ SE ATA
-- A un bloque, a un macrociclo, o a nada (objetivo del atleta sin fecha).
-- Nunca a los dos a la vez: son dos ámbitos distintos y atarlo a ambos no
-- añade información, solo ambigüedad sobre cuál manda.
--
-- POR QUÉ NO LO VE EL ATLETA
-- Decisión cerrada (F6): son del coach, para que el coach sepa hacia dónde
-- va programando. La RLS de este archivo NO concede SELECT a `athlete_id`
-- — a propósito, a diferencia de athlete_exercise_maxes.sql. Si algún día
-- cambia, es una migración aparte y una decisión aparte.
--
-- POR QUÉ POR NOMBRE Y NO POR exercise_id
-- Mismo motivo que athlete_exercise_maxes.sql: la biblioteca tiene
-- duplicados pendientes de fusionar, y el nombre normalizado (`exercise_key`,
-- calculado con la misma función `exerciseKey()` del cliente) sobrevive a
-- esa limpieza.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.training_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Ámbito. Como mucho UNO de los dos — ver la cabecera.
    block_id UUID REFERENCES public.training_blocks(id) ON DELETE CASCADE,
    macro_id UUID REFERENCES public.macrocycles(id) ON DELETE CASCADE,

    exercise_key TEXT NOT NULL,
    exercise_name TEXT NOT NULL,

    sets INT NOT NULL CHECK (sets > 0 AND sets <= 20),
    reps INT NOT NULL CHECK (reps > 0 AND reps <= 100),
    -- Mismo vocabulario que training_sets.target_metric: kg, RPE, RIR,
    -- velocidad o pérdida de velocidad. 'rpe'/'rir' guardan el número en
    -- `value` igual que el resto del sistema guarda `target_rpe` en texto —
    -- aquí no hace falta el rango ("7-8"): un objetivo es un número, no un
    -- margen.
    metric TEXT NOT NULL DEFAULT 'kg' CHECK (metric IN ('kg', 'rpe', 'rir', 'vel', 'vel_loss')),
    value NUMERIC(7,2) NOT NULL CHECK (value > 0),

    -- NULL = pendiente. Lo escribe el sistema al detectar que se cumplió
    -- (F5: automático, no a mano) — ver el comentario de
    -- `src/lib/planning/goals.ts` para el criterio exacto.
    achieved_at TIMESTAMPTZ,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (block_id IS NULL OR macro_id IS NULL)
);

CREATE INDEX IF NOT EXISTS training_goals_athlete_idx
    ON public.training_goals (athlete_id);
CREATE INDEX IF NOT EXISTS training_goals_block_idx
    ON public.training_goals (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS training_goals_macro_idx
    ON public.training_goals (macro_id) WHERE macro_id IS NOT NULL;

ALTER TABLE public.training_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_goals_select ON public.training_goals;
DROP POLICY IF EXISTS training_goals_insert ON public.training_goals;
DROP POLICY IF EXISTS training_goals_update ON public.training_goals;
DROP POLICY IF EXISTS training_goals_delete ON public.training_goals;

-- Solo el coach que lo escribió. NI SIQUIERA el atleta — ver la cabecera.
CREATE POLICY training_goals_select ON public.training_goals
    FOR SELECT TO authenticated
    USING (coach_id = auth.uid());

CREATE POLICY training_goals_insert ON public.training_goals
    FOR INSERT TO authenticated
    WITH CHECK (coach_id = auth.uid() AND public.shares_coaching_link(athlete_id));

CREATE POLICY training_goals_update ON public.training_goals
    FOR UPDATE TO authenticated
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

CREATE POLICY training_goals_delete ON public.training_goals
    FOR DELETE TO authenticated
    USING (coach_id = auth.uid());

REVOKE ALL ON public.training_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_goals TO authenticated;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'objetivos de programación' AS check, count(*) AS total
  FROM public.training_goals;
