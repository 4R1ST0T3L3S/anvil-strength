-- =====================================================
-- ANVIL STRENGTH - EFORT COACH STYLE SCHEMA
-- =====================================================

-- 1. EXERCISE LIBRARY
-- "Libro" de ejercicios. Puede haber ejercicios del sistema (is_public = true) o personalizados por coach.
CREATE TABLE IF NOT EXISTS exercise_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- Dueño del ejercicio custome
    name TEXT NOT NULL,
    video_url TEXT,
    muscle_group TEXT, -- Pecho, Espalda, Pierna...
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Exercise Library
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches view public and own exercises" ON exercise_library
    FOR SELECT USING (
        is_public = true 
        OR coach_id = auth.uid()
    );

CREATE POLICY "Athletes view public and designated exercises" ON exercise_library
    FOR SELECT USING (
        is_public = true 
        OR coach_id IN (
            SELECT coach_id FROM coach_athletes WHERE athlete_id = auth.uid()
        )
    );

CREATE POLICY "Coaches manage own exercises" ON exercise_library
    FOR ALL USING (coach_id = auth.uid());


-- 2. TRAINING BLOCKS (Mesociclos)
-- Conecta al Coach con el Atleta.
CREATE TABLE IF NOT EXISTS training_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "Mesociclo 1: Hipertrofia"
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Training Blocks
ALTER TABLE training_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manage own blocks" ON training_blocks
    FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Athlete view own blocks" ON training_blocks
    FOR SELECT USING (athlete_id = auth.uid());


-- 3. TRAINING SESSIONS (Días de entrenamiento)
-- Un bloque tiene N sesiones (Day 1, Day 2...).
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id UUID NOT NULL REFERENCES training_blocks(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL, -- 1, 2, 3...
    name TEXT, -- "Torso Pesado"
    date DATE, -- Opcional, para asignar a calendario real
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(block_id, day_number) -- Evita duplicar "Día 1" en el mismo bloque
);

-- RLS: Training Sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Acceso indirecto a través del bloque
CREATE POLICY "Coach manage sessions via block" ON training_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM training_blocks 
            WHERE training_blocks.id = training_sessions.block_id 
            AND training_blocks.coach_id = auth.uid()
        )
    );

CREATE POLICY "Athlete view sessions via block" ON training_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM training_blocks 
            WHERE training_blocks.id = training_sessions.block_id 
            AND training_blocks.athlete_id = auth.uid()
        )
    );


-- 4. SESSION EXERCISES (Ejercicios de la sesión)
-- Link M:N con orden.
CREATE TABLE IF NOT EXISTS session_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercise_library(id), -- No cascade, el ejercicio perdura
    order_index INTEGER NOT NULL DEFAULT 0,
    notes TEXT, -- Notas específicas para este día
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Session Exercises
ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manage session exercises" ON session_exercises
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM training_sessions
            JOIN training_blocks ON training_sessions.block_id = training_blocks.id
            WHERE training_sessions.id = session_exercises.session_id
            AND training_blocks.coach_id = auth.uid()
        )
    );

CREATE POLICY "Athlete view session exercises" ON session_exercises
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM training_sessions
            JOIN training_blocks ON training_sessions.block_id = training_blocks.id
            WHERE training_sessions.id = session_exercises.session_id
            AND training_blocks.athlete_id = auth.uid()
        )
    );


-- 5. TRAINING SETS (La tabla madre)
-- Donde ocurre la magia de "Target" vs "Actual".
CREATE TABLE IF NOT EXISTS training_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_exercise_id UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    
    -- Target (Coach define)
    target_reps TEXT, -- "5-6", "RIR 2"
    target_load NUMERIC, -- Kilos target (opcional)
    target_rpe TEXT, -- "@8", "7-8"
    rest_seconds INTEGER,
    
    -- Actual (Atleta rellena)
    actual_reps INTEGER,
    actual_load NUMERIC,
    actual_rpe NUMERIC, -- Float para RPE precisos (8.5)
    
    -- Multimedia / Feedback
    is_video_required BOOLEAN DEFAULT FALSE,
    video_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_index INTEGER DEFAULT 0 -- Set 1, Set 2...
);

