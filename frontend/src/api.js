// Thin typed client over the Firasa REST surface (see backend/app/main.py).
// In dev, Vite proxies /api -> FastAPI. In prod, set VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE || "";
const TOKEN_KEY = "firasa_session_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  getToken,
  setToken,

  health: () => req("/api/health"),
  kb: () => req("/api/kb"),

  register: async ({ email, password, name }) => {
    const res = await req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    setToken(res.token);
    return res.user;
  },

  login: async ({ email, password }) => {
    const res = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res.user;
  },

  logout: async () => {
    try {
      if (getToken()) await req("/api/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
    }
  },

  me: async () => {
    const res = await req("/api/auth/me");
    return res.user;
  },

  updatePlan: async (plan) => {
    const res = await req("/api/me/plan", {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    });
    return res.user;
  },

  createProject: (name, language = "fr") =>
    req("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, language }),
    }),

  getProject: (pid) => req(`/api/projects/${pid}`),

  nextQuestion: (pid) => req(`/api/projects/${pid}/next-question`),

  answer: (pid, questionId, value) =>
    req(`/api/projects/${pid}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId, value }),
    }),

  audit: (pid) => req(`/api/projects/${pid}/audit`, { method: "POST" }),

  assistant: (pid, question) =>
    req(`/api/projects/${pid}/assistant`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // History / management
  listProjects: () => req("/api/projects"),
  getLastAudit: (pid) => req(`/api/projects/${pid}/last-audit`),
  deleteProject: (pid) => req(`/api/projects/${pid}`, { method: "DELETE" }),
};
