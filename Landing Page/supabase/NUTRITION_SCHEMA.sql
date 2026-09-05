-- NUTRITION_SCHEMA.sql
-- Setup tables for the Nutrition feature

-- 1. Food Items (Base de datos de alimentos)
-- La tabla usa "code" como Primary Key (importado de OpenFoodFacts)
CREATE TABLE IF NOT EXISTS public.food_items (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    calories_per_100g NUMERIC NOT NULL,
    protein_per_100g NUMERIC NOT NULL,
    carbs_per_100g NUMERIC NOT NULL,
    fats_per_100g NUMERIC NOT NULL,
    salt_per_100g NUMERIC,
    sugar_per_100g NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Food items are viewable by everyone" ON public.food_items;
CREATE POLICY "Food items are viewable by everyone" ON public.food_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Food items can be inserted by coaches and nutritionists" ON public.food_items;
CREATE POLICY "Food items can be inserted by coaches and nutritionists" ON public.food_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'nutritionist'))
);

DROP POLICY IF EXISTS "Food items can be updated by coaches and nutritionists" ON public.food_items;
CREATE POLICY "Food items can be updated by coaches and nutritionists" ON public.food_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('coach', 'nutritionist'))
);


-- 2. Nutrition Plans (Planes Nutricionales)
CREATE TABLE IF NOT EXISTS public.nutrition_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nutritionist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    calories_target NUMERIC NOT NULL DEFAULT 0,
    protein_target NUMERIC NOT NULL DEFAULT 0,
    carbs_target NUMERIC NOT NULL DEFAULT 0,
    fats_target NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    training_block_id TEXT,
    tags TEXT[] DEFAULT '{}',
    general_guidelines TEXT[] DEFAULT '{}',
    global_supplements TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own nutrition plans or plans they created" ON public.nutrition_plans;
CREATE POLICY "Users can view their own nutrition plans or plans they created" ON public.nutrition_plans FOR SELECT USING (
    auth.uid() = athlete_id OR auth.uid() = nutritionist_id
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can insert nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Coaches/Nutritionists can insert nutrition plans" ON public.nutrition_plans FOR INSERT WITH CHECK (
    auth.uid() = nutritionist_id
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can update nutrition plans they created" ON public.nutrition_plans;
CREATE POLICY "Coaches/Nutritionists can update nutrition plans they created" ON public.nutrition_plans FOR UPDATE USING (
    auth.uid() = nutritionist_id
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can delete nutrition plans they created" ON public.nutrition_plans;
CREATE POLICY "Coaches/Nutritionists can delete nutrition plans they created" ON public.nutrition_plans FOR DELETE USING (
    auth.uid() = nutritionist_id
);


-- 3. Meals (Comidas dentro de un plan)
CREATE TABLE IF NOT EXISTS public.meals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    time TEXT,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    meal_supplements TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view meals of their plans" ON public.meals;
CREATE POLICY "Users can view meals of their plans" ON public.meals FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.nutrition_plans 
        WHERE id = meals.plan_id AND (athlete_id = auth.uid() OR nutritionist_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can insert meals to their plans" ON public.meals;
CREATE POLICY "Coaches/Nutritionists can insert meals to their plans" ON public.meals FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.nutrition_plans 
        WHERE id = meals.plan_id AND nutritionist_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can update meals of their plans" ON public.meals;
CREATE POLICY "Coaches/Nutritionists can update meals of their plans" ON public.meals FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.nutrition_plans 
        WHERE id = meals.plan_id AND nutritionist_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can delete meals of their plans" ON public.meals;
CREATE POLICY "Coaches/Nutritionists can delete meals of their plans" ON public.meals FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.nutrition_plans 
        WHERE id = meals.plan_id AND nutritionist_id = auth.uid()
    )
);


-- 4. Meal Foods (Alimentos específicos dentro de una comida)
CREATE TABLE IF NOT EXISTS public.meal_foods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
    food_id TEXT NOT NULL REFERENCES public.food_items(code) ON DELETE CASCADE,
    amount_g NUMERIC NOT NULL,
    notes TEXT,
    category TEXT NOT NULL DEFAULT 'Otros',
    alternative_group_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.meal_foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view foods in their meals" ON public.meal_foods;
CREATE POLICY "Users can view foods in their meals" ON public.meal_foods FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.meals m
        JOIN public.nutrition_plans p ON p.id = m.plan_id
        WHERE m.id = meal_foods.meal_id AND (p.athlete_id = auth.uid() OR p.nutritionist_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can insert foods to their meals" ON public.meal_foods;
CREATE POLICY "Coaches/Nutritionists can insert foods to their meals" ON public.meal_foods FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.meals m
        JOIN public.nutrition_plans p ON p.id = m.plan_id
        WHERE m.id = meal_foods.meal_id AND p.nutritionist_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can update foods in their meals" ON public.meal_foods;
CREATE POLICY "Coaches/Nutritionists can update foods in their meals" ON public.meal_foods FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.meals m
        JOIN public.nutrition_plans p ON p.id = m.plan_id
        WHERE m.id = meal_foods.meal_id AND p.nutritionist_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Coaches/Nutritionists can delete foods from their meals" ON public.meal_foods;
CREATE POLICY "Coaches/Nutritionists can delete foods from their meals" ON public.meal_foods FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.meals m
        JOIN public.nutrition_plans p ON p.id = m.plan_id
        WHERE m.id = meal_foods.meal_id AND p.nutritionist_id = auth.uid()
    )
);

