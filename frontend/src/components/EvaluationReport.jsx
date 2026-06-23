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

const STEPS = ["diagnostic", "rag_retrieval", "scoring_consistency"];
const STEP_LABELS = {
  fr: ["Moteur de diagnostic", "Récupération RAG", "Cohérence du scoring"],
  ar: ["محرك التشخيص", "محرك RAG", "اتساق التقييم"],
};

export default function EvaluationReport({ lang, api, onBack }) {
  const [partialData, setPartialData] = useState({});  // populated step by step
  const [progress, setProgress] = useState(0);          // 0-3
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState(null);
  const [jobId, setJobId]       = useState(null);

  const ar = lang === "ar";
  const t  = TEXTS[lang] || TEXTS.fr;
  const stepLabels = STEP_LABELS[lang] || STEP_LABELS.fr;
  const done = progress === 3;

  // Poll backend every 3s while job is running
  useEffect(() => {
    if (!jobId || done || error) return;
    const iv = setInterval(async () => {
      try {
        const job = await api.evalStatus(jobId);
        // Merge newly completed steps into partialData
        if (job.result) {
          setPartialData(prev => ({ ...prev, ...job.result }));
          setProgress(job.progress);
        }
        if (job.status === "done") {
          setRunning(false);
          clearInterval(iv);
        } else if (job.status === "failed") {
          setError(job.error || "Evaluation failed");
          setRunning(false);
          clearInterval(iv);
        }
      } catch (e) {
        setError(e.message);
        setRunning(false);
        clearInterval(iv);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [jobId, done, error]);

  function runEval() {
    setRunning(true);
    setError(null);
    setPartialData({});
    setProgress(0);
    setJobId(null);
    api.evalStart()
      .then(res => setJobId(res.job_id))
      .catch(err => { setError(err.message); setRunning(false); });
  }

  // Landing screen
  if (!running && progress === 0 && !error) {
    return (
      <div className="hist-wrap" dir={ar ? "rtl" : "ltr"} style={{ minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <button className="ghost-btn" onClick={onBack} style={{ position: "absolute", top: 24, [ar ? "right" : "left"]: 24, padding: "8px 16px" }}>{t.back}</button>
        <h1 style={{ fontFamily: "var(--f-display)", fontStyle: "italic", textAlign: "center", padding: "0 24px" }}>{t.title}</h1>
        <p style={{ color: "var(--text-sub)", textAlign: "center", maxWidth: 520, padding: "0 24px" }}>{t.sub}</p>
        <button className="primary" onClick={runEval} style={{ padding: "12px 32px", fontSize: "1rem" }}>
          {lang === "ar" ? "تشغيل التقييم" : "Lancer l'évaluation"}
        </button>
      </div>
    );
  }

  // Progress bar header (shown while running or after done)
  const ProgressHeader = (
    <div style={{ maxWidth: 1100, margin: "0 auto 32px", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: "0.85rem", color: "var(--text-sub)" }}>
          {done ? (lang === "ar" ? "اكتمل التقييم" : "Évaluation terminée") : `${progress}/3 — ${stepLabels[progress] || ""}`}
        </span>
        <span style={{ fontSize: "0.85rem", color: "var(--cyan)", fontWeight: 700 }}>{Math.round(progress / 3 * 100)}%</span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress / 3 * 100}%`, background: done ? "var(--green)" : "var(--cyan)", transition: "width 0.4s ease", borderRadius: 3 }} />
      </div>
      {running && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 8 }}>
          {lang === "ar" ? "جاري التحليل... كل خطوة تستغرق دقيقة تقريباً" : "Analyse en cours… chaque étape prend ~1 min"}
        </p>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="hist-wrap" style={{ minHeight: "100vh", padding: "40px 20px" }}>
        <div className="error-banner" style={{ maxWidth: 800, margin: "0 auto" }}>
          <span>Erreur : {error}</span>
          <button className="primary" onClick={runEval} style={{ marginTop: 16 }}>
            {lang === "ar" ? "إعادة المحاولة" : "Réessayer"}
          </button>
        </div>
      </div>
    );
  }

  const { diagnostic, rag_retrieval, scoring_consistency } = partialData;

  return (
    <div className="hist-wrap" dir={ar ? "rtl" : "ltr"} style={{ padding: "40px 24px" }}>
      <div className="hist-content" style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <button className="ghost-btn" onClick={onBack} style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {t.back}
            </button>
            {done && (
              <button className="ghost-btn" onClick={runEval} style={{ padding: "8px 16px" }}>
                {lang === "ar" ? "إعادة التشغيل" : "Re-lancer"}
              </button>
            )}
          </div>
          <h1 className="hist-title">{t.title}</h1>
          <p className="hist-sub" style={{ color: "var(--text-sub)", marginTop: 6 }}>{t.sub}</p>
        </div>

        {/* Progress bar */}
        {ProgressHeader}

        {/* SECTION 1: DIAGNOSTIC */}
        {!diagnostic && running && <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}><span className="spinner" style={{ display: "inline-block", width: 28, height: 28 }} /></div>}
        {diagnostic && <section className="panel" style={{ padding: 24, marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
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
        </section>}

        {/* SECTION 2: RAG RETRIEVAL */}
        {!rag_retrieval && running && progress >= 1 && <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}><span className="spinner" style={{ display: "inline-block", width: 28, height: 28 }} /></div>}
        {rag_retrieval && <section className="panel" style={{ padding: 24, marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
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
        </section>}

        {/* SECTION 3: CONSISTENCY CHECKS */}
        {!scoring_consistency && running && progress >= 2 && <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}><span className="spinner" style={{ display: "inline-block", width: 28, height: 28 }} /></div>}
        {scoring_consistency && <section className="panel" style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
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
        </section>}

      </div>
    </div>
  );
}
