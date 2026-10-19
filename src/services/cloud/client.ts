import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase connection, and the demo/live switch.
 *
 * Both values are compiled into the browser bundle and are therefore public —
 * that is how Supabase is designed: the anon key grants nothing by itself, and
 * every table is guarded by row-level security (see supabase/schema.sql).
 * Never put the service_role key in a VITE_ variable.
 *
 * Demo mode
 * ---------
 * The two modes are separate data paths, not two views of the same data:
 *
 *   live  — `isCloud` true. Writes go to Supabase; nothing persists locally
 *           (dataStore uses `noStorage`).
 *   demo  — `isCloud` false. Everything runs on generated sample data kept in
 *           this browser only. No request ever reaches Supabase, so a demo can
 *           never touch, or be mistaken for, real salon data.
 *
 * Which one is in force is decided once, here, at module load, so `isCloud`
 * stays a plain constant for the thirty-odd places that read it. Switching
 * therefore reloads the page: the data store picks its storage engine when it
 * is created, and flipping that under a running app would leave half the
 * screens reading the wrong source.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const DEMO_KEY = 'aura-demo-mode';

function demoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    // Private mode or blocked site data — fall back to live.
    return false;
  }
}

/** True when this build has real credentials, whether or not demo is on. */
export const cloudConfigured = Boolean(url && anonKey);

/** True while the visitor is deliberately exploring the demo. */
export const isDemo = cloudConfigured && demoRequested();

export const isCloud = cloudConfigured && !isDemo;

/** Start the demo. Reloads, because the data store binds its storage on creation. */
export function enterDemo(): void {
  try {
    window.localStorage.setItem(DEMO_KEY, '1');
  } catch {
    /* nothing we can do; the reload below simply keeps the live app */
  }
  window.location.assign('/login');
}

/** Leave the demo and return to the real sign-in screen. */
export function exitDemo(): void {
  try {
    window.localStorage.removeItem(DEMO_KEY);
    // The demo's sample data lives under its own keys; clear it so the next
    // demo starts clean and nothing lingers in storage.
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('aura.') || key.startsWith('aura-')) {
        if (key !== DEMO_KEY) window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
  window.location.assign('/login');
}

export const supabase: SupabaseClient | null = isCloud
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
