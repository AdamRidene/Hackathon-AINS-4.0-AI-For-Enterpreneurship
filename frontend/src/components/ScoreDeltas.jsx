const LABELS_FR = {
  market: "Marché",
  commercial: "Offre",
  innovation: "Innovation",
  scalability: "Scalabilité",
  green: "Vert",
};
const LABELS_AR = {
  market: "السوق",
  commercial: "العرض",
  innovation: "الابتكار",
  scalability: "التوسع",
  green: "البيئة",
};

export default function ScoreDeltas({ scoreDeltas, lang }) {
  if (!scoreDeltas || !scoreDeltas.deltas) return null;
  const ar = lang === "ar";
  const LABELS = ar ? LABELS_AR : LABELS_FR;
  const entries = Object.entries(scoreDeltas.deltas);
  return (
    <div className="panel">
      <h2>{ar ? "التطور منذ آخر تدقيق" : "Évolution depuis le dernier audit"}</h2>
      <div className="sub">
        {ar ? "تغير كل بعد مقارنة بتدقيقك السابق." : "Variation de chaque dimension par rapport à votre audit précédent."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {entries.map(([dim, d]) => {
          const up = d > 0, flat = d === 0;
          const color = flat ? "#9ca3af" : up ? "#22c55e" : "#ef4444";
          const arrow = flat ? "→" : up ? "▲" : "▼";
          return (
            <div
              key={dim}
              style={{
                flex: "1 1 120px", minWidth: 110, borderRadius: 8, padding: "8px 10px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="muted" style={{ fontSize: "0.78rem" }}>{LABELS[dim] || dim}</div>
              <div style={{ color, fontWeight: 700, fontSize: "1.05rem" }}>
                {arrow} {flat ? "0" : `${up ? "+" : ""}${d}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
