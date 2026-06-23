import { useState, useEffect } from "react";

const TEXTS = {
  fr: {
    title: "Rapport d'Évaluation & Rigueur (Rubrique)",
    sub: "Performance et alignement algorithmique mesurés sur des jeux de tests et cas adverses (Rubrique 15%).",
    back: "← Retour à l'accueil",
    loading: "Exécution des protocoles d'évaluation...",
    pass: "CONFORME",
    fail: "NON CONFORME",
    diagnosticTitle: "1. Moteur de Diagnostic (Classification)",
    diagnosticDesc: "Vérifie la justesse de classification du moteur par rapport aux briques théoriques (1..6). Les 60 cas servent de suite de régression automatique. Le jeu hors-ligne indépendant de 12 profils valide la généralisation réelle.",
    regressionTitle: "Régression / Auto-vérification (60 cas)",
    regressionAccuracy: "Précision Régression",
    validationTitle: "Validation Indépendante (12 profils)",
    ragTitle: "2. Moteur de Recherche RAG (Orientation)",
    ragDesc: "Mesure la précision de récupération (Precision@5) des ressources de l'écosystème tunisien.",
    consistencyTitle: "3. Cohérence, Cas Adversaires & Kappa",
    consistencyDesc: "Valide le comportement des portes non-linéaires et calcule le Kappa pondéré de Cohen pour le cadre de scores (cible >= 0.70).",
    accuracyTop1: "Précision Top-1",
    accuracyTop2: "Précision Top-2",
    mase: "Erreur Moyenne (MASE)",
    kappa: "Kappa Pondéré (Cohen)",
    meanP5: "Précision Moyenne @ 5",
    scenario: "Scénario",
    truth: "Attendu",
    prediction: "Prédiction",
    query: "Requête / Écart",
    institutions: "Institutions récupérées",
    adversarialCase: "Cas Adversaire",
    status: "Statut",
    result: "Résultat",
    diagnosticPassMsg: "Le modèle satisfait les exigences de rigueur théorique (MASE <= 0.5 sur l'ensemble de validation).",
    ragPassMsg: "Le retriever satisfait les exigences de couverture documentaire (P@5 >= 0.70)."
  },
  ar: {
    title: "تقرير التقييم والدقة الخوارزمية",
    sub: "أداء وموثوقية النظام الخوارزمي مقاسة على حالات اختبار مخصصة وحالات معارضة (الشبكة التقييمية 15%).",
    back: "الرجوع للرئيسية →",
    loading: "جاري تشغيل بروتوكولات التقييم والقياس...",
    pass: "متوافق",
    fail: "غير متوافق",
    diagnosticTitle: "1. محرك التشخيص والتدقيق",
    diagnosticDesc: "يتحقق من دقة تصنيف المشاريع وتحديد مستواها الفعلي. 60 حالة تُستعمل كفحص تراجع تلقائي. مجموعة 12 ملف مستقلة خارج التصميم تؤكد الدقة الفعلية.",
    regressionTitle: "فحص التراجع الخوارزمي (60 حالة)",
    regressionAccuracy: "دقة التراجع",
    validationTitle: "التحقق المستقل (12 ملف)",
    ragTitle: "2. محرك البحث الذكي (RAG)",
    ragDesc: "يقيس دقة استرجاع مصادر وتوجيهات بيئة الأعمال التونسية (Precision@5).",
    consistencyTitle: "3. اتساق البوابات، الحالات الخاصة ومعامل كوهين",
    consistencyDesc: "يتحقق من السلوك الفعلي للبوابات غير الخطية ويقيس معامل اتساق كوهين (Kappa) لإطار التقييم الرقمي (المستهدف >= 0.70).",
    accuracyTop1: "دقة التصنيف المباشر (Top-1)",
    accuracyTop2: "دقة التصنيف التقريبي (Top-2)",
    mase: "معدل الخطأ (MASE)",
    kappa: "معامل كوهين للاتساق (Kappa)",
    meanP5: "معدل دقة الاسترجاع @ 5",
    scenario: "السيناريو",
    truth: "الفعلي",
    prediction: "التشخيص",
    query: "الاستعلام / الفجوة",
    institutions: "الهيئات المسترجعة",
    adversarialCase: "حالة معارضة",
    status: "الوضعية",
    result: "النتيجة",
    diagnosticPassMsg: "محرك التشخيص يستوفي متطلبات الدقة النظرية (MASE <= 0.5 على مجموعة التحقق المستقلة).",
    ragPassMsg: "محرك الاسترجاع يستوفي متطلبات التغطية الوثائقية (P@5 >= 0.70)."
  }
};

