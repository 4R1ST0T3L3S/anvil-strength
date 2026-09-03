-- 1. Ensure Table Exists (Safe if already exists)
NOTIFY "Verifying competitions table...";

CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    date DATE NOT NULL,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ensure Columns Exist (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'location') THEN
        ALTER TABLE competitions ADD COLUMN location TEXT;
    END IF;
END $$;

-- 3. Reset RLS Policies (Fixes Permission Errors)
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid "policy already exists" errors
DROP POLICY IF EXISTS "Coach Manage Competitions" ON competitions;
DROP POLICY IF EXISTS "Athlete Read Competitions" ON competitions;
DROP POLICY IF EXISTS "Coach Insert Competitions" ON competitions; -- In case used different names before
DROP POLICY IF EXISTS "Coach Update Competitions" ON competitions;
DROP POLICY IF EXISTS "Coach Delete Competitions" ON competitions;

-- 4. Re-Apply Correct Policies

-- Policy: Coach can do EVERYTHING (Insert, Select, Update, Delete)
CREATE POLICY "Coach Manage Competitions" ON competitions FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'coach' 
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'coach'
);

-- Policy: Athlete can only READ their own competitions
CREATE POLICY "Athlete Read Competitions" ON competitions FOR SELECT USING (
    auth.uid() = athlete_id
);

-- 5. Grant Permissions (Sometimes needed for new tables)
GRANT ALL ON competitions TO postgres;
GRANT ALL ON competitions TO authenticated;
GRANT ALL ON competitions TO service_role;

NOTIFY "Fix applied successfully! Competitions table is ready.";
