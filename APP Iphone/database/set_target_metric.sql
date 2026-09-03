-- =====================================================================
-- ANVIL STRENGTH — MÉTRICA DE PRESCRIPCIÓN POR SERIE
-- =====================================================================
-- Idempotente. Se puede ejecutar antes o después de SECURITY_HARDENING.sql:
-- no crea políticas, solo añade una columna con valor por defecto.
--
-- QUÉ RESUELVE
-- Hasta ahora una serie solo podía prescribirse en kilos (`target_load`) o
-- en RPE (`target_rpe`). No había forma de pedir RIR, una velocidad objetivo
-- ni un umbral de pérdida de velocidad, que es lo que usa el trabajo con
-- encoder.
--
-- DÓNDE VIVE EL VALOR
-- Una serie tiene UNA métrica. Según cuál sea, el valor se guarda en la
-- columna que ya existía y que mejor le encaja:
--
--   target_metric | valor en      | ejemplo
--   --------------+---------------+---------------------------------
--   kg            | target_load   | 170
--   rir           | target_load   | 2
--   vel           | target_load   | 0.45   (m/s objetivo)
--   vel_loss      | target_load   | 20     (% de pérdida permitido)
--   rpe           | target_rpe    | "@8", "7-8"
--
-- El RPE se queda en su columna de texto en vez de mudarse a `target_load`
-- por dos razones: ya hay datos escritos ahí, y es la única métrica que se
-- prescribe habitualmente en rango ("7-8"), cosa que un NUMERIC no admite.
--
-- Regla para leerlo desde código: el valor está en `target_rpe` si la
-- métrica es 'rpe', y en `target_load` en cualquier otro caso.
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

        -- DEFAULT 'kg' hace que todas las series ya escritas sigan
        -- significando exactamente lo mismo. Sin él haría falta un UPDATE
        -- sobre toda la tabla y una ventana en la que el tonelaje saldría mal.
        ALTER TABLE public.training_sets
            ADD COLUMN target_metric TEXT NOT NULL DEFAULT 'kg';

        RAISE NOTICE 'Añadida training_sets.target_metric';
    ELSE
        RAISE NOTICE 'training_sets.target_metric ya existía';
    END IF;
END $$;

-- La restricción va aparte y con nombre fijo para poder reejecutar el
-- archivo sin que falle por duplicado.
ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_target_metric_check;

ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_target_metric_check
    CHECK (target_metric IN ('kg', 'rir', 'rpe', 'vel', 'vel_loss'));

COMMENT ON COLUMN public.training_sets.target_metric IS
    'Unidad de la prescripción de la serie. El valor está en target_rpe si es ''rpe'', y en target_load en el resto de casos.';


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT
    'reparto de métricas' AS check,
    target_metric,
    count(*) AS series
  FROM public.training_sets
 GROUP BY target_metric
 ORDER BY series DESC;
