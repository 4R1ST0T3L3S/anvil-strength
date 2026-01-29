import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase keys missing!');
  if (typeof window !== 'undefined') {
    document.body.innerHTML = '<div style="color:red; padding:20px; text-align:center;"><h1>Configuration Error</h1><p>Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in Vercel Environment Variables.</p></div>';
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
