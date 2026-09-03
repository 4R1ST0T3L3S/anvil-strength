-- =====================================================
-- ANVIL STRENGTH - COMPLETE DATABASE SCHEMA
-- =====================================================
-- Last Updated: 2026-01-30
-- Description: Complete Supabase database setup with RLS policies
-- Includes: All tables, reviews system, and comments cleanup
-- =====================================================

-- =====================================================
-- 0. CLEANUP OLD DATA
-- =====================================================

-- Remove old blog comments table (replaced by reviews system)
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS posts CASCADE;

-- =====================================================
-- 1. EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 2. TABLES
-- =====================================================

-- Profiles Table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    nickname TEXT,
    role TEXT NOT NULL CHECK (role IN ('athlete', 'coach')),
    profile_image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Athlete-specific fields
    weight_category TEXT,
    age_category TEXT,
    squat_pr NUMERIC,
    bench_pr NUMERIC,
    deadlift_pr NUMERIC,
    
    -- Coach-specific fields
    biography TEXT
);

-- Coach-Athlete Relationships
CREATE TABLE IF NOT EXISTS coach_athletes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coach_id, athlete_id)
);

-- Training Plans
CREATE TABLE IF NOT EXISTS training_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workouts (part of a training plan)
CREATE TABLE IF NOT EXISTS workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercises within workouts
CREATE TABLE IF NOT EXISTS exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sets INTEGER NOT NULL,
    reps TEXT, -- Can be "5", "5-8", "AMRAP", etc.
    weight NUMERIC,
    rpe NUMERIC, -- Rate of Perceived Exertion (1-10)
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competition Calendar
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

-- Athlete Reviews (NEW - 2026-01-29)
CREATE TABLE IF NOT EXISTS athlete_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL CHECK (length(review_text) >= 10 AND length(review_text) <= 1000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- 3. INDEXES
-- =====================================================

-- Athlete Reviews Indexes
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_user_id ON athlete_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_created_at ON athlete_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athlete_reviews_rating ON athlete_reviews(rating);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_reviews ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- SELECT: Users can read their own profile and coaches can read their athletes
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id 
    OR 
    id IN (
        SELECT athlete_id FROM coach_athletes WHERE coach_id = auth.uid()
    )
);

-- INSERT: Allow new user registration (handled by auth triggers)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- UPDATE: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- =====================================================
-- COACH_ATHLETES POLICIES
-- =====================================================

-- SELECT: Coaches can see their athletes, athletes can see their coaches
DROP POLICY IF EXISTS "View coach-athlete relationships" ON coach_athletes;
CREATE POLICY "View coach-athlete relationships"
ON coach_athletes FOR SELECT
TO authenticated
USING (
    coach_id = auth.uid() 
    OR 
    athlete_id = auth.uid()
);

-- INSERT: Only coaches can create relationships
DROP POLICY IF EXISTS "Coaches can add athletes" ON coach_athletes;
CREATE POLICY "Coaches can add athletes"
ON coach_athletes FOR INSERT
TO authenticated
WITH CHECK (
    coach_id = auth.uid() 
    AND 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- DELETE: Only coaches can remove relationships
DROP POLICY IF EXISTS "Coaches can remove athletes" ON coach_athletes;
CREATE POLICY "Coaches can remove athletes"
ON coach_athletes FOR DELETE
TO authenticated
USING (
    coach_id = auth.uid() 
    AND 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- =====================================================
-- TRAINING_PLANS POLICIES
-- =====================================================

-- SELECT: Athletes see their own plans, coaches see their athletes' plans
DROP POLICY IF EXISTS "View training plans" ON training_plans;
CREATE POLICY "View training plans"
ON training_plans FOR SELECT
TO authenticated
USING (
    athlete_id = auth.uid() 
    OR 
    coach_id = auth.uid()
    OR
    athlete_id IN (
        SELECT athlete_id FROM coach_athletes WHERE coach_id = auth.uid()
    )
);

-- INSERT: Coaches can create plans for their athletes
DROP POLICY IF EXISTS "Coaches can create plans" ON training_plans;
CREATE POLICY "Coaches can create plans"
ON training_plans FOR INSERT
TO authenticated
WITH CHECK (
    coach_id = auth.uid() 
    AND 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
    AND
    athlete_id IN (
        SELECT athlete_id FROM coach_athletes WHERE coach_id = auth.uid()
    )
);

-- UPDATE: Coaches can update plans they created
DROP POLICY IF EXISTS "Coaches can update plans" ON training_plans;
CREATE POLICY "Coaches can update plans"
ON training_plans FOR UPDATE
TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- =====================================================
-- WORKOUTS POLICIES
-- =====================================================

-- SELECT: See workouts from accessible plans
DROP POLICY IF EXISTS "View workouts" ON workouts;
CREATE POLICY "View workouts"
ON workouts FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM training_plans 
        WHERE training_plans.id = workouts.plan_id
        AND (
            training_plans.athlete_id = auth.uid() 
            OR 
            training_plans.coach_id = auth.uid()
        )
    )
);

-- INSERT: Coaches can add workouts to their plans
DROP POLICY IF EXISTS "Coaches can create workouts" ON workouts;
CREATE POLICY "Coaches can create workouts"
ON workouts FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM training_plans 
        WHERE training_plans.id = workouts.plan_id
        AND training_plans.coach_id = auth.uid()
    )
);