-- End of schema

-- ==========================================
-- MIGRACIONES: Añadir nuevos campos (Phase 5)
-- ==========================================

DO $$ 
BEGIN
    -- nutrition_plans: nuevos campos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nutrition_plans' AND column_name='training_block_id') THEN
        ALTER TABLE public.nutrition_plans ADD COLUMN training_block_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nutrition_plans' AND column_name='tags') THEN
        ALTER TABLE public.nutrition_plans ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nutrition_plans' AND column_name='general_guidelines') THEN
        ALTER TABLE public.nutrition_plans ADD COLUMN general_guidelines TEXT[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nutrition_plans' AND column_name='global_supplements') THEN
        ALTER TABLE public.nutrition_plans ADD COLUMN global_supplements TEXT[] DEFAULT '{}';
    END IF;

    -- meals: suplementación por comida
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meals' AND column_name='meal_supplements') THEN
        ALTER TABLE public.meals ADD COLUMN meal_supplements TEXT[] DEFAULT '{}';
    END IF;

    -- meal_foods: categoría y grupo de alternativas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meal_foods' AND column_name='category') THEN
        ALTER TABLE public.meal_foods ADD COLUMN category TEXT NOT NULL DEFAULT 'Otros';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meal_foods' AND column_name='alternative_group_id') THEN
        ALTER TABLE public.meal_foods ADD COLUMN alternative_group_id UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

-- ==========================================
-- SCRIPT DE REPARACIÓN DE CONEXIONES Y CACHÉ
-- ==========================================

-- 1. Asegurar que 'code' es la clave principal de food_items (por si se subió un CSV nuevo sin marcarlo)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE contype = 'p' AND conrelid = 'public.food_items'::regclass
    ) THEN 
        ALTER TABLE public.food_items ADD PRIMARY KEY (code);
    END IF;
END $$;

-- 2. Forzar la creación de la clave foránea en meal_foods (por si se perdió al hacer CASCADE)
DO $$ 
BEGIN 
    ALTER TABLE public.meal_foods DROP CONSTRAINT IF EXISTS meal_foods_food_id_fkey;
    ALTER TABLE public.meal_foods ADD CONSTRAINT meal_foods_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.food_items(code) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
    -- Si falla, ignoramos (puede que el tipo de dato no coincida o ya exista otra)
END $$;

-- 3. Recargar la caché de Supabase (crucial para que la web detecte los cambios al instante)
NOTIFY pgrst, 'reload schema';
