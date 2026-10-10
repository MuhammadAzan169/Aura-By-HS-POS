import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase connection.
 *
 * Both values are compiled into the browser bundle and are therefore public —
 * that is how Supabase is designed: the anon key grants nothing by itself, and
 * every table is guarded by row-level security (see supabase/schema.sql).
 * Never put the service_role key in a VITE_ variable.
 *
 * Without them the app runs in demo mode on generated data in the browser.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isCloud = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloud
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
