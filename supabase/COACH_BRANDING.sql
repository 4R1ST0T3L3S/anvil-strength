-- Migration script for Coach Branding
-- Execute this natively in the Supabase SQL editor or via Supabase CLI

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- If you intend to let the brand color default to Anvil Red, we leave it as NULL in the database
-- and the NextJS/React frontend will coerce NULL to '#dc2626'
