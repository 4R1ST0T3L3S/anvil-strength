-- =============================================
-- ANVIL STRENGTH - CORE TRAINING SCHEMA v2
-- =============================================

-- 1. CLEANUP (Drop tables in correct order to avoid FK errors)
DROP TABLE IF EXISTS training_sets CASCADE;
DROP TABLE IF EXISTS session_exercises CASCADE;
DROP TABLE IF EXISTS training_sessions CASCADE;
DROP TABLE IF EXISTS training_blocks CASCADE;
DROP TABLE IF EXISTS exercise_library CASCADE;

-- 2. TABLES

-- Exercise Library
CREATE TABLE exercise_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    video_url TEXT,
    muscle_group TEXT, -- 'Chest', 'Legs', 'Back', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Blocks (Mesociclos)
CREATE TABLE training_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES auth.users(id),
    athlete_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL, -- "Mesociclo Febrero 2026"
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Sessions (Days)
CREATE TABLE training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID NOT NULL REFERENCES training_blocks(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL, -- 1, 2, 3... used for ordering
    name TEXT, -- "Día de Sentadilla", optional
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session Exercises (Join Table)
CREATE TABLE session_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercise_library(id),
    notes TEXT, -- Coach notes specific to this day
    order_index INTEGER NOT NULL DEFAULT 0, -- To order exercises within a session
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Sets (THE CORE)
CREATE TABLE training_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_exercise_id UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,

    -- COACH TARGETS (Plan)
    target_load NUMERIC, -- kg
    target_reps TEXT, -- Can be "5", "5-8", "AMRAP"
    target_rpe TEXT, -- Can be "8", "7-8"
    rest_seconds INTEGER, 
    is_video_required BOOLEAN DEFAULT FALSE,

    -- ATHLETE ACTUALS (Execution)
    actual_load NUMERIC,
    actual_reps INTEGER,
    actual_rpe NUMERIC, -- Usually precise number like 8.5
    video_url TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    feedback_text TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. RLS POLICIES (Security)

ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;

-- Policy Helper: Is User a Coach? (Simplified check based on metadata or role table)
-- For this prompt we assume standard Auth.uid() checks.

-- EXERCISE LIBRARY (Public Read, Coach Write)
CREATE POLICY "Public Read Exercises" ON exercise_library FOR SELECT USING (true);
CREATE POLICY "Coach Write Exercises" ON exercise_library FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'coach' 
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'coach'
);

-- TRAINING BLOCKS
-- Coach: ALL access
CREATE POLICY "Coach Manage Blocks" ON training_blocks FOR ALL USING (
    coach_id = auth.uid()
);
-- Athlete: Read Own
CREATE POLICY "Athlete Read Own Blocks" ON training_blocks FOR SELECT USING (
    athlete_id = auth.uid()
);

-- TRAINING SESSIONS (Cascade from Block)
CREATE POLICY "Coach Manage Sessions" ON training_sessions FOR ALL USING (
    EXISTS (SELECT 1 FROM training_blocks b WHERE b.id = training_sessions.block_id AND b.coach_id = auth.uid())
);
CREATE POLICY "Athlete Read Sessions" ON training_sessions FOR SELECT USING (
    EXISTS (SELECT 1 FROM training_blocks b WHERE b.id = training_sessions.block_id AND b.athlete_id = auth.uid())
);

-- SESSION EXERCISES (Cascade from Session -> Block)
CREATE POLICY "Coach Manage Exercises" ON session_exercises FOR ALL USING (
    EXISTS (
        SELECT 1 FROM training_sessions s 
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE s.id = session_exercises.session_id AND b.coach_id = auth.uid()
    )
);
CREATE POLICY "Athlete Read Exercises" ON session_exercises FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM training_sessions s 
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE s.id = session_exercises.session_id AND b.athlete_id = auth.uid()
    )
);

-- TRAINING SETS (The Tricky Part)
-- Coach: Full Control
CREATE POLICY "Coach Manage Sets" ON training_sets FOR ALL USING (
    EXISTS (
        SELECT 1 FROM session_exercises se
        JOIN training_sessions s ON s.id = se.session_id
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE se.id = training_sets.session_exercise_id AND b.coach_id = auth.uid()
    )
);

-- Athlete: Read
CREATE POLICY "Athlete Read Sets" ON training_sets FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM session_exercises se
        JOIN training_sessions s ON s.id = se.session_id
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE se.id = training_sets.session_exercise_id AND b.athlete_id = auth.uid()
    )
);

-- Athlete: Update (ONLY Actuals)
-- Note: Supabase/Postgres RLS for UPDATE checks the "USING" clause for row visibility
-- and "WITH CHECK" for the new data. 
-- To strictly limit COLUMNS, we usually use separate API endpoints or Database Triggers, 
-- but RLS is row-based.
-- For this prototype, we allow UPDATE if they own the block. The Frontend will enforce column limits, 
-- and a Trigger could strictly enforce it if needed (Skipping trigger for simplicity unless requested).
CREATE POLICY "Athlete Update Sets" ON training_sets FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM session_exercises se
        JOIN training_sessions s ON s.id = se.session_id
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE se.id = training_sets.session_exercise_id AND b.athlete_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM session_exercises se
        JOIN training_sessions s ON s.id = se.session_id
        JOIN training_blocks b ON b.id = s.block_id 
        WHERE se.id = training_sets.session_exercise_id AND b.athlete_id = auth.uid()
    )
);


-- 4. SEED DATA (Basic Exercises)
INSERT INTO exercise_library (name, muscle_group) VALUES 
('Squat (Barra Baja)', 'Pierna'),
('Bench Press (Competición)', 'Pecho'),
('Deadlift (Sumo)', 'Espalda/Pierna'),
('Deadlift (Convencional)', 'Espalda/Pierna'),
('Press Militar', 'Hombro'),
('Dominadas', 'Espalda'),
('Remo con Barra', 'Espalda'),
('Sentadilla Búlgara', 'Pierna'),
('Face Pull', 'Hombro'),
('Plancha Abdominal', 'Core');
