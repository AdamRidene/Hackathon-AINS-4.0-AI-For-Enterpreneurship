// Thin typed client over the Firasa REST surface (see backend/app/main.py).
// In dev, Vite proxies /api -> FastAPI. In prod, set VITE_API_BASE.
// Token management is delegated to the auth module (src/auth.js).
import { auth } from "./auth.js";

const BASE = import.meta.env.VITE_API_BASE || "";

async function req(path, options = {}) {
  const token = await auth.getToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const { signal, ...fetchOptions } = options;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal,
    });
  } catch (err) {
    // Network errors (DNS failure, connection refused, timeout, abort)
    if (err.name === "AbortError") throw err;
    throw new Error("Impossible de se connecter au serveur. Vérifiez votre connexion.");
  }
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
  health: () => req("/api/health"),
  kb: () => req("/api/kb"),
  listDocuments: (pid) => req(`/api/projects/${pid}/documents`),
  uploadDocument: (pid, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return req(`/api/projects/${pid}/documents`, {
      method: "POST",
      body: formData,
    });
  },
  deleteDocument: (pid, docId) => req(`/api/projects/${pid}/documents/${docId}`, { method: "DELETE" }),

  // Auth delegated to auth module
  getToken: () => auth.getToken(),

  login: async ({ email, password }) => {
    return auth.login({ email, password });
  },

  register: async ({ email, password, name, birth_date, location, phone, role, company }) => {
    return auth.register({ email, password, name, birth_date, location, phone, role, company });
  },

  logout: async () => {
    return auth.logout();
  },

  me: async () => {
    return auth.me();
  },

  updatePlan: async (plan) => {
    const res = await req("/api/me/plan", {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    });
    return res.user;
  },

  updateProfile: async (profileData) => {
    const res = await req("/api/me/profile", {
      method: "PATCH",
      body: JSON.stringify(profileData),
    });
    return res.user;
  },

  createProject: (name, language = "fr") =>
    req("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, language }),
    }),

  getProject: (pid) => req(`/api/projects/${pid}`),
  updateProject: (pid, fields) =>
    req(`/api/projects/${pid}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),

  getQuestions: (pid) => req(`/api/projects/${pid}/questions`),

  nextQuestion: (pid) => req(`/api/projects/${pid}/next-question`),

  answer: (pid, questionId, value) =>
    req(`/api/projects/${pid}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId, value }),
    }),

  // Document-driven auto-fill: propose extracted answers, then apply confirmed
  autofill: (pid) => req(`/api/projects/${pid}/autofill`, { method: "POST" }),
  applyAutofill: (pid, confirmed) =>
    req(`/api/projects/${pid}/autofill/apply`, {
      method: "POST",
      body: JSON.stringify({ confirmed }),
    }),

  audit: (pid) => req(`/api/projects/${pid}/audit`, { method: "POST" }),

  assistant: (pid, question, lang = "fr") =>
        req(`/api/projects/${pid}/assistant`, {
            method: "POST",
            body: JSON.stringify({ question, lang }),
        }),

  // History / management
  listProjects: (opts) => req("/api/projects", opts),
  getLastAudit: (pid) => req(`/api/projects/${pid}/last-audit`),
  getAuditHistory: (pid) => req(`/api/projects/${pid}/audit-history`),
  deleteProject: (pid) => req(`/api/projects/${pid}`, { method: "DELETE" }),
  eval: () => req("/api/eval"),

  completeMilestone: (pid, mid, trigger) =>
    req(`/api/project/${pid}/milestone/${mid}/complete`, {
      method: "POST",
      body: JSON.stringify({ trigger }),
    }),
};
