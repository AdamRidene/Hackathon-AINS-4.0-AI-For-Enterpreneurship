import { useState } from "react";

/**
 * Document-driven auto-fill: ask the backend to extract intake answers from the
 * project's uploaded document(s), let the user review/edit/confirm, then apply.
 * Turns a 38-question form into a review-and-confirm step.
 *
 * Props: pid, api, lang, onApplied(result) — parent refreshes intake state.
 */
const T = {
  fr: {
    upload: "Importer un document",
    uploading: "Téléversement…",
    analyzeExisting: "Analyser un document déjà importé",
    hint: "Importez un ou plusieurs documents (pitch deck, business plan, CV…) en PDF, MD ou TXT. L'IA pré-remplit le formulaire — vous validez avant d'appliquer.",
    analyzing: "Analyse du document…",
    title: "Champs extraits — vérifiez avant d'appliquer",
    none: "Aucun champ exploitable trouvé. Répondez aux questions manuellement.",
    apply: "Appliquer",
    cancel: "Annuler",
    fields: "champ(s)",
    verified: "vérifié dans le document",
    unverified: "non vérifié — à confirmer",
    source: "Source",
    yes: "Oui", no: "Non",
  },
  ar: {
    upload: "تحميل وثيقة",
    uploading: "جارٍ الرفع…",
    analyzeExisting: "تحليل وثيقة محمّلة مسبقاً",
    hint: "حمّل وثيقة أو أكثر (عرض تقديمي، خطة عمل، CV…) بصيغة PDF أو MD أو TXT. يملأ الذكاء الاصطناعي النموذج — وتؤكّد قبل التطبيق.",
    analyzing: "تحليل الوثيقة…",
    title: "الحقول المستخرجة — تحقق قبل التطبيق",
    none: "لم يُعثر على حقول قابلة للاستخدام. أجب على الأسئلة يدوياً.",
    apply: "تطبيق",
    cancel: "إلغاء",
    fields: "حقل",
    verified: "مُتحقَّق منه في الوثيقة",
    unverified: "غير مُتحقَّق — للتأكيد",
    source: "المصدر",
    yes: "نعم", no: "لا",
  },
};

