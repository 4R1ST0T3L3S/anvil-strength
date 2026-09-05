-- =====================================================================
-- ANVIL STRENGTH — COMPETICIONES PÚBLICAS, SOLO DE MIEMBROS DEL CLUB
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
--
-- POR QUÉ EXISTE
-- ---------------------------------------------------------------------
-- La página pública /competiciones necesita mostrar las competiciones de
-- los atletas del club, con su nombre, SIN sesión abierta. Pero
-- `database/FIX_RLS_COMPETICIONES.sql` cerró a propósito la lectura
-- anónima de `competitions` a solo `athlete_id IS NULL` (el calendario
-- oficial de la federación): las filas con atleta son la agenda de una
-- persona identificable y no pueden quedar abiertas a `USING (TRUE)`.
--
-- Consecuencia: `getPublicCompetitions()` embebía `profiles` en la misma
-- consulta, PostgREST rechazaba ese embed sin sesión, y la página se
-- quedaba vacía — el problema "no aparecen competiciones" no era de datos,
-- era de permisos.
--
-- LA SOLUCIÓN NO ES REABRIR LA TABLA
-- ---------------------------------------------------------------------
-- Es la misma que ya usa `public.public_profiles` (database/SECURITY_
-- HARDENING.sql §1.5): una función SECURITY DEFINER que decide, en el
-- servidor, EXACTAMENTE qué columnas se enseñan y de qué filas — no un
-- USING(TRUE) que abre la tabla entera.
--
-- "MIEMBRO DEL CLUB", DEFINIDO IGUAL QUE EN TODO EL RESTO DE LA APP
-- ---------------------------------------------------------------------
-- Esta app es de un solo club: no hay tabla `clubs`. La pertenencia real
-- es `coach_athletes.status = 'active'` — el mismo vínculo que ya decide
-- quién ve la ficha de quién en el panel de coach. Por eso la función NO
-- se limita a `profiles.role = 'athlete'` (eso incluiría a cualquiera que
-- se haya registrado sin que ningún coach del club lo entrene): exige el
-- vínculo activo. `EXISTS` y no `JOIN` a propósito — un atleta puede tener
-- más de un vínculo activo (coach + nutricionista) y un JOIN duplicaría
-- cada una de sus competiciones tantas veces como vínculos tenga.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_upcoming_competitions()
RETURNS TABLE (
    id UUID,
    name TEXT,
    date DATE,
    end_date DATE,
    location TEXT,
    level TEXT,
    description TEXT,
    athlete_id UUID,
    athlete_full_name TEXT,
    athlete_avatar_url TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        c.id, c.name, c.date, c.end_date, c.location, c.level, c.description,
        c.athlete_id, p.full_name, p.avatar_url
    FROM public.competitions c
    JOIN public.profiles p ON p.id = c.athlete_id
    WHERE c.athlete_id IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM public.coach_athletes ca
          WHERE ca.athlete_id = c.athlete_id AND ca.status = 'active'
      )
      -- Futura o en curso: mismo criterio que ya usaba el servicio.
      AND (c.date >= current_date OR c.end_date >= current_date)
    ORDER BY c.date ASC;
$$;

-- Público a propósito: es la única puerta de entrada de datos de
-- competición para quien no tiene sesión, y ya decide ella misma qué
-- enseña. No hace falta política RLS adicional sobre `competitions`.
REVOKE ALL ON FUNCTION public.get_public_upcoming_competitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_upcoming_competitions() TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_upcoming_competitions() IS
    'Competiciones futuras de atletas con vínculo coach_athletes activo (miembros reales del club). Usada por la página pública /competiciones sin necesidad de sesión.';


-- =====================================================================
-- COMPROBACIÓN
-- =====================================================================
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM public.get_public_upcoming_competitions();
    RAISE NOTICE 'Competiciones públicas de miembros del club (próximas o en curso): % filas.', n;
END $$;

NOTIFY pgrst, 'reload schema';
