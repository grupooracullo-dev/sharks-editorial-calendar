import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Required for OAuth (Google) redirects: captures the tokens
    // Supabase appends to the URL on return from the provider.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// Current authenticated user id (kept in sync by AuthContext)
export const authState = {
  userId: null as string | null,
};
