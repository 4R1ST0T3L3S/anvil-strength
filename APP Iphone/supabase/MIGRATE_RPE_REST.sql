-- =====================================================
-- MIGRATE RPE AND REST TO EXERCISE LEVEL
-- =====================================================
-- Description: Adds 'rpe' and 'rest_seconds' to 'session_exercises'
-- so they can be set globally for the exercise instead of per set.

-- 1. Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_exercises' AND column_name = 'rpe') THEN
        ALTER TABLE session_exercises ADD COLUMN rpe TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_exercises' AND column_name = 'rest_seconds') THEN
        ALTER TABLE session_exercises ADD COLUMN rest_seconds INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_exercises' AND column_name = 'velocity_avg') THEN
        ALTER TABLE session_exercises ADD COLUMN velocity_avg TEXT;
    END IF;
END $$;

-- 2. Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'session_exercises';
