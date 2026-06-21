import { useState, useEffect, useCallback, useRef } from "react";
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

const SECTIONS = {
  fr: {
    context:     { ids: ["name","sector","declared_stage","problem_statement","user_segment","legal_form","revenue_model","unit_economics","repeatable_sales"], label: "Contexte", icon: "🏢" },
    market:      { ids: ["tam","competitors","validation","validation_proof"], label: "Marché", icon: "📊" },
    offer:       { ids: ["vp_narrative","mvp_stage","pricing"], label: "Offre", icon: "💡" },
    innovation:  { ids: ["geo_novelty","tech_stack","ip_status"], label: "Innovation", icon: "🔬" },
    scalability: { ids: ["human_dependency","equipment_cost","monthly_overhead","cross_border"], label: "Scalabilité", icon: "📈" },
    green:       { ids: ["agri_footprint","agri_circular","digital_footprint","footprint","circular","sdg"], label: "Impact", icon: "🌱" },
  },
  ar: {
    context:     { ids: ["name","sector","declared_stage","problem_statement","user_segment","legal_form","revenue_model","unit_economics","repeatable_sales"], label: "السياق", icon: "🏢" },
    market:      { ids: ["tam","competitors","validation","validation_proof"], label: "السوق", icon: "📊" },
    offer:       { ids: ["vp_narrative","mvp_stage","pricing"], label: "العرض", icon: "💡" },
    innovation:  { ids: ["geo_novelty","tech_stack","ip_status"], label: "الابتكار", icon: "🔬" },
    scalability: { ids: ["human_dependency","equipment_cost","monthly_overhead","cross_border"], label: "التوسع", icon: "📈" },
    green:       { ids: ["agri_footprint","agri_circular","digital_footprint","footprint","circular","sdg"], label: "الأثر", icon: "🌱" },
  }
};

const SDG_LABELS = {
  fr: {
    1:"Fin de la pauvreté", 2:"Faim «zéro»", 3:"Bonne santé", 4:"Éducation de qualité",
    5:"Égalité des sexes", 6:"Eau propre", 7:"Énergie propre", 8:"Travail décent",
    9:"Industrie & Innovation", 10:"Inégalités réduites", 11:"Villes durables",
    12:"Conso. responsable", 13:"Lutte contre le climat", 14:"Vie aquatique",
    15:"Vie terrestre", 16:"Paix & Justice", 17:"Partenariats"
  },
  ar: {
    1:"القضاء على الفقر", 2:"القضاء على الجوع", 3:"الصحة الجيدة", 4:"التعليم الجيد",
    5:"المساواة بين الجنسين", 6:"المياه النظيفة", 7:"الطاقة النظيفة", 8:"العمل اللائق",
    9:"الصناعة والابتكار", 10:"الحد من التفاوت", 11:"المدن المستدامة",
    12:"الاستهلاك المسؤول", 13:"العمل المناخي", 14:"الحياة المائية",
    15:"الحياة البرية", 16:"السلام والعدل", 17:"شراكات التنمية"
  }
};

const SLIDER_QUESTIONS = {
  human_dependency: {
    min: 1, max: 10, step: 1,
    leftLabel: { fr: "Automatisé", ar: "آلي بالكامل" },
    rightLabel: { fr: "Manuel total", ar: "يدوي تام" }
  }
};

const COPY = {
  fr: {
    skip: "Auditer maintenant →",
    probe: "Sonde ciblée",
    yes: "Oui", no: "Non",
    tagsPlaceholder: "Séparez par des virgules",
    sdgNone: "Aucun sélectionné",
    hint: "Cliquez ou utilisez les touches 1-9, Y/N, Entrée",
    continue: "Continuer →",
    save: "Sauvegarder",
    cancel: "Annuler",
    editTitle: "Modifier la réponse",
  },
  ar: {
    skip: "← تدقيق الآن",
    probe: "سؤال مخصص",
    yes: "نعم", no: "لا",
    tagsPlaceholder: "افصل بفواصل",
    sdgNone: "لم يتم الاختيار",
    hint: "انقر أو استخدم المفاتيح 1-9 أو Y/N أو Enter",
    continue: "← متابعة",
    save: "حفظ",
    cancel: "إلغاء",
    editTitle: "تعديل الإجابة",
  },
};

