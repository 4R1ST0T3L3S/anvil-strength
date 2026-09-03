-- =====================================================================
-- ANVIL STRENGTH — REGISTRO DE EJECUCIÓN, VBT Y VOLUMEN EDITABLE
-- =====================================================================
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → New query → pegar esto ENTERO → Run.
--   Es idempotente: se puede lanzar las veces que haga falta.
--
-- QUÉ TRAE, y por qué
--
--   1. Competiciones duplicadas.  Un atleta puede acabar con la misma
--      competición tres veces: la asigna el coach, se la auto-asigna él, y
--      el coach vuelve a asignarla al añadir a otro atleta. Se limpian los
--      duplicados y se impide que vuelvan a entrar.
--
--   2. Volumen por prescripción.  El motor de volumen ya admitía anular la
--      clasificación muscular POR EJERCICIO DE BIBLIOTECA, pero eso es
--      global: cambiarlo afecta a todos los atletas y a todos los bloques.
--      Un mismo "remo con barra" puede ser dorsal directo en un bloque y
--      accesorio de espalda alta en otro. La anulación vive ahora también
--      en la fila de session_exercises, que es donde el coach programa.
--
--   3. VBT por serie.  Hasta ahora una serie solo podía llevar un ARCHIVO
--      (`vbt_file_url`). Las métricas quedaban dentro del CSV y había que
--      volver a parsearlo para leer una velocidad. Con las columnas nuevas,
--      la velocidad de una serie es un número consultable: se puede
--      graficar, promediar y comparar sin descargar nada.
--
--   4. vbt_measurements.  Mediciones VBT que NO cuelgan de una serie
--      programada: lo que el coach mete a mano desde la pestaña VBT, o lo
--      que sale de PWR Análisis con un vídeo suelto. Sin esta tabla, medir
--      obligaba a tener el día programado primero, que es justo lo que no
--      pasa cuando se hace un perfil de cargas en una tarde.
--
--   5. Descansos y anotaciones.  Columnas que el código escribe desde hace
--      tiempo y que en bases antiguas pueden no existir.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. COLUMNAS DE session_exercises QUE EL CÓDIGO YA ESCRIBE
-- ---------------------------------------------------------------------
-- `rest_seconds`, `rpe` y `velocity_avg` los escribe el editor del día.
-- `modifiers` lo lee el exportador a PDF. Si falta cualquiera, PostgREST
-- rechaza el INSERT COMPLETO con PGRST204 — no la columna, la fila entera —
-- y copiar una semana falla sin decir por qué.

ALTER TABLE public.session_exercises
    ADD COLUMN IF NOT EXISTS rest_seconds  INTEGER,
    ADD COLUMN IF NOT EXISTS rpe           TEXT,
    ADD COLUMN IF NOT EXISTS velocity_avg  TEXT,
    ADD COLUMN IF NOT EXISTS modifiers     TEXT[],
    ADD COLUMN IF NOT EXISTS vbt_file_url  TEXT;

COMMENT ON COLUMN public.session_exercises.rest_seconds IS
    'Descanso entre series de ESTE ejercicio, en segundos. NULL = sin pautar.';


-- ---------------------------------------------------------------------
-- 1. COMPETICIONES: FUERA DUPLICADOS
-- ---------------------------------------------------------------------
-- "La misma competición" es el mismo atleta, el mismo nombre (sin
-- distinguir mayúsculas ni espacios de sobra) y la misma fecha. Dos
-- competiciones distintas el mismo día en la misma sede tendrían nombres
-- distintos; el mismo nombre el mismo día es siempre la misma.
--
-- Se conserva la fila MÁS COMPLETA, no la más antigua: la que tiene coach,
-- descripción y nivel es la que el coach asignó, y la auto-asignada del
-- atleta suele venir a secas. Perder la descripción pública por quedarnos
-- con la primera sería un retroceso visible en la web.

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY athlete_id, LOWER(TRIM(name)), date
            ORDER BY
                (coach_id IS NOT NULL) DESC,
                (description IS NOT NULL AND LENGTH(TRIM(description)) > 0) DESC,
                (level IS NOT NULL) DESC,
                (location IS NOT NULL) DESC,
                created_at ASC
        ) AS posicion
    FROM public.competitions
)
DELETE FROM public.competitions c
USING ranked r
WHERE c.id = r.id AND r.posicion > 1;

-- Y que no vuelvan a entrar. El índice es la única garantía real: la
-- comprobación del cliente se salta con dos pestañas abiertas.
CREATE UNIQUE INDEX IF NOT EXISTS competitions_unicas_por_atleta
    ON public.competitions (athlete_id, LOWER(TRIM(name)), date);


