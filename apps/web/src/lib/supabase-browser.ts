import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for browser/client component usage.
 * Singleton pattern - safe to call multiple times.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
