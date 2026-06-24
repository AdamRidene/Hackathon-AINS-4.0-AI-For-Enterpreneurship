import { useState } from "react";
import ScoreDeltas from "./ScoreDeltas.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
import ScoreExplanationOverlay from "./ScoreExplanationOverlay.jsx";
import { SECTOR_LABELS as SECTOR_L, STAGE_LABELS as STAGE_L } from "../constants.js";

const CRITERION_LABELS_FR = {
  tam: "une estimation du marché adressable (TAM)",
  competition: "une analyse de la concurrence",
  revenue_viability: "un modèle de revenus",
  customer_validation_evidence: "une preuve de validation client",
  pcoh: "une proposition de valeur claire",
  mvp_stage: "un stade MVP défini",
  pricing: "une stratégie de prix",
  geo_novelty: "une nouveauté géographique",
  tech_stack: "un stack technologique documenté",
  ip_status: "une protection de la propriété intellectuelle",
  human_dependency: "une réduction de la dépendance humaine",
  monthly_overhead: "un bilan des charges mensuelles",
  cross_border_zones: "une expansion géographique ciblée",
  footprint_category: "une empreinte environnementale définie",
  circular_recycling: "une approche circulaire / recyclage",
  sdg: "des Objectifs de Développement Durable ciblés",
};

const CRITERION_LABELS_AR = {
  tam: "تقدير السوق المستهدف (TAM)",
  competition: "تحليل المنافسة",
  revenue_viability: "نموذج الإيرادات",
  customer_validation_evidence: "دليل تحقق من العملاء",
  pcoh: "عرض قيمة واضح",
  mvp_stage: "مرحلة MVP محددة",
  pricing: "استراتيجية التسعير",
  geo_novelty: "التجديد الجغرافي",
  tech_stack: "توثيق التقنية المستخدمة",
  ip_status: "حماية الملكية الفكرية",
  human_dependency: "تقليل الاعتماد البشري",
  monthly_overhead: "توثيق التكاليف الشهرية",
  cross_border_zones: "التوسع الجغرافي المستهدف",
  footprint_category: "تصنيف البصمة البيئية",
  circular_recycling: "نهج دائري / إعادة تدوير",
  sdg: "أهداف التنمية المستدامة المستهدفة",
};

const DIMS = [
  ["market", "Marché", "سوق"],
  ["commercial", "Commercial", "تجاري"],
  ["innovation", "Innovation", "ابتكار"],
  ["scalability", "Scalabilité", "توسع"],
  ["green", "Green / ESG", "بيئة"],
];
const ROADMAP_TRIGGER_BY_SCORE = {
  market: "missing_market_validation",
  commercial: "tech_hype",
  innovation: "tech_hype",
  scalability: "scalability",
  green: "green",
};

function findRoadmapMatch(roadmap, scoreKey) {
  const trigger = ROADMAP_TRIGGER_BY_SCORE[scoreKey];
  if (!trigger || !Array.isArray(roadmap)) return null;
  return roadmap.find((item) => item.trigger === trigger) || null;
}

function barColor(v, gated) {
  if (gated) return "var(--red)";
  if (v >= 66) return "var(--green)";
  if (v >= 40) return "var(--amber)";
  return "var(--red)";
}

function subBarColor(raw) {
  if (raw >= 66) return "var(--green)";
  if (raw >= 40) return "var(--amber)";
  return "var(--red)";
}

