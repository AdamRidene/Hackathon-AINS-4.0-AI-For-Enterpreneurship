import { useState } from "react";

const DIMS = [
  ["market", "Marché", "S_M"],
  ["commercial", "Commercial", "S_C"],
  ["innovation", "Innovation", "S_I"],
  ["scalability", "Scalabilité", "S_S"],
  ["green", "Green / ESG", "S_G"],
];

function barColor(v, gated) {
  if (gated) return "var(--red)";
  if (v >= 66) return "var(--green)";
  if (v >= 40) return "var(--amber)";
  return "var(--red)";
}

function ScoreRow({ res, label, code }) {
  const [open, setOpen] = useState(false);
  if (!res) return null;
  return (
    <div className="scorerow">
      <div className="scorehead" onClick={() => setOpen((o) => !o)}>
        <div className="dim">
          {label} <span className="muted mono">{code}</span>
        </div>
        <div className="bar">
          <div
            style={{
              width: `${res.final_score}%`,
              background: barColor(res.final_score, res.gate_triggered),
            }}
          />
        </div>
        <div className="scoreval">
          <span className="final">{res.final_score}</span>
          {res.base_score !== res.final_score && (
            <span className="base"> / base {res.base_score}</span>
          )}
        </div>
        {res.gate_triggered && <span className="gateflag">GATE</span>}
        <span className="muted">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div className="contribs">
          <div className="anchor">Cadre de référence : {res.anchor}</div>
          {res.gate_triggered && res.gate_reason && (
            <div className="gate-reason">⚠ Gate : {res.gate_reason}</div>
          )}
          {res.contributions.map((c, i) => (
            <div key={i} className="contrib">
              <span>
                <b>{c.criterion}</b>{" "}
                <span className="muted mono">
                  (w {c.weight} · raw {c.raw})
                </span>
              </span>
              <span className="cdetail">{c.detail}</span>
              <span className="mono">{c.weighted}</span>
            </div>
          ))}
          {res.missing_inputs?.length > 0 && (
            <div className="gate-reason muted">
              Données manquantes : {res.missing_inputs.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScorePanel({ scores }) {
  if (!scores) return null;
  return (
    <div className="panel">
      <h2>Scores GWLC explicables</h2>
      <div className="sub">
        Combinaison linéaire pondérée à portes (gates). Cliquez une dimension pour
        la trace de calcul critère par critère. Vecteur (M,C,I,S,G) :{" "}
        <span className="mono">[{scores.vector.join(", ")}]</span>
      </div>
      <div className="scoregrid">
        {DIMS.map(([key, label, code]) => (
          <ScoreRow key={key} res={scores[key]} label={label} code={code} />
        ))}
      </div>
    </div>
  );
}
