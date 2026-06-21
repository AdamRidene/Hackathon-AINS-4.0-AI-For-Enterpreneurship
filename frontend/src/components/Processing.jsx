import { useEffect, useState, useRef } from "react";
import Rive from "@rive-app/react-canvas";
import logoRiv from "../../assets/logo_firasa.riv";

const STEPS = {
  fr: [
    "Classification du stade",
    "Calcul des indicateurs de maturité",
    "Construction de la feuille de route",
  ],
  ar: [
    "تصنيف مرحلة المشروع",
    "احتساب مؤشرات التقييم",
    "بناء خارطة الطريق",
  ],
};

const TOTAL_DURATION = 20000; // 20 seconds to reach 95%
const TARGET_PROGRESS = 95;

// Ease-out-cubic easing: fast start, decelerates
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function Processing({ lang }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(20);
  const ar = lang === "ar";
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  // Step progression timers spread across ~20s
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 8000),
      setTimeout(() => setStep(3), 16000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Animated progress bar: 0→95% over 20s with easeOutCubic
  useEffect(() => {
    startTimeRef.current = performance.now();

    function tick(now) {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / TOTAL_DURATION, 1);
      const eased = easeOutCubic(t);
      const value = eased * TARGET_PROGRESS;
      setProgress(value);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
      // At t=1 the bar stops at 95% — pulse CSS takes over
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Countdown timer: 20 → 0
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const labels = STEPS[lang];
  const atCeiling = progress >= TARGET_PROGRESS - 0.5;

  function stepClass(idx) {
    if (step > idx + 1) return "proc-step done";
    if (step === idx + 1) return "proc-step active";
    return "proc-step";
  }

  function stepIcon(idx) {
    if (step > idx + 1) return "✓";
    if (step === idx + 1) return "◌";
    return String(idx + 1);
  }

  const countdownLabel = ar
    ? countdown > 0
      ? `~${countdown} ثانية`
      : ar ? "لحظات قليلة…" : "quelques instants…"
    : countdown > 0
    ? `~${countdown} secondes`
    : "quelques instants…";

  return (
    <div className="processing-wrap" dir={ar ? "rtl" : "ltr"}>
      <div className="processing-rive-container">
        <Rive src={logoRiv} />
      </div>

      <p className="processing-title">
        {ar ? "جارٍ تحليل بياناتك…" : "Analyse en cours…"}
      </p>

      <div className="processing-steps">
        {labels.map((label, idx) => (
          <div key={idx} className={stepClass(idx)}>
            <div className="proc-icon">{stepIcon(idx)}</div>
            <span className="proc-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 24,
        width: "100%",
        maxWidth: 360,
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}>
          <span style={{
            fontSize: "0.75rem",
            color: "var(--text-sub, rgba(255,255,255,0.45))",
            letterSpacing: "0.03em",
          }}>
            {ar ? "تقدم التحليل" : "Progression de l'analyse"}
          </span>
          <span style={{
            fontSize: "0.75rem",
            color: "var(--text-sub, rgba(255,255,255,0.45))",
            fontVariantNumeric: "tabular-nums",
          }}>
            {Math.round(progress)}%
          </span>
        </div>

        {/* Track */}
        <div style={{
          width: "100%",
          height: 6,
          borderRadius: 99,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          position: "relative",
        }}>
          {/* Fill */}
          <div style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: 99,
            background: "linear-gradient(90deg, #6366f1 0%, #818cf8 60%, #a5b4fc 100%)",
            transition: "width 0.05s linear",
            position: "relative",
            ...(atCeiling ? {
              animation: "proc-bar-pulse 1.8s ease-in-out infinite",
            } : {}),
          }} />
        </div>

        {/* Estimated time hint */}
        <div style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: "0.72rem",
          color: "var(--text-sub, rgba(255,255,255,0.35))",
          letterSpacing: "0.02em",
          fontStyle: "italic",
        }}>
          {countdown > 0
            ? (ar ? `الوقت المقدر: ${countdownLabel}` : `Temps estimé : ${countdownLabel}`)
            : (ar ? "جارٍ الانتهاء…" : "Finalisation en cours…")}
        </div>
      </div>

      <style>{`
        @keyframes proc-bar-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
          50% { opacity: 0.75; box-shadow: 0 0 8px 2px rgba(129, 140, 248, 0.4); }
        }
      `}</style>
    </div>
  );
}
