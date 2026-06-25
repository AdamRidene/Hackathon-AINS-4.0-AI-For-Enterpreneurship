import { useState } from "react";
import GraphMap from "./GraphMap.jsx";

/**
 * Agent decision timeline. Renders the per-turn LangGraph node trace returned
 * by POST /answer (e.g. ["answer:name","probe_emitted:ai_probe::name::1"]) as a
 * compact, human-readable sequence — explainability for the adaptive intake.
 *
 * Props: trace (string[]), value (the answer just submitted), question (the
 * resulting next question, used to show a generated probe's text), lang.
 */
function buildSteps(trace, value, question, lang) {
  const ar = lang === "ar";
  const has = (p) => trace.some((t) => t === p || t.startsWith(p));
  const qText = question ? (ar && question.prompt_ar ? question.prompt_ar : question.prompt_fr) : "";

  const valStr = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const valShort = valStr.length > 64 ? valStr.slice(0, 64) + "…" : valStr;

  const steps = [];

  // 1 — ingest (deterministic)
  if (has("probe_answer:")) {
    steps.push({ label: ar ? "إجابة السبر مُسجَّلة" : "Réponse à la sonde enregistrée", detail: valShort, node: "ingest" });
  } else if (has("answer:")) {
    steps.push({ label: ar ? "إجابة مُستلمة" : "Réponse reçue", detail: valShort, node: "ingest" });
  }

  // 2 — LLM probe decision
  if (has("probe_emitted:")) {
    steps.push({ label: ar ? "تحليل النص الحر (IA)" : "Analyse IA du texte libre", node: "generate_probe" });
    steps.push({ label: ar ? "سبر مُولَّد" : "Sonde générée", detail: qText, node: "generate_probe", accent: true });
  } else if (trace.includes("probe_declined")) {
    steps.push({ label: ar ? "تحليل IA: الإجابة كافية" : "Analyse IA : réponse jugée suffisante", node: "generate_probe" });
  }

  // 3 — outcome
  if (trace.includes("serve_pending_probe")) {
    steps.push({ label: ar ? "تقديم سبر مُعلَّق" : "Sonde en attente servie", detail: qText, node: "finalize", accent: true });
  } else if (trace.includes("deterministic_next")) {
    steps.push({ label: ar ? "السؤال الحتمي التالي" : "Question déterministe suivante", detail: qText, node: "finalize" });
  } else if (trace.includes("intake_complete")) {
    steps.push({ label: ar ? "اكتمل الاستبيان — انطلاق التدقيق" : "Intake terminé — audit lancé", node: "finalize" });
  }

  return steps;
}

export default function AgentTrace({ trace, value, question, lang }) {
  const [open, setOpen] = useState(true);
  if (!Array.isArray(trace) || trace.length === 0) return null;
  const ar = lang === "ar";
  const steps = buildSteps(trace, value, question, lang);
  if (steps.length === 0) return null;

  return (
    <div
      className="agent-trace"
      dir={ar ? "rtl" : "ltr"}
      style={{ margin: "0 0 16px 0", padding: "8px 12px", background: "rgba(124, 109, 245, 0.05)", border: "1px solid rgba(124, 109, 245, 0.25)", borderRadius: "var(--r-sm)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, color: "#9b8cff", fontSize: "0.72rem", fontWeight: 700 }}
      >
        <span>{ar ? "مسار قرار الوكيل (LangGraph)" : "Parcours de décision de l'agent (LangGraph)"}</span>
        <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && <GraphMap trace={trace} lang={lang} />}

      {open && (
        <ol style={{ listStyle: "none", margin: "8px 0 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "0.74rem", color: "var(--text-sub)" }}>
              <span style={{ color: s.accent ? "#9b8cff" : "var(--text)", fontWeight: s.accent ? 600 : 500 }}>{s.label}</span>
              {s.detail && (
                <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                  {ar ? "« " : "« "}{s.detail}{" »"}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
