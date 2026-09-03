-- Create table for week metadata
CREATE TABLE IF NOT EXISTS training_weeks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    block_id UUID REFERENCES training_blocks(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(block_id, week_number)
);

-- Enable RLS
ALTER TABLE training_weeks ENABLE ROW LEVEL SECURITY;

-- Policies (Assuming standard authenticated user access for now, similar to blocks)
CREATE POLICY "Users can view weeks of their blocks" ON training_weeks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM training_blocks 
            WHERE training_blocks.id = training_weeks.block_id 
            AND training_blocks.athlete_id = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM training_blocks 
            WHERE training_blocks.id = training_weeks.block_id 
            AND training_blocks.coach_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can insert/update weeks" ON training_weeks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM training_blocks 
            WHERE training_blocks.id = training_weeks.block_id 
            AND training_blocks.coach_id = auth.uid()
        )
    );
