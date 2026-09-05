-- =====================================================================
-- ANVIL STRENGTH — 0002 · EL CHAT, POR ESCRITO
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Verificar después con `npm run db:check`.
--
-- Cierra la primera de las dos deudas que K12 dejó apuntadas
-- (docs/DECISIONES_2026-08-21.md §K12):
--
--   > Escribir el esquema y la RLS de `chat_messages` en
--   > `database/migrations/`. Una tabla de producción que no está en el
--   > repositorio no se puede reconstruir ni auditar.
--
-- `chat_messages` se creó A MANO en el panel de Supabase. Existe, funciona y
-- sirve el chat que la aplicación enseña de verdad, pero no hay ni una línea
-- en el repositorio que diga cómo es. Esto lo arregla, y además trae los
-- índices que la consulta nueva del cliente necesita.
--
--
-- LO QUE ESTE FICHERO **NO** HACE, Y POR QUÉ
--
-- No toca las políticas de RLS si ya hay alguna. Nadie sabe con qué nombres se
-- crearon —se hicieron a mano— y las políticas permisivas se SUMAN: añadir las
-- mías encima de las que ya haya no las sustituye, las une con un OR y puede
-- ABRIR el acceso en vez de definirlo. Sobre una tabla con conversaciones
-- reales entre personas, eso no se hace a ciegas.
--
-- Así que: si la tabla no tiene ninguna política, las crea. Si tiene alguna,
-- las IMPRIME y no toca nada. Con esa lista delante se decide en diez segundos
-- si sobra alguna, que es justo lo que hoy no se puede hacer.
--
-- El resto del fichero (tabla, RLS, índices, función) es seguro en los dos
-- casos.
-- =====================================================================


-- =====================================================================
-- 1. LA TABLA
-- =====================================================================
--
-- Siete columnas, que son exactamente las que hay en producción —sondeadas una
-- por una el 24/08/2026— y exactamente las del tipo `ChatMessage` de
-- src/types/database.ts. En producción esto es un no-op; existe para que un
-- entorno nuevo se pueda levantar entero desde el repositorio.

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    type        TEXT        NOT NULL DEFAULT 'text',
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'chat_messages_type_check') THEN
        ALTER TABLE public.chat_messages
            ADD CONSTRAINT chat_messages_type_check
            CHECK (type IN ('text', 'image'));
    END IF;
END $$;

COMMENT ON TABLE public.chat_messages IS
    'El chat vivo entre entrenador y atleta. Creada a mano en el panel; escrita '
    'aqui el 24/08/2026 (K12). La tabla `messages`, del chat MUERTO cuyo cliente '
    'se borro en el bloque 1, es otra cosa y no la usa nadie.';


-- =====================================================================
-- 2. RLS
-- =====================================================================

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Las políticas: solo si no hay NINGUNA. Ver la cabecera.
DO $$
DECLARE
    v_n        INTEGER;
    v_politica RECORD;
