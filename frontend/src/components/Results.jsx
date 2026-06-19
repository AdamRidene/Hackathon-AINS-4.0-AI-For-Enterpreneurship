import { useState } from "react";
import logoSvg from "../../assets/logo_first.svg";

/* ── label maps ── */
const SECTOR_L = {
  fr:{"agri-food":"Agri-food","digital-saas":"SaaS & Numérique","industry":"Industrie","health":"Santé","greentech":"CleanTech","services":"Services","other":"Autre"},
  ar:{"agri-food":"الصناعات الغذائية","digital-saas":"البرمجيات الرقمية","industry":"الصناعة","health":"الصحة","greentech":"التكنولوجيا الخضراء","services":"الخدمات","other":"قطاع آخر"},
};
const STAGE_L = {
  fr:{1:"Idéation",2:"Validation Marché",3:"Structuration",4:"Levée de fonds",5:"Lancement",6:"Croissance"},
  ar:{1:"مرحلة الفكرة",2:"التحقق من السوق",3:"الهيكلة",4:"التمويل",5:"الإطلاق",6:"النمو"},
};
const DIMS = [
  ["market",      "Marché",      "سوق",   "S_M"],
  ["commercial",  "Commercial",  "تجاري", "S_C"],
  ["innovation",  "Innovation",  "ابتكار","S_I"],
  ["scalability", "Scalabilité", "توسع",  "S_S"],
  ["green",       "Green / ESG", "بيئة",  "S_G"],
];

function barColor(v, gated) {
  if (gated)   return "var(--red)";
  if (v >= 66) return "var(--green)";
  if (v >= 40) return "var(--amber)";
  return "var(--red)";
}

const COPY = {
  fr:{
    newAudit:"Nouvel audit",
    tabs:["Diagnostic","Scores","Feuille de route"],
    confidence:"Confiance",
    activeGate:"PORTE ACTIVE",
    declared:"Stade déclaré",
    classified:"Stade classifié (preuves)",
    realloc:"Réallocation auto",
    gap:{severe:"Écart sévère",mild:"Écart modéré",aligned:"Aligné"},
    gapMsg:"Message d'analyse",
    anomalyTitle:"Incohérences structurelles",
    anchor:"Cadre de référence",
    gateRule:"Règle de gate",
    missing:"Données manquantes",
    vector:"Vecteur GWLC",
    checkDone:"Étape terminée",
    assistantTitle:"Conseiller ancré",
    assistantSub:"Posez des questions sur votre diagnostic. Réponses sourcées uniquement sur vos résultats.",
    send:"Envoyer",
    placeholder:"Ex. Quels financements s'offrent à moi ?",
    grounding:"Contexte de grounding",
  },
  ar:{
    newAudit:"تدقيق جديد",
    tabs:["التشخيص","المؤشرات","خارطة الطريق"],
    confidence:"الثقة",
    activeGate:"البوابة النشطة",
    declared:"المرحلة المعلنة",
    classified:"المرحلة بالأدلة",
    realloc:"إعادة تخصيص تلقائية",
    gap:{severe:"فجوة حادة",mild:"فجوة معتدلة",aligned:"متوافق"},
    gapMsg:"رسالة التحليل",
    anomalyTitle:"تناقضات هيكلية",
    anchor:"الإطار المرجعي",
    gateRule:"قاعدة البوابة",
    missing:"بيانات ناقصة",
    vector:"متجه التقييم",
    checkDone:"خطوة مكتملة",
    assistantTitle:"المستشار الموثق",
    assistantSub:"اطرح أي سؤال حول تقييمك. إجابات موثقة من مخرجات تدقيقك فقط.",
    send:"إرسال",
    placeholder:"مثال: ما مصادر التمويل المتاحة لي؟",
    grounding:"السياق التوثيقي",
  },
};