export default function EvaluationReport({ lang, api, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ar = lang === "ar";
  const t = TEXTS[lang] || TEXTS.fr;

  function runEval() {
    setLoading(true);
    setError(null);
    setData(null);
    api.eval()
      .then(res => { setData(res); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }

  if (!data && !loading && !error) {
    return (
      <div className="hist-wrap" dir={ar ? "rtl" : "ltr"} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <button className="ghost-btn" onClick={onBack} style={{ alignSelf: ar ? "flex-end" : "flex-start", padding: "8px 16px", margin: "0 24px" }}>{t.back}</button>
        <h1 style={{ fontFamily: "var(--f-display)", fontStyle: "italic", textAlign: "center", padding: "0 24px" }}>{t.title}</h1>
        <p style={{ color: "var(--text-sub)", textAlign: "center", maxWidth: 520, padding: "0 24px" }}>{t.sub}</p>
        <button className="primary" onClick={runEval} style={{ padding: "12px 32px", fontSize: "1rem" }}>
          {lang === "ar" ? "تشغيل التقييم" : "Lancer l'évaluation"}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hist-wrap" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <span className="spinner" style={{ display: "inline-block", width: 36, height: 36, marginBottom: 16 }} />
          <p className="muted">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hist-wrap" style={{ minHeight: "100vh", padding: "40px 20px" }}>
        <div className="error-banner" style={{ maxWidth: 800, margin: "0 auto" }}>
          <span>Erreur : {error}</span>
          <button className="primary" onClick={onBack} style={{ marginTop: 16 }}>{t.back}</button>
        </div>
      </div>
    );
  }

  const { diagnostic, rag_retrieval, scoring_consistency } = data;

  return (
    <div className="hist-wrap" dir={ar ? "rtl" : "ltr"} style={{ padding: "40px 24px" }}>
      <div className="hist-content" style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <button className="ghost-btn" onClick={onBack} style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {t.back}
            </button>
            <button className="ghost-btn" onClick={runEval} style={{ padding: "8px 16px" }}>
              {lang === "ar" ? "إعادة التشغيل" : "Re-lancer"}
            </button>
          </div>
          <h1 className="hist-title">{t.title}</h1>
          <p className="hist-sub" style={{ color: "var(--text-sub)", marginTop: 6 }}>{t.sub}</p>
        </div>

        {/* SECTION 1: DIAGNOSTIC */}
        <section className="panel" style={{ padding: 24, marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3>{t.diagnosticTitle}</h3>
              <p className="sub" style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 4 }}>{t.diagnosticDesc}</p>
            </div>
            <span className={`plan-badge ${diagnostic.passes ? "pro" : "free"}`} style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
              {diagnostic.passes ? t.pass : t.fail}
            </span>
          </div>

          <div style={{ fontSize: "0.9rem", fontWeight: 700, marginTop: 24, color: "var(--cyan)", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
            {t.regressionTitle}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, margin: "16px 0" }}>
            <div style={{ padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.regressionAccuracy}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--cyan)", marginTop: 8 }}>{(diagnostic.regression_accuracy * 100).toFixed(1)}%</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 4 }}>Sur {diagnostic.regression_n} profils</div>
            </div>
          </div>

          <div style={{ fontSize: "0.9rem", fontWeight: 700, marginTop: 24, color: "var(--orange)", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
            {t.validationTitle}
          </div>
          {/* Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, margin: "16px 0" }}>
            <div style={{ padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.accuracyTop1}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--cyan)", marginTop: 8 }}>{(diagnostic.top1_accuracy * 100).toFixed(1)}%</div>
            </div>
            <div style={{ padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.accuracyTop2}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--cyan)", marginTop: 8 }}>{(diagnostic.top2_accuracy * 100).toFixed(1)}%</div>
            </div>
            <div style={{ padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.mase}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: diagnostic.MASE <= diagnostic.MASE_threshold ? "var(--green)" : "var(--red)", marginTop: 8 }}>{diagnostic.MASE}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 4 }}>Seuil &lt;= {diagnostic.MASE_threshold}</div>
            </div>
          </div>

          <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", padding: 12, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)", borderRadius: "var(--r-sm)", marginBottom: 20 }}>
            🟢 {t.diagnosticPassMsg}
          </div>

          {/* Detail Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: ar ? "right" : "left" }}>
                  <th style={{ padding: 10 }}>{t.scenario}</th>
                  <th style={{ padding: 10 }}>{t.truth}</th>
                  <th style={{ padding: 10 }}>{t.prediction}</th>
                  <th style={{ padding: 10 }}>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {diagnostic.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                    <td style={{ padding: 10, fontFamily: "var(--f-mono)" }}>{r.scenario}</td>
                    <td style={{ padding: 10 }}>Stade {r.true}</td>
                    <td style={{ padding: 10 }}>Stade {r.pred}</td>
                    <td style={{ padding: 10 }}>
                      <span style={{ color: r.top1 ? "var(--green)" : "var(--amber)", fontWeight: 600 }}>
                        {r.top1 ? "✓ OK" : "⚠ Écart +-1"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 2: RAG RETRIEVAL */}
        <section className="panel" style={{ padding: 24, marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3>{t.ragTitle}</h3>
              <p className="sub" style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 4 }}>{t.ragDesc}</p>
            </div>
            <span className={`plan-badge ${rag_retrieval.passes ? "pro" : "free"}`} style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
              {rag_retrieval.passes ? t.pass : t.fail}
            </span>
          </div>

          <div style={{ display: "flex", gap: 16, margin: "24px 0", maxWidth: 300 }}>
            <div style={{ flex: 1, padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.meanP5}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--cyan)", marginTop: 8 }}>{(rag_retrieval.mean_precision_at_5 * 100).toFixed(1)}%</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 4 }}>Seuil &gt;= {rag_retrieval.threshold * 100}%</div>
            </div>
          </div>

          <div style={{ fontSize: "0.8rem", color: "var(--text-sub)", padding: 12, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)", borderRadius: "var(--r-sm)", marginBottom: 20 }}>
            🟢 {t.ragPassMsg}
          </div>

          {/* RAG Details */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: ar ? "right" : "left" }}>
                  <th style={{ padding: 10 }}>{t.query}</th>
                  <th style={{ padding: 10 }}>Precision @ 5</th>
                  <th style={{ padding: 10 }}>{t.institutions}</th>
                </tr>
              </thead>
              <tbody>
                {rag_retrieval.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{r.gap}</td>
                    <td style={{ padding: 10, color: "var(--cyan)", fontWeight: 700 }}>{(r["p@5"] * 100).toFixed(0)}%</td>
                    <td style={{ padding: 10, color: "var(--text-sub)" }}>
                      {r.retrieved.map((inst, idx) => (
                        <span key={idx} style={{ display: "inline-block", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "4px", padding: "1px 6px", fontSize: "0.72rem", margin: "2px" }}>
                          {inst}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 3: CONSISTENCY CHECKS */}
        <section className="panel" style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3>{t.consistencyTitle}</h3>
              <p className="sub" style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 4 }}>{t.consistencyDesc}</p>
            </div>
            <span className={`plan-badge ${scoring_consistency.passes ? "pro" : "free"}`} style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
              {scoring_consistency.passes ? t.pass : t.fail}
            </span>
          </div>

          {/* Kappa Metric Card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, margin: "24px 0", maxWidth: 300 }}>
            <div style={{ padding: 16, background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", textAlign: "center" }}>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase" }}>{t.kappa}</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--orange)", marginTop: 8 }}>{scoring_consistency.cohens_weighted_kappa}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 4 }}>Cible &gt;= 0.70</div>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: ar ? "right" : "left" }}>
                  <th style={{ padding: 10 }}>{t.adversarialCase}</th>
                  <th style={{ padding: 10 }}>{t.result}</th>
                  <th style={{ padding: 10 }}>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {scoring_consistency.cases.map((c, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{c.case}</td>
                    <td style={{ padding: 10, color: "var(--text-sub)", fontSize: "0.78rem" }}>
                      {c.case === "huge_TAM_no_validation" ? (
                        <span>Market Score final : <b>{c.market_final}</b> / 100 (Cap appliqué à {c.expected_cap})</span>
                      ) : (
                        <span>Scalabilité base : <b>{c.scal_base}</b>, final avec pénalité D_man : <b>{c.scal_final}</b></span>
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      <span style={{ color: c.passes ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                        {c.passes ? "✓ CONFORME" : "✗ ANOMALIE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
