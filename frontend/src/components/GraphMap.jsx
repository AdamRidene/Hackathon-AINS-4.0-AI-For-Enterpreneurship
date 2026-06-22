/**
 * Mini static DAG of the LangGraph intake graph, with this turn's active path
 * highlighted from the per-turn trace. The graph is fixed (it mirrors
 * backend/app/intake/graph.py: ingest -> generate_probe | finalize), so we draw
 * it by hand in SVG and just toggle node/edge colors.
 */
const ACTIVE = "#9b8cff";
const ACTIVE_FILL = "rgba(124, 109, 245, 0.16)";
const DIM = "var(--text-dim, #8a8a99)";
const DIM_LINE = "rgba(160,160,180,0.35)";

function activeSets(trace) {
  const has = (p) => trace.some((t) => t === p || t.startsWith(p));
  const ingest = has("answer:") || has("probe_answer:");
  const emitted = has("probe_emitted:");
  const declined = trace.includes("probe_declined");
  const probe = emitted || declined;
  const finalize =
    trace.includes("deterministic_next") ||
    trace.includes("intake_complete") ||
    trace.includes("serve_pending_probe");

  const nodes = { ingest, generate_probe: probe, finalize };
  const edges = {
    start_ingest: ingest,
    ingest_probe: probe,
    ingest_finalize: finalize && !probe,
    probe_finalize: probe && !emitted, // declined -> falls through to finalize
    probe_end: emitted,
    finalize_end: finalize,
  };
  return { nodes, edges };
}

function Node({ x, y, w, label, on }) {
  return (
    <g>
      <rect
        x={x - w / 2} y={y - 13} width={w} height={26} rx={6}
        fill={on ? ACTIVE_FILL : "transparent"}
        stroke={on ? ACTIVE : DIM_LINE} strokeWidth={on ? 1.6 : 1}
      />
      <text
        x={x} y={y + 3} textAnchor="middle"
        fontSize="9" fontFamily="monospace"
        fill={on ? ACTIVE : DIM} fontWeight={on ? 700 : 400}
      >
        {label}
      </text>
    </g>
  );
}

function Edge({ d, on }) {
  return (
    <path
      d={d} fill="none"
      stroke={on ? ACTIVE : DIM_LINE} strokeWidth={on ? 2 : 1}
      markerEnd={on ? "url(#arrow-on)" : "url(#arrow-off)"}
      strokeDasharray={on ? "0" : "3 3"}
    />
  );
}

export default function GraphMap({ trace, lang }) {
  if (!Array.isArray(trace) || trace.length === 0) return null;
  const ar = lang === "ar";
  const { nodes, edges } = activeSets(trace);

  return (
    <div style={{ margin: "4px 0 8px 0" }}>
      <svg viewBox="0 0 280 210" width="100%" style={{ maxWidth: 300, height: "auto" }} role="img"
           aria-label="LangGraph intake decision path">
        <defs>
          <marker id="arrow-on" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={ACTIVE} />
          </marker>
          <marker id="arrow-off" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={DIM_LINE} />
          </marker>
        </defs>

        {/* edges (drawn first, under nodes) */}
        <Edge d="M140,24 L140,38" on={edges.start_ingest} />
        <Edge d="M152,62 C178,78 196,90 200,105" on={edges.ingest_probe} />
        <Edge d="M128,62 C100,78 80,90 74,105" on={edges.ingest_finalize} />
        <Edge d="M150,120 L116,120" on={edges.probe_finalize} />
        <Edge d="M196,131 C176,152 158,166 150,176" on={edges.probe_end} />
        <Edge d="M74,131 C96,152 116,166 130,176" on={edges.finalize_end} />

        {/* nodes */}
        <ellipse cx="140" cy="14" rx="20" ry="10" fill="transparent" stroke={DIM_LINE} strokeWidth="1" />
        <text x="140" y="17" textAnchor="middle" fontSize="8" fontFamily="monospace" fill={DIM}>START</text>

        <Node x={140} y={50} w={70} label="ingest" on={nodes.ingest} />
        <Node x={200} y={118} w={104} label="generate_probe" on={nodes.generate_probe} />
        <Node x={70} y={118} w={74} label="finalize" on={nodes.finalize} />

        <ellipse cx="140" cy="188" rx="18" ry="10" fill="transparent" stroke={DIM_LINE} strokeWidth="1" />
        <text x="140" y="191" textAnchor="middle" fontSize="8" fontFamily="monospace" fill={DIM}>END</text>
      </svg>
      <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: 2 }}>
        {ar ? "بنفسجي = المسار المُنفَّذ في هذه الجولة" : "Violet = chemin exécuté ce tour-ci"}
      </div>
    </div>
  );
}
