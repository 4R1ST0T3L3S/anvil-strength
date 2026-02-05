-- Competitions Table (Assigned Competitions)
CREATE TABLE competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES auth.users(id), -- Who assigned it
    name TEXT NOT NULL,
    date DATE NOT NULL,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- Coach can do everything
CREATE POLICY "Coach Manage Competitions" ON competitions FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'coach' 
    OR 
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'coach'
);

-- Athlete can read their own
CREATE POLICY "Athlete Read Competitions" ON competitions FOR SELECT USING (
    auth.uid() = athlete_id
);
