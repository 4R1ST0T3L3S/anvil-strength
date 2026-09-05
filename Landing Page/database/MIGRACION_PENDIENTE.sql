-- =====================================================================
-- ANVIL STRENGTH — MIGRACIÓN PENDIENTE (ejecutar entera, de una vez)
-- =====================================================================
--
-- CÓMO SE EJECUTA
-- Supabase → SQL Editor → New query → pegar esto entero → Run.
--
-- Es IDEMPOTENTE: se puede ejecutar las veces que haga falta sin romper
-- nada ni duplicar datos. Si algo falla a mitad, se corrige y se vuelve a
-- lanzar completo.
--
-- QUÉ ARREGLA, y por qué estaba roto
--
--   1. warmup / extras       → "Faltan las columnas de calentamiento y
--                              extras". El editor del día escribía contra
--                              dos columnas que nunca se crearon.
--
--   2. progression_templates → "No se pudo guardar la progresión". La
--                              tabla no existe, así que guardar y listar
--                              plantillas fallaba siempre.
--
--   3. set_type / group_tag  → Dropsets, rest-pause, clusters,
--                              superseries y triseries. Columnas nuevas.
--
--   3B. target_metric/notes  → "Error al guardar cambios" al tocar series,
--                              repeticiones o RPE de un ejercicio. El
--                              constructor escribe estas dos columnas en
--                              CADA serie; si falta cualquiera de ellas,
--                              PostgREST rechaza el lote entero (PGRST204)
--                              y no se guarda ni una fila.
--
--   4. Índices               → "canceling statement due to statement
--                              timeout" al guardar la rutina. Ver el
--                              bloque 4, que explica el porqué a fondo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. APÉNDICES DEL DÍA: CALENTAMIENTO Y EXTRAS
-- ---------------------------------------------------------------------
-- Un día de entrenamiento no son solo las series pautadas. Antes y después
-- hay trabajo que el coach metía como "ejercicios" de mentira ("Movilidad
-- cadera", "Core 3x15") para que apareciese en algún sitio, y eso ensuciaba
-- TODAS las métricas: contaba como series de accesorio, entraba en el
-- tonelaje y desviaba el reparto por patrón del panel de análisis.

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS warmup TEXT,
    ADD COLUMN IF NOT EXISTS extras TEXT;

COMMENT ON COLUMN public.training_sessions.warmup IS
    'Calentamiento y aproximaciones del día, en texto libre. Admite enlaces en formato [texto](url). Se enseña al atleta antes de la tabla de ejercicios y sale como apéndice en el PDF.';

COMMENT ON COLUMN public.training_sessions.extras IS
    'Trabajo opcional al terminar (core, movilidad, cardio). Texto libre con enlaces. No cuenta para el volumen ni el tonelaje.';


-- ---------------------------------------------------------------------
-- 2. PLANTILLAS DE PROGRESIÓN
-- ---------------------------------------------------------------------
-- Cómo evoluciona un ejercicio a lo largo de las semanas de un bloque:
-- "S1 4x6 al 70%, S2 4x6 al 75%, S3 4x6 al 80%, S4 3x5 al 60%".
--
-- Se guarda tal como la escribió el coach, PORCENTAJES INCLUIDOS, y los
-- kilos se calculan al aplicarla con el 1RM de cada atleta. Así la misma
-- progresión sirve para todo el equipo.

CREATE TABLE IF NOT EXISTS public.progression_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),

    -- [{ week, sets, reps, metric, value }]
    -- `metric`: 'percent' | 'kg' | 'rpe' | 'rir' | 'vel' | 'vel_loss'
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- El nombre es cómo el coach la reconoce en la lista: dos iguales
    -- dejarían dos entradas idénticas y ninguna forma de saber cuál es.
    UNIQUE (coach_id, name)
);

CREATE INDEX IF NOT EXISTS progression_templates_coach_idx
    ON public.progression_templates (coach_id);

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

CREATE POLICY prog_select ON public.progression_templates
    FOR SELECT TO authenticated
    USING (coach_id = auth.uid());

