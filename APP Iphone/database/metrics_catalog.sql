-- =====================================================================
-- ANVIL STRENGTH — MÉTRICAS COMO DATO, NO COMO ESQUEMA
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- EL PROBLEMA QUE VIENE A RESOLVER
--
-- Hasta ahora cada métrica de VBT era una COLUMNA: `vbt_mean_velocity`,
-- `vbt_peak_power`, `vbt_rom`… Añadir una métrica nueva costaba:
--
--   1. una migración (ALTER TABLE en dos tablas),
--   2. tocar `VbtMetrics` en src/types/training.ts,
--   3. tocar `metricsToRow` y `metricsToSetRow` en vbtService.ts,
--   4. tocar cada pantalla que la pinte,
--   5. y añadirla a la lista blanca de columnas de SECURITY_HARDENING.sql
--      (que es justo el paso que se olvida y rompe el guardado en silencio).
--
-- Con decenas de métricas por delante —PWR ya calcula fuerza media, RFD,
-- desviación horizontal de la barra, punto de estancamiento, duración
-- excéntrica…— eso es insostenible.
--
-- LA FORMA DE LA SOLUCIÓN: BOLSA + CATÁLOGO
--
-- Los VALORES van en una bolsa JSONB (`metrics`), sin esquema fijo.
-- El SIGNIFICADO va en una tabla catálogo (`metric_definitions`): qué
-- unidad tiene, cuántos decimales, cómo se llama en pantalla, si más es
-- mejor o peor, en qué grupo se enseña.
--
-- Añadir una métrica nueva pasa a ser UN INSERT en el catálogo. Cero
-- migraciones, cero despliegues, cero código.
--
-- POR QUÉ NO EAV PURO (una fila por métrica)
--
-- Porque leer las quince métricas de una serie serían quince filas a unir
-- en cada consulta, y el perfil carga-velocidad de un bloque son cientos de
-- series. La bolsa se lee de una vez con la fila que ya se estaba trayendo.
--
-- POR QUÉ NO JSONB A SECAS, SIN CATÁLOGO
--
-- Porque entonces el cliente tendría que saber de memoria que
-- `mean_velocity` va en m/s con tres decimales y se llama "Velocidad media".
-- Eso es el mismo acoplamiento de antes, solo que sin que la base de datos
-- lo sepa. El catálogo es lo que permite que una pantalla pinte una métrica
-- que no existía cuando se escribió esa pantalla.
--
-- COMPATIBILIDAD
--
-- Las columnas `vbt_*` de `training_sets` y las columnas sueltas de
-- `vbt_measurements` SIGUEN EXISTIENDO y se siguen escribiendo. Nada de lo
-- que ya consulta por ellas se entera de este cambio. La bolsa es aditiva:
-- contiene esas mismas siete y además todo lo nuevo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL CATÁLOGO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_definitions (
    -- La clave es el identificador estable que viaja en la bolsa JSONB.
    -- snake_case y en inglés, como el resto de columnas de la base: es una
    -- clave de datos, no un texto de interfaz (para eso está `label`).
    key             TEXT PRIMARY KEY,

    -- Cómo se llama en pantalla. Se puede cambiar sin tocar los datos.
    label           TEXT        NOT NULL,
    -- Versión corta para tarjetas estrechas y cabeceras de tabla.
    short_label     TEXT,

    -- Unidad tal y como se escribe detrás del número ('m/s', 'W', 'kg',
    -- '%', 's', 'cm'). NULL = magnitud sin unidad (un conteo, un índice).
    unit            TEXT,
    -- Decimales con los que se enseña. La velocidad necesita 2-3; un
    -- número de repeticiones, 0.
    precision       SMALLINT    NOT NULL DEFAULT 2,

    -- Agrupación en la interfaz: 'velocity', 'power', 'force', 'range',
    -- 'estimation', 'tempo', 'quality'. Texto libre a propósito — inventar
    -- un grupo nuevo no debe exigir un ALTER TYPE.
    category        TEXT        NOT NULL DEFAULT 'other',

    -- Hacia dónde es "mejor". Lo usa la interfaz para colorear tendencias:
    -- en velocidad media, subir es mejorar; en pérdida de velocidad, no.
    --   'up'      — más es mejor
    --   'down'    — menos es mejor
    --   'neutral' — no hay dirección buena (una duración, un conteo)
    direction       TEXT        NOT NULL DEFAULT 'neutral'
                    CHECK (direction IN ('up', 'down', 'neutral')),

    -- Orden de aparición dentro de su categoría.
    sort_order      SMALLINT    NOT NULL DEFAULT 100,

    -- Una métrica retirada deja de ofrecerse y de pintarse, pero los
    -- valores históricos que ya están en las bolsas NO se tocan: borrar la
    -- definición no puede borrar la medición.
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Rango admisible. Sirve para descartar lo que sale del analizador
    -- cuando el seguimiento del vídeo se pierde: una velocidad de 40 m/s
    -- no es un dato, es un fallo de medición.
    min_value       DOUBLE PRECISION,
    max_value       DOUBLE PRECISION,

    -- Para quien lea el catálogo dentro de un año.
    description     TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.metric_definitions IS
    'Catálogo de métricas. Añadir una métrica nueva es un INSERT aquí: no hace falta migración ni despliegue. Los valores viven en las bolsas JSONB de vbt_measurements.metrics y training_sets.vbt_metrics.';

-- El catálogo lo lee TODO el mundo (el atleta también ve sus métricas) pero
-- solo lo escribe el service_role: una métrica nueva es una decisión de
-- producto, no algo que un cliente pueda inventar sobre la marcha.
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metric_definitions_read" ON public.metric_definitions;
CREATE POLICY "metric_definitions_read" ON public.metric_definitions
    FOR SELECT TO authenticated
    USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.metric_definitions FROM authenticated, anon;
GRANT SELECT ON public.metric_definitions TO authenticated;


-- ---------------------------------------------------------------------
-- 2. LAS BOLSAS
-- ---------------------------------------------------------------------
-- En la medición (el dato primario).
ALTER TABLE public.vbt_measurements
    ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vbt_measurements.metrics IS
    'Bolsa de métricas {clave: número}. Las claves se describen en metric_definitions. Contiene también las siete métricas que tienen columna propia, por comodidad de lectura.';

-- En la serie (el resumen consultable junto al peso y las repeticiones).
ALTER TABLE public.training_sets
    ADD COLUMN IF NOT EXISTS vbt_metrics JSONB;

COMMENT ON COLUMN public.training_sets.vbt_metrics IS
    'Bolsa de métricas VBT de ESTA serie. Espejo de vbt_measurements.metrics para no tener que unir tablas al pintar el registro del día. NULL = sin medición.';

-- Solo objetos, y planos: la bolsa es {clave: número}, no un árbol. Sin
-- esto, un cliente con un fallo podría dejar ahí una lista o un objeto
-- anidado y toda pantalla que la recorra tendría que defenderse.
ALTER TABLE public.vbt_measurements
    DROP CONSTRAINT IF EXISTS vbt_measurements_metrics_is_object;
ALTER TABLE public.vbt_measurements
    ADD CONSTRAINT vbt_measurements_metrics_is_object
    CHECK (jsonb_typeof(metrics) = 'object');

ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_vbt_metrics_is_object;
ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_vbt_metrics_is_object
    CHECK (vbt_metrics IS NULL OR jsonb_typeof(vbt_metrics) = 'object');

-- Tope de tamaño. Una bolsa son decenas de números; si alguien empieza a
-- meter ahí la serie temporal completa del vídeo, cada lectura de una serie
-- arrastraría cientos de kilobytes. Las series temporales tienen su sitio:
-- `rep_velocities` y, si crecen, su propia tabla.
ALTER TABLE public.vbt_measurements
    DROP CONSTRAINT IF EXISTS vbt_measurements_metrics_size;
ALTER TABLE public.vbt_measurements
    ADD CONSTRAINT vbt_measurements_metrics_size
    CHECK (pg_column_size(metrics) <= 4096);

ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_vbt_metrics_size;
ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_vbt_metrics_size
    CHECK (vbt_metrics IS NULL OR pg_column_size(vbt_metrics) <= 4096);

-- Índice GIN: permite preguntar "¿qué series tienen medida la fuerza
-- media?" sin recorrer la tabla entera. Es lo que hace que una métrica
-- añadida hoy sea consultable sin crearle un índice propio.
CREATE INDEX IF NOT EXISTS idx_vbt_measurements_metrics
    ON public.vbt_measurements USING GIN (metrics jsonb_path_ops);


-- ---------------------------------------------------------------------
-- 3. PERMISO DE ESCRITURA SOBRE LA BOLSA DE LA SERIE
-- ---------------------------------------------------------------------
-- `training_sets` tiene permisos por COLUMNA (ver FIX_TIMEOUT_SERIES.sql y
-- SECURITY_HARDENING.sql). Una columna nueva que el cliente escribe y que
-- no esté concedida hace que PostgREST rechace el lote entero con PGRST204
-- — el fallo clásico de este proyecto, y sin mensaje útil.
--
-- Se concede solo si la tabla tiene de verdad permisos por columna; si el
-- GRANT es de tabla completa, esto no hace falta y añadirlo no cambia nada.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.column_privileges
         WHERE table_schema = 'public'
           AND table_name   = 'training_sets'
           AND grantee      = 'authenticated'
           AND privilege_type = 'UPDATE'
    ) THEN
        EXECUTE 'GRANT UPDATE (vbt_metrics) ON public.training_sets TO authenticated';
        RAISE NOTICE 'training_sets.vbt_metrics: UPDATE concedido a authenticated';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 4. SIEMBRA DEL CATÁLOGO
