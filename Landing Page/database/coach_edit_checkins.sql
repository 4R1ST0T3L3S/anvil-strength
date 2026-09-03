-- =====================================================
-- ANVIL STRENGTH — El coach puede crear y editar los
-- check-ins (diarios y semanales) de sus atletas.
-- Ejecutar en el SQL Editor de Supabase.
-- Depende de: forms_and_gameplan.sql
-- =====================================================

-- 1. Trazabilidad: quién tocó la respuesta por última vez
ALTER TABLE form_responses
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. El coach puede escribir (insertar / modificar / borrar) las respuestas
--    de los atletas que tiene asignados en coach_athletes.
--    Las políticas del atleta (form_responses_athlete_all) siguen intactas:
--    en Postgres las políticas permisivas se suman con OR.

DROP POLICY IF EXISTS "form_responses_coach_insert" ON form_responses;
CREATE POLICY "form_responses_coach_insert" ON form_responses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.athlete_id = form_responses.athlete_id AND ca.coach_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "form_responses_coach_update" ON form_responses;
CREATE POLICY "form_responses_coach_update" ON form_responses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.athlete_id = form_responses.athlete_id AND ca.coach_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.athlete_id = form_responses.athlete_id AND ca.coach_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "form_responses_coach_delete" ON form_responses;
CREATE POLICY "form_responses_coach_delete" ON form_responses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM coach_athletes ca
            WHERE ca.athlete_id = form_responses.athlete_id AND ca.coach_id = auth.uid()
        )
    );