-- ---------------------------------------------------------------------
-- 2. VOLUMEN: ANULACIÓN POR PRESCRIPCIÓN
-- ---------------------------------------------------------------------
-- Prioridad de clasificación, de más específica a más genérica:
--   session_exercises.primary_muscles  (esta prescripción, este atleta)
--   exercise_library.primary_muscles   (el ejercicio, para todos)
--   reglas por patrón de src/lib/volume/muscles.ts
--
-- NULL significa "no opino, hereda". Un array VACÍO significa "este
-- ejercicio no aporta volumen a nadie", que es una respuesta legítima para
-- un calentamiento o un ejercicio de movilidad metido como ejercicio.

ALTER TABLE public.session_exercises
    ADD COLUMN IF NOT EXISTS primary_muscles   TEXT[],
    ADD COLUMN IF NOT EXISTS secondary_muscles TEXT[];

COMMENT ON COLUMN public.session_exercises.primary_muscles IS
    'Músculos motores de ESTA prescripción. Cada serie cuenta 1.0. NULL = heredar de exercise_library y, si tampoco, de las reglas por patrón.';
COMMENT ON COLUMN public.session_exercises.secondary_muscles IS
    'Sinergistas de ESTA prescripción. Cada serie cuenta INDIRECT_FACTOR.';

-- Los nombres tienen que coincidir EXACTAMENTE con MUSCLE_GROUPS de
-- src/lib/volume/muscles.ts. El cliente descarta en silencio lo que no
-- reconoce, así que una falta de ortografía aquí se traduce en volumen que
-- desaparece del reparto sin avisar. De ahí la restricción.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_exercises_muscles_valid'
    ) THEN
        ALTER TABLE public.session_exercises
            ADD CONSTRAINT session_exercises_muscles_valid CHECK (
                (primary_muscles IS NULL OR primary_muscles <@ ARRAY[
                    'Cuádriceps','Isquiosurales','Glúteo','Aductores','Gemelo','Erectores',
                    'Dorsal','Espalda alta','Trapecio','Pecho','Hombro anterior',
                    'Hombro lateral','Hombro posterior','Tríceps','Bíceps','Antebrazo','Core'
                ]::TEXT[])
                AND
                (secondary_muscles IS NULL OR secondary_muscles <@ ARRAY[
                    'Cuádriceps','Isquiosurales','Glúteo','Aductores','Gemelo','Erectores',
                    'Dorsal','Espalda alta','Trapecio','Pecho','Hombro anterior',
                    'Hombro lateral','Hombro posterior','Tríceps','Bíceps','Antebrazo','Core'
                ]::TEXT[])
            );
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 3. VBT EN LA SERIE: NÚMEROS, NO SOLO UN ARCHIVO
-- ---------------------------------------------------------------------
-- Un CSV de encoder es la MATERIA PRIMA. Lo que se consulta cien veces es
-- el resumen: a qué velocidad se movió esa serie y cuánto cayó dentro de
-- ella. Guardarlo aquí es lo que permite pintar un perfil carga-velocidad
-- de un bloque entero sin descargar treinta ficheros.

ALTER TABLE public.training_sets
    ADD COLUMN IF NOT EXISTS vbt_file_url        TEXT,
    ADD COLUMN IF NOT EXISTS vbt_mean_velocity   NUMERIC(5,3),
    ADD COLUMN IF NOT EXISTS vbt_peak_velocity   NUMERIC(5,3),
    ADD COLUMN IF NOT EXISTS vbt_velocity_loss   NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS vbt_mean_power      NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS vbt_peak_power      NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS vbt_rom             NUMERIC(6,3),
    ADD COLUMN IF NOT EXISTS vbt_est_1rm         NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS vbt_source          TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'training_sets_vbt_source_valid'
    ) THEN
        ALTER TABLE public.training_sets
            ADD CONSTRAINT training_sets_vbt_source_valid CHECK (
                vbt_source IS NULL OR vbt_source IN ('encoder', 'video', 'manual')
            );
    END IF;
END $$;

COMMENT ON COLUMN public.training_sets.vbt_mean_velocity IS
    'Velocidad media concéntrica de la serie, m/s. Es la métrica de referencia en VBT: la propulsiva y la pico se guardan aparte porque no son intercambiables.';
COMMENT ON COLUMN public.training_sets.vbt_velocity_loss IS
    'Pérdida de velocidad DENTRO de la serie, en %. De la primera repetición a la última.';
COMMENT ON COLUMN public.training_sets.vbt_source IS
    'De dónde salen los números: encoder (CSV), video (PWR Análisis) o manual (a mano).';


-- ---------------------------------------------------------------------
-- 4. MEDICIONES VBT SUELTAS
-- ---------------------------------------------------------------------
-- Una medición que no cuelga de una serie programada. Casos reales:
--   · perfil de cargas de una tarde, sin bloque abierto;
--   · un vídeo que manda el atleta por el chat;
--   · un CSV histórico de otro software que se quiere importar.
--
-- `training_set_id` es opcional a propósito: si la medición SÍ corresponde
-- a una serie del plan, se enlaza y se puede leer desde las dos partes.
-- Si no, sigue existiendo por sí sola. Obligar al enlace convertiría el
-- caso normal —medir antes de programar— en imposible.

