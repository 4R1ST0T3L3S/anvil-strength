-- =====================================================================
-- ANVIL STRENGTH — PUSH NATIVO (APK Android, Firebase Cloud Messaging)
-- =====================================================================
--
-- `push_subscriptions` guarda suscripciones de WEB PUSH: un endpoint y dos
-- claves de cifrado (p256dh, auth). Un token de FCM es una sola cadena opaca
-- y no encaja en esa forma, así que va en tabla aparte. La función de borde
-- `send-push` lee de las dos y manda por el canal que toque.
--
-- Ejecutar en el editor SQL de Supabase. Idempotente.
--
-- Después: `supabase functions deploy send-push --no-verify-jwt` con los
-- secretos de Firebase puestos (ver docs/ANDROID.md).

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Token de FCM. ÚNICO: un dispositivo pertenece a una sola persona a la
    -- vez; si otra entra en el mismo móvil, el `upsert` del cliente se lo
    -- reasigna en vez de dejar al anterior recibiendo avisos ajenos.
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT NOT NULL DEFAULT 'android',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La función de borde busca por usuario.
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON public.device_push_tokens(user_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Cada uno gestiona los tokens de sus dispositivos. `(select auth.uid())` y
-- no `auth.uid()` a secas: se resuelve una vez por consulta y no por fila
-- (ver database/OPTIMIZACION_RENDIMIENTO.sql).
DROP POLICY IF EXISTS "Usuarios gestionan sus tokens" ON public.device_push_tokens;
CREATE POLICY "Usuarios gestionan sus tokens" ON public.device_push_tokens
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- La función de borde entra con la clave de servicio, que salta la RLS; la
-- política explícita queda por claridad y por si algún día se cierra eso.
DROP POLICY IF EXISTS "Servicio lee todos los tokens" ON public.device_push_tokens;
CREATE POLICY "Servicio lee todos los tokens" ON public.device_push_tokens
    FOR SELECT TO service_role
    USING (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_push_tokens TO authenticated;
GRANT SELECT, DELETE ON public.device_push_tokens TO service_role;
