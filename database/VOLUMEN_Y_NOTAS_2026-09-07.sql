-- =====================================================================
-- ANVIL STRENGTH — OBJETIVOS DE VOLUMEN SEMANAL Y NOTA DE SEMANA
-- =====================================================================
-- Idempotente. Ejecutar DESPUÉS de SECURITY_HARDENING.sql (usa
-- public.shares_coaching_link, que se define allí) y de
-- create_training_weeks.sql.
--
-- Dos cosas independientes que van juntas porque las dos son del mismo
-- trabajo del 7 de septiembre de 2026 y las dos son aditivas: ninguna
-- reescribe ni borra nada.
--
--   1. `training_weeks.notes`  — la nota rápida del entrenador POR SEMANA.
--   2. `volume_targets`        — cuánto volumen se quiere por movimiento.
--
-- LAS DOS DEGRADAN CON ELEGANCIA. Sin ejecutar esto, el constructor sigue
-- funcionando igual que hoy: la caja de notas de la semana no guarda (y lo
-- dice) y el panel de volumen semanal enseña las series programadas sin
-- objetivo contra el que compararlas, que es exactamente lo que enseña
-- ahora.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. NOTA RÁPIDA DE LA SEMANA
-- ---------------------------------------------------------------------
-- POR QUÉ AQUÍ Y NO EN UNA TABLA NUEVA
-- Ya hay notas en tres niveles y todas viven pegadas a lo que anotan:
--   training_sets.notes         — una serie
--   session_exercises.notes     — un ejercicio ("usar cinturón")
--   training_sessions.appendix  — un día
--   coach_athletes.notes        — la relación, PRIVADA del coach
-- Faltaba el nivel de la SEMANA, que es donde caben las instrucciones que
-- no son de un ejercicio concreto ("semana de descarga, no pasar de RPE
-- 7"). `training_weeks` ya existe, ya tiene una fila por semana tocada y
-- ya tiene la RLS correcta. Una tabla nueva sería un cuarto sitio donde
-- buscar la misma clase de texto.
--
-- LA VE EL ATLETA. A diferencia de `coach_athletes.notes`, que es la
-- libreta privada del entrenador: los ejemplos que motivan esto ("si la
-- primera serie sale lenta, baja un 2,5%") son instrucciones PARA el
-- atleta. La política de SELECT de training_weeks ya deja leer al atleta
-- del bloque, así que no hay nada que añadir.
ALTER TABLE public.training_weeks
    ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.training_weeks.notes IS
    'Nota del entrenador para toda la semana. La ve el atleta. Ver database/VOLUMEN_Y_NOTAS_2026-09-07.sql';


-- ---------------------------------------------------------------------
-- 2. OBJETIVOS DE VOLUMEN
-- ---------------------------------------------------------------------
-- QUÉ GUARDA
-- "Sentadilla: 12 series y 100 repeticiones a la semana". El entrenador lo
-- fija y el constructor va descontando mientras programa.
--
-- POR QUÉ NO ES `training_goals`, QUE YA EXISTE
-- Son dos preguntas distintas y mezclarlas haría las dos peor.
-- `training_goals` guarda RENDIMIENTO ("Sentadilla, 5x5x270 kg": hacia
-- dónde se lleva al atleta) y es del coach, no lo ve el atleta. Esto
-- guarda un PRESUPUESTO de trabajo por semana, se compara contra lo
-- programado —no contra lo levantado— y no tiene nada que ver con si el
-- atleta se acerca o no a una marca.
--
-- POR QUÉ `metric` ES TEXTO Y NO UNA COLUMNA POR MÉTRICA
-- Mismo modelo que `metric_definitions`: añadir "tonelaje" o "distancia"
-- tiene que ser un INSERT, nunca un ALTER TABLE. Con una columna por
-- métrica, cada idea nueva sería una migración y una fila con nueve
-- casillas vacías. Aquí una fila es (movimiento, métrica, objetivo), así
-- que "12 series y 100 reps de sentadilla" son DOS filas y añadir
-- tonelaje es una tercera.
--
-- La prioridad de esta primera entrega es `series` y `reps`; el resto del
-- vocabulario se admite desde ya para que no haga falta volver aquí.
--
-- QUÉ ES `scope` Y POR QUÉ HAY DOS
-- 'lift'      — un básico entero: SQ, BP o DL. Cuenta TODAS sus variantes
--               de competición según classifyMainLift() (src/lib/planning/
--               mainLift.ts), que es el clasificador que ya usa el panel.
--               Es lo que quiere decir un coach con "12 series de
--               sentadilla a la semana".
-- 'exercise'  — un ejercicio concreto, por su nombre normalizado con
--               exerciseKey(). Para cuando el objetivo es "8 series de
--               remo con barra" y no "8 series de espalda".
--
-- Se guardan los dos casos en la misma tabla, con `scope` diciendo cómo
-- leer `scope_key`, en vez de dos tablas: la cuenta, la RLS y la pantalla
-- son las mismas, y lo único que cambia es a qué se parece la clave.
CREATE TABLE IF NOT EXISTS public.volume_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    coach_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Ámbito temporal. NULL en `block_id` = vale para todos los bloques de
    -- ese atleta (el objetivo de fondo). NULL en `week_number` = vale para
    -- todas las semanas del bloque. Una semana concreta gana sobre el
    -- objetivo del bloque, y el del bloque sobre el general — la
    -- resolución la hace el cliente, ver src/lib/volume/objetivos.ts.
    block_id    UUID REFERENCES public.training_blocks(id) ON DELETE CASCADE,
    week_number INT CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 53),

    scope     TEXT NOT NULL CHECK (scope IN ('lift', 'exercise')),
    -- 'SQ' | 'BP' | 'DL' si scope='lift'; exerciseKey(nombre) si 'exercise'.
    scope_key TEXT NOT NULL CHECK (length(scope_key) BETWEEN 1 AND 120),
    -- Cómo se llama en pantalla. Se guarda para no depender de que el
    -- ejercicio siga existiendo en la biblioteca con el mismo nombre.
    label     TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),

    metric TEXT NOT NULL CHECK (metric IN (
        'series',            -- prioridad de esta entrega
        'reps',              -- prioridad de esta entrega
        'tonelaje_kg',
        'volumen_relativo',  -- series ponderadas por intensidad
        'distancia_km',
        'duracion_seg'
    )),
    target NUMERIC(10,2) NOT NULL CHECK (target > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un objetivo por (atleta, ámbito, movimiento, métrica). El upsert del
-- cliente se apoya en este índice, así que tiene que ser ÚNICO y tiene que
-- tratar los NULL como iguales — de ahí el `COALESCE`: en PostgreSQL dos
-- NULL no chocan en un índice único, y sin esto "Sentadilla · series · sin
-- bloque" se podría escribir dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS volume_targets_unico
    ON public.volume_targets (
        athlete_id,
        COALESCE(block_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(week_number, -1),
        scope,
        scope_key,
        metric
    );

CREATE INDEX IF NOT EXISTS volume_targets_athlete_idx
    ON public.volume_targets (athlete_id);
CREATE INDEX IF NOT EXISTS volume_targets_block_idx
    ON public.volume_targets (block_id) WHERE block_id IS NOT NULL;

ALTER TABLE public.volume_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volume_targets_select ON public.volume_targets;
DROP POLICY IF EXISTS volume_targets_insert ON public.volume_targets;
DROP POLICY IF EXISTS volume_targets_update ON public.volume_targets;
DROP POLICY IF EXISTS volume_targets_delete ON public.volume_targets;

-- LO VE EL ATLETA, al contrario que `training_goals`.
-- Un presupuesto de series no es información táctica que haya que
-- esconder: es lo que explica por qué esta semana toca menos volumen, y el
-- atleta ya ve las series programadas una a una de todas formas. Lo que
-- NO puede es tocarlo — solo escribe su coach.
CREATE POLICY volume_targets_select ON public.volume_targets
    FOR SELECT TO authenticated
    USING (athlete_id = (SELECT auth.uid()) OR public.shares_coaching_link(athlete_id));

-- Escribir: solo el coach, y solo sobre atletas con los que comparte
-- relación activa. `coach_id` se comprueba también en USING además de en
-- WITH CHECK para que nadie mueva una fila ajena a su propio coach_id.
CREATE POLICY volume_targets_insert ON public.volume_targets
    FOR INSERT TO authenticated
    WITH CHECK (
        coach_id = (SELECT auth.uid())
        AND public.shares_coaching_link(athlete_id)
    );

CREATE POLICY volume_targets_update ON public.volume_targets
    FOR UPDATE TO authenticated
    USING (coach_id = (SELECT auth.uid()))
    WITH CHECK (
        coach_id = (SELECT auth.uid())
        AND public.shares_coaching_link(athlete_id)
    );

CREATE POLICY volume_targets_delete ON public.volume_targets
    FOR DELETE TO authenticated
    USING (coach_id = (SELECT auth.uid()));

-- Permisos de TABLA. No los cubre la RLS: sin esto, `anon` conserva lo que
-- le diera el GRANT por defecto del esquema. Ver la lección de
-- CALENDARIO_Y_MARCAS_2026-08-30.sql.
REVOKE ALL ON public.volume_targets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volume_targets TO authenticated;

-- `updated_at` al día sin que el cliente tenga que acordarse.
CREATE OR REPLACE FUNCTION public.tocar_volume_targets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS volume_targets_touch ON public.volume_targets;
CREATE TRIGGER volume_targets_touch
    BEFORE UPDATE ON public.volume_targets
    FOR EACH ROW EXECUTE FUNCTION public.tocar_volume_targets();


-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Las dos comprobaciones EJECUTAN, no solo miran el catálogo: PostgreSQL no
-- valida los nombres de columna del cuerpo de una función plpgsql al
-- crearla, así que un CREATE que pasa sin quejarse no prueba nada. Ver la
-- lección de FIX_ATLETA_SIN_EMAIL.sql.

SELECT 'training_weeks.notes' AS comprobacion,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'training_weeks'
             AND column_name = 'notes'
       ) THEN 'OK' ELSE 'FALTA' END AS estado;

SELECT 'volume_targets' AS comprobacion,
       count(*) AS filas
  FROM public.volume_targets;

-- Y que el índice único de verdad impide el duplicado. Si esto NO da error,
-- el COALESCE del índice no está haciendo su trabajo.
DO $$
BEGIN
    RAISE NOTICE 'volume_targets: índice único %',
        (SELECT CASE WHEN count(*) = 1 THEN 'presente' ELSE 'AUSENTE' END
           FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'volume_targets_unico');
END $$;
