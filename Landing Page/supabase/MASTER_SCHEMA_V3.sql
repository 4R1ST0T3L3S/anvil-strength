-- =====================================================
-- ANVIL STRENGTH - MASTER DATABASE SCHEMA v3.0
-- =====================================================
-- Last Updated: 2026-02-04
-- IDEMPOTENT: Safe to run multiple times
-- =====================================================

-- =====================================================
-- 0. EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE USER TABLES
-- =====================================================

-- Profiles Table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    nickname TEXT,
    role TEXT NOT NULL CHECK (role IN ('athlete', 'coach')),
    avatar_url TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Category fields
    weight_category TEXT,
    age_category TEXT,
    
    -- Athlete PR fields
    squat_pr NUMERIC,
    bench_pr NUMERIC,
    deadlift_pr NUMERIC,
    total_pr NUMERIC,
    
    -- Coach-specific fields
    biography TEXT,
    coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Add gender column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
        ALTER TABLE profiles ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
    END IF;
END $$;

-- Coach-Athlete Relationships
CREATE TABLE IF NOT EXISTS coach_athletes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coach_id, athlete_id)
);

-- =====================================================
-- 2. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. TRAINING SYSTEM TABLES
-- =====================================================

-- Exercise Library
CREATE TABLE IF NOT EXISTS exercise_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    video_url TEXT,
    muscle_group TEXT,
    coach_id UUID REFERENCES auth.users(id),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training Blocks (Mesocycles)
CREATE TABLE IF NOT EXISTS training_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES auth.users(id),
    athlete_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training Sessions (Days within Weeks)
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID NOT NULL REFERENCES training_blocks(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL DEFAULT 1,
    day_number INTEGER NOT NULL,
    name TEXT DEFAULT 'Día 1',
    scheduled_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add week_number if it doesn't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'training_sessions' AND column_name = 'week_number') THEN
        ALTER TABLE training_sessions ADD COLUMN week_number INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- Session Exercises
CREATE TABLE IF NOT EXISTS session_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercise_library(id),
    notes TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training Sets
CREATE TABLE IF NOT EXISTS training_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_exercise_id UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    
    -- Coach Targets
    target_load NUMERIC,
    target_reps TEXT,
    target_rpe TEXT,
    rest_seconds INTEGER,
    is_video_required BOOLEAN DEFAULT FALSE,
    
    -- Athlete Actuals
    actual_load NUMERIC,
    actual_reps INTEGER,
    actual_rpe NUMERIC,
    video_url TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    feedback_text TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Athlete Reviews
CREATE TABLE IF NOT EXISTS athlete_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL CHECK (length(review_text) >= 10 AND length(review_text) <= 1000),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitions
CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    date DATE NOT NULL,
    location TEXT,
    federation TEXT,
    athlete_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_user_id ON athlete_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_training_blocks_athlete ON training_blocks(athlete_id);
CREATE INDEX IF NOT EXISTS idx_training_blocks_coach ON training_blocks(coach_id);

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RLS POLICIES
-- =====================================================

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR id IN (SELECT athlete_id FROM coach_athletes WHERE coach_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Athletes can view all athletes for ranking" ON profiles;
CREATE POLICY "Athletes can view all athletes for ranking" ON profiles FOR SELECT TO authenticated
USING (role = 'athlete');

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT TO authenticated
WITH CHECK (TRUE);

-- EXERCISE LIBRARY
DROP POLICY IF EXISTS "Public read exercises" ON exercise_library;
CREATE POLICY "Public read exercises" ON exercise_library FOR SELECT TO authenticated
USING (is_public = TRUE OR coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches write exercises" ON exercise_library;
CREATE POLICY "Coaches write exercises" ON exercise_library FOR ALL TO authenticated
USING (coach_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'coach');

-- TRAINING BLOCKS
DROP POLICY IF EXISTS "Coach manage blocks" ON training_blocks;
CREATE POLICY "Coach manage blocks" ON training_blocks FOR ALL TO authenticated
USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "Athlete read own blocks" ON training_blocks;
CREATE POLICY "Athlete read own blocks" ON training_blocks FOR SELECT TO authenticated
USING (athlete_id = auth.uid());

-- TRAINING SESSIONS
DROP POLICY IF EXISTS "Coach manage sessions" ON training_sessions;
CREATE POLICY "Coach manage sessions" ON training_sessions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM training_blocks b WHERE b.id = block_id AND b.coach_id = auth.uid()));

DROP POLICY IF EXISTS "Athlete read sessions" ON training_sessions;
CREATE POLICY "Athlete read sessions" ON training_sessions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM training_blocks b WHERE b.id = block_id AND b.athlete_id = auth.uid()));

-- SESSION EXERCISES
DROP POLICY IF EXISTS "Coach manage session exercises" ON session_exercises;
CREATE POLICY "Coach manage session exercises" ON session_exercises FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM training_sessions s 
    JOIN training_blocks b ON b.id = s.block_id 
    WHERE s.id = session_id AND b.coach_id = auth.uid()
));

DROP POLICY IF EXISTS "Athlete read session exercises" ON session_exercises;
CREATE POLICY "Athlete read session exercises" ON session_exercises FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM training_sessions s 
    JOIN training_blocks b ON b.id = s.block_id 
    WHERE s.id = session_id AND b.athlete_id = auth.uid()
));

-- TRAINING SETS
DROP POLICY IF EXISTS "Coach manage sets" ON training_sets;
CREATE POLICY "Coach manage sets" ON training_sets FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM session_exercises se
    JOIN training_sessions s ON s.id = se.session_id
    JOIN training_blocks b ON b.id = s.block_id 
    WHERE se.id = session_exercise_id AND b.coach_id = auth.uid()
));

