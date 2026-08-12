-- =====================================================================
-- ANVIL STRENGTH — REESTRUCTURACIÓN DE AGOSTO 2026
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- Todo el SQL de un solo plan (docs/PLAN_REESTRUCTURACION_2026-08-12.md) en
-- un único archivo, con verificación al final. Es la regla que ya costó caro
-- una vez: una columna que el cliente escribe y que la base no tiene hace que
-- PostgREST rechace el LOTE ENTERO con PGRST204, en silencio, y repartir el
-- SQL en varios ficheros es como se pierde la cuenta de cuál falta.
--
-- QUÉ TRAE
--   1. profiles.coach_prefs   — personalización del entrenador (colores,
--      opacidad por intensidad, programación). Mismo patrón que pdf_theme.
--   2. profiles.athlete_prefs — override del atleta: solo unidad y primer
--      día de la semana, que es lo único que varía por persona y no por
--      quien programa (decidido el 12/08/2026, ver memoria del proyecto).
--   3. athlete_payments       — registro de pagos. Semáforo, no pasarela:
--      esto NO cobra nada, solo avisa. Nunca corta el acceso.
--   4. competition_results    — resultado de una competición ya disputada.
--      Tabla propia y no columnas en `competitions`: esa tabla también
--      guarda el calendario oficial de la AEP, que no tiene resultados.
--   5. form_templates.intro   — indicación general del check-in.
--   6. coach_athletes.notes   — notas privadas del entrenador sobre ESTE
--      atleta. Es de la RELACIÓN, no de ninguno de los dos perfiles: un
--      atleta con dos entrenadores (nutrición y fuerza) tiene una nota
--      distinta para cada uno.
--
-- DEPENDE DE (para que las políticas de pagos funcionen):
--   database/INFORMACION_PERSONAL.sql — define manages_athlete(), que este
--   archivo REUTILIZA (no la redefine) para no tener dos copias de una
--   función de seguridad divergiendo con el tiempo. Si no está aplicada
--   todavía, créala primero: la sección 3 de aquí fallará con "function
--   manages_athlete does not exist" y no con un error más críptico.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PREFERENCIAS DEL ENTRENADOR
-- ---------------------------------------------------------------------
-- Un JSONB y no una columna por ajuste, por la misma razón que pdf_theme:
-- esto es una decisión de producto que cambia cada dos semanas, y una
-- columna por retoque convierte cada uno en una migración. El contrato
-- vive en el cliente (src/lib/prefs/contract.ts) y se resuelve con
-- valores por defecto para lo que falte — un coach_prefs guardado hoy
-- sigue abriendo aunque el contrato crezca mañana.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS coach_prefs JSONB;

COMMENT ON COLUMN public.profiles.coach_prefs IS
    'Personalización del entrenador: colores por sección, opacidad por intensidad, ajustes de programación. Contrato: src/lib/prefs/contract.ts. Siempre parcial.';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_coach_prefs_is_object;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_coach_prefs_is_object
    CHECK (coach_prefs IS NULL OR jsonb_typeof(coach_prefs) = 'object');

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_coach_prefs_size;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_coach_prefs_size
    CHECK (coach_prefs IS NULL OR pg_column_size(coach_prefs) <= 8192);

-- El atleta hereda las preferencias visuales de SU entrenador (mismo
-- mecanismo que ya usa coach_brand_color en src/hooks/useUser.ts), así que
-- tiene que poder leer esta columna del perfil de su coach. No hace falta
-- política nueva: profiles_read_managed / la política de lectura del coach
-- ya deja ver esa fila para sacar nombre, color y logo; esto es una columna
-- más de la misma fila. Escribirla solo puede su dueño.


-- ---------------------------------------------------------------------
-- 2. PREFERENCIAS DEL ATLETA (override)
-- ---------------------------------------------------------------------
-- Deliberadamente MÍNIMO: solo lo que varía por persona y no por quien
-- programa. Unidad (kg/lb) y primer día de la semana. Todo lo demás
-- (colores, opacidad, ajustes de programación) es SIEMPRE del entrenador.
-- Si en el futuro aparece la tentación de meter algo más aquí, el criterio
-- que ya se decidió es ese: solo lo que depende de la persona, no del gusto
-- de quien programa.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS athlete_prefs JSONB;

