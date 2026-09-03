-- =====================================================
-- ANVIL STRENGTH — Metadatos de bloque + Biblioteca de ejercicios
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

-- 1. Descripción y objetivos del bloque (visibles para el atleta)
ALTER TABLE training_blocks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE training_blocks ADD COLUMN IF NOT EXISTS objectives TEXT;

-- 2. Biblioteca de ejercicios enfocada a powerlifting (públicos, visibles para todos los coaches)
-- Inserta solo los que no existan ya (case-insensitive).
INSERT INTO exercise_library (name, muscle_group, is_public)
SELECT v.name, v.muscle_group, TRUE
FROM (VALUES
    -- SENTADILLA Y VARIANTES
    ('Sentadilla', 'Pierna'),
    ('Sentadilla Competición', 'Pierna'),
    ('Sentadilla Barra Alta', 'Pierna'),
    ('Sentadilla Pausada', 'Pierna'),
    ('Sentadilla Tempo', 'Pierna'),
    ('Sentadilla Pin', 'Pierna'),
    ('Sentadilla con Gomas', 'Pierna'),
    ('Sentadilla con Cadenas', 'Pierna'),
    ('Sentadilla Frontal', 'Pierna'),
    ('Sentadilla SSB', 'Pierna'),
    ('Sentadilla a Cajón', 'Pierna'),
    ('Sentadilla Cinturón (Belt Squat)', 'Pierna'),
    ('Media Sentadilla', 'Pierna'),
    ('Sentadilla Búlgara', 'Pierna'),
    ('Zancadas', 'Pierna'),
    ('Prensa', 'Pierna'),
    ('Extensión de Cuádriceps', 'Pierna'),
    ('Curl Femoral', 'Pierna'),
    ('Hip Thrust', 'Glúteo'),
    -- PRESS BANCA Y VARIANTES
    ('Press Banca', 'Pecho'),
    ('Press Banca Competición', 'Pecho'),
    ('Banca Pausada', 'Pecho'),
    ('Banca Tempo', 'Pecho'),
    ('Banca Pin (Dead Press)', 'Pecho'),
    ('Banca con Gomas', 'Pecho'),
    ('Banca con Cadenas', 'Pecho'),
    ('Banca Agarre Cerrado', 'Pecho'),
    ('Banca Agarre Ancho', 'Pecho'),
    ('Banca Larsen', 'Pecho'),
    ('Banca Spoto', 'Pecho'),
    ('Banca Declinada', 'Pecho'),
    ('Press Inclinado', 'Pecho'),
    ('Press Inclinado Mancuernas', 'Pecho'),
    ('Press Militar', 'Hombro'),
    ('Press Militar Sentado', 'Hombro'),
    ('Fondos Lastrados', 'Pecho'),
    ('Aperturas', 'Pecho'),
    ('Extensión de Tríceps', 'Tríceps'),
    ('Press Francés', 'Tríceps'),
    ('JM Press', 'Tríceps'),
    -- PESO MUERTO Y VARIANTES
    ('Peso Muerto', 'Espalda'),
    ('Peso Muerto Competición', 'Espalda'),
    ('Peso Muerto Sumo', 'Espalda'),
    ('Peso Muerto Convencional', 'Espalda'),
    ('Peso Muerto Pausado', 'Espalda'),
    ('Peso Muerto Tempo', 'Espalda'),
    ('Peso Muerto con Gomas', 'Espalda'),
    ('Peso Muerto con Cadenas', 'Espalda'),
    ('Peso Muerto Déficit', 'Espalda'),
    ('Peso Muerto desde Bloques', 'Espalda'),
    ('Rack Pull', 'Espalda'),
    ('Peso Muerto Rumano', 'Femoral'),
    ('Peso Muerto Piernas Rígidas', 'Femoral'),
    ('Buenos Días (Good Morning)', 'Femoral'),
    ('Peso Muerto Agarre Snatch', 'Espalda'),
    -- ACCESORIOS ESPALDA / TORSO
    ('Dominadas', 'Espalda'),
    ('Dominadas Lastradas', 'Espalda'),
    ('Jalón al Pecho', 'Espalda'),
    ('Remo con Barra', 'Espalda'),
    ('Remo Pendlay', 'Espalda'),
    ('Remo con Mancuerna', 'Espalda'),
    ('Remo en Polea', 'Espalda'),
    ('Face Pull', 'Hombro'),
    ('Elevaciones Laterales', 'Hombro'),
    ('Curl de Bíceps', 'Bíceps'),
    ('Curl Martillo', 'Bíceps'),
    -- CORE
    ('Plancha Abdominal', 'Core'),
    ('Rueda Abdominal', 'Core'),
    ('Pallof Press', 'Core'),
    ('Farmer Walk', 'Core')
) AS v(name, muscle_group)
WHERE NOT EXISTS (
    SELECT 1 FROM exercise_library e WHERE LOWER(e.name) = LOWER(v.name)
);
