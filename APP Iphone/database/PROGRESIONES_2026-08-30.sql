-- =====================================================================
-- ANVIL STRENGTH — PROGRESIONES GUARDADAS, V2
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere database/progression_templates.sql y database/metrics_catalog.sql
-- ejecutados antes.
--
-- QUÉ CAMBIA RESPECTO A LA V1
--
--   1. VISIBLE A TODOS LOS ENTRENADORES (B9). La v1 solo dejaba ver a su
--      propio autor —"no queremos verlas mezcladas de varios entrenadores"—,
--      pero el encargo pide lo contrario: "todos los entrenadores" pueden
--      ver y usar cualquier progresión guardada. ESCRIBIR sigue siendo solo
--      de quien la creó — ver la nueva política.
--   2. `movement_name` y `frequency` — metadatos con los que se propone el
--      formulario al aplicar (B6: el movimiento tiene un valor por defecto
--      pero se puede cambiar; B7: los días de la semana se elige AL
--      APLICAR, nunca se graban en la plantilla).
--   3. `steps` admite un campo `day` por escalón (1..frequency). Es
--      aditivo: una plantilla v1 sin `day` en sus pasos sigue leyéndose
--      igual —el cliente trata la ausencia como día 1—, así que no hace
--      falta migrar datos existentes.
-- =====================================================================

ALTER TABLE public.progression_templates
    ADD COLUMN IF NOT EXISTS movement_name TEXT;

ALTER TABLE public.progression_templates
    ADD COLUMN IF NOT EXISTS frequency SMALLINT NOT NULL DEFAULT 1
    CHECK (frequency >= 1 AND frequency <= 7);

COMMENT ON COLUMN public.progression_templates.movement_name IS
    'Movimiento por defecto al aplicar. Solo una propuesta: se puede cambiar en el momento de aplicar (B6), nunca obliga.';
COMMENT ON COLUMN public.progression_templates.frequency IS
    'Cuántos días por semana propone la plantilla (1-7). Los días de la semana concretos (lunes, jueves…) se eligen al aplicar, nunca se guardan aquí (B7).';

-- ---------------------------------------------------------------------
-- Visible a todos los entrenadores (B9)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS prog_select ON public.progression_templates;

CREATE POLICY prog_select ON public.progression_templates
    FOR SELECT TO authenticated
    USING (TRUE);

-- prog_insert / prog_update / prog_delete NO cambian: solo el propio autor
-- crea, edita o borra sus progresiones. "Todos pueden verla y usarla" no es
-- "todos pueden editarla" — son cosas distintas y el encargo solo pedía la
-- primera.


-- ---------------------------------------------------------------------
-- El % aplicado, guardado (B1)
-- ---------------------------------------------------------------------
-- "Guardar el porcentaje y enseñarlo junto a los kilos, sin recalcular
-- solo": training_sets no tiene columna de porcentaje (nunca la tuvo — ver
-- database/set_target_metric.sql), así que igual que el resto de datos
-- auxiliares de una serie desde el 5 de agosto, esto es una métrica más de
-- catálogo, en la MISMA bolsa que ya usan VBT y cardio.
INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    ('applied_percent', 'Porcentaje aplicado', '% aplic.', '%', 0, 'other', 'neutral', 810, 0, 200,
     'El %1RM que se usó para calcular esta carga al aplicar una progresión. Informativo: cambiar el 1RM del atleta no lo recalcula solo (decisión B1).')
ON CONFLICT (key) DO NOTHING;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'progresiones con movimiento por defecto' AS check, count(*) AS total
  FROM public.progression_templates WHERE movement_name IS NOT NULL;
