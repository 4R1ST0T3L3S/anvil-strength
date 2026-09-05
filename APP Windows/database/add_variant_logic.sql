-- 1. Add variant_name to session_exercises
ALTER TABLE session_exercises 
ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- 2. Seed Exercise Library with specific requested list
-- First, optional: Clear existing to ensure clean list (Verify if this is desired, usually yes for specific requests)
DELETE FROM exercise_library;

-- Insert requested exercises
INSERT INTO exercise_library (name, muscle_group) VALUES 
('Sentadilla', 'Pierna'),
('Sentadilla (Variante)', 'Pierna'),
('Press Banca', 'Pecho'),
('Press Banca (Variante)', 'Pecho'),
('Peso Muerto Convencional', 'Espalda/Pierna'),
('Peso Muerto Convencional (Variante)', 'Espalda/Pierna'),
('Peso Muerto Sumo', 'Espalda/Pierna'),
('Peso Muerto Sumo (Variante)', 'Espalda/Pierna'),
('Personalizado', 'General');
