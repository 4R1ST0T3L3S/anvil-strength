-- =====================================================
-- ANVIL STRENGTH — Plantillas de día reutilizables
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

CREATE TABLE IF NOT EXISTS day_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    -- [{ name, variant_name, notes, rpe, velocity_avg, rest_seconds, sets: [{target_reps, target_rpe, target_load, rest_seconds}] }]
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_templates_coach ON day_templates(coach_id);

ALTER TABLE day_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "day_templates_coach_all" ON day_templates;
CREATE POLICY "day_templates_coach_all" ON day_templates
    FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