// ─── helpers ────────────────────────────────────────────────────────────────

function initial(q) {
  if (!q) return "";
  if (q.qtype === "bool")  return null;
  if (q.qtype === "enum")  return "";
  if (q.qtype === "tags" || q.qtype === "sdg") return [];
  if (q.id in SLIDER_QUESTIONS) return SLIDER_QUESTIONS[q.id].min;
  if (q.qtype === "int" || q.qtype === "float") return "";
  return "";
}

function coerce(q, v) {
  if (q.qtype === "int")   return parseInt(v, 10) || 0;
  if (q.qtype === "float") return parseFloat(v)   || 0;
  if (q.qtype === "tags")  return Array.isArray(v) ? v : String(v).split(",").map(s => s.trim()).filter(Boolean);
  if (q.qtype === "sdg")   return Array.isArray(v) ? v : String(v).split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  return v;
}

function optLabel(q, opt, lang) {
  if (q.id === "sector")         return SECTOR_LABELS[lang][opt] || opt;
  if (q.id === "declared_stage") return STAGE_LABELS[lang][parseInt(opt)] || opt;
  return opt;
}

function getSectionKey(qid) {
  for (const [key, sec] of Object.entries(SECTIONS.fr)) {
    if (sec.ids.includes(qid)) return key;
  }
  return null;
}

function getSectionInfo(qid, lang) {
  const sections = SECTIONS[lang] || SECTIONS.fr;
  for (const [, sec] of Object.entries(sections)) {
    if (sec.ids.includes(qid)) return sec;
  }
  return null;
}

// A question type is "groupable" if it is bool or enum (quick-select) and NOT the first question
function isGroupable(q) {
  if (!q) return false;
  if (q.id === "name") return false; // always solo
  return q.qtype === "bool" || q.qtype === "enum";
}

// Returns true if two questions can share the same page
function canGroup(existing, incoming) {
  if (!isGroupable(incoming)) return false;
  if (existing.length === 0) return false;
  if (existing.length >= 3) return false;
  // Must all be groupable
  if (!existing.every(isGroupable)) return false;
  // Must all be in the same section
  const targetSection = getSectionKey(incoming.id);
  if (!targetSection) return false;
  return existing.every(q => getSectionKey(q.id) === targetSection);
}

function displayValue(q, lang) {
  if (q.qtype === "bool") return q.value ? (lang === "ar" ? "نعم ✓" : "Oui ✓") : (lang === "ar" ? "لا ✗" : "Non ✗");
  if (q.id === "sector")         return SECTOR_LABELS[lang][q.value] || q.value;
  if (q.id === "declared_stage") return STAGE_LABELS[lang][parseInt(q.value)] || q.value;
  if (Array.isArray(q.value))    return q.value.length ? `${q.value.length} sél.` : "—";
  return String(q.value);
}

// ─── sub-components ──────────────────────────────────────────────────────────

