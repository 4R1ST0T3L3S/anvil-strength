-- =====================================================================
-- ANVIL STRENGTH — INVITACIONES DE ENTRENADOR
-- =====================================================================
-- Ejecutar una vez en el SQL Editor de Supabase. Idempotente.
--
-- EL PROBLEMA
--
-- Vincular un atleta con su entrenador solo se podía hacer entrando a
-- Supabase a mano. Eso significa que dar de alta a alguien depende de que
-- una persona concreta se siente delante del panel de la base de datos, y
-- que un atleta que se registra un domingo por la noche no puede empezar
-- hasta que eso ocurra.
--
-- Y HAY UN SEGUNDO PROBLEMA, PEOR
--
-- El vínculo vive en DOS SITIOS que nadie mantiene sincronizados:
--
--   · `coach_athletes` — lo que lee la lista de atletas del coach, el chat
--     y las políticas RLS de la biblioteca de ejercicios.
--   · `profiles.coach_id` — lo único que escribe el panel de administración
--     (ver adminService.updateUserCoach), y de donde salen el nombre, el
--     color y el logo del entrenador que ve el atleta.
--
-- Asignar por el panel de admin rellenaba el segundo y NO el primero: el
-- atleta veía a su entrenador, pero el entrenador no veía al atleta en su
-- lista. `redeem_coach_invite` escribe LOS DOS, que es la única forma de que
-- el vínculo signifique lo mismo mires por donde mires.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. COLUMNA QUE ESTE FICHERO DA POR HECHA
-- ---------------------------------------------------------------------
-- `redeem_coach_invite` escribe en `profiles.nutritionist_id` cuando quien
-- invita es nutricionista. La aplicación la usa, pero no consta que se
-- creara en ningún script (ver database/SECURITY_HARDENING.sql, sección 1).
-- Si ya existe, esto no hace nada.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS nutritionist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- 1. TABLA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- El código va en la URL y la gente lo dicta por WhatsApp o en voz alta.
    -- Se guarda en MAYÚSCULAS y se compara en mayúsculas, para que escribirlo
    -- en minúscula no dé un "invitación no válida" absurdo.
    code TEXT NOT NULL UNIQUE CHECK (code = upper(code) AND length(code) BETWEEN 6 AND 16),

    -- Nombre para que el coach distinga sus enlaces ("Grupo iniciación").
    label TEXT,

    /**
     * Un enlace para una persona o uno para un grupo.
     *
     * Por defecto 1: el caso normal es invitar a alguien concreto, y un
     * enlace de un solo uso que se reenvía por error no engancha a medio
     * gimnasio al equipo de nadie.
     */
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 500),
    uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),

    /**
     * Caducidad. NULL sería "para siempre", que en un enlace que da acceso a
     * los datos de entrenamiento de alguien es una mala idea por defecto, así
     * que el servicio siempre manda una fecha.
     */
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_invites_coach_idx ON public.coach_invites (coach_id, created_at DESC);

-- El canje busca SIEMPRE por código. Sin índice, cada canje recorre la tabla.
CREATE UNIQUE INDEX IF NOT EXISTS coach_invites_code_idx ON public.coach_invites (code);


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;

-- El coach gestiona SOLO sus invitaciones.
DROP POLICY IF EXISTS "coach_reads_own_invites" ON public.coach_invites;
CREATE POLICY "coach_reads_own_invites"
    ON public.coach_invites FOR SELECT
    USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "coach_creates_own_invites" ON public.coach_invites;
CREATE POLICY "coach_creates_own_invites"
    ON public.coach_invites FOR INSERT
    WITH CHECK (
        coach_id = auth.uid()
        -- Solo quien gestiona atletas puede invitar. Sin esto, cualquier
        -- atleta podría crear enlaces que le asignen atletas a sí mismo.
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('coach', 'nutritionist', 'admin')
        )
    );

DROP POLICY IF EXISTS "coach_updates_own_invites" ON public.coach_invites;
CREATE POLICY "coach_updates_own_invites"
    ON public.coach_invites FOR UPDATE
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "coach_deletes_own_invites" ON public.coach_invites;
CREATE POLICY "coach_deletes_own_invites"
    ON public.coach_invites FOR DELETE
    USING (coach_id = auth.uid());

-- NO hay política de SELECT para quien recibe la invitación, a propósito.
-- Si la hubiera, cualquiera podría listar la tabla entera y quedarse con
-- todos los códigos activos del club. Quien recibe el enlace pasa por las
-- dos funciones de abajo, que devuelven solo lo de SU código.


