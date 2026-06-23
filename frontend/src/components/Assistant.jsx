import { useState, useEffect } from "react";
import { api } from "../api.js";

// ---------------------------------------------------------------------------
// Grounding formatter — parses the compact grounding string into score chips,
// labelled sections and a numbered roadmap (pretty render of res.grounding).
// ---------------------------------------------------------------------------
const SCORE_META = [
  { key: "M", label: "Marché",      color: "#06b6d4" }, // cyan
  { key: "C", label: "Commercial",  color: "#3b82f6" }, // blue
  { key: "I", label: "Innovation",  color: "#a855f7" }, // purple
  { key: "S", label: "Scalability", color: "#f97316" }, // orange
  { key: "G", label: "Green",       color: "#22c55e" }, // green
];

function ScoreChip({ label, value, color }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 99,
      border: `1px solid ${color}55`,
      background: `${color}18`,
      color,
      fontSize: "0.72rem",
      fontWeight: 700,
      marginRight: 4,
      marginBottom: 4,
      letterSpacing: "0.02em",
    }}>
      {label} <span style={{ opacity: 0.85, fontWeight: 400 }}>{value}</span>
    </span>
  );
}

function formatGrounding(text) {
  try {
    if (!text || typeof text !== "string") throw new Error("empty");

    const stadeMatch = text.match(/Stade objectif\s*:\s*([^.]+)\./);
    const stade = stadeMatch ? stadeMatch[1].trim() : null;

    const ecartMatch = text.match(/[Éé]cart perception[- ]r[ée]alit[ée]\s*:\s*([^.]+\.)/);
    const ecart = ecartMatch ? ecartMatch[1].replace(/\.\s*$/, "").trim() : null;

    const scoresMatch = text.match(/Scores\s*\(M,C,I,S,G\)\s*:\s*\[([^\]]+)\]/);
    let scoreChips = null;
    if (scoresMatch) {
      const vals = scoresMatch[1].split(",").map((s) => parseFloat(s.trim()));
      if (vals.length === 5 && vals.every((v) => !isNaN(v))) {
        scoreChips = vals.map((v, i) => (
          <ScoreChip key={i} label={SCORE_META[i].key} value={v} color={SCORE_META[i].color} />
        ));
      }
    }

    const feuilleMatch = text.match(/Feuille de route\s*:\s*(.*)/s);
    let roadmapItems = null;
    if (feuilleMatch) {
      const raw = feuilleMatch[1].trim();
      const items = raw.split(/\s*\|\s*/).filter(Boolean);
      roadmapItems = items.map((item, i) => {
        const cleaned = item.replace(/^\d+\.\s*/, "");
        const timelineMatch = cleaned.match(/^(.*)\s\[(.*)\]\s—\s(.*)$/);
        if (timelineMatch) {
          const [, headline, timeline, rest] = timelineMatch;
          return (
            <li key={i} style={{ marginBottom: 4, lineHeight: 1.5 }}>
              {headline} <span style={{ color: "var(--orange)", fontWeight: 700 }}>[{timeline}]</span> — {rest}
            </li>
          );
        }
        return (
          <li key={i} style={{ marginBottom: 4, lineHeight: 1.5 }}>
            {cleaned}
          </li>
        );
      });
    }

    if (!stade && !ecart && !scoreChips && !roadmapItems) throw new Error("no fields");

    const sectionStyle = { marginBottom: 10 };
    const labelStyle = { fontWeight: 700, fontSize: "0.78rem", color: "var(--text-sub, rgba(255,255,255,0.55))", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 };
    const valueStyle = { fontSize: "0.83rem", lineHeight: 1.5 };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {stade && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Stade objectif</div>
            <div style={valueStyle}>{stade}</div>
          </div>
        )}
        {ecart && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Écart perception / réalité</div>
            <div style={valueStyle}>{ecart}</div>
          </div>
        )}
        {scoreChips && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Scores (M / C / I / S / G)</div>
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 2 }}>
              {scoreChips}
            </div>
          </div>
        )}
        {roadmapItems && (
          <div style={sectionStyle}>
            <div style={labelStyle}>Feuille de route</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.83rem" }}>
              {roadmapItems}
            </ol>
          </div>
        )}
      </div>
    );
  } catch (_) {
    return <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>;
  }
}

const TEXTS = {
  fr: {
    sub: "Réponses fondées uniquement sur votre audit structuré. Aucune connaissance générale, aucun programme inventé.",
    placeholder: "Posez une question sur votre audit...",
    send: "Envoyer",
    noMsg: "Ex. « Pourquoi mon score Marché est-il plafonné ? » · « Quelle est ma prochaine étape prioritaire ? »",
  },
  ar: {
    sub: "إجابات مبنية حصرياً على نتائج تدقيقك الهيكلي. لا معرفة عامة ولا برامج مخترعة.",
    placeholder: "اطرح سؤالاً حول تدقيقك...",
    send: "إرسال",
    noMsg: "أمثلة: « لماذا تم وضع سقف لنتيجة السوق ؟ » · « ما هي خطوتي التالية ذات الأولوية ؟ »",
  }
};

