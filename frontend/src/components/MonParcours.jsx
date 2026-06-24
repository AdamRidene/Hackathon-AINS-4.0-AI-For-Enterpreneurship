import { useState, useEffect } from "react";
import { STAGE_LABELS } from "../constants.js";

const STAGE_ORDER = [1, 2, 3, 4, 5, 6];

function formatDate(iso, lang) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-TN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso?.slice(0, 10) || ""; }
}

const TEXTS = {
  fr: {
    title: "Mon Parcours",
    sub: "Suivez l'évolution de votre projet à travers les différentes étapes de maturité.",
    currentStage: "Stade actuel",
    progress: "Progression",
    nextSteps: "Prochaines étapes",
    pastRecommendations: "Recommandations passées",
    actionsTaken: "Actions réalisées",
    noHistory: "Pas encore d'historique d'audit.",
    back: "← Retour au tableau de bord",
    auditedOn: "Audité le",
    completed: "Complété",
    pending: "En attente",
    refresh: "Actualiser",
    scores: "Évolution des scores",
    noScores: "Pas de scores disponibles",
    markDone: "Marquer comme fait",
    scoreDelta: "Δ scores",
    rescoreTitle: "Scores mis à jour",
    rescoreSub: (title) => `Étape "${title}" complétée — votre profil a été mis à jour et les scores recalculés.`,
    dimLabels: ["Marché", "Commercial", "Innovation", "Scalabilité", "Green"],
  },
  ar: {
    title: "مسارِي",
    sub: "تتبع تطور مشروعك عبر مراحل النضج المختلفة.",
    currentStage: "المرحلة الحالية",
    progress: "التقدم",
    nextSteps: "الخطوات القادمة",
    pastRecommendations: "التوصيات السابقة",
    actionsTaken: "الإجراءات المنجزة",
    noHistory: "لا يوجد سجل تدقيق بعد.",
    back: "العودة إلى لوحة القيادة ←",
    auditedOn: "تم التدقيق في",
    completed: "مكتمل",
    pending: "قيد الانتظار",
    refresh: "تحديث",
    scores: "تطور المؤشرات",
    noScores: "لا توجد مؤشرات متاحة",
    markDone: "وضع علامة منجز",
    scoreDelta: "فروق المؤشرات",
    rescoreTitle: "تم تحديث المؤشرات",
    rescoreSub: (title) => `اكتملت الخطوة "${title}" — تم تحديث ملفك وإعادة حساب المؤشرات.`,
    dimLabels: ["سوق", "تجاري", "ابتكار", "توسع", "بيئة"],
  },
};

