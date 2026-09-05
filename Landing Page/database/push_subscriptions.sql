-- =====================================================
-- PUSH SUBSCRIPTIONS TABLE
-- Para almacenar tokens de dispositivos para Web Push
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por usuario
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Habilitar RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden gestionar sus propias suscripciones
DROP POLICY IF EXISTS "Users manage own subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role puede leer todas (para Edge Function)
DROP POLICY IF EXISTS "Service can read all subscriptions" ON push_subscriptions;
CREATE POLICY "Service can read all subscriptions" ON push_subscriptions
FOR SELECT TO service_role
USING (TRUE);
