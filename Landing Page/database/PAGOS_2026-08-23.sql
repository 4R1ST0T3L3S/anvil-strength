-- =====================================================================
-- ANVIL STRENGTH — PUERTA DE PAGO
-- Bloque 5 del plan del 21/08/2026 · Decisiones K1, K3, K5, K6, K7
-- =====================================================================
--
-- QUÉ HACE ESTE FICHERO
--
-- Añade el estado de facturación POR RELACIÓN y la función que decide, en el
-- servidor, si un atleta está al corriente con su entrenador.
--
--
-- LO QUE NO HACE, Y CONVIENE TENER CLARO
--
-- No cobra nada. ANVIL no tiene pasarela y no mueve dinero. `athlete_payments`
-- es un REGISTRO que el entrenador rellena a mano. Lo que decidió K1 es que
-- ese registro pase a decidir el acceso.
--
--
-- CÓMO SE EJECUTA
--
-- Idempotente: se puede lanzar las veces que haga falta. Al final imprime qué
-- se ha aplicado y qué ya estaba.
--
--     Supabase → SQL Editor → pegar → Run
--
--
-- DESPLIEGUE EN DOS TIEMPOS (K1, innegociable)
--
-- Este SQL NO bloquea a nadie por sí solo. La puerta la abre o la cierra
-- `coach_prefs.billing.gate`, que sale de fábrica en 'warn': se avisa y no se
-- corta. El paso a 'block' es una decisión posterior, después de una semana
-- con datos reales comprobando que el semáforo dice la verdad.
--
-- Un fallo aquí deja sin entrenar a alguien que ha pagado, y eso se paga en
-- confianza, no en tiempo de desarrollo.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. ESTADO DE FACTURACIÓN, POR RELACIÓN
-- =====================================================================
-- Va en `coach_athletes` y no en `profiles`, igual que `notes`, porque es de
-- la RELACIÓN: un atleta con entrenador de fuerza y nutricionista puede estar
-- al día con uno y no con el otro, y su perfil no puede decir las dos cosas.
--
--   'auto'      (por defecto) Sin ninguna fila de pago no bloquea (K7). Con al
--               menos una, manda MAX(paid_until) + días de cortesía.
--   'exempt'    Nunca bloquea. Familia, intercambios, cuentas de prueba.
--   'suspended' Bloquea siempre. Es el "se dice explícitamente que no paga".

ALTER TABLE public.coach_athletes
    ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'auto';

-- La restricción se crea aparte y con guarda: `ADD CONSTRAINT IF NOT EXISTS`
-- no existe en PostgreSQL, así que se comprueba en el catálogo.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'coach_athletes_billing_mode_check'
    ) THEN
        ALTER TABLE public.coach_athletes
            ADD CONSTRAINT coach_athletes_billing_mode_check
            CHECK (billing_mode IN ('auto', 'exempt', 'suspended'));
    END IF;
END $$;

COMMENT ON COLUMN public.coach_athletes.billing_mode IS
    'Estado de facturación de ESTA relación (K7): auto | exempt | suspended. '
    'auto = sin filas de pago no bloquea; con ellas manda MAX(paid_until)+cortesía.';


-- =====================================================================
-- 2. LA REGLA, EN EL SERVIDOR
-- =====================================================================
-- `src/lib/billing.ts` tiene un espejo exacto de esto en TypeScript. El de
-- aquí es el que MANDA: el del cliente sirve para no pintar lo que el
-- servidor no va a devolver, y un desajuste entre los dos no filtra nada.
--
-- El orden de las comprobaciones no es cosmético. La línea de K7 —sin filas
-- de pago, al corriente— es la que evita el desastre del día del despliegue:
-- hoy NINGÚN atleta tiene pagos registrados, y con la regla contraria se
-- bloquearían todos a la vez.