COMMENT ON COLUMN public.profiles.athlete_prefs IS
    'Override personal del atleta: unidad de peso y primer día de la semana. Nada más. Contrato: src/lib/prefs/contract.ts.';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_athlete_prefs_is_object;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_athlete_prefs_is_object
    CHECK (athlete_prefs IS NULL OR jsonb_typeof(athlete_prefs) = 'object');

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_athlete_prefs_size;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_athlete_prefs_size
    CHECK (athlete_prefs IS NULL OR pg_column_size(athlete_prefs) <= 2048);


-- ---------------------------------------------------------------------
-- 3. CONTROL DE PAGOS
-- ---------------------------------------------------------------------
-- UNA FILA POR PAGO, no una columna "pagado_hasta" que se sobrescribe.
-- "Pagado hasta" = MAX(paid_until) de las filas del atleta. El histórico
-- sale gratis (cuántos meses lleva pagando puntual) y renovar no destruye
-- el pago anterior. Es la misma decisión que ya se tomó en
-- athlete_profile_data para el peso corporal: el dato con fecha vale más
-- que el dato "actual".
--
-- ESTO NO ES UNA PASARELA DE COBRO. Es un registro manual: el coach anota
-- que ha cobrado, y la app calcula el semáforo. Nada aquí mueve dinero.
CREATE TABLE IF NOT EXISTS public.athlete_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    coach_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Hasta cuándo cubre ESTE pago. Es la fecha que se compara con hoy
    -- para el semáforo, no la fecha en que se pagó.
    paid_until  DATE NOT NULL,

    amount      NUMERIC(10, 2),
    currency    TEXT NOT NULL DEFAULT 'EUR',
    method      TEXT,
    note        TEXT,

    created_by  UUID NOT NULL REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS athlete_payments_athlete_idx
    ON public.athlete_payments (athlete_id, paid_until DESC);

ALTER TABLE public.athlete_payments ENABLE ROW LEVEL SECURITY;

-- El entrenador gestiona los pagos de SUS atletas. manages_athlete() es la
-- función SECURITY DEFINER de INFORMACION_PERSONAL.sql: una comprobación
-- que salta a coach_athletes NO puede ir suelta dentro de la política, o
-- Postgres evalúa las políticas de coach_athletes anidadas dentro de las de
-- esta tabla en cada fila — es exactamente lo que hizo que guardar una sola
-- serie tardara segundos (ver database/FIX_TIMEOUT_SERIES.sql).
DROP POLICY IF EXISTS "athlete_payments_coach_manage" ON public.athlete_payments;
CREATE POLICY "athlete_payments_coach_manage" ON public.athlete_payments
    FOR ALL
    USING (public.manages_athlete(athlete_id))
    WITH CHECK (public.manages_athlete(athlete_id) AND coach_id = (SELECT auth.uid()));

-- El atleta SOLO lee los suyos. Nunca escribe: registrar un pago es cosa
-- del entrenador.
DROP POLICY IF EXISTS "athlete_payments_athlete_read" ON public.athlete_payments;
CREATE POLICY "athlete_payments_athlete_read" ON public.athlete_payments
    FOR SELECT
    USING (athlete_id = (SELECT auth.uid()));


