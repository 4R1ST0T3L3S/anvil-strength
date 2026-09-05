-- =====================================================
-- ANVIL STRENGTH — Mensajería y Notificaciones
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

-- 1. MENSAJES (chat coach <-> atleta)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
    ON messages (recipient_id) WHERE NOT is_read;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON messages;
CREATE POLICY "messages_select_own" ON messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "messages_insert_own" ON messages;
CREATE POLICY "messages_insert_own" ON messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_update_read" ON messages;
CREATE POLICY "messages_update_read" ON messages
    FOR UPDATE USING (auth.uid() = recipient_id);

-- 2. ANUNCIOS DEL CLUB (solo administradores publican)
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 3000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_all" ON announcements;
CREATE POLICY "announcements_select_all" ON announcements
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "announcements_insert_admin" ON announcements;
CREATE POLICY "announcements_insert_admin" ON announcements
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'email' IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
    );

DROP POLICY IF EXISTS "announcements_delete_admin" ON announcements;
CREATE POLICY "announcements_delete_admin" ON announcements
    FOR DELETE USING (
        auth.jwt() ->> 'email' IN ('anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com')
    );

-- 3. RLS PARA NOTIFICATIONS (la tabla ya existe en MASTER_SCHEMA_V3)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 4. TRIGGERS AUTOMÁTICOS -> notifications

-- 4a. Nuevo bloque de entrenamiento -> avisa al atleta
CREATE OR REPLACE FUNCTION notify_new_training_block()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO notifications (user_id, title, message, link)
    VALUES (
        NEW.athlete_id,
        '¡Nuevo bloque de entrenamiento!',
        'Tu entrenador te acaba de subir el bloque "' || NEW.name || '". ¡A darle caña!',
        '/dashboard'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_training_block_created ON training_blocks;
CREATE TRIGGER on_training_block_created
    AFTER INSERT ON training_blocks
    FOR EACH ROW EXECUTE FUNCTION notify_new_training_block();

-- 4b. Nuevo mensaje -> avisa al destinatario
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    sender_name TEXT;
BEGIN
    SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
    INSERT INTO notifications (user_id, title, message, link)
    VALUES (
        NEW.recipient_id,
        'Nuevo mensaje',
        COALESCE(sender_name, 'Alguien') || ' te ha enviado un mensaje.',
        '/dashboard'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_message_created ON messages;
CREATE TRIGGER on_message_created
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- 4c. Nuevo anuncio del club -> avisa a todos los usuarios
CREATE OR REPLACE FUNCTION notify_new_announcement()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO notifications (user_id, title, message, link)
    SELECT p.id,
           '📢 ' || NEW.title,
           LEFT(NEW.content, 140),
           '/dashboard'
    FROM profiles p
    WHERE p.id <> NEW.author_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_announcement_created ON announcements;
CREATE TRIGGER on_announcement_created
    AFTER INSERT ON announcements
    FOR EACH ROW EXECUTE FUNCTION notify_new_announcement();

-- 4d. Convocatoria a competición -> avisa al atleta
CREATE OR REPLACE FUNCTION notify_competition_assigned()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Solo si la asigna un coach (no auto-asignada)
    IF NEW.coach_id IS NOT NULL AND NEW.athlete_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, message, link)
        VALUES (
            NEW.athlete_id,
            '🏆 ¡Estás convocado!',
            'Tu entrenador te ha convocado a "' || NEW.name || '" (' || TO_CHAR(NEW.date, 'DD/MM/YYYY') || ').',
            '/dashboard'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_competition_assigned ON competitions;
CREATE TRIGGER on_competition_assigned
    AFTER INSERT ON competitions
    FOR EACH ROW EXECUTE FUNCTION notify_competition_assigned();

-- 5. REALTIME: activar para chat y notificaciones
-- (Si ya están añadidas, estas líneas dan error inofensivo; ejecutar una a una si hace falta)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
