/** Unified authentication module.

Routes to either local PBKDF2 auth (dev) or Supabase Auth (production)
depending on the backend's FIRASA_AUTH_MODE, discovered at runtime from
GET /api/auth/config.

Interface:
  auth.init()            — fetch config, initialise Supabase client if needed
  auth.getToken()        — return the current session token (Bearer)
  auth.login({email, password})         — authenticate
  auth.register({email, password, ...}) — create account
  auth.logout()          — end session
  auth.me()              — get current user
  auth.onAuthStateChange(cb) — listen for Supabase auth events
*/

import { initSupabase, getSupabase } from "./supabase.js";

const TOKEN_KEY = "firasa_session_token";
const BASE = import.meta.env.VITE_API_BASE || "";

let _mode = "local"; // "local" | "supabase"
let _supabaseUrl = null;
let _initialised = false;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function getLocalToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setLocalToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiReq(path, options = {}) {
  const token = await auth.getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseLogin(email, password) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client not initialised");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

async function supabaseRegister(email, password, name) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client not initialised");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) throw new Error(error.message);
  return data;
}

async function supabaseLogout() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

async function supabaseGetToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const auth = {
  async init() {
    if (_initialised) return;
    try {
      // Discover auth mode from backend
      const config = await apiReq("/api/auth/config");
      _mode = config.auth_mode || "local";
      _supabaseUrl = config.supabase_url || null;

      if (_mode === "supabase" && _supabaseUrl) {
        await initSupabase();
      }
      if (_mode === "none") {
        setLocalToken("dev-token");
      }
    } catch {
      // Backend unreachable — default to local mode
      _mode = "local";
    }
    _initialised = true;
  },

  getMode() {
    return _mode;
  },

  async getToken() {
    if (_mode === "supabase") {
      return await supabaseGetToken();
    }
    if (_mode === "none") {
      return "dev-token";
    }
    return getLocalToken();
  },

  async login({ email, password }) {
    if (_mode === "none") {
      setLocalToken("dev-token");
      try { const me = await apiReq("/api/auth/me"); return me.user; } catch { /* ok */ }
      return { id: "dev-user-001", email: "dev@firasa.local", name: "Dev Entrepreneur", plan: "pro" };
    }
    if (_mode === "supabase") {
      const data = await supabaseLogin(email, password);
      // Also call the backend /me to ensure user row exists
      try {
        const me = await apiReq("/api/auth/me");
        return me.user;
      } catch {
        // Fallback: construct user from Supabase session
        return {
          id: data.user?.id,
          email: data.user?.email,
          name: data.user?.user_metadata?.full_name || email.split("@")[0],
          plan: "free",
        };
      }
    }
    const res = await apiReq("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setLocalToken(res.token);
    return res.user;
  },

  async register({ email, password, name, birth_date, location, phone, role, company }) {
    if (_mode === "none") {
      setLocalToken("dev-token");
      try { const me = await apiReq("/api/auth/me"); return me.user; } catch { /* ok */ }
      return { id: "dev-user-001", email: "dev@firasa.local", name: name || "Dev Entrepreneur", plan: "pro" };
    }
    if (_mode === "supabase") {
      const data = await supabaseRegister(email, password, name);
      // Supabase may require email confirmation — the user may not be
      // immediately signed in.
      if (data.session) {
        try {
          const me = await apiReq("/api/auth/me");
          return me.user;
        } catch {
          /* fall through to fallback */
        }
      }
      return {
        id: data.user?.id,
        email: data.user?.email,
        name: name || email.split("@")[0],
        plan: "free",
      };
    }
    const res = await apiReq("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, birth_date, location, phone, role, company }),
    });
    setLocalToken(res.token);
    return res.user;
  },

  async logout() {
    if (_mode === "none") {
      setLocalToken("dev-token"); // keep token for dev convenience
      return;
    }
    if (_mode === "supabase") {
      await supabaseLogout();
      return;
    }
    try {
      const token = getLocalToken();
      if (token) {
        await apiReq("/api/auth/logout", { method: "POST" });
      }
    } finally {
      setLocalToken(null);
    }
  },

  async me() {
    try {
      const res = await apiReq("/api/auth/me");
      return res.user;
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback) {
    if (_mode !== "supabase") return () => {};
    const sb = getSupabase();
    if (!sb) return () => {};
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return () => data?.subscription?.unsubscribe();
  },
};
