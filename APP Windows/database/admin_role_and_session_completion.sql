-- =====================================================================
-- ANVIL STRENGTH — ROL DE ADMINISTRADOR + SESIÓN TERMINADA
-- =====================================================================
-- Ejecutar una vez contra producción (SQL Editor de Supabase).
-- Es idempotente: se puede volver a lanzar sin romper nada.
--
-- Contiene dos cosas que no tienen que ver entre sí pero que se despliegan
-- juntas porque las dos las necesita el mismo release:
--
--   1. `admin` como rol de verdad, en vez de una lista de correos escrita a
--      mano en seis ficheros del front.
--   2. `training_sessions.completed_at`, para que el atleta pueda decir "he
--      terminado el lunes" y el coach pueda calcular adherencia. Hasta ahora
--      solo existían series sueltas marcadas: nada indicaba que un día se
--      hubiera cerrado, así que "ha entrenado 3 de 4 días" no se podía
--      responder sin adivinar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ROL `admin`
-- ---------------------------------------------------------------------

-- 1.1 Antes de tocar el CHECK, comprobar que no hay roles fuera de la lista.
--     Sin esto, `ADD CONSTRAINT` falla con un error de violación que no dice
--     QUÉ fila lo provoca y hay que ir a buscarla a mano.
DO $$
DECLARE
    roles_desconocidos TEXT;
BEGIN
    SELECT string_agg(DISTINCT role, ', ') INTO roles_desconocidos
    FROM public.profiles
    WHERE role IS NOT NULL
      AND role NOT IN ('athlete', 'coach', 'nutritionist', 'visitor', 'admin');

    IF roles_desconocidos IS NOT NULL THEN
        RAISE EXCEPTION
            'Hay perfiles con roles fuera de la lista: %. Corrígelos antes de aplicar el CHECK.',
            roles_desconocidos;
    END IF;
END $$;

-- 1.2 Ampliar el CHECK de `role` para que admita 'admin'.
--
--     Se recorren TODOS los checks sobre esa columna, no solo el primero: si
--     quedara alguno viejo sin borrar, el ADD de después chocaría con él.
--
--     Los candidatos se buscan por la COLUMNA a la que afecta el constraint
--     (`c.conkey` contra `pg_attribute`), no buscando la palabra "role" en su
--     definición: un `LIKE '%role%'` también acierta en cualquier otro CHECK
--     que mencione esa cadena por casualidad, y lo habría borrado en
--     silencio. Cada borrado se anuncia, para que quede en el registro.
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT c.conname, pg_get_constraintdef(c.oid) AS definicion
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'profiles'
          AND c.contype = 'c'
          AND EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = k.attnum
              WHERE a.attname = 'role'
          )
    LOOP
        RAISE NOTICE 'Sustituyendo el CHECK %: %', con.conname, con.definicion;
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

-- Por si una ejecución anterior lo dejó a medias con este mismo nombre pero
-- sin que `conkey` lo relacionara con la columna.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    -- NULL permitido: hay perfiles antiguos sin rol y bloquearlos aquí
    -- rompería su siguiente UPDATE por una migración que no iba con ellos.
    CHECK (role IS NULL OR role IN ('athlete', 'coach', 'nutritionist', 'visitor', 'admin'));

-- 1.3 Promoción de los dos correos que hasta ahora estaban a fuego en el
--     front (seis ficheros distintos, ver src/lib/roles.ts).
--
--     EL CORREO NO ESTÁ EN `profiles`: vive en `auth.users`. La tabla
--     `profiles` de los ficheros de esquema declara una columna `email`,
--     pero en la base real NUNCA se creó — ya lo advierte
--     database/SECURITY_HARDENING.sql. Por eso se resuelve por `id` contra
--     `auth.users` en vez de filtrar por `profiles.email`.
UPDATE public.profiles p
SET role = 'admin'
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
  AND p.role IS DISTINCT FROM 'admin';

-- Aviso si no ha promocionado a nadie: casi siempre significa que esas
-- cuentas todavía no se han registrado, y conviene enterarse ahora y no
-- cuando el panel de admin devuelva a la portada sin explicación.
DO $$
DECLARE
    total INT;
BEGIN
    SELECT count(*) INTO total FROM public.profiles WHERE role = 'admin';
    IF total = 0 THEN
        RAISE WARNING
            'Ningún perfil ha quedado como admin. Comprueba que esas cuentas existen en auth.users. Mientras tanto, el front sigue reconociéndolas por correo (LEGACY_ADMIN_EMAILS).';
    ELSE
        RAISE NOTICE 'Perfiles con rol admin: %', total;
    END IF;
END $$;

-- Helper para las políticas RLS. `SECURITY DEFINER` porque una política que
-- consulta `profiles` desde dentro de una política sobre `profiles` entra en
-- recursión infinita.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ---------------------------------------------------------------------
-- 2. SESIÓN TERMINADA
-- ---------------------------------------------------------------------
-- Marca de tiempo, no un booleano: "cuándo" responde a más preguntas que
-- "sí/no" (cuánto tarda en entrenar, si entrena el día que toca, cuántos
-- días lleva sin aparecer) y el booleano se deriva de ella con IS NOT NULL.
ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Nota del atleta sobre CÓMO fue el día, distinta de las notas por serie.
ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS athlete_notes TEXT;

-- El coach filtra por "quién ha entrenado esta semana" en cada carga del
-- panel; sin índice eso es un recorrido completo de la tabla.
CREATE INDEX IF NOT EXISTS training_sessions_completed_at_idx
    ON public.training_sessions (completed_at DESC)
    WHERE completed_at IS NOT NULL;

-- `notes` por serie ya existe (database/FIX_ENTRENAMIENTO.sql), pero se
-- repite aquí por si este fichero se ejecuta sobre un despliegue limpio.
ALTER TABLE public.training_sets
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- El atleta escribe en su propia sesión. La política de UPDATE que había
-- solo contemplaba al coach dueño del bloque, así que marcar el día como
-- terminado habría fallado en silencio (PostgREST devuelve 0 filas, no un
-- error) para todos los atletas.
DROP POLICY IF EXISTS "athlete_completes_own_session" ON public.training_sessions;
CREATE POLICY "athlete_completes_own_session"
    ON public.training_sessions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.training_blocks b
            WHERE b.id = training_sessions.block_id
              AND b.athlete_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.training_blocks b
            WHERE b.id = training_sessions.block_id
              AND b.athlete_id = auth.uid()
        )
    );

NOTIFY pgrst, 'reload schema';
