import { useState, useEffect, useRef } from "react";
import { SECTOR_LABELS, STAGE_LABELS } from "../constants.js";

function optLabel(q, opt, lang) {
  if (q.id === "sector")         return SECTOR_LABELS[lang][opt] || opt;
  if (q.id === "declared_stage") return STAGE_LABELS[lang][parseInt(opt)] || opt;
  return opt;
}

const DIMENSION_GROUPS = {
  fr: [
    { id: "context", label: "Contexte & Stade", qids: ["name", "sector", "declared_stage", "legal_form", "problem_statement", "user_segment", "revenue_model", "repeatable_sales"] },
    { id: "market", label: "Marché", qids: ["tam", "competitors", "validation"] },
    { id: "commercial", label: "Commercial", qids: ["vp_narrative", "validation_proof", "mvp_stage", "pricing"] },
    { id: "innovation", label: "Innovation", qids: ["geo_novelty", "tech_stack", "ip_status"] },
    { id: "scalability", label: "Scalabilité", qids: ["human_dependency", "equipment_cost", "monthly_overhead", "cross_border"] },
    { id: "green", label: "Green & ESG", qids: ["agri_footprint", "agri_circular", "digital_footprint", "footprint", "circular", "sdg"] }
  ],
  ar: [
    { id: "context", label: "السياق والمرحلة", qids: ["name", "sector", "declared_stage", "legal_form", "problem_statement", "user_segment", "revenue_model", "repeatable_sales"] },
    { id: "market", label: "السوق", qids: ["tam", "competitors", "validation"] },
    { id: "commercial", label: "الجانب التجاري", qids: ["vp_narrative", "validation_proof", "mvp_stage", "pricing"] },
    { id: "innovation", label: "الابتكار", qids: ["geo_novelty", "tech_stack", "ip_status"] },
    { id: "scalability", label: "قابلية التوسع", qids: ["human_dependency", "equipment_cost", "monthly_overhead", "cross_border"] },
    { id: "green", label: "الأثر البيئي والاجتماعي", qids: ["agri_footprint", "agri_circular", "digital_footprint", "footprint", "circular", "sdg"] }
  ]
};

