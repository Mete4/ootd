import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zcipgvyhzttxhyytczbv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dc_NntGPiAUiQpROowHGww_7c9mzhHe';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