-- ---------------------------------------------------------------------
-- Las siete de siempre (las que ya tienen columna propia) y todo lo que el
-- analizador PWR ya calcula pero hasta ahora se tiraba al cerrar la
-- pestaña. `ON CONFLICT DO UPDATE` para que reejecutar el archivo actualice
-- etiquetas sin duplicar nada.
INSERT INTO public.metric_definitions
    (key, label, short_label, unit, precision, category, direction, sort_order, min_value, max_value, description)
VALUES
    -- --- Velocidad -------------------------------------------------
    ('mean_velocity',      'Velocidad media',            'Vm',      'm/s', 3, 'velocity',   'up',      10, 0,    5,
     'Velocidad media de la fase concéntrica. La métrica de referencia en VBT.'),
    ('peak_velocity',      'Velocidad máxima',           'Vmax',    'm/s', 3, 'velocity',   'up',      20, 0,    6,
     'Pico de velocidad dentro de la repetición.'),
    ('min_velocity',       'Velocidad en el punto malo', 'Vmin',    'm/s', 3, 'velocity',   'up',      30, 0,    5,
     'Mínimo de velocidad de la concéntrica: el punto de estancamiento.'),
    ('velocity_loss',      'Pérdida de velocidad',       'VL',      '%',   1, 'velocity',   'down',    40, 0,  100,
     'Caída de velocidad dentro de la serie, de la mejor repetición a la última. Indicador de fatiga intraserie.'),

    -- --- Potencia --------------------------------------------------
    ('mean_power',         'Potencia media',             'Pm',      'W',   0, 'power',      'up',     110, 0, 10000,
     'Potencia media de la concéntrica, con la carga declarada.'),
    ('peak_power',         'Potencia máxima',            'Pmax',    'W',   0, 'power',      'up',     120, 0, 15000,
     'Pico de potencia de la repetición.'),

    -- --- Fuerza ----------------------------------------------------
    ('mean_force',         'Fuerza media',               'Fm',      'N',   0, 'force',      'up',     210, 0, 20000,
     'Fuerza media aplicada durante la concéntrica.'),
    ('peak_force',         'Fuerza máxima',              'Fmax',    'N',   0, 'force',      'up',     220, 0, 30000,
     'Pico de fuerza de la repetición.'),
    ('rfd',                'Tasa de desarrollo de fuerza','RFD',    'N/s', 0, 'force',      'up',     230, 0, 100000,
     'Con qué rapidez se aplica la fuerza. Distingue dos levantamientos de la misma fuerza máxima pero distinta explosividad.'),

    -- --- Recorrido -------------------------------------------------
    ('rom',                'Recorrido',                  'ROM',     'm',   3, 'range',      'neutral', 310, 0,    3,
     'Distancia vertical recorrida por la barra en la concéntrica.'),
    ('horizontal_deviation','Desviación horizontal',     'Desv.',   'cm',  1, 'range',      'down',    320, 0,  100,
     'Cuánto se va la barra hacia delante o atrás respecto a la vertical. Métrica de técnica, no de rendimiento.'),
    ('sticking_height',    'Altura del punto malo',      'H. crít', 'm',   3, 'range',      'neutral', 330, 0,    3,
     'A qué altura del recorrido se produce el mínimo de velocidad.'),

    -- --- Estimación ------------------------------------------------
    ('est_1rm',            '1RM estimado',               '1RM',     'kg',  1, 'estimation', 'up',      410, 0, 1000,
     'Máximo estimado a partir del perfil carga-velocidad, sin llegar a probarlo.'),
    ('est_1rm_percent',    'Intensidad relativa',        '%1RM',    '%',   1, 'estimation', 'neutral', 420, 0,  200,
     'Porcentaje del 1RM estimado que representa la carga usada.'),

    -- --- Tempo -----------------------------------------------------
    ('concentric_duration','Duración concéntrica',       'T. con',  's',   2, 'tempo',      'neutral', 510, 0,   60,
     'Cuánto dura la fase de subida.'),
    ('eccentric_duration', 'Duración excéntrica',        'T. exc',  's',   2, 'tempo',      'neutral', 520, 0,   60,
     'Cuánto dura la fase de bajada. Un tempo pautado se comprueba aquí.'),

    -- --- Calidad de la medición ------------------------------------
    ('total_reps',         'Repeticiones detectadas',    'Reps',    NULL,  0, 'quality',    'neutral', 610, 0,  100,
     'Cuántas repeticiones separó el analizador. Si no coincide con lo registrado, la medición es sospechosa.')
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
-- 5. RELLENO DE LO YA GUARDADO
-- ---------------------------------------------------------------------
-- Las mediciones que ya existen tienen sus siete columnas pero la bolsa
-- vacía. Se rellena a partir de las columnas, para que una pantalla que lea
-- SOLO la bolsa —que es lo que se quiere de aquí en adelante— vea también
-- el histórico y no parezca que el atleta empezó a medir hoy.
--
-- `strip_nulls` deja fuera las que no tengan valor: una bolsa no lleva
-- claves a null, lleva solo lo que se midió.
UPDATE public.vbt_measurements
   SET metrics = jsonb_strip_nulls(jsonb_build_object(
           'mean_velocity', mean_velocity,
           'peak_velocity', peak_velocity,
           'velocity_loss', velocity_loss,
           'mean_power',    mean_power,
           'peak_power',    peak_power,
           'rom',           rom,
           'est_1rm',       est_1rm
       ))
 WHERE metrics = '{}'::jsonb
   AND (mean_velocity IS NOT NULL OR peak_velocity IS NOT NULL
        OR mean_power IS NOT NULL OR peak_power IS NOT NULL
        OR rom IS NOT NULL OR est_1rm IS NOT NULL);

