-- =====================================================================
-- ANVIL STRENGTH — SEPARAR UNA SERIE AGRUPADA ("4x8") EN FILAS REALES
-- =====================================================================
--
-- EL FALLO QUE ARREGLA (crítico: pérdida de datos)
--
-- El coach programa "4x8" como UNA sola fila de `training_sets`. El registro
-- del atleta la pinta como cuatro renglones para poder marcarlos de uno en
-- uno, y en la primera escritura la parte en cuatro filas de verdad.
--
-- Esa separación se hacía DESDE EL NAVEGADOR (trainingService.expandGroupedSet)
-- y, ejecutada por el atleta, era IMPOSIBLE que funcionara:
--
--   1. Hace `UPDATE ... SET target_reps` sobre la fila original, y el trigger
--      protect_target_fields() prohíbe al atleta tocar campos prescritos.
--   2. Inserta las filas que faltan, y en `training_sets` el atleta tiene
--      políticas de SELECT y de UPDATE, pero NINGUNA de INSERT.
--
-- Resultado: la separación fallaba siempre, los cuatro renglones seguían
-- apuntando al MISMO id y las cuatro series se machacaban entre sí. Solo
-- sobrevivía la última que el atleta tocaba. Además el desplazamiento de
-- `order_index` de las series hermanas sí llegaba a aplicarse antes del
-- error, así que dejaba el orden del día descuadrado.
--
-- LA SOLUCIÓN
--
-- La separación es un cambio ESTRUCTURAL de la prescripción, no un registro:
-- no tiene por qué —ni debe— hacerse a base de darle permisos de INSERT al
-- atleta sobre la tabla del plan. Se hace aquí, en una función SECURITY
-- DEFINER que:
--
--   * comprueba que quien llama es el atleta o el coach de ESE bloque;
--   * hace las tres escrituras en una sola transacción, así que o sale todo
--     o no sale nada (se acabaron los `order_index` a medio desplazar);
--   * toma un cerrojo por ejercicio, así que cuatro renglones pidiendo la
--     separación a la vez la hacen UNA vez y no cuatro.
--
-- El atleta sigue sin poder insertar ni modificar objetivos por su cuenta:
-- lo único que puede hacer es partir en cuatro un "4x8" que ya le pautaron,
-- que es exactamente lo que la aplicación necesita.
--
-- IDEMPOTENTE: si la serie ya está separada no toca nada. Devuelve SIEMPRE
-- las series del ejercicio ordenadas por `order_index`, que es lo que el
-- cliente necesita para saber qué fila le corresponde a cada renglón.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL GUARDIÁN DE LOS CAMPOS PRESCRITOS, CON UNA PUERTA DE SERVICIO
-- ---------------------------------------------------------------------
-- Mismo comportamiento que antes (ver database/feature_efort_schema.sql):
-- el atleta no puede tocar lo que le pautó el coach. Lo único que cambia es
-- que ahora respeta una marca de transacción que SOLO puede poner una
-- función SECURITY DEFINER de este esquema. Sin ella, `expand_grouped_set`
-- chocaría con este mismo trigger al renumerar las repeticiones del grupo.

CREATE OR REPLACE FUNCTION public.protect_target_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_coach_id   UUID;
    v_athlete_id UUID;
BEGIN
    -- Puerta de servicio. `set_config(..., is_local => true)` vive solo
    -- dentro de la transacción que la puso, así que no puede quedarse
    -- abierta ni filtrarse a otra petición.
    IF coalesce(current_setting('anvil.split_grouped_set', true), '') = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT tb.coach_id, tb.athlete_id
    INTO v_coach_id, v_athlete_id
    FROM public.session_exercises se
    JOIN public.training_sessions ts ON se.session_id = ts.id
    JOIN public.training_blocks   tb ON ts.block_id  = tb.id
    WHERE se.id = NEW.session_exercise_id;

    IF auth.uid() = v_athlete_id THEN
        IF (NEW.target_reps       IS DISTINCT FROM OLD.target_reps)  OR
           (NEW.target_load       IS DISTINCT FROM OLD.target_load)  OR
           (NEW.target_rpe        IS DISTINCT FROM OLD.target_rpe)   OR
           (NEW.rest_seconds      IS DISTINCT FROM OLD.rest_seconds) OR
           (NEW.is_video_required IS DISTINCT FROM OLD.is_video_required) THEN
            RAISE EXCEPTION 'Acceso Denegado: Los atletas no pueden modificar los objetivos prescritos por el entrenador.';
        END IF;
    END IF;

    IF auth.uid() IS DISTINCT FROM v_athlete_id AND auth.uid() IS DISTINCT FROM v_coach_id THEN
        RAISE EXCEPTION 'Acceso Denegado: Usuario no autorizado para este bloque.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_target_fields ON public.training_sets;