export default function AutoFill({ pid, api, lang, onApplied }) {
  const ar = lang === "ar";
  const t = T[ar ? "ar" : "fr"];
  const [phase, setPhase] = useState("idle"); // idle | loading | review | applying
  const [proposals, setProposals] = useState([]);
  const [checked, setChecked] = useState({}); // qid -> bool
  const [values, setValues] = useState({});   // qid -> edited value
  const [error, setError] = useState(null);

  async function handleUpload(files) {
    if (!files?.length) return;
    const oversized = Array.from(files).find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { setError(`Fichier > 10 Mo : ${oversized.name}`); return; }
    setPhase("uploading"); setError(null);
    try {
      for (const file of files) await api.uploadDocument(pid, file);
      await analyze();
    } catch (err) {
      setError(err.message); setPhase("idle");
    }
  }

  async function analyze() {
    setPhase("loading"); setError(null);
    try {
      const res = await api.autofill(pid);
      const props = res.proposals || [];
      setProposals(props);
      const chk = {}, vals = {};
      props.forEach((p) => { chk[p.question_id] = p.recommended; vals[p.question_id] = p.value; });
      setChecked(chk); setValues(vals);
      setPhase("review");
    } catch (err) {
      setError(err.message); setPhase("idle");
    }
  }

  async function apply() {
    const confirmed = proposals
      .filter((p) => checked[p.question_id])
      .map((p) => ({ question_id: p.question_id, value: values[p.question_id] }));
    if (confirmed.length === 0) { setPhase("idle"); return; }
    setPhase("applying"); setError(null);
    try {
      const result = await api.applyAutofill(pid, confirmed);
      setPhase("idle"); setProposals([]);
      onApplied && onApplied(result);
    } catch (err) {
      setError(err.message); setPhase("review");
    }
  }

  const prompt = (p) => (ar && p.prompt_ar ? p.prompt_ar : p.prompt_fr);

  function valueEditor(p) {
    const v = values[p.question_id];
    const set = (nv) => setValues((s) => ({ ...s, [p.question_id]: nv }));
    const base = { fontSize: "0.8rem", padding: "4px 8px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", width: "100%", boxSizing: "border-box", textAlign: "start" };
    if (p.qtype === "enum") {
      return (
        <select value={v ?? ""} onChange={(e) => set(e.target.value)} style={base}>
          {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (p.qtype === "bool") {
      return (
        <select value={String(v)} onChange={(e) => set(e.target.value === "true")} style={base}>
          <option value="true">{t.yes}</option>
          <option value="false">{t.no}</option>
        </select>
      );
    }
    const display = Array.isArray(v) ? v.join(", ") : v ?? "";
    return <input value={display} onChange={(e) => set(e.target.value)} style={base} />;
  }

  if (phase === "idle" || phase === "loading" || phase === "uploading") {
    const busy = phase !== "idle";
    const inputId = `autofill-upload-${pid}`;
    const btn = { fontSize: "0.82rem", padding: "8px 14px", border: "1px solid rgba(124,109,245,0.45)", color: "#9b8cff", borderRadius: "var(--r-sm)", background: "rgba(124,109,245,0.06)", cursor: busy ? "default" : "pointer", display: "inline-block" };
    return (
      <div style={{ marginBottom: 14, width: "100%", boxSizing: "border-box" }} dir={ar ? "rtl" : "ltr"}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label htmlFor={inputId} style={{ ...btn, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            {phase === "uploading" ? t.uploading : (phase === "loading" ? t.analyzing : t.upload)}
          </label>
          <input id={inputId} type="file" multiple style={{ display: "none" }} disabled={busy}
            accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"
            onChange={(e) => handleUpload(e.target.files)} />
          <button className="ghost" onClick={analyze} disabled={busy}
            style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
            {t.analyzeExisting}
          </button>
        </div>
        {busy && (
          <div className="autofill-progress" aria-label="processing">
            <div className="autofill-progress-bar" />
          </div>
        )}
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 6 }}>
          {phase === "uploading" ? t.uploading : (phase === "loading" ? t.analyzing : t.hint)}
        </div>
        {error && <div style={{ fontSize: "0.72rem", color: "var(--danger, #e66)", marginTop: 4 }}>{error}</div>}
      </div>
    );
  }

  const nChecked = proposals.filter((p) => checked[p.question_id]).length;

  return (
    <div dir={ar ? "rtl" : "ltr"} style={{ marginBottom: 16, padding: "12px", width: "100%", boxSizing: "border-box", textAlign: "start", background: "rgba(124,109,245,0.05)", border: "1px solid rgba(124,109,245,0.25)", borderRadius: "var(--r-sm)" }}>
      <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#9b8cff", marginBottom: 8 }}>{t.title}</div>
      {proposals.length === 0 ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-sub)" }}>{t.none}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          {proposals.map((p) => (
            <div key={p.question_id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start", width: "100%", padding: "6px 0", borderBottom: "1px solid var(--border)", boxSizing: "border-box" }}>
              <input type="checkbox" checked={!!checked[p.question_id]} style={{ marginTop: 4 }}
                onChange={(e) => setChecked((s) => ({ ...s, [p.question_id]: e.target.checked }))} />
              <div style={{ minWidth: 0, textAlign: "start" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text)", marginBottom: 4 }}>{prompt(p)}</div>
                {valueEditor(p)}
                <div style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{Math.round(p.confidence * 100)}%</span>
                  <span style={{ color: p.verified ? "#7bd88f" : "var(--text-dim)" }}>
                    {p.verified ? "✓ " + t.verified : "• " + t.unverified}
                  </span>
                  {p.evidence && <span title={p.evidence} style={{ fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{t.source}: « {p.evidence} »</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: "0.72rem", color: "var(--danger, #e66)", margin: "6px 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="primary" disabled={phase === "applying" || nChecked === 0} onClick={apply}
          style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
          {phase === "applying" ? "…" : `${t.apply} ${nChecked} ${t.fields}`}
        </button>
        <button className="ghost" disabled={phase === "applying"} onClick={() => { setPhase("idle"); setProposals([]); }}
          style={{ fontSize: "0.8rem", padding: "6px 14px" }}>{t.cancel}</button>
      </div>
    </div>
  );
}
