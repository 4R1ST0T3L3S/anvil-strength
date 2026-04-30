-- =====================================================
-- TRAINING MODIFIERS MIGRATION
-- =====================================================

-- 1. Add modifiers array to session_exercises
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_exercises' AND column_name = 'modifiers') THEN
        ALTER TABLE session_exercises ADD COLUMN modifiers TEXT[] DEFAULT '{}'::TEXT[];
    END IF;
END $$;

-- 2. Add is_public column if it doesn't exist (some DBs may not have it)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exercise_library' AND column_name = 'is_public') THEN
        ALTER TABLE exercise_library ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Expand the exercise_library massively
INSERT INTO exercise_library (name, muscle_group) VALUES 
    -- Pecho
    ('Press Banca (Plano)', 'Pecho'),
    ('Press Banca (Inclinado)', 'Pecho'),
    ('Press Banca (Declinado)', 'Pecho'),
    ('Press Banca con Mancuernas', 'Pecho'),
    ('Press Inclinado con Mancuernas', 'Pecho'),
    ('Aperturas con Mancuernas', 'Pecho'),
    ('Aperturas en Polea', 'Pecho'),
    ('Fondos en Paralelas (Pecho)', 'Pecho'),
    ('Peck Deck', 'Pecho'),
    ('Spoto Press', 'Pecho'),
    ('Larsen Press', 'Pecho'),
    ('Banca Competi', 'Pecho'),
    ('Banca Touch and Go', 'Pecho'),
    ('Flexiones', 'Pecho'),

    -- Espalda
    ('Dominadas (Pronas)', 'Espalda'),
    ('Dominadas (Supinas)', 'Espalda'),
    ('Dominadas (Neutras)', 'Espalda'),
    ('Remo con Barra (Pendlay)', 'Espalda'),
    ('Remo en T', 'Espalda'),
    ('Remo con Mancuerna (Una mano)', 'Espalda'),
    ('Remo en Polea Baja', 'Espalda'),
    ('Jalón al Pecho', 'Espalda'),
    ('Jalón al Pecho (Agarre Estrecho)', 'Espalda'),
    ('Pullover en Polea', 'Espalda'),
    ('Face Pull', 'Espalda'),
    ('Rack Pull', 'Espalda'),
    ('Remo Maquina', 'Espalda'),
    ('Remo Pendlay', 'Espalda'),

    -- Pierna (Cuádriceps, Isquios, Glúteo, Gemelo)
    ('Sentadilla Barra Alta', 'Pierna'),
    ('Sentadilla Frontal', 'Pierna'),
    ('Sentadilla Hack', 'Pierna'),
    ('Sentadilla Competición', 'Pierna'),
    ('Sentadilla Barra Baja', 'Pierna'),
    ('Prensa de Piernas', 'Pierna'),
    ('Extensiones de Cuádriceps', 'Pierna'),
    ('Sentadilla Búlgara', 'Pierna'),
    ('Zancadas', 'Pierna'),
    ('Peso Muerto Rumano (RDL)', 'Pierna'),
    ('Peso Muerto Piernas Rígidas', 'Pierna'),
    ('Curl de Isquiotibiales (Tumbado)', 'Pierna'),
    ('Curl de Isquiotibiales (Sentado)', 'Pierna'),
    ('Hip Thrust', 'Pierna'),
    ('Glute Bridge', 'Pierna'),
    ('Elevación de Talones (De pie)', 'Pierna'),
    ('Elevación de Talones (Sentado)', 'Pierna'),

    -- Hombro
    ('Press Militar con Barra', 'Hombro'),
    ('Press Militar con Mancuernas', 'Hombro'),
    ('Elevaciones Laterales', 'Hombro'),
    ('Elevaciones Laterales en Polea', 'Hombro'),
    ('Elevaciones Frontales', 'Hombro'),
    ('Pájaros (Deltoides Posterior)', 'Hombro'),
    ('Encogimientos (Trapecio)', 'Hombro'),

    -- Brazos (Bíceps y Tríceps)
    ('Curl con Barra', 'Bíceps'),
    ('Curl con Barra EZ', 'Bíceps'),
    ('Curl Alterno con Mancuernas', 'Bíceps'),
    ('Curl Martillo', 'Bíceps'),
    ('Curl Predicador', 'Bíceps'),
    ('Curl en Polea', 'Bíceps'),
    ('Press Francés', 'Tríceps'),
    ('Extensiones de Tríceps en Polea', 'Tríceps'),
    ('Extensiones de Tríceps sobre la cabeza', 'Tríceps'),
    ('Rompecráneos (Skullcrushers)', 'Tríceps'),
    ('Fondos en Paralelas (Tríceps)', 'Tríceps'),
    ('Patada de Tríceps', 'Tríceps'),

    -- Core
    ('Crunch Abdominal', 'Core'),
    ('Plancha Abdominal (Plank)', 'Core'),
    ('Plancha Lateral', 'Core'),
    ('Rueda Abdominal (Ab Wheel)', 'Core'),
    ('Elevación de Piernas Colgado', 'Core'),
    ('Crunch en Polea', 'Core'),
    ('Giro Ruso (Russian Twist)', 'Core'),
    ('Press Pallof', 'Core')
ON CONFLICT DO NOTHING;
