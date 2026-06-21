import { useState, useEffect, useRef } from "react";
import logoSvg from "../../assets/logo_first.svg";
import Assistant from "./Assistant.jsx";
import ScoreDeltas from "./ScoreDeltas.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
import { SECTOR_LABELS as SECTOR_L, STAGE_LABELS as STAGE_L } from "../constants.js";

const DIMS = [
  ["market", "Marché", "سوق"],
  ["commercial", "Commercial", "تجاري"],
  ["innovation", "Innovation", "ابتكار"],
  ["scalability", "Scalabilité", "توسع"],
  ["green", "Green / ESG", "بيئة"],
];

function barColor(v, gated) {
  if (gated) return "var(--red)";
  if (v >= 66) return "var(--green)";
  if (v >= 40) return "var(--amber)";
  return "var(--red)";
}

const COPY = {
  fr: {
    newAudit: "Nouvel audit",
    editProfile: "Ajuster les réponses",
    tabs: ["Diagnostic", "Scores", "Feuille de route", "Assistant"],
    confidence: "Confiance",
    activeGate: "PORTE ACTIVE",
    declared: "Stade déclaré",
    classified: "Stade classifié (preuves)",
    realloc: "Réallocation auto",
    gap: { severe: "Écart sévère", mild: "Écart modéré", aligned: "Aligné" },
    gapMsg: "Message d'analyse",
    anomalyTitle: "Incohérences structurelles",
    anchor: "Cadre de référence",
    gateRule: "Règle de gate",
    missing: "Données manquantes",
    vector: "Profil de maturité",
    checkDone: "Étape terminée",
    roadmapTitle: "Priorités recommandées",
    roadmapSub: "Actions classées par urgence, avec sources utiles pour avancer concrètement.",
    assistantTitle: "Conseiller ancré",
    assistantSub: "Posez des questions sur votre diagnostic. Réponses sourcées uniquement sur vos résultats.",
    send: "Envoyer",
    placeholder: "Ex. Quels financements s'offrent à moi ?",
    grounding: "Contexte de grounding",
  },
  ar: {
    newAudit: "تدقيق جديد",
    editProfile: "تعديل الإجابات",
    tabs: ["التشخيص", "المؤشرات", "خارطة الطريق", "المستشار"],
    confidence: "الثقة",
    activeGate: "البوابة النشطة",
    declared: "المرحلة المعلنة",
    classified: "المرحلة بالأدلة",
    realloc: "إعادة تخصيص تلقائية",
    gap: { severe: "فجوة حادة", mild: "فجوة معتدلة", aligned: "متوافق" },
    gapMsg: "رسالة التحليل",
    anomalyTitle: "تناقضات هيكلية",
    anchor: "الإطار المرجعي",
    gateRule: "قاعدة البوابة",
    missing: "بيانات ناقصة",
    vector: "متجه التقييم",
    checkDone: "خطوة مكتملة",
    roadmapTitle: "الأولويات المقترحة",
    roadmapSub: "إجراءات مرتبة حسب الأولوية مع مصادر تساعدك على التقدم عمليًا.",
    assistantTitle: "المستشار الموثق",
    assistantSub: "اطرح أي سؤال حول تقييمك. إجابات موثقة من مخرجات تدقيقك فقط.",
    send: "إرسال",
    placeholder: "مثال: ما مصادر التمويل المتاحة لي؟",
    grounding: "السياق التوثيقي",
  },
};

/* ══════════════════════════════════════════════════════════════
   DIAGNOSTIC TAB
══════════════════════════════════════════════════════════════ */
const GATE_QUESTION_MAP = {
  1: "problem_statement",
  2: "validation",
  3: "legal_form",
  4: "revenue_model",
  5: "mvp_stage",
  6: "repeatable_sales"
};

