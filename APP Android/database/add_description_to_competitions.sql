-- Añade descripción a las convocatorias de competición.
-- El coach escribe un texto al convocar; se muestra en la ficha pública del atleta.
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS description TEXT;