function cleanAssistantText(text) {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const lowered = cleaned.toLowerCase();
  const markers = [
    "final answer:",
    "réponse finale:",
    "reponse finale:",
    "answer:",
    "réponse:",
    "reponse:",
  ];

  for (const marker of markers) {
    const idx = lowered.indexOf(marker);
    if (idx >= 0) {
      cleaned = cleaned.slice(idx + marker.length).trim();
      break;
    }
  }

  const reasoningPrefixes = [
    "here's a thinking process",
    "here is a thinking process",
    "thinking process",
    "reasoning:",
    "analysis:",
    "analyse:",
  ];
  if (reasoningPrefixes.some((prefix) => lowered.startsWith(prefix))) {
    const lines = cleaned.split(/\r?\n/).filter((line) => line.trim());
    const answerIndex = lines.findIndex((line) =>
      markers.some((marker) => line.toLowerCase().startsWith(marker))
    );
    if (answerIndex >= 0) {
      cleaned = lines.slice(answerIndex).join("\n").trim();
    } else if (lines.length > 1) {
      cleaned = lines.slice(1).join("\n").trim();
    } else {
      cleaned = "";
    }
  }

  return cleaned;
}

function BotMessage({ text, grounding, lang }) {
  const [showGrounding, setShowGrounding] = useState(false);
  const ar = lang === "ar";
  return (
    <div className="chat-msg bot">
      <div style={{ whiteSpace: "pre-line" }}>{text}</div>
      {grounding && (
        <>
          <div 
            className="grounding-toggle" 
            onClick={() => setShowGrounding(!showGrounding)}
            style={{ marginTop: 8 }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showGrounding ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block", marginRight: ar ? 0 : 4, marginLeft: ar ? 4 : 0 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span>{ar ? "سياق الإسناد" : "Contexte d'ancrage (Grounding)"}</span>
          </div>
          {showGrounding && (
            <div className="grounding-box" style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{ar ? "المعلومات المسترجعة:" : "Données de grounding :"}</div>
              <div style={{ opacity: 0.85 }}>{formatGrounding(grounding)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Assistant({ pid, lang = "fr" }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState([]);

  const t = TEXTS[lang] || TEXTS.fr;
  const ar = lang === "ar";

  useEffect(() => {
    api.listDocuments(pid)
      .then(setDocs)
      .catch(() => {});
  }, [pid]);

  async function send(e) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await api.assistant(pid, question, lang);
      setLog((l) => [
        ...l,
        { role: "bot", text: cleanAssistantText(res.reply), grounding: res.grounding },
      ]);
    } catch (err) {
      setLog((l) => [...l, { role: "bot", text: ar ? `خطأ: ${err.message}` : `Erreur : ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="advisor-wrap" dir={ar ? "rtl" : "ltr"}>
      <p style={{ fontSize: "0.84rem", color: "var(--text-sub)", marginBottom: docs.length > 0 ? 10 : 16 }}>
        {t.sub}
      </p>

      {docs.length > 0 && (
        <div className="assistant-docs-chips" style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: "8px 12px",
          background: "rgba(74, 123, 247, 0.04)",
          border: "1px solid var(--border-accent)",
          borderRadius: "var(--r-md)",
          marginBottom: 16,
          alignItems: "center"
        }}>
          <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--orange)", display: "flex", alignItems: "center", gap: 4 }}>
            📚 {ar ? "المستندات النشطة:" : "Documents lus par l'IA :"}
          </span>
          {docs.map(d => (
            <span key={d.id} style={{
              fontSize: "0.72rem",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              padding: "2px 8px",
              color: "var(--text-sub)",
              display: "inline-flex",
              alignItems: "center"
            }}>
              {d.filename}
            </span>
          ))}
        </div>
      )}

      <div className="advisor-log">
        {log.length === 0 && (
          <div className="muted" style={{ fontSize: "0.85rem", padding: "20px 4px", textAlign: "center" }}>
            {t.noMsg}
          </div>
        )}
        {log.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="chat-msg user">
                {m.text}
              </div>
            );
          } else {
            return (
              <BotMessage 
                key={i} 
                text={m.text} 
                grounding={m.grounding} 
                lang={lang} 
              />
            );
          }
        })}
        {busy && (
          <div className="chat-msg bot">
            <span className="spinner" style={{ width: 14, height: 14 }} />
          </div>
        )}
      </div>

      <form className="advisor-form" onSubmit={send}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.placeholder}
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "rgba(255, 255, 255, 0.02)",
            color: "var(--text)",
            fontFamily: "var(--f-body)"
          }}
        />
        <button className="primary" disabled={busy} style={{ cursor: "pointer", padding: "10px 20px" }}>
          {t.send}
        </button>
      </form>
    </div>
  );
}