export default function ProfileEditor({ pid, lang, api, onClose, onAuditUpdated, initialFocusQuestion }) {
  const [questions, setQuestions] = useState([]);
  const [values, setValues] = useState({});
  const [savingStates, setSavingStates] = useState({}); // { [qid]: 'saving' | 'saved' | 'error' | null }
  const [loading, setLoading] = useState(true);
  const [auditRefreshing, setAuditRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const ar = lang === "ar";
  const groups = DIMENSION_GROUPS[lang === "ar" ? "ar" : "fr"];

  // Find which tab we should display initially
  const [activeTab, setActiveTab] = useState(() => {
    if (initialFocusQuestion) {
      const foundGroup = groups.find(g => g.qids.includes(initialFocusQuestion));
      if (foundGroup) return foundGroup.id;
    }
    return "context";
  });

  const questionRefs = useRef({});

  // Load questions
  useEffect(() => {
    async function load() {
      try {
        const qList = await api.getQuestions(pid);
        setQuestions(qList);
        
        // Populate initial values
        const vals = {};
        qList.forEach(q => {
          vals[q.id] = q.value !== undefined ? q.value : "";
        });
        setValues(vals);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pid, api]);

  // Handle auto scroll / focus for deep links
  useEffect(() => {
    if (!loading && initialFocusQuestion && questionRefs.current[initialFocusQuestion]) {
      setTimeout(() => {
        questionRefs.current[initialFocusQuestion].scrollIntoView({ behavior: "smooth", block: "center" });
        const input = questionRefs.current[initialFocusQuestion].querySelector("input, select, textarea");
        if (input) input.focus();
      }, 300);
    }
  }, [loading, initialFocusQuestion]);

  function handleChange(id, val) {
    setValues(prev => ({ ...prev, [id]: val }));
  }

  function handleBoolChange(id, val) {
    handleChange(id, val);
    saveField(id, val);
  }

  function handleEnumChange(id, val) {
    handleChange(id, val);
    saveField(id, val);
  }

  async function saveField(qid, val) {
    const originalQ = questions.find(q => q.id === qid);
    const originalVal = originalQ?.value !== undefined ? originalQ.value : "";
    
    // Skip saving if value is identical
    if (JSON.stringify(originalVal) === JSON.stringify(val)) return;

    setSavingStates(prev => ({ ...prev, [qid]: "saving" }));
    try {
      let coercedVal = val;
      const q = questions.find(item => item.id === qid);
      if (q) {
        if (q.qtype === "int") {
          coercedVal = parseInt(val, 10);
          if (isNaN(coercedVal)) coercedVal = 0;
        } else if (q.qtype === "float") {
          coercedVal = parseFloat(val);
          if (isNaN(coercedVal)) coercedVal = 0;
        } else if (q.qtype === "tags" && typeof val === "string") {
          coercedVal = val.split(",").map(s => s.trim()).filter(Boolean);
        }
      }

      await api.answer(pid, qid, coercedVal);
      setSavingStates(prev => ({ ...prev, [qid]: "saved" }));
      
      // Update original value locally
      setQuestions(prev => prev.map(q => q.id === qid ? { ...q, value: coercedVal } : q));

      // If sector or declared_stage changes, reload questions as the flow branches dynamically!
      if (qid === "sector" || qid === "declared_stage") {
        const qList = await api.getQuestions(pid);
        setQuestions(qList);
        setValues(prev => {
          const next = { ...prev };
          qList.forEach(q => {
            // Keep values if already present, otherwise set to new loaded value
            next[q.id] = q.value !== undefined ? q.value : "";
          });
          return next;
        });
      }
    } catch (err) {
      setSavingStates(prev => ({ ...prev, [qid]: "error" }));
      setError(err.message);
    }
  }

  function handleBlur(qid) {
    saveField(qid, values[qid]);
  }

  function handleKeyDown(e, qid) {
    if (e.key === "Enter") {
      e.target.blur();
    }
  }

  function toggleSdg(qid, num) {
    const current = values[qid];
    const list = Array.isArray(current) ? [...current] : [];
    const next = list.includes(num) ? list.filter(n => n !== num) : [...list, num];
    handleChange(qid, next);
    saveField(qid, next);
  }

  async function handleAuditRefresh() {
    setAuditRefreshing(true);
    setError(null);
    try {
      const updatedAudit = await api.audit(pid);
      onAuditUpdated(updatedAudit);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditRefreshing(false);
    }
  }

  // Translations
  const T = {
    fr: {
      title: "Modifier le profil du projet",
      sub: "Les modifications sont enregistrées automatiquement. Relancez l'audit pour recalculer les scores.",
      refresh: "Relancer l'audit",
      cancel: "Fermer",
      loading: "Chargement du questionnaire...",
      yes: "Oui",
      no: "Non",
      saving: "Enregistrement...",
      saved: "Enregistré",
      error: "Erreur d'enregistrement",
    },
    ar: {
      title: "تعديل بيانات المشروع",
      sub: "يتم حفظ التغييرات تلقائيًا. أعد تشغيل التدقيق لإعادة حساب النتائج.",
      refresh: "إعادة حساب التدقيق",
      cancel: "إغلاق",
      loading: "جاري تحميل الأسئلة...",
      yes: "نعم",
      no: "لا",
      saving: "جاري الحفظ...",
      saved: "تم الحفظ",
      error: "خطأ في الحفظ",
    }
  }[lang];

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-container text-center" style={{ maxWidth: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, padding: 24 }}>
          <span className="spinner" style={{ display: "inline-block", marginBottom: "20px" }} />
          <p>{T.loading}</p>
        </div>
      </div>
    );
  }

  // Filter questions that are applicable and belong to the active tab group
  const activeGroup = groups.find(g => g.id === activeTab);
  const activeQuestions = questions.filter(q => activeGroup.qids.includes(q.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 850, maxHeight: "90vh" }} onClick={e => e.stopPropagation()} dir={ar ? "rtl" : "ltr"}>
        
        {/* Header */}
        <div className="modal-header" style={{ padding: "20px 24px" }}>
          <div>
            <h2 className="modal-title">{T.title}</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 4 }}>{T.sub}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div className="error-banner" style={{ margin: "16px 24px", borderRadius: 8 }}>
            <span>{error}</span>
          </div>
        )}

        {/* Tab Navigator */}
        <div className="results-tabs" style={{ padding: "0 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, overflowX: "auto" }}>
          {groups.map(g => (
            <button
              key={g.id}
              className={`res-tab${activeTab === g.id ? " active" : ""}`}
              onClick={() => setActiveTab(g.id)}
              style={{ padding: "12px 16px", fontSize: "0.82rem" }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Scrollable Questions list */}
        <div className="modal-body" style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          {activeQuestions.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: "40px 0", fontSize: "0.88rem" }}>
              {lang === "ar" ? "لا توجد أسئلة نشطة في هذا القسم حاليًا." : "Aucune question active dans cette section actuellement."}
            </p>
          ) : (
            activeQuestions.map(q => {
              const prompt = ar ? q.prompt_ar || q.prompt_fr : q.prompt_fr;
              const help = ar ? q.help_ar || q.help_fr : q.help_fr;
              const val = values[q.id];
              const saveStatus = savingStates[q.id];

              return (
                <div
                  key={q.id}
                  ref={el => questionRefs.current[q.id] = el}
                  className="editor-question-row"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 16,
                    background: "rgba(255, 255, 255, 0.01)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)",
                    transition: "border-color 0.2s",
                    borderLeftWidth: initialFocusQuestion === q.id ? 4 : 1,
                    borderLeftColor: initialFocusQuestion === q.id ? "var(--orange)" : "var(--border)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <label style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>{prompt}</div>
                      {help && <div className="editor-help-text" style={{ fontSize: "0.78rem", color: "var(--text-sub)", marginTop: 4 }}>{help}</div>}
                    </label>

                    {/* Auto save Status badge */}
                    <div style={{ minWidth: 80, textAlign: ar ? "left" : "right" }}>
                      {saveStatus === "saving" && (
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> {T.saving}
                        </span>
                      )}
                      {saveStatus === "saved" && (
                        <span style={{ fontSize: "0.72rem", color: "var(--green)", fontWeight: 600 }}>
                          ✓ {T.saved}
                        </span>
                      )}
                      {saveStatus === "error" && (
                        <span style={{ fontSize: "0.72rem", color: "var(--red)", fontWeight: 600 }}>
                          ⚠ {T.error}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="editor-input-wrapper" style={{ marginTop: 4 }}>
                    {/* Boolean */}
                    {q.qtype === "bool" && (
                      <div className="editor-bool-group" style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className={`editor-bool-btn${val === true ? " sel" : ""}`}
                          onClick={() => handleBoolChange(q.id, true)}
                          style={{
                            padding: "8px 24px",
                            borderRadius: "var(--r-sm)",
                            border: "1px solid var(--border)",
                            background: val === true ? "var(--orange-soft)" : "transparent",
                            color: val === true ? "var(--orange)" : "var(--text-sub)",
                            borderColor: val === true ? "var(--orange-border)" : "var(--border)",
                            fontWeight: val === true ? 700 : 400,
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {T.yes}
                        </button>
                        <button
                          type="button"
                          className={`editor-bool-btn${val === false ? " sel" : ""}`}
                          onClick={() => handleBoolChange(q.id, false)}
                          style={{
                            padding: "8px 24px",
                            borderRadius: "var(--r-sm)",
                            border: "1px solid var(--border)",
                            background: val === false ? "var(--red-soft)" : "transparent",
                            color: val === false ? "var(--red)" : "var(--text-sub)",
                            borderColor: val === false ? "var(--red-border)" : "var(--border)",
                            fontWeight: val === false ? 700 : 400,
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {T.no}
                        </button>
                      </div>
                    )}

                    {/* Enum */}
                    {q.qtype === "enum" && (
                      <select
                        className="editor-select"
                        value={val}
                        onChange={e => handleEnumChange(q.id, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "var(--r-md)",
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          color: "var(--text)",
                          fontFamily: "var(--f-body)"
                        }}
                      >
                        {q.options.map(opt => (
                          <option key={opt} value={opt}>
                            {optLabel(q, opt, lang)}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Integer / Float */}
                    {(q.qtype === "int" || q.qtype === "float") && (
                      <input
                        type="number"
                        className="editor-number-input"
                        value={val}
                        step={q.qtype === "float" ? "0.1" : "1"}
                        min="0"
                        onChange={e => handleChange(q.id, e.target.value)}
                        onBlur={() => handleBlur(q.id)}
                        onKeyDown={e => handleKeyDown(e, q.id)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "var(--r-md)",
                          border: "1px solid var(--border)",
                          background: "rgba(255,255,255,0.02)",
                          color: "var(--text)",
                          fontFamily: "var(--f-mono)"
                        }}
                      />
                    )}

                    {/* Text */}
                    {q.qtype === "text" && (
                      <textarea
                        rows={2}
                        className="editor-textarea"
                        value={val}
                        onChange={e => handleChange(q.id, e.target.value)}
                        onBlur={() => handleBlur(q.id)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "var(--r-md)",
                          border: "1px solid var(--border)",
                          background: "rgba(255,255,255,0.02)",
                          color: "var(--text)",
                          fontFamily: "var(--f-body)",
                          resize: "vertical"
                        }}
                      />
                    )}

                    {/* Tags */}
                    {q.qtype === "tags" && (
                      <input
                        type="text"
                        className="editor-text-input"
                        value={Array.isArray(val) ? val.join(", ") : val}
                        placeholder={lang === "ar" ? "افصل بينها بفاصلة" : "Séparez par des virgules"}
                        onChange={e => handleChange(q.id, e.target.value)}
                        onBlur={() => handleBlur(q.id)}
                        onKeyDown={e => handleKeyDown(e, q.id)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "var(--r-md)",
                          border: "1px solid var(--border)",
                          background: "rgba(255,255,255,0.02)",
                          color: "var(--text)",
                          fontFamily: "var(--f-body)"
                        }}
                      />
                    )}

                    {/* SDG */}
                    {q.qtype === "sdg" && (
                      <div>
                        <div className="editor-sdg-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))", gap: 6 }}>
                          {Array.from({ length: 17 }, (_, i) => i + 1).map(num => {
                            const isSel = Array.isArray(val) && val.includes(num);
                            return (
                              <div
                                key={num}
                                className={`sdg-cell${isSel ? " sel" : ""}`}
                                onClick={() => toggleSdg(q.id, num)}
                                style={{
                                  height: 36,
                                  display: "grid",
                                  placeItems: "center",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--r-sm)",
                                  fontSize: "0.78rem",
                                  fontWeight: isSel ? 800 : 400,
                                  cursor: "pointer",
                                  background: isSel ? "var(--orange)" : "rgba(255,255,255,0.01)",
                                  color: isSel ? "#fff" : "var(--text-sub)",
                                  borderColor: isSel ? "var(--orange-border)" : "var(--border)",
                                  transition: "all 0.15s ease",
                                  userSelect: "none"
                                }}
                              >
                                {num}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button className="ghost" onClick={onClose} disabled={auditRefreshing} style={{ padding: "10px 20px", borderRadius: "var(--r-sm)", cursor: "pointer" }}>
            {T.cancel}
          </button>
          <button className="primary" onClick={handleAuditRefresh} disabled={auditRefreshing} style={{ padding: "10px 24px", borderRadius: "var(--r-sm)", background: "var(--orange)", border: "1px solid var(--orange-border)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {auditRefreshing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            {T.refresh}
          </button>
        </div>
      </div>
    </div>
  );
}
