-- =====================================================================
-- ANVIL STRENGTH — PLANTILLAS DE PROGRESIÓN
-- =====================================================================
-- Idempotente. Ejecutar DESPUÉS de SECURITY_HARDENING.sql (usa is_coach()).
--
-- QUÉ GUARDA
-- Cómo evoluciona un ejercicio a lo largo de las semanas de un bloque:
-- "S1 4x6 al 70%, S2 4x6 al 75%, S3 4x6 al 80%, S4 3x5 al 60%".
--
-- POR QUÉ EN PORCENTAJE Y NO EN KILOS
-- La plantilla se guarda tal como la escribió el coach, incluidos los
-- porcentajes, y los kilos se calculan al APLICARLA con el 1RM de cada
-- atleta. Así la misma progresión sirve para todo el equipo, y cuando a
-- alguien le sube el máximo basta con volver a aplicarla.
--
-- Los escalones van en JSONB y no en una tabla hija porque siempre se leen y
-- se escriben enteros: una progresión no tiene sentido a trozos, y una tabla
-- aparte solo añadiría un JOIN a cada consulta.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.progression_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),

    -- [{ week, sets, reps, metric, value }]
    -- `metric`: 'percent' | 'kg' | 'rpe' | 'rir' | 'vel' | 'vel_loss'
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un coach no necesita dos progresiones con el mismo nombre, y el nombre
    -- es cómo las va a reconocer en la lista.
    UNIQUE (coach_id, name)
);

-- Se filtra siempre por coach_id: es la única consulta que hace la app.
CREATE INDEX IF NOT EXISTS progression_templates_coach_idx
    ON public.progression_templates (coach_id);

-- Un array vacío pasaría el DEFAULT pero no sirve de nada al aplicarlo.
-- La restricción va aparte y con nombre fijo para poder reejecutar el archivo.
ALTER TABLE public.progression_templates
    DROP CONSTRAINT IF EXISTS progression_templates_steps_check;

ALTER TABLE public.progression_templates
    ADD CONSTRAINT progression_templates_steps_check
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0);

ALTER TABLE public.progression_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prog_select ON public.progression_templates;
DROP POLICY IF EXISTS prog_insert ON public.progression_templates;
DROP POLICY IF EXISTS prog_update ON public.progression_templates;
DROP POLICY IF EXISTS prog_delete ON public.progression_templates;

-- Cada coach ve y gestiona solo las suyas. No se comparten entre coaches:
-- una progresión lleva el criterio de quien la escribió, y verlas todas
-- mezcladas en la lista haría el desplegable inservible en cuanto haya
-- varios entrenadores en el club.
CREATE POLICY prog_select ON public.progression_templates
    FOR SELECT TO authenticated
    USING (coach_id = auth.uid());

CREATE POLICY prog_insert ON public.progression_templates
    FOR INSERT TO authenticated
    WITH CHECK (coach_id = auth.uid() AND public.is_coach());

CREATE POLICY prog_update ON public.progression_templates
    FOR UPDATE TO authenticated
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

CREATE POLICY prog_delete ON public.progression_templates
    FOR DELETE TO authenticated
    USING (coach_id = auth.uid());

REVOKE ALL ON public.progression_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progression_templates TO authenticated;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'plantillas de progresión' AS check, count(*) AS total
  FROM public.progression_templates;
