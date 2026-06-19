import { useEffect, useState } from "react";
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

// stepState: 0 = all pending, 1 = step 0 active, 2 = step 0 done + step 1 active, etc.
export default function Processing({ lang }) {
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
    </div>
  );
}
