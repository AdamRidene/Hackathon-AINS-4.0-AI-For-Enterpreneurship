import React, { useEffect, useMemo, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

const FALLBACK_FORMULAS = {
  Market: String.raw`S_M = w_{M1}\cdot \min\left(\frac{\ln T}{\ln 10^7},1\right)\cdot 100 + w_{M2}\cdot \max(0,100-5C) + w_{M3}\cdot R_{MV}`,
  'Commercial Offer': String.raw`S_C = w_{C1}\cdot P_{coh} + w_{C2}\cdot R_{MVP}\cdot 100 + w_{C3}\cdot A_{price}`,
  Innovation: String.raw`S_I = w_{I1}\cdot N_{geo} + w_{I2}\cdot \min\left(\frac{|T_{stack}|}{5},1\right)\cdot 100 + w_{I3}\cdot I_{ip}`,
  Scalability: String.raw`S_S = w_{S1}\cdot \left(100-\frac{C_{month}}{C_{baseline}}\cdot 100\right) + w_{S2}\cdot \min\left(\frac{|E|}{3},1\right)\cdot 100 + w_{S3}\cdot \frac{10-D_{man}}{10}\cdot 100`,
  Green: String.raw`S_G = w_{G1}\cdot F_p + w_{G2}\cdot R_c + w_{G3}\cdot \min\left(\frac{|SDG|}{17},1\right)\cdot 100`,
};

const CRITERION_LABELS_OV = {
  fr: {
    tam: 'TAM', competition: 'Concurrence', revenue_viability: 'Viabilité revenus',
    vp_coherence: 'Cohérence VP', mvp_readiness: 'Préparation MVP', pricing: 'Prix',
    geo_novelty: 'Nouveauté géographique', tech_stack: 'Stack tech', ip_status: 'PI',
    cost_decoupling: 'Découplage coûts', geo_reach: 'Portée géographique', deployment: 'Déploiement',
    footprint: 'Empreinte', circularity: 'Circularité', sdg: 'ODD',
  },
  ar: {
    tam: 'حجم السوق', competition: 'المنافسة', revenue_viability: 'إمكانية تحقيق الإيرادات',
    vp_coherence: 'اتساق عرض القيمة', mvp_readiness: 'جاهزية MVP', pricing: 'التسعير',
    geo_novelty: 'التجديد الجغرافي', tech_stack: 'المنصة التكنولوجية', ip_status: 'حالة الملكية الفكرية',
    cost_decoupling: 'فصل التكاليف', geo_reach: 'الوصول الجغرافي', deployment: 'النشر',
    footprint: 'البصمة البيئية', circularity: 'التدوير', sdg: 'أهداف التنمية المستدامة',
  },
};

const TEXTS_OV = {
  fr: { returnTo: '← Retour au tableau', finalScore: 'Score final', formula: 'Formule mathématique', anchor: 'Cadre de référence :', contributions: 'Contributions', missing: 'Données manquantes :', gate: 'Alerte porte :', improvement: 'Recommandation :' },
  ar: { returnTo: '← العودة إلى اللوحة', finalScore: 'النتيجة النهائية', formula: 'الصيغة الرياضية', anchor: 'الإطار المرجعي:', contributions: 'المساهمات', missing: 'البيانات المفقودة:', gate: 'تنبيه بوابة:', improvement: 'إرشادات التحسين:' },
};

const ScoreExplanationOverlay = ({ score, onClose, lang }) => {
  const overlayRef = useRef(null);
  const returnButtonRef = useRef(null);
  const ar = lang === 'ar';
  const t = TEXTS_OV[lang] || TEXTS_OV.fr;
  const critLabels = CRITERION_LABELS_OV[lang] || CRITERION_LABELS_OV.fr;
  const formulaMath = useMemo(() => {
    const backendFormula = score?.formula_latex?.trim();
    if (backendFormula) {
      return backendFormula;
    }
    return FALLBACK_FORMULAS[score?.dimension] || null;
  }, [score]);

  // Focus management for accessibility
  useEffect(() => {
    if (returnButtonRef.current) {
      returnButtonRef.current.focus();
    }
    // Save scroll position and current focus
    const previousFocus = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus && previousFocus.focus) {
        previousFocus.focus();
      }
    };
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!score) return null;

  return (
    <div 
      className="score-explanation-overlay" 
      ref={overlayRef}
      onClick={handleOverlayClick}
      dir={ar ? 'rtl' : 'ltr'}
    >
      <div className="score-explanation-content">
        <div className="score-explanation-header">
          <h2>
            {lang === 'ar'
              ? score.dimension === 'Market' ? 'مؤشر السوق'
                : score.dimension === 'Commercial Offer' ? 'مؤشر العرض التجاري'
                : score.dimension === 'Innovation' ? 'مؤشر الابتكار'
                : score.dimension === 'Scalability' ? 'مؤشر قابلية التوسع'
                : score.dimension === 'Green' ? 'المؤشر الأخضر'
                : score.dimension
              : score.dimension === 'Market' ? 'Score Marché'
                : score.dimension === 'Commercial Offer' ? 'Score Commercial'
                : score.dimension === 'Innovation' ? 'Score Innovation'
                : score.dimension === 'Scalability' ? 'Score Scalabilité'
                : score.dimension === 'Green' ? 'Score Green'
                : score.dimension
            }
          </h2>
          <button 
            ref={returnButtonRef}
            className="return-button"
            onClick={onClose}
            title={ar ? 'العودة' : 'Retour'}
          >
            {t.returnTo}
          </button>
        </div>
        
        <div className="score-display">
          <span className="score-label">{t.finalScore}</span>
          <span className="score-value" style={{ color: score.final_score >= 66 ? 'var(--green)' : score.final_score >= 40 ? 'var(--amber)' : 'var(--red)' }}>
            {score.final_score}
          </span>
          {score.base_score !== score.final_score && (
            <span className="score-base"> / {score.base_score}</span>
          )}
        </div>
        
        {formulaMath && (
          <div className="score-formula">
            <h3>{t.formula}</h3>
            <div className="formula-display">
              <BlockMath math={formulaMath} />
            </div>
          </div>
        )}

        {score.anchor_fr && (
          <div className="score-anchor">
            <strong>{t.anchor}</strong> {ar ? score.anchor_ar : score.anchor_fr}
          </div>
        )}

        <div className="score-contributions">
          <h3>{t.contributions}</h3>
          <div className="contributions-list">
            {score.contributions?.map((contrib, idx) => (
              <div key={idx} className="contribution-item">
                <div className="contribution-header">
                  <span className="contrib-name">{critLabels[contrib.criterion] || contrib.criterion}</span>
                  <span className="contrib-weight">× {contrib.weight}</span>
                  <span className="contrib-score" style={{ color: contrib.raw >= 66 ? 'var(--green)' : contrib.raw >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                    {contrib.weighted}
                  </span>
                </div>
                <div className="contrib-bar-track">
                  <div className="contrib-bar-fill" style={{ width: `${contrib.raw}%`, background: contrib.raw >= 66 ? 'var(--green)' : contrib.raw >= 40 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
                <div className="contrib-detail">{contrib.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {score.missing_inputs && score.missing_inputs.length > 0 && (
          <div className="score-missing">
            <strong>{t.missing}</strong> {score.missing_inputs.join(', ')}
          </div>
        )}

        {score.gate_triggered && (
          <div className="score-gate-notice">
            <strong>{t.gate}</strong> {ar ? score.gate_reason_ar : score.gate_reason_fr}
          </div>
        )}

        {(score.improvement_guidance_fr || score.improvement_guidance_ar) && (
          <div className="score-improvement">
            <strong>{t.improvement}</strong>
            <p>{ar ? score.improvement_guidance_ar : score.improvement_guidance_fr}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoreExplanationOverlay;