BEGIN
    SELECT COUNT(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'chat_messages';

    IF v_n = 0 THEN
        RAISE NOTICE 'chat_messages no tenia politicas. Creando las canonicas.';

        -- Leer: solo las conversaciones en las que participo.
        CREATE POLICY "chat leer las mias" ON public.chat_messages
            FOR SELECT TO authenticated
            USING (
                sender_id      = (SELECT auth.uid())
                OR receiver_id = (SELECT auth.uid())
            );

        -- Escribir: solo en mi nombre. Nadie escribe haciendose pasar por otro.
        CREATE POLICY "chat escribir como yo" ON public.chat_messages
            FOR INSERT TO authenticated
            WITH CHECK (sender_id = (SELECT auth.uid()));

        -- Actualizar: SOLO para marcar como leido lo que me han mandado A MI.
        -- Nadie edita el contenido de un mensaje, ni el suyo ni el de nadie: un
        -- chat en el que el texto cambia despues de enviado no es un chat.
        CREATE POLICY "chat marcar leido lo mio" ON public.chat_messages
            FOR UPDATE TO authenticated
            USING      (receiver_id = (SELECT auth.uid()))
            WITH CHECK (receiver_id = (SELECT auth.uid()));

        -- Sin politica de DELETE a proposito: hoy nadie borra mensajes, y una
        -- politica que no hace falta es superficie de ataque gratis.
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE 'chat_messages YA tiene % politica(s). NO se ha tocado ninguna.', v_n;
        RAISE NOTICE 'Estas son. Comprueba que no haya duplicadas ni de mas:';
        RAISE NOTICE '';
        FOR v_politica IN
            SELECT policyname, cmd, roles::TEXT AS roles, qual, with_check
              FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'chat_messages'
             ORDER BY cmd, policyname
        LOOP
            RAISE NOTICE '  [%] "%"  roles=%', v_politica.cmd, v_politica.policyname, v_politica.roles;
            IF v_politica.qual IS NOT NULL THEN
                RAISE NOTICE '        USING       %', v_politica.qual;
            END IF;
            IF v_politica.with_check IS NOT NULL THEN
                RAISE NOTICE '        WITH CHECK  %', v_politica.with_check;
            END IF;
        END LOOP;
        RAISE NOTICE '';
        RAISE NOTICE '  Las canonicas que este fichero habria creado estan en su';
        RAISE NOTICE '  seccion 2. Si las de produccion dicen lo mismo, no hay';
        RAISE NOTICE '  nada que hacer.';
        RAISE NOTICE '';
    END IF;
END $$;


-- =====================================================================
-- 3. ÍNDICES
-- =====================================================================
--
-- POR QUÉ HACEN FALTA AHORA Y NO ANTES
--
-- Hasta hoy el cliente pedía TODOS los mensajes del usuario y filtraba la
-- conversación en el navegador, así que ningún índice le servía de nada: la
-- consulta era un barrido completo por diseño.
--
-- La consulta nueva pide UNA conversación y sus N últimos mensajes:
--
--     or=(and(sender_id.eq.A,receiver_id.eq.B),
--         and(sender_id.eq.B,receiver_id.eq.A))
--     order=created_at.desc  limit=50
--
-- Los dos índices siguientes cubren las dos ramas del OR, y llevan
-- `created_at DESC` dentro para que el ORDER + LIMIT salga del índice sin
-- ordenar nada.

CREATE INDEX IF NOT EXISTS chat_messages_conversacion_idx
    ON public.chat_messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_conversacion_inv_idx
    ON public.chat_messages (receiver_id, sender_id, created_at DESC);

-- Los no leídos: parcial, porque `is_read = TRUE` es la inmensa mayoría de la
-- tabla y no interesa indexarla. Es la que sostiene el contador del listado.
CREATE INDEX IF NOT EXISTS chat_messages_sin_leer_idx
    ON public.chat_messages (receiver_id, sender_id)
    WHERE is_read = FALSE;


-- =====================================================================
-- 4. EL LISTADO DE CONVERSACIONES, EN UNA CONSULTA
-- =====================================================================
--
-- EL PROBLEMA QUE RESUELVE
--
-- `CoachChatManager` pedía TODOS los mensajes del entrenador —con todos sus
-- atletas, desde el principio de los tiempos— para calcular dos cosas por
-- atleta: cuál fue el último mensaje y cuántos hay sin leer. Un entrenador con
-- treinta atletas y dos años de historial se descargaba la tabla entera para
-- pintar una lista de treinta líneas.
--
-- Esto lo hace el servidor y devuelve UNA FILA POR CONVERSACIÓN.
--
-- `SECURITY INVOKER` a propósito: así la RLS de la sección 2 SIGUE aplicando y
-- la función no puede enseñar una conversación ajena ni por error. La regla 3
-- del README pide `SECURITY DEFINER` para las comprobaciones que saltan de
-- tabla en tabla; ésta no salta de tabla, y aquí la RLS es justo lo que
-- queremos que se cumpla.

CREATE OR REPLACE FUNCTION public.chat_roster()
RETURNS TABLE (
    other_id        UUID,
    last_content    TEXT,
    last_type       TEXT,
    last_created_at TIMESTAMPTZ,
    last_sender_id  UUID,
    unread_count    INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    WITH yo AS (SELECT auth.uid() AS id),
    mios AS (
        SELECT m.content, m.type, m.created_at, m.sender_id, m.receiver_id, m.is_read,
               CASE WHEN m.sender_id = (SELECT id FROM yo)
                    THEN m.receiver_id ELSE m.sender_id END AS otro
          FROM public.chat_messages m
         WHERE m.sender_id   = (SELECT id FROM yo)
            OR m.receiver_id = (SELECT id FROM yo)
    ),
    ultimo AS (
        SELECT DISTINCT ON (otro) otro, content, type, created_at, sender_id
          FROM mios
         ORDER BY otro, created_at DESC
    ),
    sin_leer AS (
        SELECT otro, COUNT(*)::INTEGER AS n
          FROM mios
         WHERE receiver_id = (SELECT id FROM yo) AND is_read = FALSE
         GROUP BY otro
    )
    SELECT u.otro, u.content, u.type, u.created_at, u.sender_id,
           COALESCE(s.n, 0)
      FROM ultimo u
      LEFT JOIN sin_leer s ON s.otro = u.otro
     ORDER BY u.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.chat_roster() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_roster() TO authenticated;

COMMENT ON FUNCTION public.chat_roster() IS
    'Una fila por conversacion del usuario que llama: ultimo mensaje y numero de '
    'no leidos. Sustituye a descargarse la tabla entera en el navegador (K12, '
    'deuda 2). SECURITY INVOKER: la RLS sigue aplicando.';


-- =====================================================================
-- 5. COMPROBACIÓN
-- =====================================================================

DO $$
DECLARE
    v_tabla BOOLEAN;
    v_rls   BOOLEAN;
    v_pol   INTEGER;
    v_idx   INTEGER;
    v_fn    BOOLEAN;
    v_filas BIGINT;
    v_convs BIGINT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='chat_messages') INTO v_tabla;

    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='chat_messages';

    SELECT COUNT(*) INTO v_pol FROM pg_policies
     WHERE schemaname='public' AND tablename='chat_messages';

    SELECT COUNT(*) INTO v_idx FROM pg_indexes
     WHERE schemaname='public' AND tablename='chat_messages'
       AND indexname IN ('chat_messages_conversacion_idx',
                         'chat_messages_conversacion_inv_idx',
                         'chat_messages_sin_leer_idx');

    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='chat_roster') INTO v_fn;

    SELECT COUNT(*) INTO v_filas FROM public.chat_messages;

    SELECT COUNT(DISTINCT LEAST(sender_id::TEXT, receiver_id::TEXT) || '|' ||
                          GREATEST(sender_id::TEXT, receiver_id::TEXT))
      INTO v_convs FROM public.chat_messages;

    RAISE NOTICE '';
    RAISE NOTICE '=== 0002 · EL CHAT POR ESCRITO — verificacion ===';
    RAISE NOTICE 'tabla chat_messages ............... %', CASE WHEN v_tabla THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'RLS activada ...................... %', CASE WHEN v_rls   THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE 'politicas ......................... %', v_pol;
    RAISE NOTICE 'indices nuevos (de 3) ............. %', v_idx;
    RAISE NOTICE 'funcion chat_roster() ............. %', CASE WHEN v_fn    THEN 'SI' ELSE 'NO' END;
    RAISE NOTICE '';
    RAISE NOTICE 'mensajes guardados ................ %', v_filas;
    RAISE NOTICE 'conversaciones distintas .......... %', v_convs;
    RAISE NOTICE '';

    IF v_rls IS NOT TRUE THEN
        RAISE WARNING 'chat_messages SIN RLS: cualquiera puede leer las conversaciones.';
    END IF;
    IF v_pol = 0 THEN
        RAISE WARNING 'chat_messages con RLS y CERO politicas: nadie puede leer nada.';
    END IF;
END $$;


-- =====================================================================
-- APÉNDICE — la otra mitad de la deuda de K12
-- =====================================================================
--
-- K12 dejó apuntado que `messages` —la tabla del chat MUERTO— no se borra
-- todavía, y que antes hay que contar sus filas con sesión. Cuando toque:
--
--     SELECT COUNT(*) FROM public.messages;
--
-- Si sale 0, se borra sin más. Si sale cualquier otra cosa, hay que decidir si
-- ese historial se migra a `chat_messages` antes de borrar nada. Su código
-- cliente (`ChatView.tsx`, `chatService.ts`) ya no existe desde el bloque 1.
