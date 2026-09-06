-- =====================================================================
-- ANVIL STRENGTH — `profiles.has_access` PASA A SER TRUE POR DEFECTO
-- =====================================================================
-- Idempotente. Ejecutar entero en Supabase Dashboard -> SQL Editor.
--
--
-- QUÉ HACÍA FALSE AHÍ
--
-- Lo puso `database/SECURITY_HARDENING.sql` (apartado 1.1). El objetivo de
-- aquel archivo NO era cerrar el acceso: era que el cliente no pudiera
-- ESCRIBIR la columna. Cualquiera podía hacer
--
--     supabase.from('profiles').update({ has_access: true })
--
-- porque la RLS filtra FILAS, nunca COLUMNAS. El arreglo fue revocar el
-- permiso de escritura sobre la columna y dejar que el valor lo pusiera un
-- DEFAULT del servidor. Ese DEFAULT se dejó en FALSE por prudencia, en un
-- momento en que `has_access` todavía cerraba el entrenamiento.
--
-- Eso ya no es así. La decisión K3 sacó el entrenamiento de `has_access` y
-- lo puso detrás de la PUERTA DE PAGO (`usePuertaDePago`), que es cosa del
-- entrenador y no de la administración. Hoy `has_access` solo decide:
--
--   · a dónde te manda el botón de la portada — `/perfil` si es FALSE, tu
--     panel si es TRUE (src/components/ui/SmartAuthButton.tsx);
--   · el interruptor de la tabla del panel de administración.
--
-- Con el DEFAULT en FALSE, quien se registraba aterrizaba en `/perfil` y no
-- tenía forma de llegar a su panel hasta que un administrador lo activaba a
-- mano. Que es exactamente lo que se quiere quitar.
--
-- LO QUE NO CAMBIA: la columna sigue SIN poder escribirse desde el
-- navegador. El REVOKE de SECURITY_HARDENING.sql se queda tal cual. Un
-- atleta no puede darse acceso a sí mismo; simplemente ahora nace con él.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL VALOR POR DEFECTO
-- ---------------------------------------------------------------------
-- Esto solo afecta a las filas NUEVAS. Las que ya existen no se tocan aquí
-- (para eso está el apartado 2).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name   = 'profiles'
                  AND column_name  = 'has_access') THEN

        ALTER TABLE public.profiles ALTER COLUMN has_access SET DEFAULT TRUE;
        RAISE NOTICE 'profiles.has_access: DEFAULT TRUE puesto.';
    ELSE
        RAISE WARNING 'profiles.has_access no existe en esta base. No se ha hecho nada.';
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.has_access IS
    'Acceso concedido por la ADMINISTRACIÓN de Anvil. TRUE por defecto desde 06/09/2026: se usa para SUSPENDER una cuenta, no para autorizarla una a una. El entrenamiento no depende de esto, sino de la puerta de pago (decisión K3). La columna sigue revocada al cliente: se escribe solo desde el panel de administración.';


-- ---------------------------------------------------------------------
-- 2. LOS QUE YA ESTABAN DENTRO
-- ---------------------------------------------------------------------
-- Cambiar el DEFAULT no toca ni una fila existente, así que sin esto todo
-- el que se registró hasta hoy seguiría aterrizando en `/perfil` — el
-- problema se arreglaría solo para las cuentas nuevas.
--
-- SI NO QUIERES ESTO, ejecuta solo el apartado 1 y salta este bloque.
-- Es la única parte del archivo que escribe datos.
--
-- Se excluye a quien esté SUSPENDIDO a propósito. Como no hay ninguna marca
-- que distinga "suspendido" de "nunca activado", el criterio es el estado de
-- la cuenta: las fichas fantasma que un coach creó a mano y nadie ha
-- reclamado todavía se quedan como están — no son personas que estén
-- intentando entrar.
DO $$
DECLARE
    n INTEGER;
    tiene_estado BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name   = 'profiles'
                      AND column_name  = 'account_status')
      INTO tiene_estado;

    IF tiene_estado THEN
        UPDATE public.profiles
           SET has_access = TRUE
         WHERE has_access IS DISTINCT FROM TRUE
           AND COALESCE(account_status, 'active') <> 'managed';
    ELSE
        UPDATE public.profiles
           SET has_access = TRUE
         WHERE has_access IS DISTINCT FROM TRUE;
    END IF;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Cuentas a las que se les ha dado acceso: %', n;
END $$;


-- ---------------------------------------------------------------------
-- 3. COMPROBACIÓN
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_default TEXT;
    v_sin     INTEGER;
BEGIN
    SELECT column_default INTO v_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'has_access';

    IF v_default IS NULL OR lower(v_default) NOT LIKE 'true%' THEN
        RAISE EXCEPTION 'FALLO: el DEFAULT de has_access es %, se esperaba true', COALESCE(v_default, '(ninguno)');
    END IF;

    SELECT count(*) INTO v_sin FROM public.profiles WHERE has_access IS DISTINCT FROM TRUE;
    RAISE NOTICE 'has_access: DEFAULT correcto. Quedan % cuentas sin acceso (fichas sin reclamar o suspendidas).', v_sin;
END $$;

NOTIFY pgrst, 'reload schema';
