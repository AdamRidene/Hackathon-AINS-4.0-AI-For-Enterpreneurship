// Diagnostic evidence ladder: the six maturity gates, each showing pass/fail and
// the exact token that drove (or blocked) the classification. Transparency over flair.
export default function GateLadder({ diagnostic }) {
  if (!diagnostic) return null;
  const cur = diagnostic.next_blocking_gate?.stage;
  return (
    <div className="panel">
      <h2>Diagnostic de maturité</h2>
      <div className="sub">
        Stade objectif :{" "}
        <b>
          {diagnostic.classified_stage} · {diagnostic.classified_stage_name}
        </b>{" "}
        — confiance {Math.round(diagnostic.confidence * 100)}%
      </div>

      {diagnostic.gates.map((g) => (
        <div key={g.stage} className={`gate ${g.stage === cur ? "cur" : ""}`}>
          <div className={`dot ${g.passed ? "pass" : "fail"}`}>
            {g.passed ? "✓" : g.stage}
          </div>
          <div className="gbody">
            <div className="gname">
              Porte {g.stage} — {g.name}
              {g.stage === cur && (
                <span className="muted"> · prochaine porte bloquante</span>
              )}
            </div>
            <div className="greq">{g.requirement_fr}</div>
            <div className="gev">{g.evidence}</div>
          </div>
        </di