-- Sin `is_coach()`: esa función viene de SECURITY_HARDENING.sql y si no
-- está aplicada, la política referenciaría algo inexistente y el INSERT
-- fallaría con un error críptico. `coach_id = auth.uid()` ya impide
-- escribir plantillas a nombre de otro, que es lo que hay que impedir.
CREATE POLICY prog_insert ON public.progression_templates
    FOR INSERT TO authenticated
    WITH CHECK (coach_id = auth.uid());

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
-- 3. TIPOS DE SERIE AVANZADOS
-- ---------------------------------------------------------------------
-- Dropset, rest-pause, cluster, superserie y triserie.
--
-- POR QUÉ DOS COLUMNAS Y NO UNA
-- Son dos preguntas distintas y mezclarlas obligaría a inventar códigos:
--
--   `set_type`  — QUÉ es esta serie por dentro. Un dropset es una serie
--                 con bajadas de peso; un cluster son microseries con
--                 pausas. Vive en la serie porque cambia cómo se ejecuta
--                 ESA serie.
--
--   `group_tag` — CON QUIÉN se encadena. Una superserie es "banca +
--                 remo": no es una propiedad de una serie suelta, sino una
--                 etiqueta compartida por las series que se alternan. Dos
--                 ejercicios con el mismo `group_tag` dentro del mismo día
--                 se ejecutan alternando.
--
-- Con una sola columna, "superserie" no podría decir con QUÉ otro
-- ejercicio, que es justo la información que necesita el atleta.

ALTER TABLE public.training_sets
    ADD COLUMN IF NOT EXISTS set_type TEXT,
    ADD COLUMN IF NOT EXISTS set_detail TEXT,
    ADD COLUMN IF NOT EXISTS group_tag TEXT;

-- NULL = serie normal. Es el 95% de las filas y no merece una cadena
-- ocupando sitio en cada una de ellas.
ALTER TABLE public.training_sets
    DROP CONSTRAINT IF EXISTS training_sets_set_type_check;

ALTER TABLE public.training_sets
    ADD CONSTRAINT training_sets_set_type_check
    CHECK (set_type IS NULL OR set_type IN (
        'dropset',      -- bajadas de peso sin descanso
        'rest_pause',   -- al fallo, pausa corta, más reps
        'cluster',      -- microseries con pausas dentro de la serie
        'myo_reps',     -- serie de activación + miniseries
        'amrap'         -- todas las que salgan
    ));

COMMENT ON COLUMN public.training_sets.set_type IS
    'Técnica de intensidad de ESTA serie. NULL = serie normal.';

COMMENT ON COLUMN public.training_sets.set_detail IS
    'Parámetros de la técnica en texto corto: "-20% x2" para un dropset, "15s x3" para un cluster. Lo escribe el coach y lo lee el atleta tal cual.';

COMMENT ON COLUMN public.training_sets.group_tag IS
    'Etiqueta de encadenado. Las series de distintos ejercicios que comparten etiqueta dentro de un día se ejecutan alternando: dos ejercicios = superserie, tres = triserie.';

-- Se consulta al pintar el día para agrupar los encadenados.
CREATE INDEX IF NOT EXISTS training_sets_group_tag_idx
    ON public.training_sets (group_tag)
    WHERE group_tag IS NOT NULL;


-- ---------------------------------------------------------------------
-- 3B. MÉTRICA DE PRESCRIPCIÓN Y NOTAS DE LA SERIE
-- ---------------------------------------------------------------------
-- SÍNTOMA
-- "Error al guardar cambios" al tocar series / repeticiones / RPE de un
-- ejercicio, con esta migración ya ejecutada y dando OK en la verificación.
--
-- CAUSA
-- Estas dos columnas nunca estuvieron en este archivo: `target_metric` la
-- añadía database/set_target_metric.sql y `notes` database/FIX_ENTRENAMIENTO.sql,
-- así que en una base donde solo se ejecutó MIGRACION_PENDIENTE.sql siguen
-- faltando. El constructor las manda en TODAS las series (ver
-- WorkoutBuilder.savableSet), y PostgREST rechaza el lote completo con
-- PGRST204 en cuanto una columna del payload no existe: no se guarda nada.
--
-- Van aquí para que este archivo sea el único que hay que ejecutar, que es
-- lo que dice el mensaje de error de la aplicación.
--
-- DÓNDE VIVE EL VALOR DE CADA MÉTRICA
--
--   target_metric | valor en      | ejemplo
--   --------------+---------------+---------------------------------
--   kg            | target_load   | 170
--   rir           | target_load   | 2
--   vel           | target_load   | 0.45   (m/s objetivo)
--   vel_loss      | target_load   | 20     (% de pérdida permitido)
--   rpe           | target_rpe    | "@8", "7-8"
--
-- El RPE se queda en su columna de texto porque ya hay datos escritos ahí y
-- es la única métrica que se prescribe en rango ("7-8"), cosa que un NUMERIC
-- no admite.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'training_sets'
                     AND column_name = 'target_metric') THEN

        -- DEFAULT 'kg': las series ya escritas siguen significando
        -- exactamente lo mismo, sin una ventana en la que el tonelaje salga
        -- mal. Sin el default haría falta un UPDATE de la tabla entera.
        ALTER TABLE public.training_sets
            ADD COLUMN target_metric TEXT NOT NULL DEFAULT 'kg';

        RAISE NOTICE 'Añadida training_sets.target_metric';
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

