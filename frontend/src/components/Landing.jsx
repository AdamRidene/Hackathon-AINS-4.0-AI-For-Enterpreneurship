import { useState, useEffect, useRef } from "react";
import { SECTOR_LABELS } from "../constants.js";

function ArabicWindBackground({ theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animationId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles = [];
    const embers = [];
    const particleCount = 80;
    const emberCount = 30;

    const mouse = { x: -1000, y: -1000 };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    const isLight = theme === "light";
    const colors = isLight
      ? [
          "rgba(74, 123, 247, 0.45)",
          "rgba(6, 182, 212, 0.42)",
          "rgba(180, 110, 0, 0.35)",
        ]
      : [
          "rgba(74, 123, 247, 0.35)",
          "rgba(6, 182, 212, 0.3)",
          "rgba(234, 179, 8, 0.22)",
        ];

    // Wind-driven particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 1.5 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        frequency: Math.random() * 0.008 + 0.003,
      });
    }

    // Rising embers — drift upward slowly, fade in/out
    for (let i = 0; i < emberCount; i++) {
      embers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.4 + 0.15,
        opacity: Math.random(),
        phase: Math.random() * Math.PI * 2,
        pulse: Math.random() * 0.02 + 0.005,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Wind particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.frequency;
        const windX = Math.cos(p.angle) * 0.15 + 0.2;
        const windY = Math.sin(p.angle) * 0.08;
        p.vx += windX * 0.03;
        p.vy += windY * 0.03;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110 && dist > 0) {
          const force = (110 - dist) / 110;
          const fx = (dx / dist) * force * 4.5;
          const fy = (dy / dist) * force * 4.5;
          p.vx += fx;
          p.vy += fy;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      // Rising embers
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.y -= e.speed;
        e.phase += e.pulse;
        if (e.y < -10) { e.y = height + 10; e.x = Math.random() * width; }
        const alpha = e.opacity * (0.5 + 0.5 * Math.sin(e.phase));
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = e.color.replace(/[\d.]+\)$/, `${alpha.toFixed(2)})`);
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.85,
      }}
    />
  );
}

export default function Landing({ lang, setLang, theme, setTheme, health, history, busy, onStart, onViewProject, onViewHistory, user, plan, openProfile }) {

  const [projectName, setProjectName] = useState("");
  const ar = lang === "ar";
  const t  = TEXTS[lang] || TEXTS.fr;
  const canStart = !busy && health?.status !== "down";

  return (
    <div className="landing-wrap" dir={ar ? "rtl" : "ltr"}>
      <ArabicWindBackground theme={theme} />

      {/* ── Hero ── */}
      <main className="landing-hero">
        <h1 className="landing-headline">
          {t.headline1}<br /><em>{t.headline2}</em>
        </h1>

        <p className="landing-sub">{t.sub}</p>

        {/* CTA buttons with name input */}
        <form
          className="landing-form"
          onSubmit={e => { e.preventDefault(); if (canStart && projectName.trim()) onStart(projectName.trim()); }}
          style={{ maxWidth: "420px", margin: "0 auto", marginTop: "24px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder={t.namePlaceholder}
              dir={ar ? "rtl" : "ltr"}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(8px)",
                color: "var(--text)",
                fontSize: "1rem",
                textAlign: ar ? "right" : "left",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                marginBottom: "4px",
              }}
              required
            />
            <div style={{ display: "flex", gap: "12px", width: "100%", flexWrap: "wrap", justifyContent: "center" }}>
              <button type="submit" className="primary" disabled={!canStart || !projectName.trim()} style={{ flex: 1.5, height: "48px", minWidth: "180px" }}>
                {busy ? <span className="spinner" /> : t.cta}
              </button>
              <button type="button" className="ghost" onClick={onViewHistory} style={{ flex: 1, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", height: "48px", minWidth: "120px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h18v4H3z"/><path d="M3 11h18v4H3z"/><path d="M3 19h18v4H3z"/>
                </svg>
                <span>{t.historyBtn}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Recent audits */}
        {history.length > 0 && (
          <div className="landing-history">
            <div className="landing-history-label">{t.recent}</div>
            <div className="landing-chips">
              {history.map((h, i) => (
                <button key={i} className="landing-chip" onClick={() => onViewProject(h.project_id)} disabled={busy}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{h.name && h.name.trim() && h.name !== "—" ? h.name : (ar ? "مشروع بدون اسم" : "Projet sans nom")}</span>
                  {h.sector && <span style={{ opacity:.5, fontSize:"0.72rem" }}>{SECTOR_LABELS[lang]?.[h.sector] || h.sector}</span>}
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
    namePlaceholder: "Nom de votre projet ou startup…",
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
    namePlaceholder: "اسم مشروعك أو فكرتك…",
    cta: "← بدء التدقيق",
    recent: "استئناف تدقيق",
    historyBtn: "السجل",
  },
};
