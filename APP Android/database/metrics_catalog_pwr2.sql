-- =====================================================================
-- ANVIL STRENGTH — MÉTRICAS NUEVAS DE PWR ANALYSIS 2.0
-- =====================================================================
--
-- Ver docs/AUDITORIA_PWR_2.0.md, fases 4, 6 y 11.
--
--
-- QUÉ AÑADE
--
-- El motor calculaba TODAS las repeticiones de una serie y guardaba una: la
-- de mayor velocidad de pico. El resto se descartaba en el mismo sitio donde
-- se calculaba. Estas doce claves recogen lo que ya se sabía y no se escribía.
--
--   Sobre la mejor repetición
--     propulsive_velocity    — media hasta que la barra decelera más de lo que
--                              caería sola (Sánchez-Medina). Es la métrica que
--                              usan los encoders comerciales como referencia,
--                              y con cargas ligeras difiere mucho de la media.
--     propulsive_ratio       — qué fracción del recorrido ha sido propulsiva.
--     peak_acceleration      — aceleración máxima. LA MENOS FIABLE de todas:
--                              ~17% de error medido sobre repeticiones
--                              sintéticas. Se guarda porque ordena bien entre
--                              repeticiones de la misma serie, no porque su
--                              valor absoluto sea comparable con un encoder.
--     time_to_peak_velocity  — desde el arranque del movimiento hasta el pico.
--     sticking_rom_percent   — a qué altura del recorrido, en %, se atasca.
--     sticking_distance      — lo mismo en metros desde el inicio.
--     sticking_duration      — cuánto dura la zona de estancamiento.
--
--   Sobre la serie entera
--     series_mean_velocity   — media de las velocidades medias.
--     series_mean_rom        — recorrido medio.
--     series_consistency_cv  — coeficiente de variación de las velocidades.
--                              Adimensional a propósito: una serie a 0,80 m/s
--                              y otra a 0,30 se pueden comparar; una
--                              desviación típica en m/s no.
--     time_under_tension     — del arranque de la primera fase al final de la
--                              última, pausas incluidas.
--
--   Trazabilidad
--     engine_version         — QUÉ MOTOR produjo estos números.
--
--
-- SOBRE engine_version, QUE ES LA IMPORTANTE A LARGO PLAZO
--
-- Va codificada como entero (mayor × 10.000 + menor × 100 + parche), así que
-- v2.0.0 se guarda como 20000. La bolsa de métricas es NUMÉRICA —el catálogo
-- describe unidad, decimales y rango— y meter una cadena obligaría a que el
-- catálogo, el registro del cliente y todas las pantallas que pintan métricas
-- supieran distinguir dos tipos de valor. Ese es justo el coste que el modelo
-- de bolsa existe para evitar.
--
-- Ordenar por el entero es ordenar por versión, que es lo que hará cualquier
-- consulta del tipo «dame las mediciones de v2.1 o mejor».
--
-- Las mediciones anteriores al 18 de agosto de 2026 NO tienen esta clave, y
-- eso es correcto: se midieron antes de que hubiera con qué marcarlas. El
-- cliente las etiqueta «anterior a v2.0» en vez de inventarles un v0.0.0.
--
--
-- POR QUÉ ESTO NO ES UNA MIGRACIÓN DE ESQUEMA
--
-- No hay ALTER TABLE. Las métricas viven en la bolsa JSONB
-- (`vbt_measurements.metrics` / `training_sets.vbt_metrics`) y el catálogo
-- solo dice cómo se llaman y cómo se pintan. Doce métricas nuevas son doce
-- filas, y ninguna pantalla ya escrita necesita cambiar para enseñarlas.
--
-- Requiere database/metrics_catalog.sql ejecutado antes.
-- =====================================================================

INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    -- ---------------------------------------------------------------
    -- Velocidad
    -- ---------------------------------------------------------------
    ('propulsive_velocity',   'Velocidad propulsiva',        'MPV',    'm/s', 3, 'velocity', 'up',       15, 0,    6,
     'Velocidad media de la parte del recorrido en la que el atleta sigue empujando, es decir hasta que la barra decelera más rápido de lo que caería sola (a < -9,81 m/s²). Con cargas altas coincide casi con la velocidad media; con cargas ligeras la supera bastante.'),

    ('propulsive_ratio',      'Recorrido propulsivo',        '% prop.', '%',  0, 'velocity', 'up',       16, 0,  100,
     'Qué porcentaje del recorrido ha sido propulsivo. Un 100% significa que el atleta ha empujado hasta el final, lo normal cerca del máximo. Valores bajos indican una carga ligera con frenado largo.'),

    ('time_to_peak_velocity', 'Tiempo hasta velocidad máx.', 't→Vmax', 's',   2, 'velocity', 'down',     25, 0,   10,
     'Segundos desde que la barra arranca hasta que alcanza su velocidad máxima. En levantamientos con dos picos de velocidad esta métrica es ambigua por naturaleza: puede saltar de un pico al otro entre repeticiones parecidas.'),

    ('series_mean_velocity',  'Velocidad media de la serie', 'Vm ser.', 'm/s', 3, 'velocity', 'up',      50, 0,    6,
     'Media de las velocidades medias de todas las repeticiones de la serie, no solo de la mejor.'),

    ('series_consistency_cv', 'Consistencia de la serie',    'CV',     '%',   1, 'velocity', 'down',     60, 0,  200,
     'Coeficiente de variación de las velocidades medias entre repeticiones. Cuanto más bajo, más parecidas fueron entre sí. Es adimensional, así que series a velocidades muy distintas se pueden comparar.'),

    -- ---------------------------------------------------------------
    -- Fuerza
    -- ---------------------------------------------------------------
    ('peak_acceleration',     'Aceleración máxima',          'Amax',   'm/s²', 1, 'force',   'up',      205, -50, 100,
     'Mayor aceleración de la barra en el sentido del movimiento. ATENCIÓN: es la métrica menos fiable del análisis por vídeo — alrededor de un 17% de error absoluto medido contra repeticiones sintéticas, porque una aceleración es la segunda derivada de una señal ruidosa. Sirve para ordenar repeticiones dentro de una misma serie, no para comparar con un encoder.'),

    -- ---------------------------------------------------------------
    -- Recorrido
    -- ---------------------------------------------------------------
    ('sticking_rom_percent',  'Estancamiento (% del ROM)',   'Stick %', '%',  0, 'range',    'neutral', 331, 0,  100,
     'A qué altura del recorrido aparece el punto de estancamiento, en porcentaje: 0% es abajo del todo y 100% arriba. Es el número comparable entre atletas y entre sesiones, porque no depende de lo largo que sea el recorrido de cada uno.'),

    ('sticking_distance',     'Estancamiento (distancia)',   'Stick d', 'm',  3, 'range',    'neutral', 332, 0,    3,
     'Cuánto había subido la barra al llegar al punto de estancamiento, en metros desde el inicio del movimiento.'),

    ('sticking_duration',     'Duración del estancamiento',  'Stick t', 's',  2, 'range',    'down',    333, 0,   10,
     'Cuánto dura la zona de estancamiento, medida a media profundidad entre el fondo del valle de velocidad y el menor de los dos picos que lo rodean.'),

    ('series_mean_rom',       'Recorrido medio de la serie', 'ROM ser.', 'm', 3, 'range',    'neutral', 340, 0,    3,
     'Recorrido medio de todas las repeticiones. Comparado con el ROM de la mejor repetición, delata si el atleta fue acortando el recorrido conforme se fatigaba.'),

    ('time_under_tension',    'Tiempo bajo tensión',         'TUT',    's',   1, 'range',    'neutral', 350, 0,  600,
     'Del arranque de la primera repetición al final de la última, pausas entre repeticiones incluidas. Se mide entre movimientos y no desde el recorte del vídeo, que es una elección del usuario y no una propiedad de la serie.'),

    -- ---------------------------------------------------------------
    -- Trazabilidad
    -- ---------------------------------------------------------------
    ('engine_version',        'Versión del motor',           'Motor',  '',    0, 'quality',  'neutral', 690, 0, 999999,
     'Qué versión del motor de análisis produjo estas métricas, codificada como mayor×10000 + menor×100 + parche (v2.0.0 = 20000). Permite reanalizar vídeos antiguos y comparar precisión entre versiones, y expulsar del perfil carga-velocidad las mediciones de un motor que se descubra sesgado. Las mediciones sin esta clave son anteriores a agosto de 2026.')

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

-- Las doce nuevas tienen que aparecer aquí.
SELECT key, label, unit, category, sort_order
  FROM public.metric_definitions
 WHERE key IN (
        'propulsive_velocity', 'propulsive_ratio', 'time_to_peak_velocity',
        'series_mean_velocity', 'series_consistency_cv', 'peak_acceleration',
        'sticking_rom_percent', 'sticking_distance', 'sticking_duration',
        'series_mean_rom', 'time_under_tension', 'engine_version')
 ORDER BY category, sort_order;

-- La bolsa tiene un tope de 4 KB por fila. Con estas doce claves más se pasa
-- de unas veinte a unas treinta y dos: conviene ver cuánto ocupa de verdad la
-- medición más gorda antes de añadir muchas más.
SELECT 'tamaño de la bolsa' AS check,
       MAX(pg_column_size(metrics))              AS mayor_bytes,
       ROUND(AVG(pg_column_size(metrics)))       AS media_bytes,
       4096                                      AS tope
  FROM public.vbt_measurements;

NOTIFY pgrst, 'reload schema';
