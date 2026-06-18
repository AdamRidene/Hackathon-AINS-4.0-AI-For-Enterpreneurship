import { useState } from "react";
import { api } from "../api.js";

// Adaptive intake: one question at a time. The next question is decided
// server-side by the state machine (sector- and stage-aware branching), so the
// wizard is intentionally "dumb" — it just renders whatever token is demanded next.
export default function IntakeWizard({ pid, lang = "fr", firstQuestion, firstProgress, onComplete }) {
  const ar = lang === "ar";
  const t = (fr, arTxt) => (ar && arTxt ? arTxt : fr);
  const [question, setQuestion] = useState(firstQuestion);
  const [progress, setProgress] = useState(firstProgress || { answered: 0, total: 0 });
  const [value, setValue] = useState(initial(firstQuestion));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function initial(q) {
    if (!q) return null;
    if (q.qtype === "bool") return true;
    if (q.qtype === "enum") return q.options[0] ?? "";
    if (q.qtype === "tags" || q.qtype === "sdg") return "";
    if (q.qtype === "int" || q.qtype === "float") return 0;
    return "";
  }

  function coerce(q, v) {
    if (q.qtype === "int") return parseInt(v, 10) || 0;
    if (q.qtype === "float") return parseFloat(v) || 0;
    if (q.qtype === "tags" || q.qtype === "sdg")
      return String(v)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return v;
  }

  async function submit() {
    if (busy || !question) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.answer(pid, question.id, coerce(question, value));
      if (res.intake_complete || !res.next_question) {
        onComplete();
        return;
      }
      setQuestion(res.next_question);
      setProgress(res.progress || progress);
      setValue(initial(res.next_question));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div className="panel" dir={ar ? "rtl" : "ltr"}>
      <h2>{t("Collecte adaptative", "جمع تكيّفي")}</h2>
      <div className="sub">
        {t(
          "Le système choisit chaque question selon vos réponses précédentes — séquence ramifiée, jamais un formulaire figé.",
          "يختار النظام كل سؤال حسب إجاباتك السابقة — تسلسل متفرّع، لا استمارة جامدة."
        )}
      </div>
      <div className="progressbar">
        <div style={{ width: `${pct}%` }} />
      </div>

      {error && <div className="error">{error}</div>}

      {question && (
        <div className="qcard">
          {question.triggered_by && (
            <span className="badge-probe">
              {t("Sonde injectée par votre auto-évaluation", "سَبر مُدرج بناءً على تقييمك الذاتي")}
            </span>
          )}
          <div className="prompt">{t(question.prompt_fr, question.prompt_ar)}</div>
          {question.help_fr && (
            <div className="help">{t(question.help_fr, question.help_ar)}</div>
          )}

          {question.qtype === "enum" && (
            <div className="opts">
              {question.options.map((o) => (
                <div
                  key={o}
                  className={`opt ${value === o ? "sel" : ""}`}
                  onClick={() => setValue(o)}
                >
                  {o}
                </div>
              ))}
            </div>
          )}

          {question.qtype === "bool" && (
            <div className="boolrow">
              <div
                className={`opt ${value === true ? "sel" : ""}`}
                onClick={() => setValue(true)}
              >
                {t("Oui", "نعم")}
              </div>
              <div
                className={`opt ${value === false ? "sel" : ""}`}
                onClick={() => setValue(false)}
              >
                {t("Non", "لا")}
              </div>
            </div>
          )}

          {(question.qtype === "int" || question.qtype === "float") && (
            <input
              type="number"
              value={value}
              step={question.qtype === "float" ? "0.1" : "1"}
              onChange={(e) => setValue(e.target.value)}
            />
          )}

          {question.qtype === "text" && (
            <input value={value} onChange={(e) => setValue(e.target.value)} />
          )}

          {(question.qtype === "tags" || question.qtype === "sdg") && (
            <input
              value={value}
              placeholder={t("Séparez par des virgules", "افصل بفواصل")}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>
      )}

      <div className="wizard-actions">
        <span className="muted">{pct}% {t("collecté", "تم جمعه")}</span>
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : t("Valider et continuer", "تأكيد ومتابعة")}
        </button>
      </div>
    </div>
  );
}
