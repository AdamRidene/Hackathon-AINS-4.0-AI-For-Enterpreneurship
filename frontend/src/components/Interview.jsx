import { useState, useEffect, useCallback } from "react";

const SECTOR_LABELS = {
  fr: { "agri-food":"Agri-food","digital-saas":"SaaS & Numérique","industry":"Industrie","health":"Santé","greentech":"CleanTech","services":"Services","other":"Autre" },
  ar: { "agri-food":"الصناعات الغذائية","digital-saas":"البرمجيات الرقمية","industry":"الصناعة","health":"الصحة","greentech":"التكنولوجيا الخضراء","services":"الخدمات","other":"قطاع آخر" },
};
const STAGE_LABELS = {
  fr: {1:"Idéation",2:"Validation Marché",3:"Structuration",4:"Levée de fonds",5:"Lancement",6:"Croissance"},
  ar: {1:"مرحلة الفكرة",2:"التحقق من السوق",3:"الهيكلة",4:"التمويل",5:"الإطلاق",6:"النمو"},
};

function initial(q) {
  if (!q) return "";
  if (q.qtype === "bool")  return true;
  if (q.qtype === "enum")  return q.options[0] ?? "";
  if (q.qtype === "tags" || q.qtype === "sdg") return "";
  if (q.qtype === "int"  || q.qtype === "float") return 0;
  return "";
}

function coerce(q, v) {
  if (q.qtype === "int")   return parseInt(v,10) || 0;
  if (q.qtype === "float") return parseFloat(v)  || 0;
  if (q.qtype === "tags")  return String(v).split(",").map(s=>s.trim()).filter(Boolean);
  if (q.qtype === "sdg")   return Array.isArray(v) ? v : String(v).split(",").map(s=>parseInt(s.trim(),10)).filter(Number.isInteger);
  return v;
}

function optLabel(q, opt, lang) {
  if (q.id === "sector")         return SECTOR_LABELS[lang][opt] || opt;
  if (q.id === "declared_stage") return STAGE_LABELS[lang][parseInt(opt)] || opt;
  return opt;
}

