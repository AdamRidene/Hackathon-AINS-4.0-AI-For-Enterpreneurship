import { useState } from "react";
import logoSvg from "../../assets/logo_first.svg";

const SECTOR_LABELS = {
  fr: { "agri-food":"Agri-food","digital-saas":"SaaS & Numérique","industry":"Industrie","health":"Santé","greentech":"CleanTech","services":"Services","other":"Autre" },
  ar: { "agri-food":"الصناعات الغذائية","digital-saas":"البرمجيات الرقمية","industry":"الصناعة","health":"الصحة","greentech":"التكنولوجيا الخضراء","services":"الخدمات","other":"قطاع آخر" },
};

export default function Landing({ lang, setLang, theme, setTheme, health, history, busy, onStart, onResume, onViewHistory, user, plan, openProfile }) {


  const ar = lang === "ar";
  const t  = TEXTS[lang];

  const canStart = !busy && health?.status !== "down";

  return (
    <div className="landing-wrap" dir={ar ? "rtl" : "ltr"}>

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
          onSubmit={e => { e.preventDefault(); if (canStart) onStart(ar ? "مشروعي" : "Mon Projet"); }}
          style={{ maxWidth: "480px", margin: "0 auto" }}
        >
          <div style={{ display: "flex", gap: "10px", width: "100%", flexWrap: "wrap" }}>
            <button type="submit" className="primary" disabled={!canStart} style={{ flex: 2, height: "46px" }}>
              {busy ? <span className="spinner" /> : t.cta}
            </button>
            <button type="button" className="ghost" onClick={onViewHistory} style={{ flex: 1, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", height: "46px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h18v4H3z"/><path d="M3 11h18v4H3z"/><path d="M3 19h18v4H3z"/>
              </svg>
              <span>{t.historyBtn}</span>
            </button>
          </div>
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
    headline1: "Diagnostiquez votre projet,",
    headline2: "avec des preuves.",
    sub: "Firasa guide l'échange comme un assistant intelligent, collecte les preuves clés, calcule des scores de maturité explicables et génère une feuille de route ancrée dans l'écosystème tunisien.",
    cta: "Démarrer l'audit →",
    recent: "Reprendre un audit",
    historyBtn: "Historique",
  },
  ar: {
    brandTitle: "فِراسة", brandSub: "محرّك التوجيه الريادي",
    online: "متصل", offline: "غير متصل",
    eyebrow: "مدقق خوارزمي · النظام الريادي التونسي",
    headline1: "شخّص مشروعك،",
    headline2: "بالأدلة القاطعة.",
    sub: "يقوم فراسة بجمع الأدلة الهامة، واحتساب مؤشرات نضج مفسّرة، ويولّد خارطة طريق مخصصة ملائمة لبيئة الأعمال التونسية الحقيقية.",
    cta: "← بدء التدقيق",
    recent: "استئناف تدقيق",
    historyBtn: "السجل",
  },
};
