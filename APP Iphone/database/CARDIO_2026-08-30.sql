-- =====================================================================
-- ANVIL STRENGTH — CARDIO COMO PARTE DEL DÍA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Requiere database/CALENTAMIENTO_ESTRUCTURADO.sql, database/set_target_metric.sql
-- y database/metrics_catalog.sql ejecutados antes.
--
-- QUÉ RESUELVE
-- El cardio no era un tipo de entrenamiento: solo cabía como texto libre en
-- `extras`, sin datos, sin contar para nada. Esta migración lo incorpora
-- REUTILIZANDO el modelo que ya existe, sin arquitectura paralela — es la
-- instrucción explícita del encargo:
--
--   1. `section = 'cardio'` — ya es un valor válido en el CHECK de
--      `session_exercises.section` (junto a warmup/main/accessory).
--   2. La DURACIÓN y la DISTANCIA se pautan con las columnas que YA
--      EXISTEN — `target_load` + `target_metric` —, igual que un objetivo en
--      kilos o en RPE. Dos valores nuevos de `target_metric`:
--      'duracion_seg' (target_load son segundos) y 'distancia_km'
--      (target_load son kilómetros). "45 minutos caminata" es UNA fila con
--      target_metric='duracion_seg' y target_load=2700 — no hace falta
--      convertirlo en series.
--   3. Los INTERVALOS reutilizan `training_sets.rest_seconds` (ya existe)
--      para el descanso entre ellos, y `target_reps` para CUÁNTOS
--      intervalos son ("10 intervalos de 30 s" = target_reps='10',
--      target_metric='duracion_seg', target_load=30, rest_seconds=30):
--      UNA fila que se expande, igual que ya expande una serie agrupada
--      "4x8" — ver database/expand_grouped_set.sql. La intensidad de cada
--      intervalo va en `target_rpe`, la columna de siempre.
--   4. La FRECUENCIA CARDÍACA (objetivo y realizada) y la DISTANCIA/RITMO
--      REALIZADOS son métricas de catálogo — mismo patrón que VBT, en la
--      bolsa `training_sets.vbt_metrics` que ya existe. Un objetivo de FC
--      no es una medición de barra, pero el mecanismo (bolsa + catálogo)
--      es exactamente el mismo problema: números sin esquema fijo.
--
-- QUÉ NO CUENTA PARA EL VOLUMEN DE FUERZA
-- `countsForVolume()` (src/types/training.ts) ya excluye 'cardio' igual que
-- excluye 'warmup'. El cardio tiene su PROPIO recorrido de volumen —minutos
-- y kilómetros de la semana, no series ni tonelaje— resuelto en
-- `src/lib/planning/cardioVolume.ts` sin tocar ninguna cifra de fuerza.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. section = 'cardio'
-- ---------------------------------------------------------------------
ALTER TABLE public.session_exercises
    DROP CONSTRAINT IF EXISTS session_exercises_section_check;

ALTER TABLE public.session_exercises
    ADD CONSTRAINT session_exercises_section_check
    CHECK (section IN ('warmup', 'main', 'accessory', 'cardio'));


-- ---------------------------------------------------------------------
-- 2. target_metric admite duración y distancia
-- ---------------------------------------------------------------------
ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_target_metric_check;

ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_target_metric_check
    CHECK (target_metric IN ('kg', 'rir', 'rpe', 'vel', 'vel_loss', 'duracion_seg', 'distancia_km'));

COMMENT ON COLUMN public.training_sets.target_metric IS
    'Unidad de target_load. kg/rir/rpe/vel/vel_loss = fuerza. duracion_seg (segundos) y distancia_km (kilómetros) = cardio, añadidas 30 ago 2026.';


-- ---------------------------------------------------------------------
-- 3. Catálogo: frecuencia cardíaca, distancia y ritmo REALIZADOS
-- ---------------------------------------------------------------------
-- Van en la MISMA bolsa que VBT (training_sets.vbt_metrics), que ya existe
-- y ya tiene sus permisos de columna resueltos (metrics_catalog.sql § 3).
-- El nombre de la columna es historia de VBT; el mecanismo es genérico.
INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    ('hr_target',      'FC objetivo',           'FC obj.', 'bpm', 0, 'cardio', 'neutral', 710, 30, 230,
     'Frecuencia cardíaca objetivo, como número concreto. Si el objetivo es un rango, usar hr_target_min/hr_target_max en su lugar.'),
    ('hr_target_min',  'FC objetivo mínima',    'FC min',  'bpm', 0, 'cardio', 'neutral', 711, 30, 230,
     'Extremo inferior del rango de frecuencia cardíaca objetivo.'),
    ('hr_target_max',  'FC objetivo máxima',    'FC máx',  'bpm', 0, 'cardio', 'neutral', 712, 30, 230,
     'Extremo superior del rango de frecuencia cardíaca objetivo.'),
    ('hr_avg',         'FC media realizada',    'FC',      'bpm', 0, 'cardio', 'neutral', 720, 30, 230,
     'Frecuencia cardíaca media durante la serie o el intervalo, tal y como la registra el atleta.'),
    ('duration_actual_seconds', 'Duración realizada', 'Dur.', 's', 0, 'cardio', 'neutral', 725, 0, 36000,
     'Cuánto duró de verdad, si difiere de lo pautado. NO se guarda en actual_load: esa columna es kilos en todo el resto de la aplicación (ver lib/volume/engine.ts), y reutilizarla para segundos rompería cualquier cálculo que la lea.'),
    ('distance_km',    'Distancia',             'Dist.',   'km',  2, 'cardio', 'neutral', 730, 0,  400,
     'Distancia recorrida DE VERDAD. A diferencia de duration_actual_seconds, esta clave sirve tanto de pautada (cuando no hay target_metric=distancia_km más preciso) como de realizada.'),
    ('pace_min_km',    'Ritmo',                 'Ritmo',   'min/km', 2, 'cardio', 'neutral', 740, 0, 60,
     'Minutos por kilómetro. Se puede calcular de distancia y duración, o registrarse directamente.')
ON CONFLICT (key) DO NOTHING;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'metricas de cardio' AS check, count(*) AS total
  FROM public.metric_definitions
 WHERE category = 'cardio';

SELECT 'section admite cardio' AS check,
       EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conname = 'session_exercises_section_check'
              AND pg_get_constraintdef(oid) LIKE '%cardio%'
       ) AS ok;
