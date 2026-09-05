-- =====================================================
-- ANVIL STRENGTH — Check-ins (formularios) + Game Plan
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

-- 1. PLANTILLAS DE FORMULARIO (personalizables por el coach; si no hay, se usan las predefinidas de la app)
CREATE TABLE IF NOT EXISTS form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
    questions JSONB NOT NULL, -- [{ id, label, qtype: 'scale'|'number'|'text' }]
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (coach_id, type)
);

ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_templates_coach_all" ON form_templates;
CREATE POLICY "form_templates_coach_all" ON form_templates
    FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- Los atletas leen la plantilla de su coach
DROP POLICY IF EXISTS "form_templates_athlete_read" ON form_templates;
CREATE POLICY "form_templates_athlete_read" ON form_templates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.coach_id = form_templates.coach_id AND ca.athlete_id = auth.uid()
        )
    );

-- 2. RESPUESTAS
CREATE TABLE IF NOT EXISTS form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
    period_key TEXT NOT NULL, -- diario: 'YYYY-MM-DD' | semanal: 'YYYY-Www'
    answers JSONB NOT NULL,   -- [{ id, label, qtype, value }]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (athlete_id, type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_form_responses_athlete ON form_responses(athlete_id, type, period_key DESC);

ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_responses_athlete_all" ON form_responses;
CREATE POLICY "form_responses_athlete_all" ON form_responses
    FOR ALL USING (auth.uid() = athlete_id) WITH CHECK (auth.uid() = athlete_id);

-- El coach lee las respuestas de sus atletas
DROP POLICY IF EXISTS "form_responses_coach_read" ON form_responses;
CREATE POLICY "form_responses_coach_read" ON form_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.athlete_id = form_responses.athlete_id AND ca.coach_id = auth.uid()
        )
    );

-- 3. GAME PLANS (estrategia de competición)
CREATE TABLE IF NOT EXISTS game_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
    competition_name TEXT,
    competition_date DATE,
    -- Estructura por levantamiento: { squat: { attempts: [{kg, rpe, velocity, note}...3], warmups: [{kg, reps}...] }, bench: {...}, deadlift: {...} }
    plan JSONB NOT NULL DEFAULT '{}',
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_plans_athlete ON game_plans(athlete_id);

ALTER TABLE game_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_plans_coach_all" ON game_plans;
CREATE POLICY "game_plans_coach_all" ON game_plans
    FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

DROP POLICY IF EXISTS "game_plans_athlete_read" ON game_plans;
CREATE POLICY "game_plans_athlete_read" ON game_plans
    FOR SELECT USING (auth.uid() = athlete_id);
