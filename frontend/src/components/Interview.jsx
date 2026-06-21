import { useState, useEffect, useCallback } from "react";
import { SECTOR_LABELS, STAGE_LABELS } from "../constants.js";

const SHORT_NAMES = {
  fr: {
    name: "Nom", sector: "Secteur", declared_stage: "Stade", problem_statement: "Problème",
    user_segment: "Segment", tam: "TAM", competitors: "Concurrents", validation: "Validation",
    validation_proof: "Preuve", vp_narrative: "Offre", mvp_stage: "MVP", pricing: "Tarification",
    geo_novelty: "Innovation", tech_stack: "Stack", ip_status: "PI", human_dependency: "Dépendance",
    equipment_cost: "CAPEX", monthly_overhead: "OPEX", cross_border: "Zones", agri_footprint: "Empreinte",
    agri_circular: "Recyclage", digital_footprint: "Empreinte", footprint: "Empreinte",
    circular: "Recyclage", sdg: "ODD", legal_form: "Statut", revenue_model: "Modèle",
    unit_economics: "Unit Econ.", repeatable_sales: "Ventes"
  },
  ar: {
    name: "الاسم", sector: "القطاع", declared_stage: "المرحلة", problem_statement: "المشكلة",
    user_segment: "الشريحة", tam: "السوق", competitors: "المنافسين", validation: "التحقق",
    validation_proof: "الدليل", vp_narrative: "العرض", mvp_stage: "المنتج الأولي", pricing: "التسعير",
    geo_novelty: "الابتكار", tech_stack: "التقنيات", ip_status: "الملكية", human_dependency: "الاعتماد",
    equipment_cost: "المعدات", monthly_overhead: "النفقات", cross_border: "المناطق", agri_footprint: "الأثر",
    agri_circular: "التدوير", digital_footprint: "الأثر", footprint: "الأثر",
    circular: "التدوير", sdg: "الأهداف", legal_form: "الشكل القانوني", revenue_model: "النموذج",
    unit_economics: "الاقتصاديات", repeatable_sales: "المبيعات"
  }
};

function initial(q) {
  if (!q) return "";
  if (q.qtype === "bool")  return true;
  if (q.qtype === "enum")  return q.options[0] ?? "";
  if (q.qtype === "tags" || q.qtype === "sdg") return [];
  if (q.qtype === "int"  || q.qtype === "float") return 0;
  return "";
}

function coerce(q, v) {
  if (q.qtype === "int")   return parseInt(v, 10) || 0;
  if (q.qtype === "float") return parseFloat(v)  || 0;
  if (q.qtype === "tags")  return Array.isArray(v) ? v : String(v).split(",").map(s=>s.trim()).filter(Boolean);
  if (q.qtype === "sdg")   return Array.isArray(v) ? v : String(v).split(",").map(s=>parseInt(s.trim(),10)).filter(Number.isInteger);
  return v;
}

function optLabel(q, opt, lang) {
  if (q.id === "sector")         return SECTOR_LABELS[lang][opt] || opt;
  if (q.id === "declared_stage") return STAGE_LABELS[lang][parseInt(opt)] || opt;
  return opt;
}

function getTriggeredExplanation(triggeredBy, lang) {
  if (!triggeredBy) return "";
  const ar = lang === "ar";
  if (triggeredBy.includes("declared_stage>=Fundraising")) {
    return ar 
      ? "تم إدراجه لأنك صرحت بمرحلة تمويل أو أعلى" 
      : "Injecté car vous avez déclaré le stade Levée de fonds ou plus";
  }
  if (triggeredBy.includes("sector=agri-food")) {
    return ar 
      ? "تم إدراجه لأنك تنشط في قطاع الصناعات الغذائية" 
      : "Injecté car vous opérez dans le secteur Agri-food";
  }
  if (triggeredBy.includes("sector=digital-saas")) {
    return ar 
      ? "تم إدراجه لأنك تنشط في قطاع البرمجيات الرقمية" 
      : "Injecté car vous opérez dans le secteur SaaS & Numérique";
  }
  if (triggeredBy.includes("declared_stage=Growth")) {
    return ar 
      ? "تم إدراجه لأنك صرحت بمرحلة النمو" 
      : "Injecté car vous avez déclaré le stade de Croissance";
  }
  return ar 
    ? `سؤال مخصص بناءً على: ${triggeredBy}` 
    : `Injecté suite à : ${triggeredBy}`;
}