DROP POLICY IF EXISTS "Athlete read sets" ON training_sets;
CREATE POLICY "Athlete read sets" ON training_sets FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM session_exercises se
    JOIN training_sessions s ON s.id = se.session_id
    JOIN training_blocks b ON b.id = s.block_id 
    WHERE se.id = session_exercise_id AND b.athlete_id = auth.uid()
));

DROP POLICY IF EXISTS "Athlete update sets" ON training_sets;
CREATE POLICY "Athlete update sets" ON training_sets FOR UPDATE TO authenticated
USING (EXISTS (
    SELECT 1 FROM session_exercises se
    JOIN training_sessions s ON s.id = se.session_id
    JOIN training_blocks b ON b.id = s.block_id 
    WHERE se.id = session_exercise_id AND b.athlete_id = auth.uid()
));

-- ATHLETE REVIEWS
DROP POLICY IF EXISTS "Anyone can view reviews" ON athlete_reviews;
CREATE POLICY "Anyone can view reviews" ON athlete_reviews FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Users can create reviews" ON athlete_reviews;
CREATE POLICY "Users can create reviews" ON athlete_reviews FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reviews" ON athlete_reviews;
CREATE POLICY "Users can update own reviews" ON athlete_reviews FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reviews" ON athlete_reviews;
CREATE POLICY "Users can delete own reviews" ON athlete_reviews FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- COMPETITIONS
DROP POLICY IF EXISTS "View competitions" ON competitions;
CREATE POLICY "View competitions" ON competitions FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Athletes manage own competitions" ON competitions;
CREATE POLICY "Athletes manage own competitions" ON competitions FOR ALL TO authenticated
USING (athlete_id = auth.uid());

-- COACH ATHLETES
DROP POLICY IF EXISTS "View coach-athlete relationships" ON coach_athletes;
CREATE POLICY "View coach-athlete relationships" ON coach_athletes FOR SELECT TO authenticated
USING (coach_id = auth.uid() OR athlete_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can add athletes" ON coach_athletes;
CREATE POLICY "Coaches can add athletes" ON coach_athletes FOR INSERT TO authenticated
WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can remove athletes" ON coach_athletes;
CREATE POLICY "Coaches can remove athletes" ON coach_athletes FOR DELETE TO authenticated
USING (coach_id = auth.uid());

-- =====================================================
-- 7. FUNCTIONS & TRIGGERS
-- =====================================================

-- Updated At Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to athlete_reviews
DROP TRIGGER IF EXISTS update_athlete_reviews_updated_at ON athlete_reviews;
CREATE TRIGGER update_athlete_reviews_updated_at
    BEFORE UPDATE ON athlete_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. PR NOTIFICATION TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_pr_update()
RETURNS TRIGGER AS $$
DECLARE
    pr_type TEXT;
    pr_value NUMERIC;
    athlete_name TEXT;
BEGIN
    IF NEW.role = 'athlete' THEN
        athlete_name := COALESCE(NEW.full_name, 'Un atleta');
        
        -- Check Squat PR
        IF COALESCE(NEW.squat_pr, 0) > COALESCE(OLD.squat_pr, 0) THEN
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT p.id, '🏋️ Nuevo PR!', athlete_name || ' ha registrado ' || NEW.squat_pr || 'kg en Sentadilla', false, NOW()
            FROM public.profiles p WHERE p.role = 'athlete' AND p.id != NEW.id;
        END IF;
        
        -- Check Bench PR
        IF COALESCE(NEW.bench_pr, 0) > COALESCE(OLD.bench_pr, 0) THEN
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT p.id, '🏋️ Nuevo PR!', athlete_name || ' ha registrado ' || NEW.bench_pr || 'kg en Press Banca', false, NOW()
            FROM public.profiles p WHERE p.role = 'athlete' AND p.id != NEW.id;
        END IF;
        
        -- Check Deadlift PR
        IF COALESCE(NEW.deadlift_pr, 0) > COALESCE(OLD.deadlift_pr, 0) THEN
            INSERT INTO public.notifications (user_id, title, message, is_read, created_at)
            SELECT p.id, '🏋️ Nuevo PR!', athlete_name || ' ha registrado ' || NEW.deadlift_pr || 'kg en Peso Muerto', false, NOW()
            FROM public.profiles p WHERE p.role = 'athlete' AND p.id != NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_pr_update ON public.profiles;
CREATE TRIGGER on_pr_update
    AFTER UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_pr_update();

-- =====================================================
-- 9. SEED DATA (Basic Exercises)
-- =====================================================
INSERT INTO exercise_library (name, muscle_group, is_public) VALUES 
    ('Squat (Barra Baja)', 'Pierna', TRUE),
    ('Bench Press (Competición)', 'Pecho', TRUE),
    ('Deadlift (Sumo)', 'Espalda/Pierna', TRUE),
    ('Deadlift (Convencional)', 'Espalda/Pierna', TRUE),
    ('Press Militar', 'Hombro', TRUE),
    ('Dominadas', 'Espalda', TRUE),
    ('Remo con Barra', 'Espalda', TRUE),
    ('Sentadilla Búlgara', 'Pierna', TRUE),
    ('Face Pull', 'Hombro', TRUE),
    ('Plancha Abdominal', 'Core', TRUE)
ON CONFLICT DO NOTHING;

-- =====================================================
-- END OF SCHEMA v3.0
-- =====================================================
