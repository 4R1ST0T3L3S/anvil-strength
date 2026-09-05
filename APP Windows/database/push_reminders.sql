-- =====================================================
-- ANVIL STRENGTH — Push automático + recordatorios programados
-- Ejecutar DESPUÉS de desplegar la edge function send-push.
-- Requiere extensiones: pg_net (webhooks) y pg_cron (programación).
-- =====================================================
--
-- ANTES DE EJECUTAR ESTE ARCHIVO
-- -----------------------------------------------------
-- `send-push` se despliega con `--no-verify-jwt` porque quien la llama es
-- este disparador, que no tiene ninguna sesión de usuario que presentar. Eso
-- deja la función abierta a cualquiera que sepa su URL —y la URL lleva el
-- project-ref, que va dentro del bundle del navegador—, así que la puerta la
-- cierra un secreto compartido que solo conocen la función y este archivo.
--
-- Sin él, un POST desde cualquier sitio le mete a cualquier usuario un aviso
-- con el nombre y el icono de Anvil y un enlace elegido por quien lo manda.
--
-- El secreto se guarda en Vault y NO en este archivo, que está en el
-- repositorio. Crearlo una vez, con el MISMO valor en los dos sitios:
--
--   -- en el SQL Editor:
--   SELECT vault.create_secret('<cadena larga y aleatoria>', 'push_hook_secret');
--
--   # en la terminal:
--   supabase secrets set PUSH_HOOK_SECRET='<la misma cadena>'
--
-- Para rotarlo: `SELECT vault.update_secret(id, '<nueva>')` y volver a
-- lanzar el `secrets set`. Entre las dos órdenes los avisos fallan con 401,
-- que es lo correcto: mejor sin avisos que sin autenticación.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Cada notificación insertada dispara un push al usuario
CREATE OR REPLACE FUNCTION notify_push()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    secreto TEXT;
BEGIN
    SELECT decrypted_secret INTO secreto
      FROM vault.decrypted_secrets
     WHERE name = 'push_hook_secret';

    -- Sin secreto no se llama. Mandar la petición igualmente solo serviría
    -- para que la función la rechace con un 401 en cada inserción.
    IF secreto IS NULL THEN
        RAISE WARNING 'push_hook_secret no está en Vault: no se envía el aviso. Ver la cabecera de database/push_reminders.sql.';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://ihcyuoczbmjxfinxvzra.supabase.co/functions/v1/send-push',
        body := jsonb_build_object('record', jsonb_build_object(
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', NEW.message,
            'link', NEW.link
        )),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', secreto
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_notification_push ON notifications;
CREATE TRIGGER on_notification_push
    AFTER INSERT ON notifications
    FOR EACH ROW EXECUTE FUNCTION notify_push();

-- 2. RECORDATORIO: cuenta atrás de competición (a 7, 3 y 1 días) — corre cada día a las 09:00
CREATE OR REPLACE FUNCTION remind_competitions()
RETURNS void
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO notifications (user_id, title, message, link)
    SELECT c.athlete_id,
           '🏆 ¡Se acerca tu competición!',
           'Quedan ' || (c.date - CURRENT_DATE) || ' días para "' || c.name || '". ¡A afinar!',
           '/dashboard'
    FROM competitions c
    WHERE c.athlete_id IS NOT NULL
      AND (c.date - CURRENT_DATE) IN (7, 3, 1);
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('remind-competitions', '0 9 * * *', 'SELECT remind_competitions()');

-- 3. RECORDATORIO: check-in semanal (domingos 18:00) para atletas con coach que no lo hayan hecho
CREATE OR REPLACE FUNCTION remind_weekly_checkin()
RETURNS void
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    week_key TEXT := to_char(CURRENT_DATE, 'IYYY') || '-W' || to_char(CURRENT_DATE, 'IW');
BEGIN
    INSERT INTO notifications (user_id, title, message, link)
    SELECT ca.athlete_id,
           '📋 Check-in semanal pendiente',
           'Cuéntale a tu coach cómo ha ido la semana: cumplimiento, pasos y sensaciones.',
           '/dashboard'
    FROM coach_athletes ca
    WHERE NOT EXISTS (
        SELECT 1 FROM form_responses fr
        WHERE fr.athlete_id = ca.athlete_id AND fr.type = 'weekly' AND fr.period_key = week_key
    );
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('remind-weekly-checkin', '0 18 * * 0', 'SELECT remind_weekly_checkin()');
