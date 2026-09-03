-- 1. Reset RLS Policies to be simpler and more robust
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Drop old policies to ensure clean slate
DROP POLICY IF EXISTS "Coach Manage Competitions" ON competitions;
DROP POLICY IF EXISTS "Athlete Read Competitions" ON competitions;
DROP POLICY IF EXISTS "Coach Insert Competitions" ON competitions;

-- 2. Create new robust policies

-- Policy: Coach can manage competitions where THEY are listed as the coach.
-- This bypasses the need for complex metadata checks in JWT.
CREATE POLICY "Coach Manage Competitions" ON competitions FOR ALL USING (
    coach_id = auth.uid()
) WITH CHECK (
    coach_id = auth.uid()
);

-- Policy: Athlete can only READ their own competitions
CREATE POLICY "Athlete Read Competitions" ON competitions FOR SELECT USING (
    auth.uid() = athlete_id
);

-- 3. Notify success
NOTIFY "RLS Policies updated: Now checking coach_id = auth.uid()";