export default function MonParcours({ pid, lang, api, onBack, checkedMilestones, onToggleMilestone, onAuditUpdated }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [rescoreResult, setRescoreResult] = useState(null);

  const ar = lang === "ar";
  const t = TEXTS[lang];

  async function loadAudits() {
    try {
      const history = await api.getAuditHistory(pid).catch(() => []);
      const formatted = Array.isArray(history) ? history.map(h => ({
        date: h.audited_at,
        stage: h.stage || h.diagnostic?.classified_stage || 1,
        scores: h.scores?.vector || h.vector,
        roadmap: h.roadmap || [],
        gap: h.perception_reality_gap,
      })) : [];
      setAudits(formatted);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAudits().finally(() => setLoading(false));
  }, [pid]);

  async function handleMarkDone(milestone) {
    setCompleting(milestone.id);
    setRescoreResult(null);
    try {
      const result = await api.completeMilestone(pid, milestone.id, milestone.trigger);
      if (result.applied && result.new_scores) {
        setRescoreResult({ milestoneTitle: milestone.title, scores: result.new_scores });
        if (onAuditUpdated) onAuditUpdated();
      }
      onToggleMilestone && onToggleMilestone(milestone.id);
      await loadAudits();
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(null);
    }
  }

  if (loading) {
    return <div className="dash-loading" dir={ar ? "rtl" : "ltr"}>...</div>;
  }

  const latest = audits[0];
  const prev = audits[1];
  const currentStage = latest?.stage || 1;

  // Score deltas: latest vs previous audit [M, C, I, S, G]
  const deltas = (latest?.scores && prev?.scores)
    ? latest.scores.map((v, i) => Math.round(v) - Math.round(prev.scores[i] ?? v))
    : null;
  const stageName = STAGE_LABELS[lang]?.[currentStage] || `Stage ${currentStage}`;
  const milestoneKeys = Object.keys(checkedMilestones || {})
    .filter(k => k.startsWith(`${pid}_`));
  const completedCount = milestoneKeys.filter(k => checkedMilestones[k]).length;

  return (
    <div className="dash-wrap" dir={ar ? "rtl" : "ltr"}>
      <div className="dash-content">
        <button className="ghost-btn" onClick={onBack} style={{ padding: "8px 16px", marginBottom: 16 }}>
          {t.back}
        </button>
        <h1 className="dash-title">{t.title}</h1>
        <p style={{ color: "var(--text-sub)", marginBottom: 28 }}>{t.sub}</p>

        {error && <div className="error-banner" role="alert" style={{ marginBottom: 20 }}>{error}</div>}

        {/* Re-score result banner: shown when milestone completion triggers a full re-audit */}
        {rescoreResult && (
          <div style={{
            marginBottom: 20, padding: "14px 16px", borderRadius: "var(--r-sm)",
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--green)" }}>✓ {t.rescoreTitle}</span>
              <button onClick={() => setRescoreResult(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "1rem" }}>×</button>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginBottom: 10 }}>
              {t.rescoreSub(rescoreResult.milestoneTitle)}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rescoreResult.scores.map((val, i) => {
                const color = val >= 66 ? "var(--green)" : val >= 40 ? "var(--amber)" : "var(--red)";
                const label = t.dimLabels[i] || ["M","C","I","S","G"][i];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: "var(--r-sm)",
                    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-sub)" }}>{label}</span>
                    <span style={{ fontWeight: 700, color, fontSize: "0.9rem" }}>{Math.round(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stage progression bar */}
        <div className="parcours-stages">
          {STAGE_ORDER.map(stage => {
            const isPast = stage < currentStage;
            const isCurrent = stage === currentStage;
            const name = STAGE_LABELS[lang]?.[stage] || `S${stage}`;
            return (
              <div key={stage} className={`parcours-stage ${isPast ? "done" : ""} ${isCurrent ? "current" : ""}`}>
                <div className={`parcours-dot ${isPast ? "done" : ""} ${isCurrent ? "current" : ""}`}>
                  {isPast ? "✓" : stage}
                </div>
                <div className="parcours-name">{name}</div>
              </div>
            );
          })}
        </div>

        {/* Score evolution */}
        {latest?.scores && (
          <div className="dash-section">
            <h3 className="dash-section-title">{t.scores}</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["M", "C", "I", "S", "G"].map((dim, i) => {
                const val = latest.scores[i];
                const color = val >= 66 ? "var(--green)" : val >= 40 ? "var(--amber)" : "var(--red)";
                return (
                  <div key={dim} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: "var(--r-sm)",
                    background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{dim}</span>
                    <span style={{ fontWeight: 700, color, fontSize: "0.95rem" }}>{Math.round(val)}</span>
                  </div>
                );
              })}
            </div>
            {deltas && (
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-sub)" }}>{t.scoreDelta}:</span>
                {["M", "C", "I", "S", "G"].map((dim, i) => {
                  const d = deltas[i];
                  const color = d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--text-dim)";
                  return (
                    <span key={dim} style={{ color, fontWeight: 600 }}>
                      {dim} {d > 0 ? `+${d}` : d}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions summary */}
        <div className="dash-section">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 className="dash-section-title" style={{ margin: 0 }}>{t.nextSteps}</h3>
            <span style={{ fontSize: "0.82rem", color: "var(--text-sub)" }}>
              {completedCount} {t.completed} · {milestoneKeys.length - completedCount} {t.pending}
            </span>
          </div>

          {latest?.roadmap?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {latest.roadmap.slice(0, 5).map((m, i) => {
                const key = `${pid}_${m.id}`;
                const done = !!checkedMilestones?.[key];
                const rat = ar ? m.rationale_ar || m.rationale_fr : m.rationale_fr;
                const timeline = ar ? m.timeline_ar || m.timeline_fr : m.timeline_fr || m.timeline_ar;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px", borderRadius: "var(--r-sm)",
                    background: done ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.01)",
                    border: `1px solid ${done ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
                    opacity: done ? 0.7 : 1,
                  }}>
                    <span style={{
                      minWidth: 20, height: 20, borderRadius: "50%",
                      background: done ? "var(--green)" : "var(--border)",
                      display: "grid", placeItems: "center",
                      fontSize: "0.7rem", color: done ? "#fff" : "var(--text-dim)",
                      cursor: "pointer", flexShrink: 0,
                    }} onClick={() => onToggleMilestone && onToggleMilestone(m.id)}>
                      {done ? "✓" : m.order}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem", textDecoration: done ? "line-through" : "none" }}>
                        {ar ? m.title_ar || m.title : m.title}
                      </div>
                      {timeline && <div style={{ fontSize: "0.74rem", color: "var(--orange)", marginTop: 2 }}>{timeline}</div>}
                      {rat && <div style={{ fontSize: "0.78rem", color: "var(--text-sub)", marginTop: 2 }}>{rat}</div>}
                    </div>
                    {!done && m.trigger && (
                      <button
                        style={{
                          flexShrink: 0, fontSize: "0.72rem", padding: "4px 10px",
                          borderRadius: "var(--r-sm)", border: "1px solid var(--green)",
                          background: "transparent", color: "var(--green)", cursor: "pointer",
                          opacity: completing === m.id ? 0.5 : 1,
                        }}
                        disabled={completing === m.id}
                        onClick={() => handleMarkDone(m)}
                      >
                        {completing === m.id ? "…" : t.markDone}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{t.noHistory}</p>
          )}
        </div>

        {/* Past recommendations history timeline */}
        <div className="dash-section">
          <h3 className="dash-section-title">{t.pastRecommendations}</h3>
          {audits.length > 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {audits.slice(1).map((audit, idx) => {
                const stageName = STAGE_LABELS[lang]?.[audit.stage] || `Stage ${audit.stage}`;
                return (
                  <div key={idx} style={{
                    padding: "14px", borderRadius: "var(--r-sm)",
                    background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{stageName}</span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>{formatDate(audit.date, lang)}</span>
                    </div>
                    {/* Score vector preview */}
                    {audit.scores && (
                      <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                        {["M", "C", "I", "S", "G"].map((dim, i) => {
                          const val = audit.scores[i];
                          if (val === undefined) return null;
                          return (
                            <span key={dim} style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                              {dim}: <strong>{Math.round(val)}</strong>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {/* Roadmap top 3 */}
                    {audit.roadmap && audit.roadmap.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: 6 }}>
                        {audit.roadmap.slice(0, 3).map((item, i) => (
                          <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>
                            • {ar ? item.title_ar || item.title : item.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{t.noHistory}</p>
          )}
        </div>
      </div>
    </div>
  );
}