-- ---------------------------------------------------------------------
-- 4. RESULTADOS DE COMPETICIÓN
-- ---------------------------------------------------------------------
-- Tabla propia, no columnas en `competitions`. Esa tabla guarda DOS cosas
-- distintas bajo el mismo nombre: el calendario oficial de la AEP
-- (athlete_id NULL, público) y las competiciones asignadas a un atleta. Ni
-- una ni otra tienen resultado hasta que se disputan, y meter aquí "peso en
-- báscula" y "total" habría dejado esas columnas NULL en las 19 filas del
-- calendario público de por vida.
CREATE TABLE IF NOT EXISTS public.competition_results (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    athlete_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    bodyweight_kg  NUMERIC(5, 2),
    squat_kg       NUMERIC(6, 2),
    bench_kg       NUMERIC(6, 2),
    deadlift_kg    NUMERIC(6, 2),
    total_kg       NUMERIC(6, 2),
    dots           NUMERIC(6, 2),
    place          TEXT,
    notes          TEXT,

    created_by     UUID NOT NULL REFERENCES public.profiles(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (competition_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS competition_results_athlete_idx
    ON public.competition_results (athlete_id);

ALTER TABLE public.competition_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competition_results_coach_manage" ON public.competition_results;
CREATE POLICY "competition_results_coach_manage" ON public.competition_results
    FOR ALL
    USING (public.manages_athlete(athlete_id))
    WITH CHECK (public.manages_athlete(athlete_id));

DROP POLICY IF EXISTS "competition_results_athlete_read" ON public.competition_results;
CREATE POLICY "competition_results_athlete_read" ON public.competition_results
    FOR SELECT
    USING (athlete_id = (SELECT auth.uid()));


-- ---------------------------------------------------------------------
-- 5. DESCRIPCIÓN DEL CHECK-IN
-- ---------------------------------------------------------------------
-- Los campos por pregunta (`help`, `scale.minLabel/maxLabel`) NO necesitan
-- columna: `form_templates.questions` ya es JSONB sin esquema fijo, así que
-- añadirlos es solo escribir claves nuevas desde el cliente. La única
-- columna real que hace falta es la indicación GENERAL del formulario, que
-- no pertenecía a ninguna pregunta.
ALTER TABLE public.form_templates
    ADD COLUMN IF NOT EXISTS intro TEXT;

COMMENT ON COLUMN public.form_templates.intro IS
    'Indicación general del check-in ("rellénalo la noche anterior..."), antes de la lista de preguntas.';


-- ---------------------------------------------------------------------
-- 6. NOTAS DEL ENTRENADOR SOBRE EL ATLETA
-- ---------------------------------------------------------------------
-- En `coach_athletes`, no en `profiles`. Es una nota de la RELACIÓN: un
-- atleta con entrenador de fuerza y nutricionista tiene una nota para cada
-- uno, y si viviera en el perfil del atleta el segundo pisaría la del
-- primero. El atleta NO la ve — a diferencia de las notas por serie y por
-- sesión, que sí son suyas.
ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.coach_athletes.notes IS
    'Notas privadas del entrenador sobre este atleta. El atleta no las ve. Ver Datos > coach_athletes.notes.';

-- Sin política nueva: coach_athletes ya solo la puede tocar el propio coach
-- de esa fila (comprobar que las políticas existentes cubren UPDATE, no
-- solo SELECT/INSERT — si no, añadir aquí un
-- "coach_athletes_coach_update_notes" acotado a auth.uid() = coach_id).


-- ---------------------------------------------------------------------
-- 7. VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Cada fila tiene que decir OK. Si alguna falla, ese es el problema — no
-- "ejecuta todo otra vez".
DO $$
DECLARE
    v_count INT;
BEGIN
    -- 7.1 Columnas de profiles
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name IN ('coach_prefs', 'athlete_prefs');
    IF v_count = 2 THEN
        RAISE NOTICE '7.1 profiles.coach_prefs / athlete_prefs: OK';
    ELSE
        RAISE WARNING '7.1 FALTAN columnas en profiles (% de 2 encontradas)', v_count;
    END IF;

    -- 7.2 athlete_payments existe y manages_athlete() responde
    PERFORM public.manages_athlete('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE NOTICE '7.2 manages_athlete() ejecuta sin error: OK';

    -- 7.3 competition_results
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'competition_results';
    IF v_count = 1 THEN
        RAISE NOTICE '7.3 competition_results: OK';
    ELSE
        RAISE WARNING '7.3 FALTA la tabla competition_results';
    END IF;

    -- 7.4 form_templates.intro
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'form_templates'
          AND column_name = 'intro';
    IF v_count = 1 THEN
        RAISE NOTICE '7.4 form_templates.intro: OK';
    ELSE
        RAISE WARNING '7.4 FALTA form_templates.intro';
    END IF;

    -- 7.5 coach_athletes.notes
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'coach_athletes'
          AND column_name = 'notes';
    IF v_count = 1 THEN
        RAISE NOTICE '7.5 coach_athletes.notes: OK';
    ELSE
        RAISE WARNING '7.5 FALTA coach_athletes.notes';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
