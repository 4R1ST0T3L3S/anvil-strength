-- =====================================================================
-- NUTRICIÓN — TIPOS DE DÍA, GRAMOS POR DÍA, BLOQUEO Y ALIMENTOS GENÉRICOS
-- 21 de octubre de 2026
-- =====================================================================
--
-- SOLO AÑADE. No borra ni cambia ninguna fila existente: los planes que ya
-- hay siguen exactamente igual (su "día base" son sus objetivos y gramos de
-- siempre). Se puede ejecutar dos veces sin romper nada.
--
-- 1. nutrition_plans.base_day_name — cómo se llama el día base ("Día de
--    entreno"). Los tipos de día extra van en su propia tabla.
--
-- 2. nutrition_day_types — entreno, descanso, recarga… con sus objetivos.
--
-- 3. meal_food_day_amounts — los gramos de cada alimento en cada tipo de
--    día. Sin fila, vale el `amount_g` del día base.
--
-- 4. meal_foods.is_locked — "no me toques este alimento" para el ajuste
--    automático (un yogur, una pieza de fruta).
--
-- 5. food_items: is_generic / source / food_group, para los alimentos
--    genéricos de BEDCA (se cargan con NUTRICION_2026-10-21_bedca.sql).
--
-- 6. La política de escritura de food_items miraba `profiles.role` (el rol
--    único de antes de ROLES_MULTIPLES.sql): quien tenía nutricionista entre
--    sus roles pero otro rol "principal" no podía guardar un alimento nuevo.
--    Ahora usa `tiene_rol()`, como el resto.
--
-- RLS de las tablas nuevas: lo mismo que `meals` — el autor del plan
-- (nutritionist_id) lo gestiona todo; el atleta del plan lo lee.
-- =====================================================================

BEGIN;

-- 1 ------------------------------------------------------------------
ALTER TABLE public.nutrition_plans
    ADD COLUMN IF NOT EXISTS base_day_name TEXT NOT NULL DEFAULT 'Día de entreno';

-- 2 ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_day_types (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    calories_target  NUMERIC NOT NULL DEFAULT 0,
    protein_target   NUMERIC NOT NULL DEFAULT 0,
    carbs_target     NUMERIC NOT NULL DEFAULT 0,
    fats_target      NUMERIC NOT NULL DEFAULT 0,
    order_index      INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_day_types_plan_id_idx ON public.nutrition_day_types(plan_id);

-- 3 ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_food_day_amounts (
    meal_food_id  UUID NOT NULL REFERENCES public.meal_foods(id) ON DELETE CASCADE,
    day_type_id   UUID NOT NULL REFERENCES public.nutrition_day_types(id) ON DELETE CASCADE,
    amount_g      NUMERIC NOT NULL CHECK (amount_g >= 0),
    PRIMARY KEY (meal_food_id, day_type_id)
);
CREATE INDEX IF NOT EXISTS meal_food_day_amounts_day_type_idx ON public.meal_food_day_amounts(day_type_id);

-- 4 ------------------------------------------------------------------
ALTER TABLE public.meal_foods
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- 5 ------------------------------------------------------------------
ALTER TABLE public.food_items
    ADD COLUMN IF NOT EXISTS is_generic BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS food_group TEXT;
CREATE INDEX IF NOT EXISTS food_items_is_generic_idx ON public.food_items(is_generic) WHERE is_generic;

-- RLS ----------------------------------------------------------------
ALTER TABLE public.nutrition_day_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_food_day_amounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver tipos de día de mis planes" ON public.nutrition_day_types;
CREATE POLICY "Ver tipos de día de mis planes" ON public.nutrition_day_types
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.nutrition_plans p
        WHERE p.id = nutrition_day_types.plan_id
          AND ((SELECT auth.uid()) = p.athlete_id OR (SELECT auth.uid()) = p.nutritionist_id)
    ));

DROP POLICY IF EXISTS "Gestionar tipos de día de mis planes" ON public.nutrition_day_types;
CREATE POLICY "Gestionar tipos de día de mis planes" ON public.nutrition_day_types
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.nutrition_plans p
        WHERE p.id = nutrition_day_types.plan_id AND p.nutritionist_id = (SELECT auth.uid())
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM public.nutrition_plans p
        WHERE p.id = nutrition_day_types.plan_id AND p.nutritionist_id = (SELECT auth.uid())
    ));

DROP POLICY IF EXISTS "Ver gramos por día de mis planes" ON public.meal_food_day_amounts;
CREATE POLICY "Ver gramos por día de mis planes" ON public.meal_food_day_amounts
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.nutrition_day_types d
        JOIN public.nutrition_plans p ON p.id = d.plan_id
        WHERE d.id = meal_food_day_amounts.day_type_id
          AND ((SELECT auth.uid()) = p.athlete_id OR (SELECT auth.uid()) = p.nutritionist_id)
    ));

DROP POLICY IF EXISTS "Gestionar gramos por día de mis planes" ON public.meal_food_day_amounts;
CREATE POLICY "Gestionar gramos por día de mis planes" ON public.meal_food_day_amounts
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.nutrition_day_types d
        JOIN public.nutrition_plans p ON p.id = d.plan_id
        WHERE d.id = meal_food_day_amounts.day_type_id AND p.nutritionist_id = (SELECT auth.uid())
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM public.nutrition_day_types d
        JOIN public.nutrition_plans p ON p.id = d.plan_id
        WHERE d.id = meal_food_day_amounts.day_type_id AND p.nutritionist_id = (SELECT auth.uid())
    ));

-- 6 ------------------------------------------------------------------
DROP POLICY IF EXISTS "Food items can be inserted by coaches and nutritionists" ON public.food_items;
CREATE POLICY "Food items can be inserted by coaches and nutritionists" ON public.food_items
    FOR INSERT WITH CHECK (
        public.tiene_rol('coach') OR public.tiene_rol('nutritionist')
        OR public.tiene_rol('developer') OR public.tiene_rol('admin')
    );

DROP POLICY IF EXISTS "Food items can be updated by coaches and nutritionists" ON public.food_items;
-- Los genéricos verificados no se pueden editar desde la app: son la
-- referencia. Lo demás, como hasta ahora.
CREATE POLICY "Food items can be updated by coaches and nutritionists" ON public.food_items
    FOR UPDATE USING (
        NOT is_generic AND (
            public.tiene_rol('coach') OR public.tiene_rol('nutritionist')
            OR public.tiene_rol('developer') OR public.tiene_rol('admin')
        )
    );

COMMIT;

-- PostgREST: que vea las tablas y columnas nuevas sin esperar.
NOTIFY pgrst, 'reload schema';
