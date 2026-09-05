-- =====================================================
-- ANVIL STRENGTH — Macrociclos + VBT por serie
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

-- 1. MACROCICLOS: agrupan bloques y opcionalmente apuntan a una competición
CREATE TABLE IF NOT EXISTS macrocycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    competition_name TEXT,
    competition_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE macrocycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "macrocycles_coach_all" ON macrocycles;
CREATE POLICY "macrocycles_coach_all" ON macrocycles
    FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS "macrocycles_athlete_read" ON macrocycles;
CREATE POLICY "macrocycles_athlete_read" ON macrocycles
    FOR SELECT USING (auth.uid() = athlete_id);

-- 2. Vincular bloques a un macro
ALTER TABLE training_blocks ADD COLUMN IF NOT EXISTS macro_id UUID REFERENCES macrocycles(id) ON DELETE SET NULL;

-- 3. VBT asociado a una serie concreta (además del nivel ejercicio actual)
ALTER TABLE training_sets ADD COLUMN IF NOT EXISTS vbt_file_url TEXT;
