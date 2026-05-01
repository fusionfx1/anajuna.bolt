import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const envError: string | null = (() => {
  if (
    !supabaseUrl ||
    supabaseUrl.includes('placeholder') ||
    supabaseUrl.includes('your-project')
  ) {
    return 'VITE_SUPABASE_URL is not configured. Set it in .env.local and restart.';
  }
  if (
    !supabaseAnonKey ||
    supabaseAnonKey.includes('your-anon-key') ||
    supabaseAnonKey.length < 20
  ) {
    return 'VITE_SUPABASE_ANON_KEY is not configured. Set it in .env.local and restart.';
  }
  return null;
})();

// When envError is set, the supabase client is null.
// In production the EnvErrorOverlay in App.tsx blocks all rendering before any supabase call.
// In dev the yellow warning banner allows the app to run; individual supabase calls may fail gracefully.
export const supabase = envError
  ? (null as unknown as ReturnType<typeof createClient>)
  : createClient(supabaseUrl!, supabaseAnonKey!);
