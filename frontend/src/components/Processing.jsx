import React, { useEffect, useState } from "react";
import { useRive } from "@rive-app/react-canvas";
import logoRiv from "../../assets/logo_firasa.riv";
import logoSvg from "../../assets/logo_first.svg";

class RiveErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("Rive failed to initialize, falling back to CSS animation:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function RivePlayer({ src }) {
  const { RiveComponent } = useRive({
    src: src,
    autoplay: true,
  });

  return <RiveComponent />;
}

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

// stepState: 0 = all pending, 1 = step 0 active, 2 = step 0 done + step 1 active, etc.
export default function Processing({ lang, onCancel }) {
  const [step, setStep] = useState(0);
  const ar = lang === "ar";

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 200),
      setTimeout(() => setStep(2), 1100),
      setTimeout(() => setStep(3), 2100),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const labels = STEPS[lang];

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

  const fallbackSpinner = (
    <div className="processing-logo-spinner">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.95; filter: drop-shadow(0 0 15px rgba(249, 115, 22, 0.4)); }
          50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 30px rgba(249, 115, 22, 0.8)); }
        }
        .processing-logo-spinner {
          position: relative;
          width: 160px;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .processing-logo-svg {
          width: 100px;
          height: 100px;
          animation: pulseGlow 2.2s ease-in-out infinite;
        }
        .css-spinner {
          position: absolute;
          width: 150px;
          height: 150px;
          border: 4px solid rgba(255, 255, 255, 0.05);
          border-top: 4px solid var(--orange, #f97316);
          border-radius: 50%;
          animation: spin 1.2s linear infinite;
        }
      `}</style>
      <img src={logoSvg} alt="Loading..." className="processing-logo-svg" />
      <div className="css-spinner"></div>
    </div>
  );

  return (
    <div className="processing-wrap" dir={ar ? "rtl" : "ltr"}>
      <div className="processing-rive-container">
        <RiveErrorBoundary fallback={fallbackSpinner}>
          <RivePlayer src={logoRiv} />
        </RiveErrorBoundary>
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

      {onCancel && (
        <button
          onClick={onCancel}
          style={{ marginTop: "28px", background: "none", border: "1px solid var(--border)", color: "var(--text)", opacity: 0.5, padding: "8px 20px", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: "0.85rem" }}
        >
          {ar ? "إلغاء" : "Annuler"}
        </button>
      )}
    </div>
  );
}
