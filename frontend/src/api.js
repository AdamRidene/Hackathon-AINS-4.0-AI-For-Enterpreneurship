// Thin typed client over the Firasa REST surface (see backend/app/main.py).
// In dev, Vite proxies /api -> FastAPI. In prod, set VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE || "";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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
  health: () => req("/api/health"),
  kb: () => req("/api/kb"),

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
    req(`/