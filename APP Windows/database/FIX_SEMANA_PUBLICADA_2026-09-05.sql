-- =====================================================================
-- ANVIL STRENGTH — "PUBLICAR SEMANA" NO PUBLICABA NADA
-- =====================================================================
-- Idempotente. Ejecutar entero en Supabase Dashboard -> SQL Editor.
-- Sustituye a la definición de week_is_released() que dejó
-- database/week_visibility_and_scheduling.sql. No toca ninguna política:
-- las tres del atleta llaman a esta función por nombre y siguen igual.
--
--
-- EL SÍNTOMA
--
-- El entrenador abre el bloque, pulsa "Publicar esta semana para el atleta",
-- la aplicación le contesta "Semana publicada"... y el atleta sigue viendo
-- su planificación vacía.
--
--
-- POR QUÉ PASABA
--
-- El interruptor del coach y la puerta por fecha estaban encadenados de
-- forma que el interruptor solo sabía CERRAR:
--
--     IF v_visible IS NOT NULL AND v_visible = FALSE THEN
--         RETURN FALSE;
--     END IF;
--     ... y aquí seguía la comprobación de la fecha ...
--
-- Con `is_visible = FALSE` se devolvía FALSE, correcto. Pero con
-- `is_visible = TRUE` —que es lo que escribe el botón "Publicar"— no se
-- devolvía nada: la ejecución caía a la puerta por fecha, y si el lunes de
-- esa semana todavía no había llegado, la puerta decía que no y el atleta se
-- quedaba sin ver la semana que su entrenador acababa de abrirle.
--
-- El comentario del código original decía "Interruptor manual del coach.
-- Manda sobre la fecha". Esa era la intención; el código solo la cumplía en
-- una de las dos direcciones.
--
-- Ahora el interruptor manda de verdad:
--
--     is_visible = TRUE   -> visible YA, sin mirar la fecha
--     is_visible = FALSE  -> oculta, sin mirar la fecha
--     sin fila            -> decide la fecha, como hasta ahora
--
-- La inmensa mayoría de las semanas no tienen fila en `training_weeks`
-- —solo se crea cuando el coach toca esa semana—, así que la apertura
-- automática por calendario sigue siendo el comportamiento normal. Lo que
-- cambia es que ahora se puede ADELANTAR, no solo retrasar.
--
--
-- Y DE PASO: EL BLOQUE QUE CRUZABA EL FIN DE AÑO
--
-- La fecha se calculaba así:
--
--     v_year := EXTRACT(YEAR FROM v_start);          -- año de start_date
--     v_jan4 := make_date(v_year, 1, 4);             -- siempre en semana 1
--     v_week_monday := lunes_de_semana_1 + (p_week_number - 1) * 7;
--
-- O sea: `week_number` se interpretaba como semana ISO DEL AÑO EN QUE EMPIEZA
-- EL BLOQUE. Para un bloque que empieza en noviembre y termina en enero, sus
-- últimas semanas son la 1, la 2 y la 3 —del año siguiente—, pero se
-- calculaban contra el año anterior: salían lunes de hace once meses, la
-- puerta las daba por abiertas desde el primer día y el atleta veía en
-- noviembre el trabajo de enero.
--
-- Aquí se cuenta desde el lunes en que arranca el bloque y se avanza semana
-- a semana, sumando las semanas del año (52 ó 53, que no es fijo) cuando la
-- cuenta cruza diciembre. Dentro de un mismo año da exactamente el mismo
-- resultado que antes; la diferencia solo aparece al cambiar de año.
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
    -- 1. LA DECISIÓN EXPLÍCITA DEL COACH, EN LOS DOS SENTIDOS.
    -- -----------------------------------------------------------------
    -- Si hay fila en training_weeks es porque alguien pulsó el botón. Esa
    -- decisión gana a la fecha, tanto para abrir como para cerrar.
    SELECT is_visible INTO v_visible
      FROM public.training_weeks
     WHERE block_id = p_block_id AND week_number = p_week_number;

    IF v_visible IS NOT NULL THEN
        RETURN v_visible;
    END IF;

    -- -----------------------------------------------------------------
    -- 2. SIN DECISIÓN EXPLÍCITA, MANDA EL CALENDARIO.
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
    v_first_monday  := v_start - (EXTRACT(ISODOW FROM v_start)::INTEGER - 1);

    -- EXTRACT(WEEK) en PostgreSQL YA es la semana ISO, la misma numeración
    -- que usa getWeekNumber() en el navegador.
    v_start_week    := EXTRACT(WEEK    FROM v_start)::INTEGER;
    v_start_isoyear := EXTRACT(ISOYEAR FROM v_start)::INTEGER;

    -- Cuántas semanas ISO tiene ese año: 52 casi siempre, 53 algunos. El 28
    -- de diciembre cae por definición en la última semana ISO del año, así
    -- que preguntárselo a él es la forma corta de saberlo.
    v_weeks_in_year := EXTRACT(WEEK FROM make_date(v_start_isoyear, 12, 28))::INTEGER;

    v_delta := p_week_number - v_start_week;
    IF v_delta < 0 THEN
        v_delta := v_delta + v_weeks_in_year;   -- el bloque cruza el fin de año
    END IF;

    v_week_monday := v_first_monday + (v_delta * 7);

    RETURN CURRENT_DATE >= (v_week_monday - v_offset);
