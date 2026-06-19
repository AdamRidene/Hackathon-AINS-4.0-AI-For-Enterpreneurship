import { useState } from "react";

const SECTOR_LABELS = {
  fr: { "agri-food":"Agri-food","digital-saas":"SaaS & Numérique","industry":"Industrie","health":"Santé","greentech":"CleanTech","services":"Services","other":"Autre" },
  ar: { "agri-food":"الصناعات الغذائية","digital-saas":"البرمجيات الرقمية","industry":"الصناعة","health":"الصحة","greentech":"التكنولوجيا الخضراء","services":"الخدمات","other":"قطاع آخر" },
};

export default function Landing({ lang, setLang, health, history, busy, onStart, onResume, onViewHistory }) {
  const [name, setName]       = useState("");
  const [loadId, setLoadId]   = useState("");

  const ar = lang === "ar";
  const t  = TEXTS[lang];

  const canStart = !busy && name.trim() && health?.status !== "down";

  return (
    <div className="landing-wrap" dir={ar ? "rtl" : "ltr"}>

      {/* ── Topbar ── */}
      <header className="landing-topbar">
        <div className="topbar-brand">
          <span className="brand-ar">فِراسة</span>
          <div className="brand-divider" />
          <div>
            <div className="brand-title">{t.brandTitle}</div>
            <div className="brand-sub">{t.brandSub}</div>
          </div>
        </div>

        <div className="topbar-right">
          {health && (
            <div className="status-pill">
              <span className={`status-dot${health.status !== "ok" ? " down" : ""}`} />
              {health.status === "ok"
                ? <span>API <b>{t.online}</b> · {health.llm_provider}</span>
                : <span>API <b>{t.offline}</b></span>}
            </div>
          )}
          <button className="hist-link-btn" onClick={onViewHistory}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3h18v4H3z"/><path d="M3 11h18v4H3z"/><path d="M3 19h18v4H3z"/>
            </svg>
            {t.historyBtn}
          </button>
          <div className="lang-toggle">
            <button className={`lang-btn${lang === "fr" ? " active" : ""}`} onClick={() => setLang("fr")}>FR</button>
            <button className={`lang-btn${lang === "ar" ? " active" : ""}`} onClick={() => setLang("ar")}>عربي</button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="landing-hero">
        <div className="landing-eyebrow">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
          {t.eyebrow}
        </div>

        <h1 className="landing-headline">
          {t.headline1}<br /><em>{t.headline2}</em>
        </h1>

        <p className="landing-sub">{t.sub}</p>

        {/* Project name form */}
        <form
          className="landing-form"
          onSubmit={e => { e.preventDefault(); if (canStart) onStart(name); }}
        >
          <input
            value={name}
            placeholder={t.placeholder}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="primary" disabled={!canStart}>
            {busy ? <span className="spinner" /> : t.cta}
          </button>
        </form>

        {/* Recent audits */}
        {history.length > 0 && (
          <div className="landing-history">
            <div className="landing-history-label">{t.recent}</div>
            <div className="landing-chips">
              {history.map((h, i) => (
                <button key={i} className="landing-chip" onClick={() => onResume(h.project_id)} disabled={busy}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{h.name}</span>
                  {h.sector && <span style={{ opacity:.5, fontSize:"0.72rem" }}>{SECTOR_LABELS[lang][h.sector] || h.sector}</span>}
                </button>
              ))}
            </div>

            {/* Load by ID */}
            <div className="landing-load-row" style={{ margin: "20px auto 0", justifyContent: "center" }}>
              <input
                value={loadId}
                placeholder={t.loadPlaceholder}
                onChange={e => setLoadId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadId.trim() && onResume(loadId.trim())}
                style={{ maxWidth: 280 }}
              />
              <button
                onClick={() => loadId.trim() && onResume(loadId.trim())}
                disabled={busy || !loadId.trim()}
              >
                {t.loadBtn}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const TEXTS = {
  fr: {
    brandTitle: "Firasa", brandSub: "Moteur d'orientation entrepreneuriale",
    online: "en ligne", offline: "hors ligne",
    eyebrow: "Auditeur algorithmique · Écosystème tunisien",
    headline1: "Un auditeur,",
    headline2: "pas un chatbot.",
    sub: "Firasa collecte des preuves, confronte votre auto-évaluation aux faits, calcule des scores explicables à portes, et génère une feuille de route ancrée dans l'écosystème tunisien réel.",
    placeholder: "Nommez votre projet…",
    cta: "Démarrer l'audit →",
    recent: "Reprendre un audit",
    loadPlaceholder: "ID de projet…",
    loadBtn: "Charger",
    historyBtn: "Historique",
  },
  ar: {
    brandTitle: "فِراسة", brandSub: "محرّك التوجيه الريادي",
    online: "متصل", offline: "غير متصل",
    eyebrow: "مدقق خوارزمي · النظام الريادي التونسي",
    headline1: "مدقّق هيكلي،",
    headline2: "لا مجيب آلي.",
    sub: "يجمع فراسة الأدلة، يقارن تقييمك بالواقع، يحتسب مؤشرات مُفسَّرة، ويبني مسارك بناءً على المؤسسات التونسية الحقيقية.",
    placeholder: "سمِّ مشروعك…",
    cta: "← بدء التدقيق",
    recent: "استئناف تدقيق",
    loadPlaceholder: "معرّف المشروع…",
    loadBtn: "تحميل",
    historyBtn: "السجل",
  },
};
