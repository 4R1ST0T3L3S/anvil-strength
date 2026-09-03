-- =====================================================================
-- ENLACE DE RECLAMACIÓN DE UN ATLETA FICTICIO — por email + contraseña
-- =====================================================================
-- Hasta ahora la ÚNICA forma de que un atleta gestionado (dado de alta por
-- su entrenador, sin cuenta propia) reclamara su ficha era por CORREO:
-- `athletesService.invite()` manda un enlace mágico a su email. Si el
-- entrenador prefiere pasarle un enlace directamente (WhatsApp, en persona,
-- sin depender de que revise el correo), no había manera.
--
-- Este archivo añade la tabla que sostiene esos enlaces. El resto de la
-- lógica —generarlos, comprobarlos, canjearlos— vive en la función de
-- borde `athletes` (supabase/functions/athletes/index.ts), porque poner
-- una contraseña en una cuenta ya existente exige `service_role`.
--
-- POR QUÉ NO HAY POLÍTICAS RLS DE CLIENTE AQUÍ
-- Nada, ni el navegador del entrenador ni el del atleta, toca esta tabla
-- directamente: todo pasa por la función de borde, que usa `service_role` y
-- por tanto SALTA la RLS. La tabla se cierra a cal y canto para
-- `anon`/`authenticated` — es la defensa en profundidad correcta cuando el
-- único lector legítimo nunca es el cliente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.athlete_claim_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL UNIQUE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS athlete_claim_links_token_idx ON public.athlete_claim_links (token);
CREATE INDEX IF NOT EXISTS athlete_claim_links_profile_idx ON public.athlete_claim_links (profile_id);

ALTER TABLE public.athlete_claim_links ENABLE ROW LEVEL SECURITY;

-- Sin políticas SELECT/INSERT/UPDATE/DELETE a propósito: sin ninguna
-- política, RLS deniega todo por defecto salvo a quien salta la RLS
-- (service_role). Es justo lo que hace falta aquí.
REVOKE ALL ON public.athlete_claim_links FROM anon, authenticated;

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================
SELECT COUNT(*) AS existe FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'athlete_claim_links';
