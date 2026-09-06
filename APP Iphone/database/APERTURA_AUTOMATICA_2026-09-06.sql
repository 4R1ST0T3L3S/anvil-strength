-- =====================================================================
-- ANVIL — EL INTERRUPTOR DE SEMANA PASA A SER "ABRIR YA", NO "PUBLICAR"
-- =====================================================================
-- Idempotente. Ejecutar entero en Supabase Dashboard -> SQL Editor.
-- Sustituye a la definición que dejó FIX_SEMANA_PUBLICADA_2026-09-05.sql.
-- No toca ninguna política: las tres del atleta llaman a esta función por
-- nombre y siguen igual.
--
--
-- LO QUE SE PIDE
--
-- "Que yo tenga todo oculto si quiero y se abra automáticamente sin que
-- esté yo pendiente."
--
-- O sea: el entrenador no quiere tener que acordarse de publicar cada
-- semana el domingo por la noche. Quiere programar el bloque entero, dejarlo
-- cerrado, y que cada semana se abra sola los días de antelación que él haya
-- fijado en `release_offset_days`. Y si algún día quiere adelantar una
-- semana concreta, que pueda abrirla a mano y que eso anule la espera.
--
--
-- CÓMO QUEDA
--
--   is_visible = TRUE   -> ABIERTA YA. El coach la ha adelantado a mano y
--                          eso manda sobre la fecha.
--   is_visible = FALSE  -> la decide el CALENDARIO.
--   sin fila            -> la decide el CALENDARIO.
--
-- Las dos últimas son ahora lo mismo, y es a propósito: "cerrada" pasa a
-- significar "todavía no le toca", no "no la verá nunca".
--
--
-- LO QUE SE PIERDE, Y HAY QUE SABERLO
--
-- Ya NO se puede ocultar una semana de forma permanente. Antes,
-- `is_visible = FALSE` la tapaba para siempre aunque su fecha hubiera
-- pasado; ahora, en cuanto llegue su lunes (menos `release_offset_days`), el
-- atleta la verá, esté escrita o esté a medias.
--
-- Si algún día hace falta volver a tener ese candado, la forma de hacerlo
-- SIN romper esto es añadir un tercer estado a `training_weeks` —una columna
-- `bloqueada BOOLEAN`, por ejemplo— en vez de reutilizar `is_visible` para
-- dos cosas distintas, que es justo lo que hacía que el botón mintiera.
--
-- Mientras tanto, para que una semana no se abra sola hay dos salidas
-- limpias: no crearla hasta que esté lista, o subir `release_offset_days`
-- a 0 para que abra el mismo lunes y no antes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.week_is_released(p_block_id UUID, p_week_number INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_visible        BOOLEAN;
    v_offset         INTEGER;
    v_start          DATE;
    v_first_monday   DATE;
    v_start_week     INTEGER;
    v_start_isoyear  INTEGER;
    v_weeks_in_year  INTEGER;
    v_delta          INTEGER;
    v_week_monday    DATE;
BEGIN
    -- -----------------------------------------------------------------
    -- 1. ¿LA HA ADELANTADO EL COACH A MANO?
    -- -----------------------------------------------------------------
    -- Solo TRUE corta aquí. FALSE ya no oculta: cae al calendario igual que
    -- si no hubiera fila, que es lo que convierte el interruptor en un
    -- "abrir ya" en vez de un "publicar/ocultar".
    SELECT is_visible INTO v_visible
      FROM public.training_weeks
     WHERE block_id = p_block_id AND week_number = p_week_number;

    IF v_visible IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- -----------------------------------------------------------------
    -- 2. SI NO, MANDA EL CALENDARIO.
    -- -----------------------------------------------------------------
    SELECT COALESCE(release_offset_days, 1), start_date
      INTO v_offset, v_start
      FROM public.training_blocks
     WHERE id = p_block_id;

    IF NOT FOUND THEN
        RETURN FALSE;   -- bloque inexistente: no hay nada que enseñar
    END IF;

    IF v_start IS NULL THEN
        RETURN TRUE;    -- sin fecha de inicio no se puede calcular: no se bloquea
    END IF;

    -- Lunes de la semana en que arranca el bloque. ISODOW: lunes = 1.
    -- `v_start` está declarada DATE aunque la columna sea TIMESTAMPTZ:
    -- PL/pgSQL hace la conversión al asignar.
    v_first_monday  := v_start - (EXTRACT(ISODOW FROM v_start)::INTEGER - 1);

    -- EXTRACT(WEEK) en PostgreSQL YA es la semana ISO, la misma numeración
    -- que usa getWeekNumber() en el navegador.
    v_start_week    := EXTRACT(WEEK    FROM v_start)::INTEGER;
    v_start_isoyear := EXTRACT(ISOYEAR FROM v_start)::INTEGER;

    -- Cuántas semanas ISO tiene ese año: 52 casi siempre, 53 algunos. El 28
    -- de diciembre cae por definición en la última semana ISO del año.
    v_weeks_in_year := EXTRACT(WEEK FROM make_date(v_start_isoyear, 12, 28))::INTEGER;

    v_delta := p_week_number - v_start_week;
    IF v_delta < 0 THEN
        v_delta := v_delta + v_weeks_in_year;   -- el bloque cruza el fin de año
    END IF;

    v_week_monday := v_first_monday + (v_delta * 7);

    RETURN CURRENT_DATE >= (v_week_monday - v_offset);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.week_is_released(UUID, INTEGER) IS
    'TRUE si el atleta puede leer esa semana. training_weeks.is_visible = TRUE la ADELANTA (anula la espera); FALSE o sin fila la deja al calendario, que la abre release_offset_days antes de su lunes. Desde 06/09/2026 no existe el ocultar permanente.';


-- =====================================================================
-- COMPROBACIÓN
-- =====================================================================
-- No deja rastro: crea un bloque de mentira, hace las preguntas y lo borra.
DO $comprobacion$
DECLARE
    v_perfil  UUID;
    v_bloque  UUID;
    v_semana  INTEGER;
    v_futura  INTEGER;
    v_pasada  INTEGER;
    r         BOOLEAN;
BEGIN
    SELECT id INTO v_perfil FROM public.profiles LIMIT 1;
    IF v_perfil IS NULL THEN
        RAISE NOTICE 'Sin perfiles en la base: se omite la comprobación.';
        RETURN;
    END IF;

    v_semana := EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER;
    v_futura := v_semana + 3;
    v_pasada := v_semana - 2;

    INSERT INTO public.training_blocks (name, coach_id, athlete_id, start_date, start_week, release_offset_days, is_active)
    VALUES ('__comprobacion_apertura__', v_perfil, v_perfil, CURRENT_DATE - 14, v_pasada, 1, FALSE)
    RETURNING id INTO v_bloque;

    -- a) Semana futura sin tocar: cerrada, todavía no le toca.
    IF public.week_is_released(v_bloque, v_futura) THEN
        RAISE EXCEPTION 'FALLO: una semana futura sale abierta';
    END IF;

    -- b) Esa misma, adelantada a mano: se abre. El interruptor anula la espera.
    INSERT INTO public.training_weeks (block_id, week_number, is_visible)
    VALUES (v_bloque, v_futura, TRUE)
    ON CONFLICT (block_id, week_number) DO UPDATE SET is_visible = TRUE;
    IF NOT public.week_is_released(v_bloque, v_futura) THEN
        RAISE EXCEPTION 'FALLO: una semana adelantada a mano sigue cerrada';
    END IF;

    -- c) EL CAMBIO DE HOY: una semana marcada FALSE cuya fecha YA pasó se
    --    abre igual. Antes esto devolvía FALSE para siempre.
    INSERT INTO public.training_weeks (block_id, week_number, is_visible)
    VALUES (v_bloque, v_pasada, FALSE)
    ON CONFLICT (block_id, week_number) DO UPDATE SET is_visible = FALSE;
    IF NOT public.week_is_released(v_bloque, v_pasada) THEN
        RAISE EXCEPTION 'FALLO: una semana cerrada a mano no se abre sola al llegarle la fecha';
    END IF;

    -- d) Y una futura marcada FALSE sigue cerrada: la fecha aún no ha llegado.
    INSERT INTO public.training_weeks (block_id, week_number, is_visible)
    VALUES (v_bloque, v_futura + 5, FALSE)
    ON CONFLICT (block_id, week_number) DO UPDATE SET is_visible = FALSE;
    IF public.week_is_released(v_bloque, v_futura + 5) THEN
        RAISE EXCEPTION 'FALLO: una semana futura cerrada sale abierta';
    END IF;

    DELETE FROM public.training_weeks  WHERE block_id = v_bloque;
    DELETE FROM public.training_blocks WHERE id = v_bloque;

    RAISE NOTICE 'week_is_released(): las cuatro comprobaciones pasan. Las semanas se abren solas y el interruptor solo sirve para adelantar.';
END
$comprobacion$;

NOTIFY pgrst, 'reload schema';