function QuestionInput({ q, value, onChange, onSubmit, lang, busy }) {
  const ar = lang === "ar";
  const isSlider = q.id in SLIDER_QUESTIONS;
  const sliderCfg = isSlider ? SLIDER_QUESTIONS[q.id] : null;

  function toggleSdg(num) {
    onChange(prev => {
      const list = Array.isArray(prev) ? [...prev] : [];
      return list.includes(num) ? list.filter(n => n !== num) : [...list, num];
    });
  }

  if (q.qtype === "enum") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.options.map((opt, idx) => (
          <button
            key={opt}
            onClick={() => { onChange(opt); onSubmit && onSubmit(opt); }}
            disabled={busy}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderRadius: "var(--r-md)",
              border: `1px solid ${value === opt ? "var(--orange)" : "var(--border)"}`,
              background: value === opt ? "var(--orange-soft)" : "rgba(255,255,255,0.02)",
              color: "var(--text)", cursor: "pointer", fontSize: "0.95rem", fontWeight: 500,
              textAlign: ar ? "right" : "left", transition: "all 0.15s",
            }}
          >
            <span>{optLabel(q, opt, lang)}</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 7px", minWidth: 22, textAlign: "center" }}>{idx + 1}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.qtype === "bool") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[true, false].map(bval => (
          <button
            key={String(bval)}
            onClick={() => { onChange(bval); onSubmit && onSubmit(bval); }}
            disabled={busy}
            style={{
              padding: "22px 16px", borderRadius: "var(--r-md)",
              border: `1px solid ${value === bval ? (bval ? "#4caf50" : "#ef5350") : "var(--border)"}`,
              background: value === bval ? (bval ? "rgba(76,175,80,0.1)" : "rgba(239,83,80,0.1)") : "rgba(255,255,255,0.02)",
              color: "var(--text)", cursor: "pointer", fontSize: "1.6rem",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s",
            }}
          >
            <span>{bval ? "✓" : "✗"}</span>
            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{bval ? (COPY[lang] || COPY.fr).yes : (COPY[lang] || COPY.fr).no}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{bval ? "Y" : "N"}</span>
          </button>
        ))}
      </div>
    );
  }

  if (isSlider) {
    return (
      <div style={{ padding: "10px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: "0.78rem", color: "var(--text-dim)" }}>
          <span>{sliderCfg.leftLabel[lang] || sliderCfg.leftLabel.fr}</span>
          <span style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--orange)" }}>{value}</span>
          <span>{sliderCfg.rightLabel[lang] || sliderCfg.rightLabel.fr}</span>
        </div>
        <input
          type="range"
          min={sliderCfg.min} max={sliderCfg.max} step={sliderCfg.step}
          value={value === "" ? sliderCfg.min : value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: "var(--orange)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {Array.from({ length: sliderCfg.max - sliderCfg.min + 1 }, (_, i) => i + sliderCfg.min).map(n => (
            <span key={n} style={{ fontSize: "0.65rem", color: parseInt(value) === n ? "var(--orange)" : "var(--text-dim)", fontWeight: parseInt(value) === n ? 700 : 400 }}>{n}</span>
          ))}
        </div>
      </div>
    );
  }

  if (q.qtype === "int" || q.qtype === "float") {
    return (
      <input
        className="interview-number-input"
        type="number"
        value={value}
        step={q.qtype === "float" ? "1000" : "1"}
        min="0"
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onSubmit && onSubmit(value)}
        autoFocus
        style={{ fontSize: "1.4rem" }}
      />
    );
  }

  if (q.qtype === "text") {
    return (
      <textarea
        rows={4}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus
        placeholder={ar ? "اكتب هنا..." : "Écrivez ici..."}
        style={{ resize: "vertical", fontSize: "0.95rem" }}
      />
    );
  }

  if (q.qtype === "tags") {
    const T = COPY[lang] || COPY.fr;
    return (
      <div>
        <input
          className="interview-tags-input"
          value={Array.isArray(value) ? value.join(", ") : value}
          placeholder={T.tagsPlaceholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit && onSubmit(value)}
          autoFocus
        />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 6 }}>
          {ar ? "مثال: React، Python، AWS" : "Ex: React, Python, AWS"}
        </div>
      </div>
    );
  }

  if (q.qtype === "sdg") {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {Array.from({ length: 17 }, (_, i) => i + 1).map(num => {
            const sel = Array.isArray(value) && value.includes(num);
            return (
              <button
                key={num}
                onClick={() => toggleSdg(num)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: "var(--r-sm)",
                  border: `1px solid ${sel ? "var(--orange)" : "var(--border)"}`,
                  background: sel ? "var(--orange-soft)" : "rgba(255,255,255,0.02)",
                  color: sel ? "var(--orange)" : "var(--text-sub)",
                  cursor: "pointer", fontSize: "0.75rem", textAlign: ar ? "right" : "left",
                  transition: "all 0.12s",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 18, color: sel ? "var(--orange)" : "var(--text-dim)" }}>{num}</span>
                <span style={{ lineHeight: 1.2 }}>{SDG_LABELS[lang]?.[num] || SDG_LABELS.fr[num]}</span>
              </button>
            );
          })}
        </div>
        {Array.isArray(value) && value.length > 0 && (
          <div style={{ fontSize: "0.76rem", color: "var(--orange)", marginTop: 10 }}>
            {lang === "ar" ? `${value.length} هدف مختار` : `${value.length} ODD sélectionné${value.length > 1 ? "s" : ""}`}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// Single question block used both on main page and in edit modal
function QuestionBlock({ q, value, onChange, onSubmitValue, lang, busy, isGrouped }) {
  const ar = lang === "ar";
  const prompt = (ar && q.prompt_ar) ? q.prompt_ar : q.prompt_fr;
  const help   = (ar && q.help_ar)   ? q.help_ar   : q.help_fr;
  const isGroupable_ = isGroupable(q);

  return (
    <div
      key={q.id}
      className="interview-question-block"
      style={isGrouped ? { marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid var(--border)" } : {}}
    >
      {q.triggered_by && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--orange-soft)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)", marginBottom: 16, fontSize: "0.73rem", color: "var(--orange)" }}>
          ⚡ {(COPY[lang] || COPY.fr).probe}
        </div>
      )}
      <div className="interview-prompt" style={{ fontSize: isGrouped ? "1.1rem" : "1.35rem", fontWeight: 600, lineHeight: 1.4, marginBottom: help ? 8 : 24 }}>
        {prompt}
      </div>
      {help && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: 20, borderLeft: ar ? "none" : "2px solid var(--border)", borderRight: ar ? "2px solid var(--border)" : "none", paddingLeft: ar ? 0 : 10, paddingRight: ar ? 10 : 0 }}>
          {help}
        </div>
      )}
      <QuestionInput
        q={q}
        value={value}
        onChange={onChange}
        onSubmit={isGroupable_ ? onSubmitValue : null}
        lang={lang}
        busy={busy}
      />
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ q, lang, busy, onSave, onCancel }) {
  const ar = lang === "ar";
  const T  = COPY[lang] || COPY.fr;
  const [editVal, setEditVal] = useState(() => {
    if (q.qtype === "bool") return q.value;
    if (q.qtype === "sdg" || q.qtype === "tags") return Array.isArray(q.value) ? [...q.value] : [];
    if (q.id in SLIDER_QUESTIONS) return q.value !== undefined ? q.value : SLIDER_QUESTIONS[q.id].min;
    return q.value !== null && q.value !== undefined ? q.value : "";
  });

  const isGroupable_ = isGroupable(q);

  function handleAutoSave(v) {
    if (isGroupable_) {
      onSave(coerce(q, v));
    }
  }

  const canSave = editVal !== null && editVal !== "" && !(Array.isArray(editVal) && q.qtype === "sdg" && editVal.length === 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        dir={ar ? "rtl" : "ltr"}
        style={{
          background: "var(--bg, #0e0e0e)", border: "1px solid var(--border)", borderRadius: "var(--r-md, 12px)",
          padding: 28, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)" }}>{T.editTitle}</span>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}
          >✕</button>
        </div>

        <QuestionBlock
          q={q}
          value={editVal}
          onChange={setEditVal}
          onSubmitValue={handleAutoSave}
          lang={lang}
          busy={busy}
          isGrouped={false}
        />

        {!isGroupable_ && (
          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: ar ? "flex-start" : "flex-end" }}>
            <button
              onClick={onCancel}
              style={{ padding: "8px 18px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-sub)", cursor: "pointer", fontSize: "0.88rem" }}
            >
              {T.cancel}
            </button>
            <button
              className="primary"
              onClick={() => onSave(coerce(q, editVal))}
              disabled={busy || !canSave}
              style={{ minWidth: 120 }}
            >
              {busy ? <span className="spinner" /> : T.save}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Interview({ lang, question, progress, busy, onSubmit, onSkipToAudit, onBack, pid, api }) {
  const ar = lang === "ar";
  const T  = COPY[lang] || COPY.fr;

  // ── Progress ─────────────────────────────────────────────────────────────
  const [maxDenominator, setMaxDenominator] = useState(progress?.total || 1);
  useEffect(() => {
    if (progress?.total > maxDenominator) setMaxDenominator(progress.total);
  }, [progress?.total, maxDenominator]);
  const pct = maxDenominator > 0 ? Math.round(((progress?.answered ?? 0) / maxDenominator) * 100) : 0;

  // ── Answered chips ────────────────────────────────────────────────────────
  const [answeredList, setAnsweredList] = useState([]);

  useEffect(() => {
    if (pid && api) {
      api.getQuestions(pid)
        .then(qs => setAnsweredList(qs.filter(q => q.answered && q.value !== null && q.value !== "")))
        .catch(console.error);
    }
  }, [pid, api, question?.id]);

  // ── Edit modal state ──────────────────────────────────────────────────────
  const [editingQ, setEditingQ] = useState(null);

  function handleChipClick(q) {
    setEditingQ(q);
  }

  function handleEditSave(newValue) {
    if (!editingQ) return;
    onSubmit(editingQ.id, newValue);
    // Optimistically update the answeredList
    setAnsweredList(prev => prev.map(q => q.id === editingQ.id ? { ...q, value: newValue } : q));
    setEditingQ(null);
  }

  function handleEditCancel() {
    setEditingQ(null);
  }

  // ── Page buffer ───────────────────────────────────────────────────────────
  // Each entry: { q, value }
  const [pageBuffer, setPageBuffer]       = useState([]);
  // Tracks which buffer indices have been "confirmed" (bool/enum auto-selected)
  const [bufferAnswered, setBufferAnswered] = useState({});
  // Whether we are flushing (submitting the buffer sequentially)
  const [flushing, setFlushing]           = useState(false);
  const flushQueueRef                     = useRef([]);
  const flushIndexRef                     = useRef(0);

  // Whenever a new question arrives, decide to buffer or flush+start new page
  const prevQuestionId = useRef(null);

  useEffect(() => {
    if (!question) return;
    if (question.id === prevQuestionId.current) return;
    prevQuestionId.current = question.id;

    setPageBuffer(prev => {
      const currentQs = prev.map(e => e.q);
      if (canGroup(currentQs, question)) {
        // Add to existing page
        return [...prev, { q: question, value: initial(question) }];
      } else {
        // Start a new page; the old buffer was already submitted when user clicked "Continuer"
        // (If it wasn't flushed yet — e.g., first load — just replace)
        return [{ q: question, value: initial(question) }];
      }
    });
    setBufferAnswered({});
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateBufferValue(idx, newValue) {
    setPageBuffer(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], value: newValue };
      return next;
    });
  }

  // Auto-answer for bool/enum within buffer: mark as answered and record value
  function handleBufferAutoSelect(idx, val) {
    updateBufferValue(idx, val);
    setBufferAnswered(prev => ({ ...prev, [idx]: true }));
  }

  // Flush: submit all buffer entries sequentially to backend
  async function flushBuffer() {
    if (flushing || busy) return;
    const entries = [...pageBuffer];
    setFlushing(true);
    for (const entry of entries) {
      const v = coerce(entry.q, entry.value);
      // Wait for each submit (the parent drives question progression by changing the `question` prop)
      onSubmit(entry.q.id, v);
      // Small yield so the parent component can process state before the next call
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    setFlushing(false);
  }

  // ── "Continuer" button logic ──────────────────────────────────────────────
  // For a page with multiple questions: all must be answered
  // For a single non-bool/enum question: value must be non-empty
  function allBufferAnswered() {
    if (pageBuffer.length === 0) return false;
    return pageBuffer.every((entry, idx) => {
      const q = entry.q;
      if (isGroupable(q)) {
        return bufferAnswered[idx] === true || entry.value !== null && entry.value !== "";
      }
      // Non-groupable (solo page)
      const v = entry.value;
      if (q.qtype === "sdg") return Array.isArray(v) && v.length > 0;
      return v !== null && v !== "" && v !== undefined;
    });
  }

  // Whether the page has multiple grouped questions
  const isMultiPage = pageBuffer.length > 1;
  // The "active" question for solo pages
  const soloEntry   = !isMultiPage && pageBuffer.length === 1 ? pageBuffer[0] : null;
  const soloQ       = soloEntry?.q ?? null;

  // For solo pages, keep backward-compat: bool/enum auto-submit when solo
  function handleSoloAutoSelect(val) {
    if (!soloQ) return;
    updateBufferValue(0, val);
    // Immediately submit — no buffer grouping on solo auto-select
    onSubmit(soloQ.id, coerce(soloQ, val));
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (editingQ) return;

      if (isMultiPage) {
        if (e.key === "Enter" && allBufferAnswered()) flushBuffer();
        return;
      }

      if (!soloQ) return;

      if (soloQ.qtype === "enum") {
        const n = parseInt(e.key);
        if (!isNaN(n) && n >= 1 && soloQ.options && n <= soloQ.options.length) {
          handleSoloAutoSelect(soloQ.options[n - 1]);
        }
      }
      if (soloQ.qtype === "bool") {
        if (e.key === "y" || e.key === "Y") handleSoloAutoSelect(true);
        if (e.key === "n" || e.key === "N") handleSoloAutoSelect(false);
      }
      if (e.key === "Enter" && soloQ.qtype !== "bool" && soloQ.qtype !== "enum") {
        const v = soloEntry?.value;
        if (v !== null && v !== "" && v !== undefined) {
          onSubmit(soloQ.id, coerce(soloQ, v));
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ── Section info ─────────────────────────────────────────────────────────
  // Use the first question in the buffer for section badge
  const firstQ   = pageBuffer[0]?.q ?? null;
  const section  = firstQ ? getSectionInfo(firstQ.id, lang) : null;

  // ── Render helpers ────────────────────────────────────────────────────────
  function needsConfirmSolo(q) {
    if (!q) return false;
    if (q.qtype === "text")  return true;
    if (q.qtype === "tags")  return true;
    if (q.qtype === "sdg")   return true;
    if (q.qtype === "float") return true;
    if (q.qtype === "int" && !(q.id in SLIDER_QUESTIONS)) return true;
    if (q.id in SLIDER_QUESTIONS) return true; // slider needs confirm
    return false;
  }

  const showContinueForSolo = soloQ && (needsConfirmSolo(soloQ));
  const showContinueForMulti = isMultiPage;
  const showContinue = showContinueForSolo || showContinueForMulti;

  const continueDisabled =
    busy || flushing || !allBufferAnswered();

  const handleSkipClick = () => {
    const confirmMsg = ar
      ? "سيؤدي تجاوز الأسئلة إلى تدقيق جزئي. هل تريد الاستمرار؟"
      : "Des champs clés manqueront. Voulez-vous générer l'audit maintenant ?";
    if (window.confirm(confirmMsg)) onSkipToAudit();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="interview-wrap" dir={ar ? "rtl" : "ltr"}>

      {/* Progress line */}
      <div className="interview-progress-line" style={{ width: `${pct}%` }} />

      <div className="interview-body" style={{ paddingTop: "32px", maxWidth: 580, margin: "0 auto" }}>

        {/* Answered chips */}
        {answeredList.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
            {answeredList.map(q => {
              const dispVal  = displayValue(q, lang);
              const shortName = SHORT_NAMES[lang][q.id] || q.id;
              return (
                <button
                  key={q.id}
                  title={ar ? "انقر للتعديل" : "Cliquer pour modifier"}
                  onClick={() => handleChipClick(q)}
                  style={{
                    fontSize: "0.68rem",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border)",
                    borderRadius: "99px",
                    padding: "2px 9px",
                    color: "var(--text-sub)",
                    display: "inline-flex", gap: 4,
                    cursor: "pointer",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--orange)"; e.currentTarget.style.background = "var(--orange-soft)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  <span style={{ color: "var(--text-dim)" }}>{shortName}</span>
                  <span style={{ color: "var(--text)" }}>{dispVal}</span>
                  <span style={{ color: "var(--text-dim)", fontSize: "0.6rem", marginLeft: 2 }}>✎</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Section + counter row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{ fontSize: "0.78rem", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--text-sub)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {ar ? "→ رجوع" : "← Accueil"}
              </button>
            )}
            {section && (
              <span style={{ fontSize: "0.78rem", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: "99px", padding: "3px 12px", color: "var(--text-sub)" }}>
                {section.icon} {section.label}
                {isMultiPage && (
                  <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "var(--text-dim)" }}>
                    ({pageBuffer.length})
                  </span>
                )}
              </span>
            )}
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
              {pct < 100 ? `${pct}%` : (ar ? "اكتمل ✓" : "Complet ✓")}
            </span>
          </div>
          {progress && progress.answered >= 5 && (
            <button
              onClick={handleSkipClick}
              disabled={busy}
              style={{ fontSize: "0.74rem", padding: "4px 12px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
            >
              {T.skip}
            </button>
          )}
        </div>

        {/* ── Page questions ── */}
        {isMultiPage ? (
          /* Multi-question page */
          <div>
            {pageBuffer.map((entry, idx) => {
              const answered = bufferAnswered[idx] || false;
              return (
                <div
                  key={entry.q.id}
                  style={{
                    opacity: answered ? 0.6 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {answered && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: "0.7rem", color: "#4caf50" }}>✓ {ar ? "تم الاختيار" : "Sélectionné"}</span>
                    </div>
                  )}
                  <QuestionBlock
                    q={entry.q}
                    value={entry.value}
                    onChange={newVal => updateBufferValue(idx, newVal)}
                    onSubmitValue={val => handleBufferAutoSelect(idx, val)}
                    lang={lang}
                    busy={busy || flushing}
                    isGrouped={true}
                  />
                </div>
              );
            })}

            {/* Multi-page footer */}
            <div className="interview-footer" style={{ marginTop: 28 }}>
              <span className="interview-hint" style={{ fontSize: "0.73rem" }}>↵ Enter</span>
              <button
                className="primary"
                onClick={flushBuffer}
                disabled={continueDisabled}
                style={{ minWidth: 140 }}
              >
                {(busy || flushing) ? <span className="spinner" /> : T.continue}
              </button>
            </div>
          </div>
        ) : soloQ ? (
          /* Single-question page */
          <div>
            <div key={soloQ.id} className="interview-question-block">
              {soloQ.triggered_by && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "var(--orange-soft)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)", marginBottom: 16, fontSize: "0.73rem", color: "var(--orange)" }}>
                  ⚡ {T.probe}
                </div>
              )}

              {(() => {
                const prompt = (ar && soloQ.prompt_ar) ? soloQ.prompt_ar : soloQ.prompt_fr;
                const help   = (ar && soloQ.help_ar)   ? soloQ.help_ar   : soloQ.help_fr;
                return (
                  <>
                    <div className="interview-prompt" style={{ fontSize: "1.35rem", fontWeight: 600, lineHeight: 1.4, marginBottom: help ? 8 : 24 }}>
                      {prompt}
                    </div>
                    {help && (
                      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: 20, borderLeft: ar ? "none" : "2px solid var(--border)", borderRight: ar ? "2px solid var(--border)" : "none", paddingLeft: ar ? 0 : 10, paddingRight: ar ? 10 : 0 }}>
                        {help}
                      </div>
                    )}
                  </>
                );
              })()}

              <QuestionInput
                q={soloQ}
                value={soloEntry?.value ?? initial(soloQ)}
                onChange={val => updateBufferValue(0, val)}
                onSubmit={isGroupable(soloQ) ? handleSoloAutoSelect : null}
                lang={lang}
                busy={busy}
              />
            </div>

            {/* Solo footer */}
            {showContinueForSolo && (
              <div className="interview-footer" style={{ marginTop: 28 }}>
                <span className="interview-hint" style={{ fontSize: "0.73rem" }}>↵ Enter</span>
                <button
                  className="primary"
                  onClick={() => {
                    const v = soloEntry?.value;
                    if (v !== null && v !== "" && v !== undefined) {
                      onSubmit(soloQ.id, coerce(soloQ, v));
                    }
                  }}
                  disabled={busy || continueDisabled}
                  style={{ minWidth: 140 }}
                >
                  {busy ? <span className="spinner" /> : T.continue}
                </button>
              </div>
            )}

            {!showContinueForSolo && soloQ.qtype !== "bool" && soloQ.qtype !== "enum" && (
              <div style={{ marginTop: 16, fontSize: "0.72rem", color: "var(--text-dim)", textAlign: "center" }}>
                {T.hint}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Edit modal */}
      {editingQ && (
        <EditModal
          q={editingQ}
          lang={lang}
          busy={busy}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />
      )}
    </div>
  );
}
