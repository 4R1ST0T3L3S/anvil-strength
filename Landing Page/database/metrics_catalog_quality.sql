-- =====================================================================
-- ANVIL STRENGTH — CINCO MÉTRICAS SOBRE CÓMO SE MIDIÓ
-- =====================================================================
--
-- Fase B del análisis de vídeo. Ver docs/ARQUITECTURA_VIDEO_PWR.md §7.
--
--
-- QUÉ AÑADE
--
-- Hasta ahora se guardaba QUÉ se midió (0,71 m/s) pero no CÓMO. Y el cómo
-- decide si el qué vale: la misma serie analizada con el disco detectado
-- automáticamente o con un aro puesto a ojo puede diferir un 20% en la
-- velocidad y un 44% en la potencia, sin que nada en la base de datos permita
-- distinguir un caso del otro.
--
-- Estas cinco claves son lo que hace auditable una medición:
--
--   measurement_quality — la nota global, 0–100. Por debajo de 50 la
--                         aplicación ya no deja guardar, así que en la base
--                         no debería aparecer nada bajo ese umbral. Si
--                         aparece, viene de antes de esta versión.
--   camera_obliquity    — desviación estimada de la cámara respecto de la
--                         perpendicular a la barra. Por encima de ~22° la
--                         desviación horizontal de la barra no es comparable
--                         entre vídeos.
--   tracking_loss       — porcentaje de fotogramas en los que el flujo óptico
--                         perdió la marca.
--   sample_rate         — fotogramas por segundo efectivamente analizados. Con
--                         pocos, el pico de velocidad es ruido.
--   plate_px            — altura del disco en la imagen, en píxeles. Es el
--                         número del que sale la escala; guardarlo permite
--                         RECALCULAR una medición antigua si se descubre que
--                         el disco no era de 45 cm.
--
--
-- POR QUÉ ESTO NO ES UNA MIGRACIÓN DE ESQUEMA
--
-- No hay ALTER TABLE. Las métricas viven en la bolsa JSONB
-- (`vbt_measurements.metrics` / `training_sets.vbt_metrics`) y el catálogo
-- solo dice cómo se llaman y cómo se pintan. Añadir una métrica es un INSERT
-- —exactamente lo que se buscaba al montar el modelo— y ninguna pantalla ya
-- escrita necesita cambiar para enseñarlas.
--
-- Requiere database/metrics_catalog.sql ejecutado antes.
-- =====================================================================

INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    ('measurement_quality', 'Fiabilidad de la medición', 'Fiab.',    '/100', 0, 'quality', 'up',      600, 0,   100,
     'Nota global de confianza en esta medición: escala, ángulo de cámara, seguimiento, muestreo y plausibilidad física. Por debajo de 50 la aplicación no permite guardar.'),
    ('camera_obliquity',    'Ángulo de cámara',          'Áng.',     '°',    0, 'quality', 'down',    620, 0,    90,
     'Cuánto se desvía la cámara de la perpendicular a la barra, estimado por el achatamiento del disco. No afecta a la velocidad —la escala vertical se auto-corrige— pero sí a la desviación horizontal de la barra.'),
    ('tracking_loss',       'Fotogramas perdidos',       'Pérd.',    '%',    1, 'quality', 'down',    630, 0,   100,
     'Porcentaje de fotogramas en los que el seguimiento perdió la marca de la barra.'),
    ('sample_rate',         'Frecuencia de muestreo',    'Muestreo', 'Hz',   0, 'quality', 'up',      640, 0,  1000,
     'Fotogramas por segundo realmente analizados. Con menos de una docena por repetición, el pico de velocidad y la RFD dejan de ser fiables.'),
    ('plate_px',            'Disco medido',              'Disco',    'px',   0, 'quality', 'neutral', 650, 0, 10000,
     'Altura del disco en la imagen. Es de donde sale la escala del vídeo; guardarlo permite recalcular la medición si el disco no era del diámetro supuesto.')
ON CONFLICT (key) DO UPDATE SET
    label       = EXCLUDED.label,
    short_label = EXCLUDED.short_label,
    unit        = EXCLUDED.unit,
    precision   = EXCLUDED.precision,
    category    = EXCLUDED.category,
    direction   = EXCLUDED.direction,
    sort_order  = EXCLUDED.sort_order,
    min_value   = EXCLUDED.min_value,
    max_value   = EXCLUDED.max_value,
    description = EXCLUDED.description;


-- ---------------------------------------------------------------------
-- COMPROBACIÓN
-- ---------------------------------------------------------------------
SELECT key, label, unit, sort_order
  FROM public.metric_definitions
 WHERE category = 'quality'
 ORDER BY sort_order;

-- Cuántas mediciones ya traen nota de fiabilidad. Antes de esta versión,
-- ninguna: las anteriores se midieron sin saber con qué precisión, y eso es
-- un dato en sí mismo a la hora de leer el histórico.
SELECT 'mediciones' AS check,
       COUNT(*) FILTER (WHERE metrics ? 'measurement_quality') AS con_fiabilidad,
       COUNT(*)                                                AS total
  FROM public.vbt_measurements;

NOTIFY pgrst, 'reload schema';
