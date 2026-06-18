// Inconsistency alert card. Surfaces contradictory-evidence flags from the
// backend's detect_anomalies() pass — distinct from the perception–reality gap.
// Renders nothing when the audit found no internal inconsistencies.
const SEV = {
  high: { label: "Critique", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  medium: { label: "À surveiller", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  low: { label: "Mineur", color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
};

export default function AnomalyCard({ anomalies }) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <div className="panel" style={{ borderLeft: "3px solid #ef4444" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true">⚠</span> Alerte incohérences
        <span className="muted" style={{ fontSize: "0.8rem", fontWeight: 400 }}>
          ({anomalies.length} signal{anomalies.length > 1 ? "s" : ""} contradictoire{anomalies.length > 1 ? "s" : ""})
        </span>
      </h2>
      <div className="sub">
        Signaux internes contradictoires détectés dans les preuves collectées —
        à lever avant de présenter le projet.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {anomalies.map((a) => {
          const sev = SEV[a.severity] || SEV.low;
          return (
            <div
              key={a.code}
              style={{
                background: sev.bg,
                border: `1px solid ${sev.color}33`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <b style={{ fontSize: "0.92rem" }}>{a.title_fr}</b>
                <span
                  style={{
                    color: sev.color, fontSize: "0.72rem", fontWeight: 700,
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}
                >
                  {sev.label}
                </span>
              </div>
              <div style={{ fontSize: "0.85rem", marginTop: 4 }}>{a.detail_fr}</div>
              {a.signals?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {a.signals.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: "0.74rem", padding: "2px 8px", borderRadius: 999,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            