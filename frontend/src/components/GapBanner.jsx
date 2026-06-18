// Perception–reality gap — the core differentiator, surfaced as a first-class
// banner, color-coded by severity.
export default function GapBanner({ gap }) {
  if (!gap) return null;
  const cls =
    gap.kind === "aligned"
      ? "gap-aligned"
      : gap.severity === "severe"
      ? "gap-severe"
      : "gap-mild";
  const icon =
    gap.kind === "aligned" ? "✓" : gap.kind === "overestimation" ? "▲" : "▼";
  const heading =
    gap.kind === "aligned"
      ? "Auto-évaluation alignée"
      : gap.kind === "overestimation"
      ? "Surestimation détectée"
      : "Sous-évaluation détectée";

  return (
    <div className={`gap-banner ${cls}`}>
      <div className="gap-head">
        <span>{icon}</span>
        <span>{heading}</span>
        {gap.override_applied && (
          <span className="override-tag">Réallocation automatique</span>
        )}
      </div>

      {gap.declared_stage != null && (
        <div className="gap-stages">
          <div className="s">
            Déclaré
            <b>
              {gap.declared_stage} · {gap.declared_stage_name}
            </b>
          </div>
          <div className="s">
            Objectif (preuves)
            <b>
              {gap.classified_stage} · {gap.classified_stage_name}
            </b>
          </div>
          <div className="s">
            Écart
            <b>{gap.magnitude > 0 ? `+${gap.magnitude}` : gap.magnitude}</b>
          </div>
        </div>
      )}

      <div className="gap-msg">{gap.message_fr}</div>

      {gap.diverging_dimensions?.length > 0 && (
        <div className="gap-msg muted">
          Dimensions divergentes :{" "}
          {gap.diverging_dimensions.map((d) => d.name)