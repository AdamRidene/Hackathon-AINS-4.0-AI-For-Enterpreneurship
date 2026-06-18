import { useState } from "react";
import { api } from "../api.js";

// Grounded conversational layer. The assistant answers ONLY from the structured
// audit (diagnostic, scores, roadmap) — it is a layer over the engine, never the
// product itself.
export default function Assistant({ pid }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

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
      setLog((l) => [...l, { role: "bot", text: `Erreur : ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Assistant ancré</h2>
      <div className="sub">
        Réponses fondées uniquement sur votre audit structuré. Aucune connaissance
        générale, aucun programme inventé.
      </div>

      <div className="chatlog">
        {log.length === 0 && (
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Ex. « Pourquoi mon score Marché est-il plafonné ? » · « Quelle est ma
            prochaine étape prioritaire ? »
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="msg bot">
            <span className="spinner" />
          </div>
        )}
      </div>

      <form className="chatform" onSubmit={send}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Posez une question sur votre audit…"
        />
        <button className="primary" disabled={busy}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