-- ---------------------------------------------------------------------
-- 3. VER DE QUIÉN ES LA INVITACIÓN (sin haber iniciado sesión)
-- ---------------------------------------------------------------------
-- Quien abre el enlace tiene que ver a quién se está uniendo ANTES de crear
-- una cuenta. Un "Regístrate" a secas, sin decir de parte de quién viene, es
-- indistinguible de un enlace de spam.
--
-- Devuelve solo datos ya públicos en la portada (nombre, avatar, marca) y
-- únicamente del código exacto que se pregunta: nunca lista nada.
CREATE OR REPLACE FUNCTION public.peek_coach_invite(p_code TEXT)
RETURNS TABLE (
    coach_name TEXT,
    coach_avatar TEXT,
    coach_role TEXT,
    is_valid BOOLEAN,
    reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    inv public.coach_invites%ROWTYPE;
    prof public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM public.coach_invites WHERE code = upper(trim(p_code));

    IF inv.id IS NULL THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE, 'no_existe'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO prof FROM public.profiles WHERE id = inv.coach_id;

    IF inv.revoked_at IS NOT NULL THEN
        RETURN QUERY SELECT prof.full_name, prof.avatar_url, prof.role, FALSE, 'revocada'::TEXT;
    ELSIF inv.expires_at IS NOT NULL AND inv.expires_at < NOW() THEN
        RETURN QUERY SELECT prof.full_name, prof.avatar_url, prof.role, FALSE, 'caducada'::TEXT;
    ELSIF inv.uses >= inv.max_uses THEN
        RETURN QUERY SELECT prof.full_name, prof.avatar_url, prof.role, FALSE, 'agotada'::TEXT;
    ELSE
        RETURN QUERY SELECT prof.full_name, prof.avatar_url, prof.role, TRUE, NULL::TEXT;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_coach_invite(TEXT) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. CANJEAR
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` porque el atleta tiene que poder escribir en
-- `coach_athletes` (que es del coach) y contar un uso en una invitación que
-- no puede ni leer. Todas las comprobaciones se hacen aquí dentro.
CREATE OR REPLACE FUNCTION public.redeem_coach_invite(p_code TEXT)
RETURNS TABLE (ok BOOLEAN, reason TEXT, coach_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inv public.coach_invites%ROWTYPE;
    me UUID := auth.uid();
    coach_role TEXT;
    coach_full_name TEXT;
BEGIN
    IF me IS NULL THEN
        RETURN QUERY SELECT FALSE, 'sin_sesion'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- `FOR UPDATE` bloquea la fila hasta el final de la transacción. Sin él,
    -- dos personas canjeando el mismo enlace de un solo uso a la vez leerían
    -- las dos `uses = 0` y entrarían las dos.
    SELECT * INTO inv
    FROM public.coach_invites
    WHERE code = upper(trim(p_code))
    FOR UPDATE;

    IF inv.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'no_existe'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    SELECT p.role, p.full_name INTO coach_role, coach_full_name
    FROM public.profiles p WHERE p.id = inv.coach_id;

    IF inv.revoked_at IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'revocada'::TEXT, coach_full_name;
        RETURN;
    END IF;

    IF inv.expires_at IS NOT NULL AND inv.expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, 'caducada'::TEXT, coach_full_name;
        RETURN;
    END IF;

    IF inv.uses >= inv.max_uses THEN
        RETURN QUERY SELECT FALSE, 'agotada'::TEXT, coach_full_name;
        RETURN;
    END IF;

    IF inv.coach_id = me THEN
        RETURN QUERY SELECT FALSE, 'es_tuya'::TEXT, coach_full_name;
        RETURN;
    END IF;

    -- Ya estaba vinculado: no es un error, es que ha pulsado dos veces.
    -- No se gasta un uso por ello.
    IF EXISTS (
        SELECT 1 FROM public.coach_athletes
        WHERE coach_id = inv.coach_id AND athlete_id = me
    ) THEN
        RETURN QUERY SELECT TRUE, 'ya_vinculado'::TEXT, coach_full_name;
        RETURN;
    END IF;

    -- --- El vínculo, en los DOS sitios donde vive ---------------------
    INSERT INTO public.coach_athletes (coach_id, athlete_id)
    VALUES (inv.coach_id, me)
    ON CONFLICT (coach_id, athlete_id) DO NOTHING;

    -- Un nutricionista ocupa la casilla de nutricionista, no la de coach:
    -- un atleta puede tener los dos a la vez y meterlos en el mismo campo
    -- haría que asignar dietista te dejara sin entrenador.
    IF coach_role = 'nutritionist' THEN
        UPDATE public.profiles SET nutritionist_id = inv.coach_id WHERE id = me;
    ELSE
        UPDATE public.profiles SET coach_id = inv.coach_id WHERE id = me;
    END IF;

    UPDATE public.coach_invites SET uses = uses + 1 WHERE id = inv.id;

    RETURN QUERY SELECT TRUE, NULL::TEXT, coach_full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coach_invite(TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- 5. GENERADOR DE CÓDIGOS
-- ---------------------------------------------------------------------
-- El alfabeto no tiene 0/O, 1/I/L ni U/V: son los pares que la gente
-- confunde al dictar un código por teléfono o al copiarlo de una pantalla.
-- Se genera en el servidor para que dos coaches a la vez no puedan chocar.
CREATE OR REPLACE FUNCTION public.new_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
    alfabeto TEXT := 'ABCDEFGHJKMNPQRSTWXYZ23456789';
    candidato TEXT;
    intento INT := 0;
BEGIN
    LOOP
        candidato := '';
        FOR i IN 1..8 LOOP
            candidato := candidato || substr(alfabeto, 1 + floor(random() * length(alfabeto))::INT, 1);
        END LOOP;

        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coach_invites WHERE code = candidato);

        intento := intento + 1;
        IF intento > 20 THEN
            RAISE EXCEPTION 'No se pudo generar un código libre';
        END IF;
    END LOOP;

    RETURN candidato;
END;
$$;

GRANT EXECUTE ON FUNCTION public.new_invite_code() TO authenticated;

NOTIFY pgrst, 'reload schema';
