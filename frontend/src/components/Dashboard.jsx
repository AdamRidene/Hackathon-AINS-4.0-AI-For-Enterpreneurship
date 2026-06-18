import GapBanner from "./GapBanner.jsx";
import AnomalyCard from "./AnomalyCard.jsx";
import GateLadder from "./GateLadder.jsx";
import ScorePanel from "./ScorePanel.jsx";
import ScoreDeltas from "./ScoreDeltas.jsx";
import Roadmap from "./Roadmap.jsx";
import Assistant from "./Assistant.jsx";

// The audit report. Order reflects priority: the perception–reality gap first
// (the differentiator), then the evidence-based diagnostic, the explainable
// scores, the grounded roadmap, and the grounded assistant.
export default function Dashboard({ audit, pid, onRestart }) {
  return (
    <div>
      <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{audit.project_name || "Projet"}</h2>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {audit.sector ? `Secteur : ${audit.sector} · ` : ""}
            Audit algorithmique de maturité
          </div>
          {pid && (
            <div className="muted" style={{ fontSize: "0.72rem", marginTop: 4 }}>
              ID projet (pour reprendre plus tard) : <span className="mono">{pid}</span>
            </div>
          )}
        </div>
        <button onClick={onRestart}>Nouvel audit</button>
      </div>

      <GapBanner gap={audit.perception_reality_gap} />
      <AnomalyCard anomalies={audit.anomalies} />
      <ScoreDeltas scoreDeltas={audit.score_deltas} />
      <GateLadder diagnostic={audit.diagnostic} />
      <ScorePanel scores={audit.scores} />
      <Roadmap roadmap={audit.roadmap} />

      {audit.explanations?.pcoh_rationale && (
        <div className="panel">
          <h2>Explicabilité</h2>
          <div className="sub">
            Couche LLM secondaire — justification en langage naturel, ancrée sur
            les sorties structurées.
          </div>
          <p style={{ fontSize: "0.88rem" }}>
            <b>Indice de cohérence (P_coh) :</b>{" "}
            {audit.explanations.pcoh_rationale}
          </p>
          {audit.explanations.diagnostic_rationale && (
            <p style={{ fontSize: "0.88rem" }} className="muted">
              {audit.explanations.diagnostic_rationale}
            </p>
          )}
        </div>
      )}

      <Assistant pid={pid} />
    </div>
  );
}