CREATE TRIGGER trigger_protect_target_fields
    BEFORE UPDATE ON public.training_sets
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_target_fields();


-- ---------------------------------------------------------------------
-- 2. LA SEPARACIÓN
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expand_grouped_set(p_set_id UUID)
RETURNS SETOF public.training_sets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_set        public.training_sets%ROWTYPE;
    v_coach_id   UUID;
    v_athlete_id UUID;
    v_lower      TEXT;
    v_head       TEXT;
    v_reps       TEXT;
    v_count      INT;
    v_shift      INT;
BEGIN
    SELECT * INTO v_set FROM public.training_sets WHERE id = p_set_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La serie % no existe.', p_set_id;
    END IF;

    -- ¿De quién es esta serie?
    SELECT tb.coach_id, tb.athlete_id
    INTO v_coach_id, v_athlete_id
    FROM public.session_exercises se
    JOIN public.training_sessions ts ON se.session_id = ts.id
    JOIN public.training_blocks   tb ON ts.block_id  = tb.id
    WHERE se.id = v_set.session_exercise_id;

    IF auth.uid() IS NULL
       OR (auth.uid() IS DISTINCT FROM v_athlete_id AND auth.uid() IS DISTINCT FROM v_coach_id) THEN
        RAISE EXCEPTION 'Acceso Denegado: esta serie no pertenece a ninguno de tus bloques.';
    END IF;

    -- Cerrojo por EJERCICIO, no por serie: al separar se renumeran también
    -- las hermanas. Los cuatro renglones de un "4x8" pueden llegar aquí a la
    -- vez —basta con teclear el peso y marcar la serie seguidos— y sin esto
    -- el ejercicio acabaría con ocho o doce series en lugar de cuatro.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_set.session_exercise_id::text, 0));

    -- Releer DESPUÉS del cerrojo: si otra llamada acaba de separarla, aquí
    -- ya no queda nada que hacer y se devuelven 0 filas.
    SELECT * INTO v_set FROM public.training_sets WHERE id = p_set_id;

    -- "4x8" -> 4 y "8". Mismo criterio que parseGroupedReps() en el cliente:
    -- solo es un grupo si el primer factor es un número mayor que uno.
    -- "8" son ocho repeticiones en una serie; "AMRAP" o "5-8" no son grupos.
    v_lower := lower(coalesce(v_set.target_reps, ''));
    v_head  := btrim(split_part(v_lower, 'x', 1));
    v_reps  := CASE
                   WHEN position('x' in v_lower) = 0 THEN ''
                   ELSE btrim(substr(v_lower, position('x' in v_lower) + 1))
               END;
    v_count := CASE WHEN v_head ~ '^\d+$' AND v_reps <> '' THEN v_head::INT ELSE 1 END;

    IF v_count > 1 THEN
        v_shift := v_count - 1;

        -- A partir de aquí se tocan campos prescritos. La marca es local a
        -- esta transacción y desaparece con ella.
        PERFORM set_config('anvil.split_grouped_set', 'on', true);

        -- Las hermanas que van DETRÁS se desplazan para dejar hueco, o el
        -- orden del día queda al azar.
        UPDATE public.training_sets
           SET order_index = order_index + v_shift
         WHERE session_exercise_id = v_set.session_exercise_id
           AND order_index > v_set.order_index;

        -- La fila original se queda como la PRIMERA del grupo y conserva lo
        -- que el atleta ya hubiera escrito en ella.
        UPDATE public.training_sets
           SET target_reps = v_reps
         WHERE id = v_set.id;

        -- Las que faltan. Las columnas de ejecución (`actual_*`, `notes`,
        -- `is_completed`, VBT) NO se copian: pertenecen a la serie que el
        -- atleta ya hizo, no a las que todavía le quedan.
        INSERT INTO public.training_sets (
            session_exercise_id, order_index, target_reps,
            target_rpe, target_load, target_metric,
            rest_seconds, is_video_required
        )
        SELECT
            v_set.session_exercise_id,
            v_set.order_index + i,
            v_reps,
            v_set.target_rpe,
            v_set.target_load,
            v_set.target_metric,
            v_set.rest_seconds,
            v_set.is_video_required
        FROM generate_series(1, v_shift) AS i;

        PERFORM set_config('anvil.split_grouped_set', 'off', true);
    END IF;

    -- Se devuelven SIEMPRE las series del ejercicio, hubiera o no algo que
    -- separar. Quien llama necesita resolver qué fila le toca a cada
    -- renglón por su `order_index`, y si aquí no llegara nada —porque otro
    -- dispositivo ya la separó— volvería a escribir contra el id compartido,
    -- que es justo el fallo que esta función viene a eliminar.
    RETURN QUERY
        SELECT *
        FROM public.training_sets
        WHERE session_exercise_id = v_set.session_exercise_id
        ORDER BY order_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expand_grouped_set(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.expand_grouped_set(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
