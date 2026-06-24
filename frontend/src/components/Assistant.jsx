import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";
import GraphMap from "./GraphMap.jsx";

// ---------------------------------------------------------------------------
// Grounding formatter — parses the compact grounding string into score chips,
// labelled sections and a numbered roadmap (pretty render of res.grounding).
// ---------------------------------------------------------------------------
const SCORE_META = [
  { key: "M", labelFr: "Marché",      labelAr: "السوق",     color: "#06b6d4" },
  { key: "C", labelFr: "Commercial",  labelAr: "تجاري",     color: "#3b82f6" },
  { key: "I", labelFr: "Innovation",  labelAr: "ابتكار",    color: "#a855f7" },
  { key: "S", labelFr: "Scalability", labelAr: "توسع",      color: "#f97316" },
  { key: "G", labelFr: "Green",       labelAr: "بيئة",      color: "#22c55e" },
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

function formatGrounding(text, lang) {
  const ar = lang === "ar";
  try {
    if (!text || typeof text !== "string") throw new Error("empty");

    const stadeMatch = text.match(/(?:Stade objectif|المرحلة الموضوعية)\s*:\s*([^.]+)\./);
    const stade = stadeMatch ? stadeMatch[1].trim() : null;

    const ecartMatch = text.match(/(?:[Éé]cart perception[- ]r[ée]alit[ée]|فجوة الإدراك والواقع)\s*:\s*([^.]+\.)/);
    const ecart = ecartMatch ? ecartMatch[1].replace(/\.\s*$/, "").trim() : null;

    const scoresMatch = text.match(/(?:Scores|المؤشرات)\s*\(M,C,I,S,G\)\s*:\s*\[([^\]]+)\]/);
    let scoreChips = null;
    if (scoresMatch) {
      const vals = scoresMatch[1].split(",").map((s) => parseFloat(s.trim()));
      if (vals.length === 5 && vals.every((v) => !isNaN(v))) {
        scoreChips = vals.map((v, i) => (
          <ScoreChip key={i} label={SCORE_META[i].key} value={v} color={SCORE_META[i].color} />
        ));
      }
    }

    const roadmapLabels = ar
      ? ["خارطة الطريق", "خطة العمل", "الأولويات"]
      : ["Feuille de route", "Plan d'action", "Priorités"];
    let roadmapItems = null;
    const roadmapPattern = new RegExp(`(?:${roadmapLabels.join("|")})\\s*:\\s*(.*)`, "s");
    const feuilleMatch = text.match(roadmapPattern);
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
              {headline} <span style={{ color: "var(--primary-light)", fontWeight: 700 }}>[{timeline}]</span> — {rest}
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

    const labels = {
      stade: ar ? "المرحلة الموضوعية" : "Stade objectif",
      ecart: ar ? "فجوة الإدراك والواقع" : "Écart perception / réalité",
      scores: ar ? "المؤشرات (M / C / I / S / G)" : "Scores (M / C / I / S / G)",
      roadmap: ar ? "خارطة الطريق" : "Feuille de route",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {stade && (
          <div className="grounding-section">
            <div className="grounding-title-sub">{labels.stade}</div>
            <div className="grounding-value">{stade}</div>
          </div>
        )}
        {ecart && (
          <div className="grounding-section">
            <div className="grounding-title-sub">{labels.ecart}</div>
            <div className="grounding-value">{ecart}</div>
          </div>
        )}
        {scoreChips && (
          <div className="grounding-section">
            <div className="grounding-title-sub">{labels.scores}</div>
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 2 }}>
              {scoreChips}
            </div>
          </div>
        )}
        {roadmapItems && (
          <div className="grounding-section">
            <div className="grounding-title-sub">{labels.roadmap}</div>
            <ol className="grounding-roadmap">
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
    title: "Conseiller Firasa",
    status: "En ligne",
    sub: "Réponses fondées uniquement sur votre audit structuré.",
    placeholder: "Posez une question sur votre audit...",
    send: "Envoyer",
    clear: "Effacer la conversation",
    noMsg: "Comment puis-je vous aider aujourd'hui ?",
    suggestionsLabel: "Suggestions de questions :",
    suggestions: [
      { icon: "fa-solid fa-lightbulb", text: "Pourquoi mon score Marché est-il plafonné ?" },
      { icon: "fa-solid fa-bullseye", text: "Quelle est ma prochaine étape prioritaire ?" },
      { icon: "fa-solid fa-chart-line", text: "Que révèle l'écart perception / réalité ?" }
    ]
  },
  ar: {
    title: "مستشار فِراسة",
    status: "متصل",
    sub: "إجابات مبنية حصرياً على نتائج تدقيقك الهيكلي.",
    placeholder: "اطرح سؤالاً حول تدقيقك...",
    send: "إرسال",
    clear: "مسح المحادثة",
    noMsg: "كيف يمكنني مساعدتك اليوم؟",
    suggestionsLabel: "اقتراحات الأسئلة:",
    suggestions: [
      { icon: "fa-solid fa-lightbulb", text: "لماذا تم وضع سقف لنتيجة السوق ؟" },
      { icon: "fa-solid fa-bullseye", text: "ما هي خطوتي التالية ذات الأولوية ؟" },
      { icon: "fa-solid fa-chart-line", text: "ما الذي يظهره فارق الإدراك والواقع ؟" }
    ]
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
    "reponse finale :",
    "réponse finale :"
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

function BotMessage({ text, grounding, sourcesUsed, trace, lang }) {
  const [showGrounding, setShowGrounding] = useState(false);
  const ar = lang === "ar";
  const hasSources = Array.isArray(sourcesUsed) && sourcesUsed.length > 0;
  return (
    <div className="chat-msg bot">
      <div style={{ whiteSpace: "pre-line" }}>{text}</div>
      <GraphMap trace={trace} lang={lang} />
      {grounding && hasSources && (
        <>
          <div 
            className="grounding-toggle" 
            onClick={() => setShowGrounding(!showGrounding)}
          >
            <i 
              className="fa-solid fa-chevron-right" 
              style={{ 
                transform: showGrounding ? "rotate(90deg)" : "none", 
                transition: "transform 0.15s", 
                marginRight: ar ? 0 : 6, 
                marginLeft: ar ? 6 : 0, 
                fontSize: "0.68rem" 
              }}
            />
            <span>{ar ? "سياق الإسناد" : "Contexte d'ancrage (Grounding)"}</span>
          </div>
          {showGrounding && (
            <div className="grounding-box">
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center" }}>
                <i className="fa-solid fa-circle-nodes" style={{ marginRight: ar ? 0 : 6, marginLeft: ar ? 6 : 0, color: "var(--primary-light)" }} />
                <span>{ar ? "المعلومات المسترجعة:" : "Données de grounding :"}</span>
              </div>
              <div>{formatGrounding(grounding, lang)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const LS_PREFIX = "firasa_assistant_log_";

function loadLog(pid) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + pid);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLog(pid, log) {
  try {
    localStorage.setItem(LS_PREFIX + pid, JSON.stringify(log));
  } catch {}
}

export default function Assistant({ pid, lang = "fr" }) {
  const [log, setLog] = useState(() => loadLog(pid));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState([]);
  const logRef = useRef(null);

  const t = TEXTS[lang] || TEXTS.fr;
  const ar = lang === "ar";

  useEffect(() => {
    setLog(loadLog(pid));
  }, [pid]);

  useEffect(() => {
    api.listDocuments(pid)
      .then(setDocs)
      .catch(() => {});
  }, [pid]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, busy]);

  useEffect(() => {
    saveLog(pid, log);
  }, [log, pid]);

  const handleClear = () => {
    setLog([]);
    try { localStorage.removeItem(LS_PREFIX + pid); } catch {}
  };

  async function send(e) {
    if (e) e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await api.assistant(pid, question, lang);
      setLog((l) => [
        ...l,
        { role: "bot", text: cleanAssistantText(res.reply), grounding: res.grounding, sourcesUsed: res.sources_used, trace: res.trace },
      ]);
    } catch (err) {
      setLog((l) => [...l, { role: "bot", text: ar ? `خطأ: ${err.message}` : `Erreur : ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const handleSuggestionClick = (suggestionText) => {
    if (busy) return;
    setQ("");
    setLog((l) => [...l, { role: "user", text: suggestionText }]);
    setBusy(true);
    api.assistant(pid, suggestionText, lang)
      .then((res) => {
        setLog((l) => [
          ...l,
          { role: "bot", text: cleanAssistantText(res.reply), grounding: res.grounding, sourcesUsed: res.sources_used, trace: res.trace },
        ]);
      })
      .catch((err) => {
        setLog((l) => [...l, { role: "bot", text: ar ? `خطأ: ${err.message}` : `Erreur : ${err.message}` }]);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="advisor-wrap" dir={ar ? "rtl" : "ltr"}>
      {/* Premium Header */}
      <div className="advisor-header">
        <div className="advisor-info">
          <div className="advisor-avatar-container">
            <i className="fa-solid fa-robot advisor-avatar-icon" style={{ color: "var(--primary-light)" }} />
            <div className="advisor-status-badge"></div>
          </div>
          <div className="advisor-meta">
            <span className="advisor-title">{t.title}</span>
            <span className="advisor-status-text">{t.status}</span>
          </div>
        </div>
        <div className="advisor-actions">
          {log.length > 0 && (
            <button 
              className="advisor-btn-clear" 
              onClick={handleClear} 
              title={t.clear}
            >
              <i className="fa-solid fa-trash-can" />
            </button>
          )}
        </div>
      </div>

      {/* Active Documents chips */}
      {docs.length > 0 && (
        <div className="assistant-docs-chips">
          <span className="assistant-docs-title">
            <i className="fa-solid fa-book-open" style={{ marginRight: ar ? 0 : 6, marginLeft: ar ? 6 : 0 }} />
            {ar ? "المستندات النشطة:" : "Documents lus par l'IA :"}
          </span>
          {docs.map(d => (
            <span key={d.id} className="assistant-doc-badge">
              <i className="fa-solid fa-file-lines" style={{ marginRight: ar ? 0 : 4, marginLeft: ar ? 4 : 0, opacity: 0.8 }} />
              {d.filename}
            </span>
          ))}
        </div>
      )}

      {/* Chat Log */}
      <div className="advisor-log" ref={logRef}>
        {log.length === 0 && (
          <div className="advisor-welcome">
            <div className="advisor-welcome-icon" style={{ color: "var(--primary-light)" }}>
              <i className="fa-solid fa-robot" />
            </div>
            <div className="advisor-welcome-title">{t.noMsg}</div>
            <div className="advisor-welcome-sub">{t.sub}</div>
            
            <div className="advisor-suggestions-label">{t.suggestionsLabel}</div>
            <div className="advisor-suggestions-grid">
              {t.suggestions.map((s, idx) => (
                <button
                  key={idx}
                  className="advisor-suggestion-card"
                  onClick={() => handleSuggestionClick(s.text)}
                >
                  <i className={s.icon}></i>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
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
                sourcesUsed={m.sourcesUsed}
                trace={m.trace}
                lang={lang} 
              />
            );
          }
        })}
        
        {busy && (
          <div className="chat-msg bot">
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="advisor-form-wrap">
        <form className="advisor-form" onSubmit={send}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.placeholder}
          />
          <button 
            type="submit" 
            className="advisor-btn-send" 
            disabled={busy || !q.trim()}
          >
            <i className="fa-solid fa-paper-plane" />
          </button>
        </form>
      </div>
    </div>
  );
}