CREATE OR REPLACE FUNCTION public.athlete_is_current(
    p_athlete_id UUID,
    p_coach_id   UUID,
    p_grace_days INTEGER DEFAULT 7
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_modo        TEXT;
    v_tiene_pagos BOOLEAN;
    v_hasta       DATE;
BEGIN
    SELECT billing_mode INTO v_modo
      FROM public.coach_athletes
     WHERE athlete_id = p_athlete_id
       AND coach_id   = p_coach_id
     LIMIT 1;

    -- Sin relación no hay nada que cobrar. No se bloquea: quien no es tu
    -- atleta no te debe dinero.
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    IF v_modo = 'exempt'    THEN RETURN TRUE;  END IF;
    IF v_modo = 'suspended' THEN RETURN FALSE; END IF;

    -- K7
    SELECT EXISTS (
        SELECT 1 FROM public.athlete_payments
         WHERE athlete_id = p_athlete_id AND coach_id = p_coach_id
    ) INTO v_tiene_pagos;

    IF NOT v_tiene_pagos THEN
        RETURN TRUE;
    END IF;

    SELECT MAX(paid_until) INTO v_hasta
      FROM public.athlete_payments
     WHERE athlete_id = p_athlete_id AND coach_id = p_coach_id;

    -- Filas sin fecha de cobertura: un dato incompleto no corta el acceso.
    IF v_hasta IS NULL THEN
        RETURN TRUE;
    END IF;

    -- K3 + K6. El día del cierre TODAVÍA entra.
    RETURN CURRENT_DATE <= (v_hasta + p_grace_days);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.athlete_is_current(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.athlete_is_current(UUID, UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.athlete_is_current(UUID, UUID, INTEGER) IS
    'Regla de la puerta de pago (K3, K6, K7). Espejo servidor de evaluarPuerta() '
    'en src/lib/billing.ts. NO la aplica ninguna política todavía: el bloqueo '
    'vive en el cliente mientras gate = warn (K1, despliegue en dos tiempos).';


-- =====================================================================
-- 3. LO QUE NECESITA EL PANEL DEL ATLETA, DE UNA VEZ
-- =====================================================================
-- El atleta no puede leer `coach_athletes` de otros ni la tabla de pagos
-- entera, así que necesita una función que le conteste SOBRE SÍ MISMO. Con
-- `auth.uid()` dentro, no hay forma de preguntar por otra persona.

CREATE OR REPLACE FUNCTION public.my_billing_status()
RETURNS TABLE (
    coach_id      UUID,
    billing_mode  TEXT,
    paid_until    DATE,
    has_payments  BOOLEAN,
    is_current    BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        ca.coach_id,
        ca.billing_mode,
        (SELECT MAX(p.paid_until) FROM public.athlete_payments p
          WHERE p.athlete_id = ca.athlete_id AND p.coach_id = ca.coach_id),
        EXISTS (SELECT 1 FROM public.athlete_payments p
                 WHERE p.athlete_id = ca.athlete_id AND p.coach_id = ca.coach_id),
        public.athlete_is_current(ca.athlete_id, ca.coach_id)
      FROM public.coach_athletes ca
     WHERE ca.athlete_id = auth.uid()
       AND ca.status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.my_billing_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_billing_status() TO authenticated;

COMMENT ON FUNCTION public.my_billing_status() IS
    'Estado de pago del usuario que llama, una fila por entrenador activo. '
    'auth.uid() va DENTRO: no se puede preguntar por otra persona.';


-- =====================================================================
-- 4. ÍNDICE
-- =====================================================================
-- `athlete_is_current` consulta por (athlete_id, coach_id) y el índice que
-- había es (athlete_id, paid_until DESC): sirve para el semáforo del
-- entrenador pero no para esto.

CREATE INDEX IF NOT EXISTS athlete_payments_pareja_idx
    ON public.athlete_payments (athlete_id, coach_id, paid_until DESC);


COMMIT;


-- =====================================================================
-- 5. VERIFICACIÓN
-- =====================================================================
-- Qué ha quedado aplicado. Si algo sale en NO, este fichero no ha terminado
-- de ejecutarse y hay que mirar el error de arriba antes de tocar el código.

DO $$
DECLARE
    v_col   BOOLEAN;
    v_check BOOLEAN;
    v_fn1   BOOLEAN;
    v_fn2   BOOLEAN;
    v_idx   BOOLEAN;
    v_autos INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='coach_athletes'
                      AND column_name='billing_mode') INTO v_col;

    SELECT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='coach_athletes_billing_mode_check') INTO v_check;

    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='athlete_is_current') INTO v_fn1;

    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='my_billing_status') INTO v_fn2;

    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='athlete_payments_pareja_idx') INTO v_idx;

    SELECT COUNT(*) INTO v_autos FROM public.coach_athletes WHERE billing_mode='auto';

    RAISE NOTICE '';
    RAISE NOTICE '=== PUERTA DE PAGO — verificacion ===';
    RAISE NOTICE 'columna coach_athletes.billing_mode ... %', CASE WHEN v_col   THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'restriccion de valores admitidos ..... %', CASE WHEN v_check THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'funcion athlete_is_current() ......... %', CASE WHEN v_fn1   THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'funcion my_billing_status() .......... %', CASE WHEN v_fn2   THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'indice (athlete_id, coach_id) ........ %', CASE WHEN v_idx   THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE '';
    RAISE NOTICE 'relaciones en modo auto: %', v_autos;
    RAISE NOTICE '';
    RAISE NOTICE 'RECORDATORIO: esto NO bloquea a nadie todavia. La puerta la';
    RAISE NOTICE 'abre coach_prefs.billing.gate, que sale en warn (K1).';
    RAISE NOTICE '';
END $$;