function DiagnosticTab({ audit, lang, T, onFixGate }) {
  const ar = lang === "ar";
  const gap = audit.perception_reality_gap;
  const diag = audit.diagnostic;

  const classifiedName = STAGE_L[lang][gap?.classified_stage] || "—";
  const declaredName = STAGE_L[lang][gap?.declared_stage] || "—";
  const severity = gap?.severity || "aligned";
  const gapLabel = T.gap[severity] || severity;
  const gapMsg = ar ? gap?.message_ar || gap?.message_fr : gap?.message_fr;

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
            <div className="confidence-fill" style={{ width: `${diag.confidence * 100}%` }} />
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
            const ev = ar ? g.evidence_ar || g.evidence : g.evidence;
            const targetQ = GATE_QUESTION_MAP[g.stage];

            return (
              <div key={g.stage} className={`gate${isActive ? " active-gate" : ""}`}>
                {isActive && <span className="gate-active-label">{T.activeGate}</span>}
                <div className={`gate-dot ${g.passed ? "pass" : "fail"}`}>
                  {g.passed ? "✓" : g.stage}
                </div>
                <div className="gate-body">
                  <div className="gate-name">{STAGE_L[lang][g.stage]}</div>
                  <div className="gate-req">{req}</div>
                  <div className={`gate-ev ${g.passed ? "passed" : "failed"}`}>{ev}</div>
                  
                  {/* Deep link button to Profile Editor */}
                  {!g.passed && targetQ && (
                    <button
                      onClick={() => onFixGate(targetQ)}
                      className="ghost"
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.74rem",
                        marginTop: 8,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        color: "var(--orange)",
                        borderColor: "var(--orange-border)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <span>{ar ? "← تعديل البيانات" : "Ajuster la donnée →"}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Anomalies */}
      {audit.anomalies?.length > 0 && (
        <div className="anomaly-section">
          <div className="tab-section-title" style={{ marginTop: 32 }}>{T.anomalyTitle}</div>
          {audit.anomalies.map((a, i) => (
            <div key={i} className={`anomaly-item ${a.severity}`}>
              <div className="anomaly-sev" />
              <div className="anomaly-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span className="anomaly-title">{ar ? a.title_ar || a.title_fr : a.title_fr}</span>
                  <span className={`anom-badge ${a.severity}`}>{a.severity}</span>
                </div>
                <div className="anomaly-detail">{ar ? a.detail_ar || a.detail_fr : a.detail_fr}</div>
                <div className="anomaly-tags">{a.signals.map((s, si) => <span key={si} className="anomaly-tag mono">{s}</span>)}</div>
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

  const isLocked = plan !== "plus" && plan !== "pro" && plan !== "admin";

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

      <div style={{ pointerEvents: isLocked ? "none" : "auto", opacity: isLocked ? 0.22 : 1 }}>
        <ScoreDeltas scoreDeltas={audit.score_deltas} />
        <div className="score-rows" style={{ marginTop: 24 }}>
          {DIMS.map(([key, labelFr, labelAr]) => {
            const res = scores[key];
            if (!res) return null;
            const open = expanded === key;
            const label = ar ? labelAr : labelFr;
            const color = barColor(res.final_score, res.gate_triggered);
            const delta = audit.score_deltas?.deltas?.[key];

            return (
              <div key={key} className="score-row">
                <div className="score-head" onClick={() => setExpanded(open ? null : key)}>
                  <div className="score-dim">
                    <span className="score-dim-name">{label}</span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${res.final_score}%`, background: color }} />
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

  const isLocked = plan !== "pro" && plan !== "admin";

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

      <div style={{ pointerEvents: isLocked ? "none" : "auto", opacity: isLocked ? 0.22 : 1 }}>
        <div className="roadmap-summary">
          <div>
            <div className="tab-section-title">{T.roadmapTitle}</div>
            <div className="tab-section-sub">{T.roadmapSub}</div>
          </div>
          <span className="roadmap-count">{audit.roadmap.length}</span>
        </div>
        <div className="roadmap-items">
          {audit.roadmap.map((m, i) => {
            const key = `${pid}_${m.id}`;
            const done = !!checked[key];
            const horizon = ar ? m.horizon_ar || m.horizon_fr : m.horizon_fr;
            const rat = ar ? m.rationale_ar || m.rationale_fr : m.rationale_fr;
            const action = ar ? m.action_ar || m.action_fr : m.action_fr;

            return (
              <div key={i} className={`milestone${done ? " done" : ""}`}>
                <div className="ms-side">
                  <div className={`ms-check${done ? " done" : ""}`} onClick={() => onToggle(m.id)} title={T.checkDone}>
                    {done && "✓"}
                  </div>
                  <span className="ms-order">{m.order}</span>
                </div>
                <div className="ms-body">
                  <div className="ms-head">
                    <span className="ms-title">{m.title}</span>
                    {horizon && <span className="ms-horizon">{horizon}</span>}
                  </div>
                  {rat && <div className="ms-rationale">{rat}</div>}
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
export default function Results({ audit, pid, lang, theme, setTheme, onNewAudit, checkedMilestones, onToggleMilestone, api, user, plan, openProfile, onAuditUpdated }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [focusQuestion, setFocusQuestion] = useState(null);
  const ar = lang === "ar";
  const T = COPY[lang];

  const handleFixGate = (questionId) => {
    setFocusQuestion(questionId);
    setShowEditor(true);
  };

  const anomalyCount = audit.anomalies?.length || 0;
  const tabLabels = T.tabs;

  const SECTION_IDS = ["diagnostic-sec", "scores-sec", "roadmap-sec", "assistant-sec"];
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const scrollToSection = (index) => {
    setActiveTab(index);
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    const id = SECTION_IDS[index];
    const element = document.getElementById(id);
    if (element) {
      const offset = 120; // 58px topbar + ~50px tabs + safety margin
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }

    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 800);
  };

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "-120px 0px -60% 0px",
      threshold: 0
    };

    const handleIntersection = (entries) => {
      if (isScrollingRef.current) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = SECTION_IDS.indexOf(entry.target.id);
          if (index !== -1) {
            setActiveTab(index);
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.unobserve(el);
      });
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  return (
    <div className="results-wrap" dir={ar ? "rtl" : "ltr"}>
      <div className="results-content">
        {/* Local Page Header */}
        <div className="results-page-header">
          <div className="results-project-info">
            <h1 className="results-project-title">
              {audit.project_name}
            </h1>
            {audit.sector && (
              <span className="results-meta-chip">
                {SECTOR_L[lang][audit.sector] || audit.sector}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ghost" onClick={() => setShowEditor(true)} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 16px", cursor: "pointer" }}>
              {T.editProfile}
            </button>
            <button className="primary" onClick={onNewAudit}>
              {T.newAudit}
            </button>
          </div>
        </div>

        {/* Upgrade banner for free users */}
        {plan === "free" && (
          <div className="results-upgrade-banner">
            <div className="upgrade-banner-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span>{ar ? "التشخيص الأساسي مجاني. قم بالترقية لفتح المؤشرات التفصيلية وخارطة الطريق المخصصة." : "Le diagnostic de base est gratuit. Passez au plan Pro pour débloquer les scores détaillés et la feuille de route personnalisée."}</span>
            </div>
            <button className="upgrade-banner-btn" onClick={openProfile}>
              {ar ? "ترقية إلى برو" : "Passer à Pro →"}
            </button>
          </div>
        )}

        {/* Local Navigation Sticky Tabs */}
        <div className="results-local-nav">
          {tabLabels.map((label, i) => (
            <button
              key={i}
              className={`res-tab${activeTab === i ? " active" : ""}`}
              onClick={() => scrollToSection(i)}
            >
              {label}
              {i === 0 && anomalyCount > 0 && (
                <span className="tab-badge">{anomalyCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Section 1: Diagnostic */}
        <section id="diagnostic-sec" className="results-section">
          <div className="results-section-header">
            <h2 className="results-section-title">{T.tabs[0]}</h2>
          </div>
          <DiagnosticTab audit={audit} lang={lang} T={T} onFixGate={handleFixGate} />
        </section>

        {/* Section 2: Scores */}
        <section id="scores-sec" className="results-section">
          <div className="results-section-header">
            <h2 className="results-section-title">{T.tabs[1]}</h2>
          </div>
          <ScoresTab audit={audit} lang={lang} T={T} plan={plan} openProfile={openProfile} />
        </section>

        {/* Section 3: Roadmap */}
        <section id="roadmap-sec" className="results-section">
          <RoadmapTab
            audit={audit}
            pid={pid}
            lang={lang}
            T={T}
            checked={checkedMilestones}
            onToggle={onToggleMilestone}
            plan={plan}
            openProfile={openProfile}
          />
        </section>

        {/* Section 4: Assistant */}
        <section id="assistant-sec" className="results-section">
          <div className="results-section-header">
            <h2 className="results-section-title">{T.tabs[3]}</h2>
          </div>
          <Assistant pid={pid} lang={lang} />
        </section>
      </div>

      {showEditor && (
        <ProfileEditor
          pid={pid}
          lang={lang}
          api={api}
          onClose={() => { setShowEditor(false); setFocusQuestion(null); }}
          onAuditUpdated={onAuditUpdated}
          initialFocusQuestion={focusQuestion}
        />
      )}
    </div>
  );
}
