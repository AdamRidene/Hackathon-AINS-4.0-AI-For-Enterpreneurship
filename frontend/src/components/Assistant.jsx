import { useState } from "react";
import { api } from "../api.js";

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
              <div style={{ opacity: 0.85, whiteSpace: "pre-line" }}>{grounding}</div>
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

  const t = TEXTS[lang] || TEXTS.fr;
  const ar = lang === "ar";

  async function send(e) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await api.assistant(pid, question);
      setLog((l) => [
        ...l,
        { role: "bot", text: res.reply, grounding: res.grounding },
      ]);
    } catch (err) {
      setLog((l) => [...l, { role: "bot", text: ar ? `خطأ: ${err.message}` : `Erreur : ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="advisor-wrap" dir={ar ? "rtl" : "ltr"}>
      <p style={{ fontSize: "0.84rem", color: "var(--text-sub)", marginBottom: 16 }}>
        {t.sub}
      </p>

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
