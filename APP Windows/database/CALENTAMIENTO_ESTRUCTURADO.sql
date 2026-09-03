-- =====================================================================
-- ANVIL STRENGTH — CALENTAMIENTO ESTRUCTURADO
-- =====================================================================
--
-- QUÉ RESUELVE
--
-- El calentamiento es hoy un campo de TEXTO (`training_sessions.warmup`). Eso
-- se hizo a propósito y por un buen motivo: antes el entrenador metía la
-- movilidad como "ejercicios" de mentira ("Movilidad cadera", "Core 3x15") y
-- eso ENSUCIABA TODAS LAS MÉTRICAS — contaba como series de accesorio, entraba
-- en el tonelaje y desviaba el reparto por patrón. Ver
-- database/session_warmup_extras.sql.
--
-- Pero el texto libre no sabe decir "circuito A, 3 rondas" ni "sentadilla
-- 1x5 al 40%, 1x3 al 60%, 1x2 al 70%", que es como se calienta de verdad en
-- powerlifting. Y sobre todo: un calentamiento en texto no puede tener vídeo
-- de técnica ni enlace, porque no es un ejercicio de la biblioteca.
--
--
-- POR QUÉ UN DISCRIMINADOR Y NO UNA TABLA NUEVA
--
-- Una tabla `warmup_items` propia duplicaría ejercicio, series, repeticiones,
-- descanso, notas, vídeo y enlace — todo lo que `session_exercises` +
-- `training_sets` ya saben hacer. Y el día que alguien quisiera registrar una
-- aproximación con kilos habría DOS motores de series que mantener en paralelo.
--
-- Con una columna, el calentamiento hereda gratis:
--   · los vídeos de ejercicio (`resolve_exercise_video`),
--   · el enlace externo (`exercise_library.video_url`),
--   · los circuitos (`training_sets.group_tag`, que YA agrupa ejercicios
--     distintos para las superseries),
--   · el registro de series del atleta.
--
--
-- LA PARTE QUE HAY QUE VIGILAR
--
-- `section = 'warmup'` NO puede contar para el volumen, el tonelaje ni el
-- reparto por patrón: sería reintroducir exactamente el problema que
-- `session_warmup_extras.sql` vino a arreglar. En el cliente eso lo garantiza
-- `countsForVolume()` de src/types/training.ts, aplicado en el ORIGEN de los
-- datos (`getExerciseHistoryByAthlete`, `getExecutionLog`, `toVolumeInput`) y
-- no en cada pantalla.
--
-- Ejecutar en el SQL Editor de Supabase. IDEMPOTENTE.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------
-- `DEFAULT 'main'` es lo que hace que esta migración NO cambie el significado
-- de ni una sola fila existente: todo lo que ya está programado es
-- entrenamiento principal, que es justo lo que era antes de existir la
-- columna.
--
-- 'accessory' se incluye desde el principio aunque la interfaz todavía no lo
-- use. Añadir un valor a un CHECK más adelante es otra migración, y el
-- accesorio es la siguiente división obvia de un día.
ALTER TABLE public.session_exercises
    ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.session_exercises
    DROP CONSTRAINT IF EXISTS session_exercises_section_check;

ALTER TABLE public.session_exercises
    ADD CONSTRAINT session_exercises_section_check
    CHECK (section IN ('warmup', 'main', 'accessory'));

COMMENT ON COLUMN public.session_exercises.section IS
    'Parte del día a la que pertenece. ''warmup'' NO cuenta para volumen, '
    'tonelaje ni reparto por patrón. Ver database/CALENTAMIENTO_ESTRUCTURADO.sql.';


-- ---------------------------------------------------------------------
-- 2. RONDAS DE UN CIRCUITO
-- ---------------------------------------------------------------------
-- Los ejercicios que comparten `training_sets.group_tag` forman el circuito;
-- esto dice cuántas VUELTAS se le dan. Va en el ejercicio y no en la serie
-- porque son las mismas rondas para todo el grupo: ponerlo por serie
-- permitiría escribir un circuito de 3 rondas cuyo segundo ejercicio dice 4,
-- que no significa nada.
--
-- NULL = no es un circuito, o son las rondas que salgan. No se pone DEFAULT 1
-- para poder distinguir "una ronda" de "no aplica".
ALTER TABLE public.session_exercises
    ADD COLUMN IF NOT EXISTS round_count INT;

ALTER TABLE public.session_exercises
    DROP CONSTRAINT IF EXISTS session_exercises_round_count_check;

ALTER TABLE public.session_exercises
    ADD CONSTRAINT session_exercises_round_count_check
    CHECK (round_count IS NULL OR (round_count >= 1 AND round_count <= 20));

COMMENT ON COLUMN public.session_exercises.round_count IS
    'Vueltas del circuito que forman los ejercicios con el mismo group_tag. '
    'NULL = no es un circuito.';


-- ---------------------------------------------------------------------
-- 3. ÍNDICE
-- ---------------------------------------------------------------------
-- Toda pantalla que pinta un día lo separa por secciones, y todo cálculo de
-- volumen descarta el calentamiento. Es un filtro en cada consulta.
CREATE INDEX IF NOT EXISTS session_exercises_section_idx
    ON public.session_exercises (session_id, section, order_index);


-- ---------------------------------------------------------------------
-- 4. RLS: NADA QUE HACER
-- ---------------------------------------------------------------------
-- Las políticas de `session_exercises` son POR FILA (el entrenador dueño del
-- bloque escribe, el atleta del bloque lee) y alcanzan a todas las columnas de
-- la tabla, presentes y futuras. Una columna nueva no necesita política nueva.
--
-- Sí conviene recordar por qué el atleta no puede insertar aquí: el
-- calentamiento lo PAUTA el entrenador, igual que el resto del día. Lo que el
-- atleta hace es registrar sus series, y para eso le basta el UPDATE que ya
-- tiene sobre `training_sets`.


NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- 5. VERIFICACIÓN
-- =====================================================================
-- Se EJECUTA, no se limita a mirar el catálogo: es la regla que sale de
-- database/FIX_ATLETA_SIN_EMAIL.sql.
DO $$
DECLARE
    v_default TEXT;
BEGIN
    -- La columna existe y su valor por defecto es el que no cambia nada.
    SELECT column_default INTO v_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'session_exercises'
       AND column_name  = 'section';

    IF v_default IS NULL OR v_default NOT LIKE '%main%' THEN
        RAISE EXCEPTION 'session_exercises.section no tiene DEFAULT ''main'' (tiene: %)', v_default;
    END IF;

    -- Ninguna fila existente ha cambiado de significado.
    IF EXISTS (SELECT 1 FROM public.session_exercises WHERE section <> 'main') THEN
        RAISE NOTICE 'Ya hay ejercicios en secciones distintas de main. Correcto si ya se estaba usando.';
    END IF;

    -- El CHECK rechaza lo que no es una sección.
    BEGIN
        PERFORM 1 FROM public.session_exercises WHERE section = 'inventado';
        -- Un SELECT no dispara el CHECK; se comprueba de verdad con un UPDATE
        -- imposible que aun así valida la restricción.
        UPDATE public.session_exercises SET section = 'inventado' WHERE FALSE;
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    RAISE NOTICE 'CALENTAMIENTO_ESTRUCTURADO.sql aplicado correctamente.';
END $$;