/* ══════════════════════════════════════════════════════════════
   DIAGNOSTIC TAB
══════════════════════════════════════════════════════════════ */
function DiagnosticTab({ audit, lang, T }) {
  const ar  = lang === "ar";
  const gap = audit.perception_reality_gap;
  const diag = audit.diagnostic;

  const classifiedName = STAGE_L[lang][gap?.classified_stage] || "—";
  const declaredName   = STAGE_L[lang][gap?.declared_stage]   || "—";
  const severity       = gap?.severity || "aligned";
  const gapLabel       = T.gap[severity] || severity;
  const gapMsg         = ar ? gap?.message_ar || gap?.message_fr : gap?.message_fr;

  return (
    <div>
      {/* Stage hero cards */}
      {gap && (
        <div className="stage-hero">
          {/* Classified (objective) */}
          <div className="stage-card classified">
            <div className="stage-card-label">{T.classified}</div>
            <div className="stage-card-name">{classifiedName}</div>
            <div className="stage-card-num">Stade {gap.classified_stage} / 6</div>
            <div className={`gap-pill ${severity}`}>{gapLabel}</div>
            {gap.override_applied && <span className="override-tag">{T.realloc}</span>}
          </div>

          {/* Declared (self-assessment) */}
          {gap.declared_stage && (
            <div className="stage-card declared">
              <div className="stage-card-label">{T.declared}</div>
              <div className="stage-card-name">{declaredName}</div>
              <div className="stage-card-num">Stade {gap.declared_stage} / 6</div>
            </div>
          )}
        </div>
      )}

      {/* Gap message */}
      {gapMsg && <div className="gap-message">{gapMsg}</div>}

      {/* Confidence */}
      {diag && (
        <div className="confidence-row">
          <span>{T.confidence}</span>
          <div className="confidence-track">
            <div className="confidence-fill" style={{ width:`${diag.confidence * 100}%` }} />
          </div>
          <span className="mono">{(diag.confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Gate ladder */}
      {diag?.gates && (
        <div className="gate-ladder">
          {diag.gates.map(g => {
            const isActive = diag.next_blocking_gate?.stage === g.stage;
            const req = ar ? g.requirement_ar || g.requirement_fr : g.requirement_fr;
            return (
              <div key={g.stage} className={`gate${isActive ? " active-gate" : ""}`}>
                {isActive && <span className="gate-active-label">{T.activeGate}</span>}
                <div className={`gate-dot ${g.passed ? "pass" : "fail"}`}>
                  {g.passed ? "✓" : g.stage}
                </div>
                <div className="gate-body">
                  <div className="gate-name">{STAGE_L[lang][g.stage]}</div>
                  <div className="gate-req">{req}</div>
                  <div className={`gate-ev ${g.passed ? "passed" : "failed"}`}>{g.evidence}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Anomalies */}
      {audit.anomalies?.length > 0 && (
        <div className="anomaly-section">
          <div className="tab-section-title" style={{ marginTop:32 }}>{T.anomalyTitle}</div>
          {audit.anomalies.map((a, i) => (
            <div key={i} className={`anomaly-item ${a.severity}`}>
              <div className="anomaly-sev" />
              <div className="anomaly-body">
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                  <span className="anomaly-title">{ar ? a.title_ar || a.title_fr : a.title_fr}</span>
                  <span className={`anom-badge ${a.severity}`}>{a.severity}</span>
                </div>
                <div className="anomaly-detail">{ar ? a.detail_ar || a.detail_fr : a.detail_fr}</div>
                <div className="anomaly-tags">{a.signals.map((s,si)=><span key={si} className="anomaly-tag mono">{s}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SCORES TAB
══════════════════════════════════════════════════════════════ */
function ScoresTab({ audit, lang, T, plan, openProfile }) {
  const [expanded, setExpanded] = useState(null);
  const ar = lang === "ar";
  const scores = audit.scores;
  if (!scores) return null;

  const isLocked = plan !== "plus" && plan !== "pro";

  return (
    <div style={{ position: "relative", minHeight: "350px" }}>
      {isLocked && (
        <div className="tab-locked-overlay">
          <div className="lock-icon-container">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h3 className="lock-title">{ar ? "تحليل المؤشرات" : "Analyse des scores"}</h3>
          <p className="lock-msg">
            {ar 
              ? "تحليل المؤشرات التفصيلية لكل بعد من أبعاد مشروعك يتطلب الاشتراك في خطة بلس أو برو." 
              : "L'accès aux scores détaillés et à l'analyse de chaque dimension nécessite un plan Plus ou Pro."}
          </p>
          <button className="primary" onClick={openProfile} style={{ marginTop: 8 }}>
            {ar ? "ترقية الاشتراك" : "Mettre à niveau mon plan"}
          </button>
        </div>
      )}

      <div style={{ filter: isLocked ? "blur(4px)" : "none", pointerEvents: isLocked ? "none" : "auto", opacity: isLocked ? 0.35 : 1 }}>
        <div className="score-rows">
          {DIMS.map(([key, labelFr, labelAr, code]) => {
            const res = scores[key];
            if (!res) return null;
            const open  = expanded === key;
            const label = ar ? labelAr : labelFr;
            const color = barColor(res.final_score, res.gate_triggered);
            const delta = audit.score_deltas?.deltas?.[key];

            return (
              <div key={key} className="score-row">
                <div className="score-head" onClick={() => setExpanded(open ? null : key)}>
                  <div className="score-dim">
                    <span className="score-dim-name">{label}</span>
                    <span className="score-dim-code">{code}</span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width:`${res.final_score}%`, background: color }} />
                  </div>
                  <div className="score-val">
                    <span className="score-final" style={{ color }}>{res.final_score}</span>
                    {res.base_score !== res.final_score && (
                      <span className="score-base">/ {res.base_score}</span>
                    )}
                  </div>
                  {delta !== undefined && delta !== 0 && (
                    <span className={`delta-badge ${delta > 0 ? "up" : "down"}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                  {res.gate_triggered && <span className="gate-flag">GATE</span>}
                  <span className={`score-chevron${open ? " open" : ""}`}>▶</span>
                </div>

                {open && (
                  <div className="score-detail">
                    <div className="score-anchor">{T.anchor} : {res.anchor}</div>
                    {res.gate_triggered && res.gate_reason && (
                      <div className="score-gate-msg">⚠ {T.gateRule} : {res.gate_reason}</div>
                    )}
                    {res.contributions.map((c, i) => (
                      <div key={i} className="contrib-row">
                        <span className="contrib-name">{c.criterion}</span>
                        <span className="contrib-detail">{c.detail}</span>
                        <span className="contrib-w mono">w:{c.weight}</span>
                        <span className="contrib-score mono">{c.weighted}</span>
                      </div>
                    ))}
                    {res.missing_inputs?.length > 0 && (
                      <div className="score-missing muted">⚠ {T.missing} : {res.missing_inputs.join(", ")}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROADMAP TAB
══════════════════════════════════════════════════════════════ */
function RoadmapTab({ audit, pid, lang, T, checked, onToggle, plan, openProfile }) {
  const ar = lang === "ar";
  if (!audit.roadmap) return null;

  const isLocked = plan !== "pro";

  return (
    <div style={{ position: "relative", minHeight: "350px" }}>
      {isLocked && (
        <div className="tab-locked-overlay">
          <div className="lock-icon-container">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h3 className="lock-title">{ar ? "خارطة الطريق" : "Feuille de route"}</h3>
          <p className="lock-msg">
            {ar 
              ? "خارطة الطريق المخصصة مع التمويل والموارد الملائمة لهيكل مشروعك تتطلب الاشتراك في الخطة الاحترافية (برو)." 
              : "La feuille de route personnalisée avec financements et ressources adaptées nécessite le plan Pro."}
          </p>
          <button className="primary" onClick={openProfile} style={{ marginTop: 8 }}>
            {ar ? "ترقية الاشتراك" : "Mettre à niveau mon plan"}
          </button>
        </div>
      )}

      <div style={{ filter: isLocked ? "blur(4px)" : "none", pointerEvents: isLocked ? "none" : "auto", opacity: isLocked ? 0.35 : 1 }}>
        <div className="roadmap-items">
          {audit.roadmap.map((m, i) => {
            const key     = `${pid}_${m.order}`;
            const done    = !!checked[key];
            const horizon = ar ? m.horizon_ar || m.horizon_fr : m.horizon_fr;
            const rat     = ar ? m.rationale_ar || m.rationale_fr : m.rationale_fr;
            const action  = ar ? m.action_ar    || m.action_fr    : m.action_fr;

            return (
              <div key={i} className={`milestone${done ? " done" : ""}`}>
                <div className={`ms-check${done ? " done" : ""}`} onClick={() => onToggle(m.order)} title={T.checkDone}>
                  {done && "✓"}
                </div>
                <div className="ms-body">
                  <div className="ms-head">
                    <span className="ms-title">{m.title}</span>
                    {horizon && <span className="ms-horizon">{horizon}</span>}
                  </div>
                  {rat    && <div className="ms-rationale">{rat}</div>}
                  {action && <div className="ms-action">{action}</div>}
                  {m.sources?.length > 0 && (
                    <div className="ms-sources">
                      {m.sources.map((src, si) => (
                        <span key={si} className="ms-source">
                          <span className="ms-inst">{src.institution}</span>
                          <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title}</a>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RESULTS ROOT
 ══════════════════════════════════════════════════════════════ */
export default function Results({ audit, pid, lang, theme, setTheme, onNewAudit, checkedMilestones, onToggleMilestone, api, user, plan, openProfile }) {
  const [activeTab, setActiveTab] = useState(0);
  const ar = lang === "ar";
  const T  = COPY[lang];

  const anomalyCount = audit.anomalies?.length || 0;
  const tabLabels    = T.tabs;

  return (
    <div className="results-wrap" dir={ar ? "rtl" : "ltr"}>

      {/* ── Sticky header ── */}
      <div className="results-header">
        <div className="results-header-inner">
          <div className="results-header-top">
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              <div className="results-project">
                <div className="results-project-name">{audit.project_name}</div>
                <div className="results-project-meta">
                  {audit.sector && (
                    <span className="results-meta-chip">{SECTOR_L[lang][audit.sector] || audit.sector}</span>
                  )}
                  <span className="results-meta-chip orange mono">{audit.project_id?.slice(0,10)}…</span>
                </div>
              </div>
              <div className="results-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button className="theme-toggle-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ width: "38px", height: "38px" }} title="Toggle Theme">
                  {theme === "dark" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5"></circle>
                      <line x1="12" y1="1" x2="12" y2="3"></line>
                      <line x1="12" y1="21" x2="12" y2="23"></line>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                      <line x1="1" y1="12" x2="3" y2="12"></line>
                      <line x1="21" y1="12" x2="23" y2="12"></line>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                  )}
                </button>
                <button className="profile-btn" onClick={openProfile} style={{ padding: "8px 16px", height: "38px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>{user ? user.name : (lang === "ar" ? "الملف الشخصي" : "Profil")}</span>
                  <span className={`plan-badge ${plan}`}>{plan === "free" ? (lang === "ar" ? "مجاني" : "Gratuit") : plan === "plus" ? (lang === "ar" ? "بلس" : "Plus") : (lang === "ar" ? "برو" : "Pro")}</span>
                </button>
                <button onClick={onNewAudit}>{T.newAudit}</button>
              </div>
            </div>

            <div className="topbar-brand" onClick={onNewAudit} style={{ cursor: "pointer" }}>
              <img src={logoSvg} alt="Firasa Logo" className="brand-logo-img" />
            </div>
          </div>

          <div className="results-tabs">
            {tabLabels.map((label, i) => (
              <button
                key={i}
                className={`res-tab${activeTab === i ? " active" : ""}`}
                onClick={() => setActiveTab(i)}
              >
                {label}
                {i === 0 && anomalyCount > 0 && (
                  <span className="tab-badge">{anomalyCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="results-content">
        {activeTab === 0 && <DiagnosticTab audit={audit} lang={lang} T={T} />}
        {activeTab === 1 && <ScoresTab     audit={audit} lang={lang} T={T} plan={plan} openProfile={openProfile} />}
        {activeTab === 2 && (
          <RoadmapTab
            audit={audit} pid={pid} lang={lang} T={T}
            checked={checkedMilestones}
            onToggle={onToggleMilestone}
            plan={plan}
            openProfile={openProfile}
          />
        )}
      </div>
    </div>
  );
}
