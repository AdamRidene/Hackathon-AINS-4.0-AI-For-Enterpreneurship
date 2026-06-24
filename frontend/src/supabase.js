/** Lazy Supabase client initialisation.
 *
 * Only creates a client when Supabase URL and anon key are configured.
 * In local dev mode these are undefined and getSupabase() returns null.
 *
 * If a ?code= OAuth PKCE param is present in the URL when this module
 * initialises, we capture it BEFORE createClient() can strip it, then
 * explicitly await exchangeCodeForSession() so the session is ready
 * synchronously by the time auth.init() returns.
 */

// Capture the URL *before* any Supabase code can mutate it via history.replaceState
const _capturedUrl  = window.location.href;
const _capturedCode = new URLSearchParams(window.location.search).get("code");
const _capturedHash = window.location.hash;

let client      = null;
let initPromise = null;

export async function initSupabase() {
  if (client) return client;
  if (initPromise) return initPromise;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  initPromise = (async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");

      if (_capturedCode) {
        // OAuth PKCE redirect: disable auto-detection so we can explicitly await
        // the code exchange (Supabase's background exchange fires SIGNED_IN too
        // late and gets missed in the React StrictMode double-effect cycle).
        console.log("[SUPABASE] PKCE code detected, exchanging...");
        client = createClient(url, key, { auth: { detectSessionInUrl: false } });
        const { data, error } = await client.auth.exchangeCodeForSession(_capturedUrl);
        if (error) {
          console.error("[SUPABASE] exchangeCodeForSession error:", error.message);
        } else {
          console.log("[SUPABASE] exchange OK, user:", data?.user?.email);
          // Clean the code out of the URL bar
          window.history.replaceState({}, "", window.location.pathname);
        }
      } else if (_capturedHash.includes("access_token")) {
        // Implicit flow fallback: let Supabase handle it normally
        client = createClient(url, key);
      } else {
        // Normal startup – no OAuth redirect in progress
        client = createClient(url, key);
      }

      return client;
    } catch (e) {
      console.error("[SUPABASE] createClient error:", e);
      return null;
    }
  })();

  return initPromise;
}

export function getSupabase() {
  return client;
}