-- UPDATE: Coaches can update workouts, athletes can mark as completed
DROP POLICY IF EXISTS "Update workouts" ON workouts;
CREATE POLICY "Update workouts"
ON workouts FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM training_plans 
        WHERE training_plans.id = workouts.plan_id
        AND (
            training_plans.coach_id = auth.uid()
            OR
            training_plans.athlete_id = auth.uid()
        )
    )
);

-- =====================================================
-- EXERCISES POLICIES
-- =====================================================

-- SELECT: See exercises from accessible workouts
DROP POLICY IF EXISTS "View exercises" ON exercises;
CREATE POLICY "View exercises"
ON exercises FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workouts 
        INNER JOIN training_plans ON workouts.plan_id = training_plans.id
        WHERE workouts.id = exercises.workout_id
        AND (
            training_plans.athlete_id = auth.uid() 
            OR 
            training_plans.coach_id = auth.uid()
        )
    )
);

-- INSERT: Coaches can add exercises
DROP POLICY IF EXISTS "Coaches can create exercises" ON exercises;
CREATE POLICY "Coaches can create exercises"
ON exercises FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM workouts 
        INNER JOIN training_plans ON workouts.plan_id = training_plans.id
        WHERE workouts.id = exercises.workout_id
        AND training_plans.coach_id = auth.uid()
    )
);

-- UPDATE: Coaches can update exercises
DROP POLICY IF EXISTS "Coaches can update exercises" ON exercises;
CREATE POLICY "Coaches can update exercises"
ON exercises FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM workouts 
        INNER JOIN training_plans ON workouts.plan_id = training_plans.id
        WHERE workouts.id = exercises.workout_id
        AND training_plans.coach_id = auth.uid()
    )
);

-- =====================================================
-- COMPETITIONS POLICIES
-- =====================================================

-- SELECT: Users can see all competitions or their own
DROP POLICY IF EXISTS "View competitions" ON competitions;
CREATE POLICY "View competitions"
ON competitions FOR SELECT
TO authenticated
USING (TRUE); -- All authenticated users can view competitions

-- INSERT: Athletes can add their own competitions
DROP POLICY IF EXISTS "Athletes can create competitions" ON competitions;
CREATE POLICY "Athletes can create competitions"
ON competitions FOR INSERT
TO authenticated
WITH CHECK (athlete_id = auth.uid());

-- UPDATE: Athletes can update their own competitions
DROP POLICY IF EXISTS "Athletes can update competitions" ON competitions;
CREATE POLICY "Athletes can update competitions"
ON competitions FOR UPDATE
TO authenticated
USING (athlete_id = auth.uid())
WITH CHECK (athlete_id = auth.uid());

-- DELETE: Athletes can delete their own competitions
DROP POLICY IF EXISTS "Athletes can delete competitions" ON competitions;
CREATE POLICY "Athletes can delete competitions"
ON competitions FOR DELETE
TO authenticated
USING (athlete_id = auth.uid());

-- =====================================================
-- ATHLETE REVIEWS POLICIES
-- =====================================================

-- SELECT: Anyone can view reviews (public read)
DROP POLICY IF EXISTS "Anyone can view reviews" ON athlete_reviews;
CREATE POLICY "Anyone can view reviews"
ON athlete_reviews FOR SELECT
USING (TRUE);

-- INSERT: Only authenticated users can create reviews
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON athlete_reviews;
CREATE POLICY "Authenticated users can create reviews"
ON athlete_reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own reviews only
DROP POLICY IF EXISTS "Users can update own reviews" ON athlete_reviews;
CREATE POLICY "Users can update own reviews"
ON athlete_reviews FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own reviews only
DROP POLICY IF EXISTS "Users can delete own reviews" ON athlete_reviews;
CREATE POLICY "Users can delete own reviews"
ON athlete_reviews FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- 5. FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_training_plans_updated_at ON training_plans;
CREATE TRIGGER update_training_plans_updated_at
    BEFORE UPDATE ON training_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workouts_updated_at ON workouts;
CREATE TRIGGER update_workouts_updated_at
    BEFORE UPDATE ON workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for athlete_reviews updated_at
DROP TRIGGER IF EXISTS athlete_reviews_updated_at ON athlete_reviews;
CREATE TRIGGER athlete_reviews_updated_at
    BEFORE UPDATE ON athlete_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. STORAGE BUCKETS (for profile images)
-- =====================================================
-- Note: Storage buckets must be created via Supabase Dashboard
-- Bucket name: 'profiles'
-- Public: true
-- Allowed MIME types: image/jpeg, image/png, image/webp
-- Max file size: 5MB

-- =====================================================
-- 7. VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the schema was created successfully:

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Count records in each table
SELECT 
    'profiles' as table_name, COUNT(*) as count FROM profiles
UNION ALL
SELECT 'coach_athletes', COUNT(*) FROM coach_athletes
UNION ALL
SELECT 'training_plans', COUNT(*) FROM training_plans
UNION ALL
SELECT 'workouts', COUNT(*) FROM workouts
UNION ALL
SELECT 'exercises', COUNT(*) FROM exercises
UNION ALL
SELECT 'competitions', COUNT(*) FROM competitions
UNION ALL
SELECT 'athlete_reviews', COUNT(*) FROM athlete_reviews;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
-- Schema Version: 2.0
-- Last Updated: 2026-01-30
-- Changes:
-- - Added athlete_reviews table
-- - Removed old comments/posts tables
-- - Changed profile 'name' field to 'full_name' for consistency
-- - All RLS policies updated and verified
-- =====================================================
