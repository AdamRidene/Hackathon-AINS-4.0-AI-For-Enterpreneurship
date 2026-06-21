/** Lazy Supabase client initialisation.
 *
 * Only creates a client when Supabase URL and anon key are configured.
 * In local dev mode these are undefined and getSupabase() returns null.
 *
 * IMPORTANT: Always call `await initSupabase()` at app startup before any
 * auth operations. After init, `getSupabase()` returns the ready client
 * synchronously (no race condition).
 */
let client = null;
let initPromise = null;

/** Initialise the Supabase client synchronously.
 * Call this once at app startup before any auth operations.
 * Idempotent — subsequent calls return the same promise.
 */
export async function initSupabase() {
  if (client) return client;
  if (initPromise) return initPromise;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  initPromise = (async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(url, key);
      return client;
    } catch {
      return null;
    }
  })();
  return initPromise;
}

/** Return the Supabase client if already initialised, null otherwise.
 *
 * Safe to call synchronously AFTER initSupabase() has resolved.
 * For the initial call, use `await initSupabase()` instead.
 */
export function getSupabase() {
  return client;
}