END;
$fn$;

-- Los permisos se vuelven a poner por si la función se recreara desde cero.
REVOKE EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.week_is_released(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.week_is_released(UUID, INTEGER) IS
    'TRUE si el atleta puede leer esa semana. El interruptor del coach en training_weeks.is_visible manda en los dos sentidos; sin fila decide release_offset_days sobre el lunes de la semana.';


-- =====================================================================
-- COMPROBACIÓN
-- =====================================================================
-- No deja rastro: crea un bloque de mentira, hace las cuatro preguntas y lo
-- borra. Si alguna falla, el RAISE EXCEPTION tira la transacción entera.
DO $comprobacion$
DECLARE
    v_perfil  UUID;
    v_bloque  UUID;
    v_semana  INTEGER;
    v_futura  INTEGER;
    r         BOOLEAN;
BEGIN
    SELECT id INTO v_perfil FROM public.profiles LIMIT 1;
    IF v_perfil IS NULL THEN
        RAISE NOTICE 'Sin perfiles en la base: se omite la comprobación.';
        RETURN;
    END IF;

    v_semana := EXTRACT(WEEK FROM CURRENT_DATE)::INTEGER;
    v_futura := v_semana + 3;

    -- `is_active = FALSE` para que, en el improbable caso de que algo deje
    -- la fila atrás, no aparezca como el bloque en curso de nadie.
    INSERT INTO public.training_blocks (name, coach_id, athlete_id, start_date, start_week, release_offset_days, is_active)
    VALUES ('__comprobacion_week_is_released__', v_perfil, v_perfil, CURRENT_DATE, v_semana, 1, FALSE)
    RETURNING id INTO v_bloque;

    -- a) Semana de dentro de tres semanas, sin tocar: la fecha la cierra.
    r := public.week_is_released(v_bloque, v_futura);
    IF r THEN RAISE EXCEPTION 'FALLO: una semana futura sin publicar sale visible'; END IF;

    -- b) La misma, publicada a mano: tiene que abrirse. ESTE ES EL FALLO QUE
    --    SE ARREGLA — antes seguía dando FALSE.
    INSERT INTO public.training_weeks (block_id, week_number, is_visible)
    VALUES (v_bloque, v_futura, TRUE)
    ON CONFLICT (block_id, week_number) DO UPDATE SET is_visible = TRUE;

    r := public.week_is_released(v_bloque, v_futura);
    IF NOT r THEN RAISE EXCEPTION 'FALLO: una semana publicada a mano sigue oculta'; END IF;

    -- c) La de esta semana, ocultada a mano: tiene que cerrarse.
    INSERT INTO public.training_weeks (block_id, week_number, is_visible)
    VALUES (v_bloque, v_semana, FALSE)
    ON CONFLICT (block_id, week_number) DO UPDATE SET is_visible = FALSE;

    r := public.week_is_released(v_bloque, v_semana);
    IF r THEN RAISE EXCEPTION 'FALLO: una semana oculta a mano sigue visible'; END IF;

    -- d) La de esta semana, sin tocar: la fecha la abre.
    DELETE FROM public.training_weeks WHERE block_id = v_bloque AND week_number = v_semana;
    r := public.week_is_released(v_bloque, v_semana);
    IF NOT r THEN RAISE EXCEPTION 'FALLO: la semana en curso sale oculta'; END IF;

    DELETE FROM public.training_weeks  WHERE block_id = v_bloque;
    DELETE FROM public.training_blocks WHERE id = v_bloque;

    RAISE NOTICE 'week_is_released(): las cuatro comprobaciones pasan. Publicar una semana ahora la abre de verdad.';
END
$comprobacion$;

NOTIFY pgrst, 'reload schema';