-- RLS: Training Sets
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;

-- Coach: Puede hacer TODO si le pertenece el bloque
CREATE POLICY "Coach manage sets" ON training_sets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM session_exercises
            JOIN training_sessions ON session_exercises.session_id = training_sessions.id
            JOIN training_blocks ON training_sessions.block_id = training_blocks.id
            WHERE session_exercises.id = training_sets.session_exercise_id
            AND training_blocks.coach_id = auth.uid()
        )
    );

-- Athlete: Puede VER (Select)
CREATE POLICY "Athlete view sets" ON training_sets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM session_exercises
            JOIN training_sessions ON session_exercises.session_id = training_sessions.id
            JOIN training_blocks ON training_sessions.block_id = training_blocks.id
            WHERE session_exercises.id = training_sets.session_exercise_id
            AND training_blocks.athlete_id = auth.uid()
        )
    );

-- Athlete: Puede EDITAR (Update), pero restringido por Trigger para campos Target
CREATE POLICY "Athlete update sets" ON training_sets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM session_exercises
            JOIN training_sessions ON session_exercises.session_id = training_sessions.id
            JOIN training_blocks ON training_sessions.block_id = training_blocks.id
            WHERE session_exercises.id = training_sets.session_exercise_id
            AND training_blocks.athlete_id = auth.uid()
        )
    );


-- 6. TRIGGER DE SEGURIDAD (Senior Level)
-- Impide que el atleta modifique lo que el coach mandó (Target fields).
CREATE OR REPLACE FUNCTION protect_target_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_coach_id UUID;
    v_athlete_id UUID;
BEGIN
    -- Obtener IDs del bloque dueño de este set
    SELECT tb.coach_id, tb.athlete_id
    INTO v_coach_id, v_athlete_id
    FROM session_exercises se
    JOIN training_sessions ts ON se.session_id = ts.id
    JOIN training_blocks tb ON ts.block_id = tb.id
    WHERE se.id = NEW.session_exercise_id;

    -- Si el usuario es el ATLETA
    IF auth.uid() = v_athlete_id THEN
        -- Verificar que NO está cambiando campos target
        IF (NEW.target_reps IS DISTINCT FROM OLD.target_reps) OR
           (NEW.target_load IS DISTINCT FROM OLD.target_load) OR
           (NEW.target_rpe IS DISTINCT FROM OLD.target_rpe) OR
           (NEW.rest_seconds IS DISTINCT FROM OLD.rest_seconds) OR
           (NEW.is_video_required IS DISTINCT FROM OLD.is_video_required) THEN
           
            RAISE EXCEPTION 'Acceso Denegado: Los atletas no pueden modificar los objetivos prescritos por el entrenador.';
        END IF;
    END IF;

    -- Si el usuario es el COACH, dejamos pasar todo.
    -- Si no es ninguno (hack?), el RLS ya lo habrá parado, pero por si acaso:
    IF auth.uid() != v_athlete_id AND auth.uid() != v_coach_id THEN
        RAISE EXCEPTION 'Acceso Denegado: Usuario no autorizado para este bloque.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar Trigger
DROP TRIGGER IF EXISTS trigger_protect_target_fields ON training_sets;
CREATE TRIGGER trigger_protect_target_fields
    BEFORE UPDATE ON training_sets
    FOR EACH ROW
    EXECUTE FUNCTION protect_target_fields();

-- Notas:
-- 1. SECURITY DEFINER en la función le da permiso para hacer selects internos sin pelear con RLS.
-- 2. "IS DISTINCT FROM" maneja NULLs correctamente (NULL != NULL).