export default function Interview({ lang, question, progress, busy, onSubmit, onSkipToAudit }) {
  const [value, setValue]   = useState(() => initial(question));
  const ar = lang === "ar";

  // Reset value whenever question changes
  useEffect(() => { setValue(initial(question)); }, [question?.id]);

  const pct = progress?.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  const submit = useCallback(() => {
    if (busy || !question) return;
    onSubmit(question.id, coerce(question, value));
  }, [busy, question, value, onSubmit]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!question) return;

      if (question.qtype === "enum") {
        const n = parseInt(e.key);
        if (!isNaN(n) && n >= 1 && n <= question.options.length) {
          setValue(question.options[n - 1]);
        }
      }
      if (question.qtype === "bool") {
        if (e.key === "y" || e.key === "Y") setValue(true);
        if (e.key === "n" || e.key === "N") setValue(false);
      }
      if (e.key === "Enter") submit();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [question, submit]);

  function toggleSdg(num) {
    setValue(prev => {
      const list = Array.isArray(prev) ? [...prev] : [];
      return list.includes(num) ? list.filter(n => n !== num) : [...list, num];
    });
  }

  const T = COPY[lang];
  const prompt = (ar && question?.prompt_ar) ? question.prompt_ar : question?.prompt_fr;
  const help   = (ar && question?.help_ar)   ? question.help_ar   : question?.help_fr;

  return (
    <div className="interview-wrap" dir={ar ? "rtl" : "ltr"}>

      {/* Orange progress line fixed at top */}
      <div className="interview-progress-line" style={{ width: `${pct}%` }} />

      {/* Minimal header */}
      <div className="interview-header">
        <span className="interview-brand">فِراسة</span>
        <div className="interview-meta">
          {progress && (
            <span className="interview-counter">{progress.answered} / {progress.total}</span>
          )}
          <button className="ghost" onClick={onSkipToAudit} disabled={busy} style={{ fontSize:"0.78rem", padding:"6px 14px" }}>
            {T.skip}
          </button>
        </div>
      </div>

      {/* Question body */}
      <div className="interview-body">
        {question?.triggered_by && (
          <div className="interview-probe-badge">⚡ {T.probe}</div>
        )}

        {/* key forces animation replay on question change */}
        <div key={question?.id} className="interview-question-block">
          <div className="interview-prompt">{prompt}</div>
          {help && <div className="interview-help">{help}</div>}

          {/* Enum */}
          {question?.qtype === "enum" && (
            <div className="interview-opts">
              {question.options.map((opt, idx) => (
                <div
                  key={opt}
                  className={`interview-opt${value === opt ? " sel" : ""}`}
                  onClick={() => setValue(opt)}
                >
                  <span>{optLabel(question, opt, lang)}</span>
                  <span className="opt-key">{idx + 1}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bool */}
          {question?.qtype === "bool" && (
            <div className="interview-bool">
              <div className={`interview-bool-btn${value === true ? " sel" : ""}`} onClick={() => setValue(true)}>
                <span className="bool-label">{T.yes}</span>
                <span className="bool-key">Y</span>
              </div>
              <div className={`interview-bool-btn${value === false ? " sel" : ""}`} onClick={() => setValue(false)}>
                <span className="bool-label">{T.no}</span>
                <span className="bool-key">N</span>
              </div>
            </div>
          )}

          {/* Number */}
          {(question?.qtype === "int" || question?.qtype === "float") && (
            <input
              className="interview-number-input"
              type="number"
              value={value}
              step={question.qtype === "float" ? "0.1" : "1"}
              min="0"
              onChange={e => setValue(e.target.value)}
              autoFocus
            />
          )}

          {/* Text */}
          {question?.qtype === "text" && (
            <textarea
              rows={3}
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              style={{ resize: "vertical" }}
            />
          )}

          {/* Tags */}
          {question?.qtype === "tags" && (
            <input
              className="interview-tags-input"
              value={value}
              placeholder={T.tagsPlaceholder}
              onChange={e => setValue(e.target.value)}
              autoFocus
            />
          )}

          {/* SDG */}
          {question?.qtype === "sdg" && (
            <div>
              <div className="interview-sdg-grid">
                {Array.from({ length: 17 }, (_, i) => i + 1).map(num => (
                  <div
                    key={num}
                    className={`sdg-cell${Array.isArray(value) && value.includes(num) ? " sel" : ""}`}
                    onClick={() => toggleSdg(num)}
                  >
                    {num}
                  </div>
                ))}
              </div>
              <div className="muted" style={{ fontSize: "0.76rem", marginTop: 8 }}>
                {Array.isArray(value) && value.length > 0 ? value.join(", ") : T.sdgNone}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="interview-footer">
        <span className="interview-hint">{T.hint}</span>
        <button
          className="primary"
          onClick={submit}
          disabled={busy || value === "" || value === null}
          style={{ minWidth: 160 }}
        >
          {busy ? <span className="spinner" /> : T.continue}
        </button>
      </div>
    </div>
  );
}

const COPY = {
  fr: {
    skip: "Auditer maintenant →",
    probe: "Sonde ciblée",
    yes: "Oui", no: "Non",
    tagsPlaceholder: "Séparez par des virgules",
    sdgNone: "Aucun sélectionné",
    hint: "Utilisez les touches 1-9, Y/N, Entrée",
    continue: "Continuer →",
  },
  ar: {
    skip: "← تدقيق الآن",
    probe: "سؤال مخصص",
    yes: "نعم", no: "لا",
    tagsPlaceholder: "افصل بفواصل",
    sdgNone: "لم يتم الاختيار",
    hint: "استخدم المفاتيح 1-9 أو Y/N أو Enter",
    continue: "← متابعة",
  },
};