UPDATE public.training_sets
   SET vbt_metrics = jsonb_strip_nulls(jsonb_build_object(
           'mean_velocity', vbt_mean_velocity,
           'peak_velocity', vbt_peak_velocity,
           'velocity_loss', vbt_velocity_loss,
           'mean_power',    vbt_mean_power,
           'peak_power',    vbt_peak_power,
           'rom',           vbt_rom,
           'est_1rm',       vbt_est_1rm
       ))
 WHERE vbt_metrics IS NULL
   AND (vbt_mean_velocity IS NOT NULL OR vbt_peak_velocity IS NOT NULL
        OR vbt_mean_power IS NOT NULL OR vbt_peak_power IS NOT NULL
        OR vbt_rom IS NOT NULL OR vbt_est_1rm IS NOT NULL);


-- ---------------------------------------------------------------------
-- 6. COMPROBACIÓN
-- ---------------------------------------------------------------------
SELECT 'catálogo' AS check, category, COUNT(*) AS metricas
  FROM public.metric_definitions
 WHERE is_active
 GROUP BY category
 ORDER BY category;

SELECT 'columnas' AS check, table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'vbt_measurements' AND column_name = 'metrics')
     OR (table_name = 'training_sets'    AND column_name = 'vbt_metrics'));

SELECT 'rellenadas' AS check,
       COUNT(*) FILTER (WHERE metrics <> '{}'::jsonb) AS con_bolsa,
       COUNT(*)                                        AS total
  FROM public.vbt_measurements;

NOTIFY pgrst, 'reload schema';