CREATE TABLE IF NOT EXISTS public.vbt_measurements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- Quién la creó. Puede ser el propio atleta o su entrenador, y saberlo
    -- importa para la trazabilidad de un dato que se usa para decidir cargas.
    created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- El ejercicio se guarda por NOMBRE y no solo por id de biblioteca: una
    -- medición importada puede referirse a un ejercicio que este coach no
    -- tiene creado, y perder el nombre la dejaría inservible.
    exercise_id   UUID REFERENCES public.exercise_library(id) ON DELETE SET NULL,
    exercise_name TEXT NOT NULL CHECK (length(trim(exercise_name)) > 0),

    -- Enlace opcional con el plan.
    training_set_id      UUID REFERENCES public.training_sets(id) ON DELETE SET NULL,
    session_exercise_id  UUID REFERENCES public.session_exercises(id) ON DELETE SET NULL,

    performed_at DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Condiciones de la medición.
    set_number   INTEGER CHECK (set_number IS NULL OR set_number > 0),
    reps         INTEGER CHECK (reps IS NULL OR reps > 0),
    load_kg      NUMERIC(6,2) CHECK (load_kg IS NULL OR load_kg >= 0),

    -- Métricas resumidas. Mismas unidades que en training_sets.
    mean_velocity NUMERIC(5,3),
    peak_velocity NUMERIC(5,3),
    velocity_loss NUMERIC(5,2),
    mean_power    NUMERIC(8,2),
    peak_power    NUMERIC(8,2),
    rom           NUMERIC(6,3),
    est_1rm       NUMERIC(6,2),

    -- Velocidad de CADA repetición, en orden. Es lo que permite dibujar la
    -- caída dentro de la serie, que es el dato que decide si se corta.
    rep_velocities NUMERIC(5,3)[],

    file_url TEXT,
    source   TEXT NOT NULL DEFAULT 'manual'
             CHECK (source IN ('encoder', 'video', 'manual')),
    notes    TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vbt_measurements_atleta_fecha
    ON public.vbt_measurements (athlete_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS vbt_measurements_ejercicio
    ON public.vbt_measurements (athlete_id, exercise_name);
CREATE INDEX IF NOT EXISTS vbt_measurements_serie
    ON public.vbt_measurements (training_set_id)
    WHERE training_set_id IS NOT NULL;

ALTER TABLE public.vbt_measurements ENABLE ROW LEVEL SECURITY;

-- El atleta ve y gestiona lo suyo.
DROP POLICY IF EXISTS vbt_measurements_athlete ON public.vbt_measurements;
CREATE POLICY vbt_measurements_athlete ON public.vbt_measurements
    FOR ALL
    USING (auth.uid() = athlete_id)
    WITH CHECK (auth.uid() = athlete_id);

-- Y su entrenador también. El vínculo vive en coach_athletes, que es la
-- misma puerta que usan el resto de tablas de entrenamiento.
DROP POLICY IF EXISTS vbt_measurements_coach ON public.vbt_measurements;
CREATE POLICY vbt_measurements_coach ON public.vbt_measurements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.coach_athletes ca
            WHERE ca.coach_id = auth.uid()
              AND ca.athlete_id = public.vbt_measurements.athlete_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.coach_athletes ca
            WHERE ca.coach_id = auth.uid()
              AND ca.athlete_id = public.vbt_measurements.athlete_id
        )
    );


-- ---------------------------------------------------------------------
-- 5. ÍNDICES PARA EL REGISTRO DE EJECUCIÓN
-- ---------------------------------------------------------------------
-- La pantalla nueva de "Registro" pregunta por las series HECHAS de un
-- atleta. Sin índice, eso es un recorrido completo de training_sets, que en
-- un club con veinte atletas y un año de histórico son cientos de miles de
-- filas y un timeout garantizado.

CREATE INDEX IF NOT EXISTS training_sets_completadas
    ON public.training_sets (session_exercise_id)
    WHERE is_completed = TRUE;

CREATE INDEX IF NOT EXISTS training_sessions_completadas
    ON public.training_sessions (block_id, completed_at DESC)
    WHERE completed_at IS NOT NULL;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN. Las cinco filas tienen que decir OK.
-- ---------------------------------------------------------------------
SELECT 'session_exercises.primary_muscles' AS comprobacion,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'session_exercises' AND column_name = 'primary_muscles'
       ) THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'session_exercises.rest_seconds',
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'session_exercises' AND column_name = 'rest_seconds'
       ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'training_sets.vbt_mean_velocity',
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'training_sets' AND column_name = 'vbt_mean_velocity'
       ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'tabla vbt_measurements',
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_name = 'vbt_measurements'
       ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'competiciones sin duplicados',
       CASE WHEN EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE indexname = 'competitions_unicas_por_atleta'
       ) THEN 'OK' ELSE 'FALTA' END;