const COPY = {
  fr: {
    newAudit: "Nouvel audit",
    editProfile: "Ajuster les réponses",
    tabs: ["Diagnostic", "Scores", "Feuille de route"],
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
    pourquoi: "Pourquoi ce score ?",
    whatIf: (criterion, gain) => `+${gain} pts si vous ajoutez : ${CRITERION_LABELS_FR[criterion] || criterion}`,
    viewAction: "Voir l'action liée",
    kbTitle: "Ressources utiles pour combler cet écart",
    kbCta: "Voir dans la feuille de route →",
  },
  ar: {
    newAudit: "تدقيق جديد",
    editProfile: "تعديل الإجابات",
    tabs: ["التشخيص", "المؤشرات", "خارطة الطريق"],
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
    pourquoi: "لماذا هذا المؤشر؟",
    whatIf: (criterion, gain) => `+${gain} نقطة إذا أضفت: ${CRITERION_LABELS_AR[criterion] || criterion}`,
    viewAction: "عرض الإجراء المرتبط",
    kbTitle: "موارد مفيدة لمعالجة هذه الفجوة",
    kbCta: "عرض في خارطة الطريق ←",
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

const GAP_CATEGORY_LABELS = {
  fr: {
    missing_market_validation: "Validation marché manquante",
    missing_legal_form: "Forme légale manquante",
    tech_hype: "Risque tech / surestimation",
    premature_fundraising: "Levée de fonds prématurée",
    scalability: "Scalabilité",
    green: "Impact environnemental",
    general: "Général",
  },
  ar: {
    missing_market_validation: "تحقق السوق مفقود",
    missing_legal_form: "الشكل القانوني مفقود",
    tech_hype: "مبالغة تقنية",
    premature_fundraising: "جمع تمويل مبكر",
    scalability: "قابلية التوسع",
    green: "الأثر البيئي",
    general: "عام",
  },
};

function DiagnosticTab({ audit, lang, T, onFixGate, onJumpToRoadmap }) {
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

      {/* KB sources per gap category — cross-module: gap → KB */}
      {audit.gap_sources && Object.keys(audit.gap_sources).length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="tab-section-title">{T.kbTitle}</div>
          {Object.entries(audit.gap_sources).map(([cat, chunks]) => {
            const catLabel = (GAP_CATEGORY_LABELS[lang] || GAP_CATEGORY_LABELS.fr)[cat] || cat;
            return (
              <div key={cat} style={{ marginTop: 12 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--orange)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {catLabel}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {chunks.map((src, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "8px 12px", borderRadius: "var(--r-sm)",
                      background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
                      flexWrap: "wrap",
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          {ar ? src.title_ar || src.title : src.title}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{src.institution}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {src.url && (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.74rem", color: "var(--orange)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)" }}
                          >
                            {ar ? "رابط" : "Lien"}
                          </a>
                        )}
                        {onJumpToRoadmap && (
                          <button
                            onClick={() => {
                              const match = audit.roadmap?.find(m => m.trigger === cat);
                              if (match) onJumpToRoadmap(match.id);
                            }}
                            style={{ fontSize: "0.74rem", background: "transparent", color: "var(--text-sub)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "4px 8px", cursor: "pointer" }}
                          >
                            {T.kbCta}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SCORES TAB
══════════════════════════════════════════════════════════════ */
function ScoresTab({ audit, lang, T, plan, openProfile, explanations, onJumpToRoadmap }) {
  const [expanded, setExpanded] = useState(null);
  const [selectedScore, setSelectedScore] = useState(null);
  const ar = lang === "ar";
  const scores = audit.scores;
  if (!scores) return null;

  const isLocked = plan !== "plus" && plan !== "pro";

  if (isLocked) {
    return (
      <div style={{ position: "relative", minHeight: "350px" }}>
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
      </div>
    );
  }

  const handleScoreClick = (key) => {
    setSelectedScore(scores[key]);
  };

  return (
    <>
      <div style={{ position: "relative", minHeight: "350px" }}>
        <ScoreDeltas scoreDeltas={audit.score_deltas} lang={lang} />
        <div className="score-rows" style={{ marginTop: 24 }}>
          {DIMS.map(([key, labelFr, labelAr]) => {
            const res = scores[key];
            if (!res) return null;
            const open = expanded === key;
            const label = ar ? labelAr : labelFr;
            const color = barColor(res.final_score, res.gate_triggered);
            const delta = audit.score_deltas?.deltas?.[key];
            const roadmapMatch = findRoadmapMatch(audit.roadmap, key);

            return (
              <div key={key} className="score-row">
                <div className="score-head" onClick={() => setExpanded(open ? null : key)}>
                  <div className="score-dim">
                    <span className="score-dim-name">{label}</span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${res.final_score}%`, background: color }} />
                  </div>
                  <div className="score-val" onClick={(e) => {
                    e.stopPropagation();
                    handleScoreClick(key);
                  }} style={{ cursor: 'pointer' }}>
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
                    {/* Pourquoi ce score — LLM prose from explain_all_scores */}
                    {explanations?.[key]?.natural_language && (
                      <div className="score-pourquoi">
                        <span className="score-pourquoi-label">{T.pourquoi}</span>
                        <p className="score-pourquoi-text">{explanations[key].natural_language}</p>
                      </div>
                    )}
                    <div className="score-anchor">{T.anchor} : {ar ? res.anchor_ar || res.anchor_fr : res.anchor_fr}</div>
                    {res.gate_triggered && (res.gate_reason_fr || res.gate_reason_ar) && (
                      <div className="score-gate-msg">⚠ {T.gateRule} : {ar ? res.gate_reason_ar || res.gate_reason_fr : res.gate_reason_fr}</div>
                    )}
                    {res.contributions.map((c, i) => (
                      <div key={i} className="contrib-row">
                        <div className="contrib-row-head">
                          <span className="contrib-name">
                            {ar ? CRITERION_LABELS_AR[c.criterion] || c.criterion : CRITERION_LABELS_FR[c.criterion] || c.criterion}
                          </span>
                          <span className="contrib-w mono">×{c.weight}</span>
                          <span className="contrib-score mono" style={{ color: subBarColor(c.raw) }}>{c.weighted}</span>
                        </div>
                        <div className="contrib-bar-track">
                          <div className="contrib-bar-fill" style={{ width: `${c.raw}%`, background: subBarColor(c.raw) }} />
                        </div>
                        <div className="contrib-detail">{c.detail}</div>
                      </div>
                    ))}
                    {res.missing_inputs?.length > 0 && (
                      <div className="score-missing muted">⚠ {T.missing} : {res.missing_inputs.join(", ")}</div>
                    )}
                    {(res.improvement_guidance_fr || res.improvement_guidance_ar) && (
                      <div className="score-pourquoi" style={{ marginTop: 12 }}>
                        <span className="score-pourquoi-label">{ar ? "الإجراء الأولوي" : "Action prioritaire"}</span>
                        <p className="score-pourquoi-text">{ar ? res.improvement_guidance_ar : res.improvement_guidance_fr}</p>
                      </div>
                    )}
                    {/* What-if CTA */}
                    {res.what_if_hint && (
                      <div className="score-whatif" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <span>▲ {T.whatIf(res.what_if_hint.criterion, res.what_if_hint.potential_gain)}</span>
                        {roadmapMatch && (
                          <button
                            className="ghost"
                            onClick={() => onJumpToRoadmap(roadmapMatch.id)}
                            style={{ border: "1px solid var(--orange-border)", color: "var(--orange)", borderRadius: "var(--r-sm)", padding: "6px 12px", cursor: "pointer" }}
                          >
                            {T.viewAction} →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {selectedScore && (
        <ScoreExplanationOverlay 
          score={selectedScore} 
          onClose={() => setSelectedScore(null)} 
          lang={lang}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROADMAP TAB
══════════════════════════════════════════════════════════════ */
function RoadmapTab({ audit, pid, lang, T, checked, onToggle, plan, openProfile, highlightedMilestoneId }) {
  const ar = lang === "ar";
  if (!audit.roadmap) return null;

  const isLocked = plan !== "pro";

  if (isLocked) {
    return (
      <div style={{ position: "relative", minHeight: "350px" }}>
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
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "350px" }}>
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
          const highlighted = highlightedMilestoneId === m.id;
          const horizon = ar ? m.horizon_ar || m.horizon_fr : m.horizon_fr;
          const timeline = ar ? m.timeline_ar || m.timeline_fr : m.timeline_fr || m.timeline_ar;
          const rat = ar ? m.rationale_ar || m.rationale_fr : m.rationale_fr;
          const action = ar ? m.action_ar || m.action_fr : m.action_fr;

          return (
            <div
              key={i}
              className={`milestone${done ? " done" : ""}`}
              style={highlighted ? { borderColor: "var(--orange-border)", boxShadow: "0 0 0 1px var(--orange-border) inset" } : undefined}
            >
              <div className="ms-side">
                <div className={`ms-check${done ? " done" : ""}`} onClick={() => onToggle(m.id)} title={T.checkDone}>
                  {done && "✓"}
                </div>
                <span className="ms-order">{m.order}</span>
              </div>
              <div className="ms-body">
                <div className="ms-head">
                  <span className="ms-title">{ar ? m.title_ar || m.title : m.title}</span>
                  {horizon && <span className="ms-horizon">{horizon}</span>}
                </div>
                {timeline && <div className="ms-timeline">{timeline}</div>}
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
  );
}

/* ══════════════════════════════════════════════════════════════
   RESULTS ROOT
 ══════════════════════════════════════════════════════════════ */
export default function Results({ audit, pid, lang, onNewAudit, onBackToDashboard, checkedMilestones, onToggleMilestone, api, user, plan, openProfile, onAuditUpdated }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [focusQuestion, setFocusQuestion] = useState(null);
  const [highlightedMilestoneId, setHighlightedMilestoneId] = useState(null);
  const ar = lang === "ar";
  const T = COPY[lang];

  const handleFixGate = (questionId) => {
    setFocusQuestion(questionId);
    setShowEditor(true);
  };
  const handleJumpToRoadmap = (milestoneId) => {
    setHighlightedMilestoneId(milestoneId);
    setActiveTab(2);
  };

  const anomalyCount = audit.anomalies?.length || 0;
  const tabLabels = T.tabs;

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
            {audit.location && (
              <span className="results-meta-chip">
                📍 {audit.location}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ghost" onClick={onBackToDashboard} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 16px", cursor: "pointer" }}>
              {ar ? "لوحة قيادة المشروع" : "Tableau de bord"}
            </button>
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

        {/* Local Navigation Tabs — panel switching, NOT scrolling */}
        <div className="results-local-nav">
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

        {/* Tab Panels — only the active one renders */}
        {activeTab === 0 && (
          <div className="results-section">
            <DiagnosticTab audit={audit} lang={lang} T={T} onFixGate={handleFixGate} onJumpToRoadmap={handleJumpToRoadmap} />
          </div>
        )}

        {activeTab === 1 && (
          <div className="results-section">
            <ScoresTab
              audit={audit}
              lang={lang}
              T={T}
              plan={plan}
              openProfile={openProfile}
              explanations={audit.explanations}
              onJumpToRoadmap={handleJumpToRoadmap}
            />
          </div>
        )}

        {activeTab === 2 && (
          <div className="results-section">
            <RoadmapTab
              audit={audit}
              pid={pid}
              lang={lang}
              T={T}
              checked={checkedMilestones}
              onToggle={onToggleMilestone}
              plan={plan}
              openProfile={openProfile}
              highlightedMilestoneId={highlightedMilestoneId}
            />
          </div>
        )}

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
