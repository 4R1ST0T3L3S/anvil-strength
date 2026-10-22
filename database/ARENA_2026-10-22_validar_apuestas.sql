-- =====================================================================
-- LA ARENA: VALIDAR IMPORTES Y APUESTAS EN EL SERVIDOR
-- 22 de octubre de 2026
-- =====================================================================
--
-- place_arena_bet (las dos firmas) y place_arena_parlay solo comprobaban
-- `saldo < importe`. Con eso:
--   - un importe NEGATIVO pasaba y SUMABA monedas al restar;
--   - sin fila en user_points el saldo es NULL, la comparación da NULL y
--     la apuesta salía gratis;
--   - una apuesta inexistente tenía estado NULL y `NULL != 'open'` no
--     saltaba;
--   - una opción de otra apuesta, o una combinada sin patas, entraban.
--
-- Ahora: sesión obligatoria, importe > 0, fila de saldo bloqueada (FOR
-- UPDATE, para que dos apuestas a la vez no gasten el mismo saldo),
-- apuesta existente y abierta, opción de esa misma apuesta y valor en las
-- predicciones. Lo demás (tablas, transacciones, pools) queda igual.
-- Aplicado en producción el 22/10/2026 como migración
-- `arena_validar_apuestas`. No dependía de ningún despliegue.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.place_arena_bet(p_bet_id uuid, p_option_id uuid DEFAULT NULL::uuid, p_prediction_value double precision DEFAULT NULL::double precision, p_amount integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    current_balance INTEGER;
    bet_status TEXT;
    bet_type TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Necesitas iniciar sesión';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'El importe debe ser mayor que cero';
    END IF;

    -- Verificar estado y tipo de la apuesta
    SELECT status, type INTO bet_status, bet_type FROM public.arena_bets WHERE id = p_bet_id;
    IF bet_status IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'La apuesta ya no está abierta';
    END IF;

    -- Validar parámetros según el tipo
    IF bet_type = 'prediction' AND p_prediction_value IS NULL THEN
        RAISE EXCEPTION 'Debes indicar un valor para tu predicción';
    END IF;
    IF bet_type IS DISTINCT FROM 'prediction' AND p_option_id IS NULL THEN
        RAISE EXCEPTION 'Debes seleccionar una opción';
    END IF;
    IF p_option_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.arena_options WHERE id = p_option_id AND bet_id = p_bet_id
    ) THEN
        RAISE EXCEPTION 'La opción no es de esta apuesta';
    END IF;

    -- Verificar saldo (bloqueando la fila)
    SELECT balance INTO current_balance FROM public.user_points WHERE user_id = auth.uid() FOR UPDATE;
    IF current_balance IS NULL OR current_balance < p_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente';
    END IF;

    -- Restar puntos
    UPDATE public.user_points
    SET balance = balance - p_amount
    WHERE user_id = auth.uid();

    -- Registrar apuesta del usuario
    INSERT INTO public.user_arena_bets (user_id, bet_id, option_id, prediction_value, amount)
    VALUES (auth.uid(), p_bet_id, p_option_id, p_prediction_value, p_amount);

    -- Actualizar pool de la opción si no es predicción
    IF p_option_id IS NOT NULL THEN
        UPDATE public.arena_options
        SET total_pool = total_pool + p_amount
        WHERE id = p_option_id;
    END IF;

    -- Registrar transacción
    INSERT INTO public.point_transactions (user_id, amount, type, reason)
    VALUES (auth.uid(), p_amount, 'spent', 'Apuesta en La Arena');
END;
$function$;

-- La firma antigua de tres argumentos la app ya no la usa: pasa por la nueva.
CREATE OR REPLACE FUNCTION public.place_arena_bet(p_bet_id uuid, p_option_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
    PERFORM public.place_arena_bet(p_bet_id, p_option_id, NULL::double precision, p_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_arena_parlay(p_amount integer, p_legs jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_parlay_id UUID;
    v_leg RECORD;
    v_user_balance INTEGER;
    v_status TEXT;
    v_type TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Necesitas iniciar sesión';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'El importe debe ser mayor que cero';
    END IF;
    IF p_legs IS NULL OR jsonb_typeof(p_legs) <> 'array' OR jsonb_array_length(p_legs) = 0 THEN
        RAISE EXCEPTION 'La combinada no tiene apuestas';
    END IF;

    -- 0. Validar cada pata antes de cobrar nada
    FOR v_leg IN SELECT * FROM jsonb_to_recordset(p_legs) AS x(bet_id UUID, option_id UUID, prediction_value DECIMAL) LOOP
        SELECT status, type INTO v_status, v_type FROM public.arena_bets WHERE id = v_leg.bet_id;
        IF v_status IS DISTINCT FROM 'open' THEN
            RAISE EXCEPTION 'Una de las apuestas ya no está abierta';
        END IF;
        IF v_type = 'prediction' AND v_leg.prediction_value IS NULL THEN
            RAISE EXCEPTION 'Falta el valor de una predicción';
        END IF;
        IF v_type IS DISTINCT FROM 'prediction' AND v_leg.option_id IS NULL THEN
            RAISE EXCEPTION 'Falta la opción de una apuesta';
        END IF;
        IF v_leg.option_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.arena_options WHERE id = v_leg.option_id AND bet_id = v_leg.bet_id
        ) THEN
            RAISE EXCEPTION 'Una opción no es de su apuesta';
        END IF;
    END LOOP;

    -- 1. Verificar balance (bloqueando la fila)
    SELECT balance INTO v_user_balance FROM public.user_points WHERE user_id = auth.uid() FOR UPDATE;
    IF v_user_balance IS NULL OR v_user_balance < p_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente';
    END IF;

    -- 2. Crear la combinada
    INSERT INTO public.arena_parlays (user_id, amount, status)
    VALUES (auth.uid(), p_amount, 'open')
    RETURNING id INTO v_parlay_id;

    -- 3. Insertar las patas
    FOR v_leg IN SELECT * FROM jsonb_to_recordset(p_legs) AS x(bet_id UUID, option_id UUID, prediction_value DECIMAL) LOOP
        INSERT INTO public.arena_parlay_legs (parlay_id, bet_id, option_id, prediction_value)
        VALUES (v_parlay_id, v_leg.bet_id, v_leg.option_id, v_leg.prediction_value);
    END LOOP;

    -- 4. Restar puntos al usuario
    UPDATE public.user_points
    SET balance = balance - p_amount,
        last_updated = now()
    WHERE user_id = auth.uid();

    -- Registrar transacción
    INSERT INTO public.anvil_point_transactions (user_id, amount, reason)
    VALUES (auth.uid(), -p_amount, 'ARENA_PARLAY_BET');

    RETURN v_parlay_id;
END;
$function$;