export default function Interview({ lang, question, progress, busy, onSubmit, onSkipConfirm, user, plan, openProfile, pid, api }) {
  const [value, setValue]   = useState(() => initial(question));
  const [answeredList, setAnsweredList] = useState([]);
  const ar = lang === "ar";

  // Freeze progress denominator so it never jumps backward
  const [maxDenominator, setMaxDenominator] = useState(progress?.total || 1);
  useEffect(() => {
    if (progress?.total > maxDenominator) {
      setMaxDenominator(progress.total);
    }
  }, [progress?.total, maxDenominator]);

  // Reset value whenever question changes
  useEffect(() => { 
    setValue(initial(question)); 
  }, [question?.id]);

  // Fetch answered questions to show Locked-in profile summary chips
  useEffect(() => {
    if (pid && api) {
      api.getQuestions(pid)
        .then(qs => {
          setAnsweredList(qs.filter(q => q.answered && q.value !== null && q.value !== ""));
        })
        .catch(console.error);
    }
  }, [pid, api, question?.id]);

  const pct = maxDenominator > 0 ? Math.round((progress.answered / maxDenominator) * 100) : 0;

  const submit = useCallback(() => {
    if (busy || !question) return;
    onSubmit(question.id, coerce(question, value));
  }, [busy, question, value, onSubmit]);

  const handleSkipClick = () => {
    onSkipConfirm();
  };

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

      {/* Question body */}
      <div className="interview-body" style={{ paddingTop: "40px" }}>
        
        {/* Answered questions horizontal chip summary */}
        {answeredList.length > 0 && (
          <div className="locked-in-summary" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "24px", padding: "10px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", alignSelf: "center", marginRight: ar ? 0 : 4, marginLeft: ar ? 4 : 0 }}>
              {ar ? "الملف التعريفي الحالي:" : "Profil constitué :"}
            </span>
            {answeredList.map(q => {
              let dispVal = q.value;
              if (q.qtype === "bool") dispVal = q.value ? (ar ? "نعم" : "Oui") : (ar ? "لا" : "Non");
              if (q.id === "sector") dispVal = SECTOR_LABELS[lang][q.value] || q.value;
              if (q.id === "declared_stage") dispVal = STAGE_LABELS[lang][parseInt(q.value)] || q.value;
              if (Array.isArray(q.value)) dispVal = q.value.join(", ");
              const shortName = SHORT_NAMES[lang][q.id] || q.id;

              return (
                <span key={q.id} className="locked-chip" style={{ fontSize: "0.7rem", background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", borderRadius: "99px", padding: "2px 10px", color: "var(--text-sub)", display: "inline-flex", gap: 4 }}>
                  <strong style={{ color: "var(--text)" }}>{shortName}</strong>: {dispVal}
                </span>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          {progress && (
            <span className="interview-counter" style={{ fontSize: "0.88rem" }}>
              {ar ? `السؤال ${progress.answered + 1}` : `Question ${progress.answered + 1}`} 
              <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                {" — "}{ar ? "بضعة أسئلة أخرى حسب قطاعك" : "encore quelques questions selon votre secteur"}
              </span>
            </span>
          )}
          {progress && progress.answered >= 5 && (
            <button className="ghost" onClick={handleSkipClick} disabled={busy} style={{ fontSize: "0.78rem", padding: "6px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)" }}>
              {T.skip}
            </button>
          )}
        </div>

        {question?.triggered_by && (
          <div className="interview-probe-badge" style={{ display: "inline-flex", flexDirection: "column", gap: 4, padding: "8px 12px", background: "var(--orange-soft)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)", marginBottom: 16 }}>
            <span style={{ color: "var(--orange)", fontWeight: 700, fontSize: "0.76rem" }}>⚡ {T.probe}</span>
            <span style={{ color: "var(--text-sub)", fontSize: "0.72rem" }}>
              {getTriggeredExplanation(question.triggered_by, lang)}
            </span>
          </div>
        )}

        {/* key forces animation replay on question change */}
        <div key={question?.id} className="interview-question-block" style={{ marginTop: 10 }}>
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