-- Nota del coach sobre ESA serie. Venía en MASTER_DEPLOY_V3 pero no en
-- feature_efort_schema, así que falta en parte de los despliegues.
ALTER TABLE public.training_sets
    ADD COLUMN IF NOT EXISTS notes TEXT;


-- ---------------------------------------------------------------------
-- 4. ÍNDICES: EL "STATEMENT TIMEOUT" AL GUARDAR
-- ---------------------------------------------------------------------
-- SÍNTOMA
-- "Error al guardar cambios: canceling statement due to statement timeout".
--
-- CAUSA
-- No es la conexión del coach. Es el servidor abortando la sentencia por
-- pasarse del tiempo máximo. Guardar la rutina manda un UPSERT con TODAS
-- las series del bloque —ocho semanas por cuatro días por seis ejercicios
-- por cuatro series son casi 800 filas— y la política RLS de training_sets
-- hace, POR CADA FILA, este recorrido:
--
--     training_sets → session_exercises → training_sessions → training_blocks
--
-- Sin índices en esas claves ajenas, cada salto es un recorrido secuencial
-- de la tabla entera. 800 filas × 3 saltos × tabla completa se va de los
-- segundos que PostgREST concede a una petición.
--
-- Los índices convierten cada salto en una búsqueda directa. El cliente,
-- además, ahora manda solo las series que han cambiado y en lotes (ver
-- WorkoutBuilder.handleSaveChanges): las dos mitades del arreglo.

CREATE INDEX IF NOT EXISTS training_sets_session_exercise_idx
    ON public.training_sets (session_exercise_id);

CREATE INDEX IF NOT EXISTS session_exercises_session_idx
    ON public.session_exercises (session_id);

CREATE INDEX IF NOT EXISTS training_sessions_block_idx
    ON public.training_sessions (block_id);

CREATE INDEX IF NOT EXISTS training_blocks_coach_idx
    ON public.training_blocks (coach_id);

CREATE INDEX IF NOT EXISTS training_blocks_athlete_idx
    ON public.training_blocks (athlete_id);

-- Que el planificador conozca las tablas recién indexadas. Sin esto sigue
-- usando estadísticas viejas y puede no elegir los índices nuevos.
ANALYZE public.training_sets;
ANALYZE public.session_exercises;
ANALYZE public.training_sessions;
ANALYZE public.training_blocks;


-- ---------------------------------------------------------------------
-- 5. REFRESCAR EL CACHÉ DE ESQUEMA
-- ---------------------------------------------------------------------
-- Sin esto, PostgREST sigue rechazando las columnas nuevas con PGRST204
-- ("column not found") hasta el siguiente reinicio del proyecto, y parece
-- que la migración no ha servido de nada.

NOTIFY pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 6. VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Las cinco filas tienen que decir OK. Si alguna dice FALTA, esa parte no
-- se ha aplicado y el error correspondiente seguirá apareciendo.

SELECT
    'calentamiento y extras' AS comprueba,
    CASE WHEN COUNT(*) = 2 THEN 'OK' ELSE 'FALTA' END AS estado
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'training_sessions'
  AND column_name IN ('warmup', 'extras')

UNION ALL

SELECT
    'plantillas de progresión',
    CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FALTA' END
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'progression_templates'

UNION ALL

SELECT
    'tipos de serie',
    CASE WHEN COUNT(*) = 3 THEN 'OK' ELSE 'FALTA' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'training_sets'
  AND column_name IN ('set_type', 'set_detail', 'group_tag')

UNION ALL

SELECT
    'métrica y notas de serie',
    CASE WHEN COUNT(*) = 2 THEN 'OK' ELSE 'FALTA' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'training_sets'
  AND column_name IN ('target_metric', 'notes')

UNION ALL

SELECT
    'índices de rendimiento',
    CASE WHEN COUNT(*) = 5 THEN 'OK' ELSE 'FALTA' END
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'training_sets_session_exercise_idx',
      'session_exercises_session_idx',
      'training_sessions_block_idx',
      'training_blocks_coach_idx',
      'training_blocks_athlete_idx'
  );
