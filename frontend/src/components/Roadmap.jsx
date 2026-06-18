// Mon Parcours — ordered, grounded action plan. Each milestone is a four-tuple
// (order, rationale, horizon, source); every recommendation cites a real
// Tunisian institutional resource (RAG-grounded, no invented programs).
export default function Roadmap({ roadmap }) {
  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="panel">
        <h2>Mon Parcours</h2>
        <div className="center">
          Aucune action prioritaire — toutes les portes franchies.
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Mon Parcours</h2>
      <div className="sub">
        Feuille de route priorisée. Chaque étape est déclenchée par une porte non
        franchie ou un score pénalisé, et reliée à une ressource institutionnelle
        réelle.
      </div>

      {roadmap.map((m) => (
        <div key={m.order} className="milestone">
          <div className="mhead">
            <div className="morder">{m.order}</div>
            <div className="mtitle">{m.title}</div>
            <span className="horizon">{m.horizon_fr}</span>
          </div>
          <div className="mrationale">{m.rationale_fr}</div>
          {m.action_fr && <div className="maction">{m.action_fr}</div>}
          <div className="sources">
            {m.sources.map((s, i) => (
              <div key={i} className="source">
                <span className="inst">{s.institution}</span> —{" "}
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>{" "}
                <span className="muted">({s.horizon})</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
