import { useEffect, useState } from "react";
import { api } from "./api.js";

// Multi-language UI texts
const TEXTS = {
  fr: {
    title: "Firasa",
    subtitle: "Moteur d'orientation entrepreneuriale",
    online: "en ligne",
    offline: "hors ligne",
    tagline: "Un auditeur algorithmique, pas un chatbot.",
    taglineSub: "Firasa confronte votre auto-évaluation aux preuves, calcule des scores explicables à portes, et trace une feuille de route ancrée dans l'écosystème tunisien réel.",
    pillar1Title: "Diagnostic adaptatif",
    pillar1Desc: "Collecte ramifiée et classification en 6 stades, avec détection de l'écart perception-réalité.",
    pillar2Title: "Scoring GWLC explicable",
    pillar2Desc: "Combinaison linéaire pondérée à portes non-linéaires — chaque score est traçable au critère près.",
    pillar3Title: "Parcours ancré (RAG)",
    pillar3Desc: "Chaque recommandation cite une institution tunisienne réelle : APII, BFPME, BTS, Startup Act...",
    projectNameLabel: "Nom du projet",
    projectNamePlaceholder: "Ex. AgriSmart Tunisie",
    startAudit: "Démarrer l'audit",
    recentAudits: "Audits récents",
    noRecent: "Aucun audit récent dans ce navigateur.",
    resume: "Reprendre",
    newAuditBtn: "Nouvel audit",
    partialAuditBtn: "Auditer maintenant (données partielles)",
    adaptiveIntake: "Collecte adaptative",
    adaptiveIntakeSub: "Le système choisit chaque question selon vos réponses précédentes — séquence ramifiée, jamais un formulaire figé.",
    validateContinue: "Valider et continuer",
    collected: "collecté",
    perceptionGapTitle: "Écart Perception-Réalité",
    declaredStage: "Stade Déclaré",
    evidenceStage: "Stade Classifié (Objectif)",
    confidence: "Confiance",
    gateLadderTitle: "Échelle de Maturité Diagnostic",
    activeGate: "PORTE ACTIVE",
    scorePanelTitle: "Scores GWLC Explicables",
    scorePanelSub: "Combinaison linéaire à portes. Cliquez sur une ligne pour voir le détail des critères.",
    scoreVector: "Vecteur",
    referenceFramework: "Cadre de référence",
    gateReason: "Règle de Gate active",
    missingData: "Données manquantes pour cette dimension",
    anomaliesTitle: "Alertes d'Incohérence Structurelle",
    anomaliesSub: "Incohérences logiques détectées entre vos différentes réponses par l'auditeur backend.",
    roadmapTitle: "Feuille de route (Mon Parcours)",
    roadmapSub: "Actions prioritaires et opportunités d'accompagnement basées sur votre profil.",
    roadmapChecked: "Terminée",
    assistantTitle: "Assistant Conseil Grounded",
    assistantSub: "Posez des questions sur votre diagnostic. Les réponses sont bridées et sourcées uniquement sur vos résultats et la base de connaissances.",
    askAssistantPlaceholder: "Ex. Quels financements s'offrent à moi à ce stade ?",
    send: "Envoyer",
    groundingContext: "Contexte de grounding utilisé par l'IA",
    sourcesUsed: "Sources citées",
    noSector: "Secteur non spécifié",
    reallocationMsg: "Réallocation automatique appliquée au stade objectif.",
    deltaPrev: "Auparavant",
    deltaCurr: "Actuel",
    deltaChange: "Évolution",
    yes: "Oui",
    no: "Non",
    commaSeparated: "Séparez les tags par des virgules",
    loadByIdLabel: "Charger par ID de projet",
    loadByIdBtn: "Charger",
  },
  ar: {
    title: "فِراسة",
    subtitle: "محرّك التوجيه والمرافقة الريادية",
    online: "متصل",
    offline: "غير متصل",
    tagline: "مُدقّق خوارزمي هيكلي، وليس مجرد مجيب آلي.",
    taglineSub: "يقوم نظام فِراسة بمقارنة تقييمك الذاتي بالأدلة الملموسة، ويحتسب مؤشرات أداء قابلة للتفسير مع قواعد تصفية صارمة، ويخطط مسار عمل مستند إلى مؤسسات النظام الريادي التونسي.",
    pillar1Title: "تشخيص تكيّفي",
    pillar1Desc: "جمع بيانات متفرع وتصنيف عبر 6 مراحل مع كشف الفجوة بين التقييم الذاتي والواقع الأداتي.",
    pillar2Title: "مؤشرات أداء مفسّرة",
    pillar2Desc: "دمج خطي مرجح مدعوم ببوابات غير خطية — كل مؤشر قابل للتتبع والتفكيك لكل معيار تفصيلي.",
    pillar3Title: "مسار موثق ومؤطر",
    pillar3Desc: "كل توصية تستند إلى برامج ومؤسسات تونسية حقيقية: APII ،BFPME ،BTS ،Startup Act...",
    projectNameLabel: "اسم المشروع",
    projectNamePlaceholder: "مثال: ذكاء فلاحي تونس",
    startAudit: "بدء التدقيق والتقييم",
    recentAudits: "عمليات التدقيق الأخيرة",
    noRecent: "لا توجد عمليات تدقيق محفوظة في هذا المتصفح.",
    resume: "استئناف التقييم",
    newAuditBtn: "تدقيق جديد",
    partialAuditBtn: "تدقيق الآن (بيانات جزئية)",
    adaptiveIntake: "جمع البيانات التكيفي",
    adaptiveIntakeSub: "يختار النظام كل سؤال بناءً على إجاباتك السابقة — تسلسل ديناميكي ذكي وليس استمارة جامدة.",
    validateContinue: "تأكيد ومتابعة",
    collected: "تم جمعه",
    perceptionGapTitle: "الفجوة بين التقييم الذاتي والواقع الملموس",
    declaredStage: "المرحلة المعلنة ذاتياً",
    evidenceStage: "المرحلة المحددة بالأدلة",
    confidence: "مستوى الثقة",
    gateLadderTitle: "سلم نضج المشروع بالأدلة",
    activeGate: "البوابة النشطة حالياً",
    scorePanelTitle: "مؤشرات التقييم القابلة للتفسير (GWLC)",
    scorePanelSub: "توليفة خطية خاضعة لبوابات تقييد. اضغط على أي بند لعرض تفاصيل احتساب المعايير.",
    scoreVector: "متجه الأداء",
    referenceFramework: "الإطار المرجعي المعتمد",
    gateReason: "قاعدة التقييد النشطة (Gate)",
    missingData: "البيانات الناقصة لهذا البعد التقييمي",
    anomaliesTitle: "تنبيهات التناقض والخلل الهيكلي",
    anomaliesSub: "تناقضات منطقية تم رصدها بين إجاباتك المختلفة بواسطة خوارزميات التدقيق الخلفية.",
    roadmapTitle: "خارطة الطريق (مساري الريادي)",
    roadmapSub: "خطوات عملية ذات أولوية وفرص مرافقة موجهة لملف مشروعك الخاص.",
    roadmapChecked: "مكتملة",
    assistantTitle: "المساعد الاستشاري الموثق",
    assistantSub: "اطرح أي سؤال حول تقييمك. الإجابات موثقة وتستند حصرياً إلى مخرجات تدقيقك وقاعدة المعارف.",
    askAssistantPlaceholder: "مثال: ما هي مصادر التمويل المتاحة لمشروعي في هذه المرحلة ؟",
    send: "إرسال",
    groundingContext: "السياق التوثيقي المستخدم من الذكاء الاصطناعي",
    sourcesUsed: "المصادر المرجعية المعتمدة",
    noSector: "القطاع غير محدد",
    reallocationMsg: "تم تطبيق إعادة التخصيص التلقائي للمرحلة الواقعية بالأدلة.",
    deltaPrev: "سابقاً",
    deltaCurr: "حالياً",
    deltaChange: "التغير",
    yes: "نعم",
    no: "لا",
    commaSeparated: "افصل بين الكلمات باستخدام الفاصلة",
    loadByIdLabel: "تحميل برقم المشروع (ID)",
    loadByIdBtn: "تحميل",
  }
};

const SECTOR_TRANSLATIONS = {
  fr: {
    "agri-food": "Agri-food / Agroalimentaire",
    "digital-saas": "SaaS & Numérique",
    "industry": "Industrie",
    "health": "Santé",
    "greentech": "CleanTech / GreenTech",
    "services": "Services",
    "other": "Autre secteur"
  },
  ar: {
    "agri-food": "الصناعات الغذائية والفلاحية",
    "digital-saas": "البرمجيات والحلول الرقمية",
    "industry": "الصناعة والإنتاج",
    "health": "الصحة والطب",
    "greentech": "التكنولوجيا النظيفة والخضراء",
    "services": "الخدمات والتعليم",
    "other": "قطاع آخر"
  }
};

const STAGE_TRANSLATIONS = {
  fr: {
    1: "Idéation (Ideation)",
    2: "Validation Marché (Market Validation)",
    3: "Structuration (Structuration)",
    4: "Levée de fonds (Fundraising)",
    5: "Planification du lancement (Launch Planning)",
    6: "Croissance (Growth)"
  },
  ar: {
    1: "مرحلة الفكرة (Idéation)",
    2: "التحقق من السوق (Market Validation)",
    3: "الهيكلة والتأسيس (Structuration)",
    4: "الاستعداد للتمويل (Fundraising)",
    5: "تخطيط الإطلاق (Launch Planning)",
    6: "النمو والتوسع (Growth)"
  }
};

export default function App() {
  const [phase, setPhase] = useState("start");
  const [lang, setLang] = useState(() => localStorage.getItem("firasa_lang") || "fr");
  const [health, setHealth] = useState(null);
  const [name, setName] = useState("");
  const [pid, setPid] = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [value, setValue] = useState("");
  const [audit, setAudit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  
  // Local history state
  const [history, setHistory] = useState([]);
  const [loadIdInput, setLoadIdInput] = useState("");

  // Completed Milestones (Persistent Checklist)
  const [checkedMilestones, setCheckedMilestones] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("firasa_checked_milestones") || "{}");
    } catch (_) {
      return {};
    }
  });

  // Assistant conversational state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [grounding, setGrounding] = useState("");
  const [showGrounding, setShowGrounding] = useState(false);
  const [expandedScore, setExpandedScore] = useState(null);

  // Load language settings
  useEffect(() => {
    localStorage.setItem("firasa_lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  // Load local audits history from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("firasa_history") || "[]");
      setHistory(saved);
    } catch (_) {
      setHistory([]);
    }
    
    // Check backend health
    api.health()
      .then(setHealth)
      .catch(() => setHealth({ status: "down" }));
  }, []);

  // Update localStorage checklist whenever checked milestones change
  useEffect(() => {
    localStorage.setItem("firasa_checked_milestones", JSON.stringify(checkedMilestones));
  }, [checkedMilestones]);

  const t = TEXTS[lang];

  // Helper to add project to local history
  function addToHistory(project_id, name, sector) {
    const item = { project_id, name, sector, timestamp: new Date().toLocaleString() };
    const filtered = history.filter(h => h.project_id !== project_id);
    const updated = [item, ...filtered].slice(0, 5); // keep top 5
    setHistory(updated);
    localStorage.setItem("firasa_history", JSON.stringify(updated));
  }

  // Create project api call
  async function handleStart() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createProject(name, lang);
      setPid(res.project_id);
      setQuestion(res.next_question);
      setProgress(res.progress);
      setValue(initialValue(res.next_question));
      addToHistory(res.project_id, name, null);
      setPhase("intake");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Resume existing project
  async function handleResume(existingId) {
    setBusy(true);
    setError(null);
    try {
      const proj = await api.getProject(existingId);
      setPid(existingId);
      setName(proj.name || "Projet");
      
      const qRes = await api.nextQuestion(existingId);
      addToHistory(existingId, proj.name || "Projet", proj.sector);
      
      if (qRes.next_question) {
        setQuestion(qRes.next_question);
        setProgress(qRes.progress);
        setValue(initialValue(qRes.next_question));
        setPhase("intake");
      } else {
        // intake already complete, run audit directly
        const auditRes = await api.audit(existingId);
        // Persist score vector for delta comparisons in subsequent loads
        if (auditRes.scores && auditRes.scores.vector) {
          saveLastScoreVector(existingId, auditRes.scores.vector);
        }
        setAudit(auditRes);
        setPhase("audit");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function saveLastScoreVector(projectId, vector) {
    try {
      const vectors = JSON.parse(localStorage.getItem("firasa_vectors") || "{}");
      vectors[projectId] = vector;
      localStorage.setItem("firasa_vectors", JSON.stringify(vectors));
    } catch (_) {}
  }

  // Submit answer
  async function handleAnswerSubmit() {
    if (busy || !question) return;
    setBusy(true);
    setError(null);
    try {
      const coercedVal = coerceValue(question, value);
      const res = await api.answer(pid, question.id, coercedVal);
      
      // Update history if sector was answered
      if (question.id === "sector") {
        addToHistory(pid, name, coercedVal);
      }

      if (res.intake_complete || !res.next_question) {
        handleRunAudit();
        return;
      }
      setQuestion(res.next_question);
      setProgress(res.progress);
      setValue(initialValue(res.next_question));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Run final audit
  async function handleRunAudit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.audit(pid);
      if (res.scores && res.scores.vector) {
        // Keep trace of last score vector in backend & frontend local storage for evolutions
        saveLastScoreVector(pid, res.scores.vector);
      }
      setAudit(res);
      setPhase("audit");
      // Reset chatbot conversation
      setChatMessages([]);
      setGrounding("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Trigger assistant chat
  async function handleChatSubmit(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await api.assistant(pid, userMsg);
      setChatMessages(prev => [...prev, { role: "bot", text: res.reply }]);
      if (res.grounding) {
        setGrounding(res.grounding);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "bot", text: `Erreur: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // Toggle milestone checklist
  function toggleMilestone(mId) {
    setCheckedMilestones(prev => ({
      ...prev,
      [`${pid}_${mId}`]: !prev[`${pid}_${mId}`]
    }));
  }

  function restart() {
    setPhase("start");
    setPid(null);
    setAudit(null);
    setName("");
    setQuestion(null);
    setProgress(null);
  }

  // Value coercion helpers matching state_machine.py
  function initialValue(q) {
    if (!q) return "";
    if (q.qtype === "bool") return true;
    if (q.qtype === "enum") return q.options[0] ?? "";
    if (q.qtype === "tags" || q.qtype === "sdg") return "";
    if (q.qtype === "int" || q.qtype === "float") return 0;
    return "";
  }

  function coerceValue(q, v) {
    if (q.qtype === "int") return parseInt(v, 10) || 0;
    if (q.qtype === "float") return parseFloat(v) || 0;
    if (q.qtype === "tags") {
      return String(v).split(",").map(s => s.trim()).filter(Boolean);
    }
    if (q.qtype === "sdg") {
      return Array.isArray(v) ? v : String(v).split(",").map(s => parseInt(s.trim(), 10)).filter(Number.isInteger);
    }
    return v;
  }

  // Render options for Custom SDG 17-grid box
  function toggleSdgItem(num) {
    let currentSdgList = Array.isArray(value) ? [...value] : [];
    if (currentSdgList.includes(num)) {
      currentSdgList = currentSdgList.filter(n => n !== num);
    } else {
      currentSdgList.push(num);
    }
    setValue(currentSdgList);
  }

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.answered / progress.total) * 100)
    : 0;

  return (
    <div className="app">
      {/* Top Header Bar */}
      <header className="topbar">
        <div className="brand">
          <span className="ar">فِراسة</span>
          <h1>{t.title}</h1>
          <span className="tag">{t.subtitle}</span>
        </div>
        
        <div className="status-row">
          {health && (
            <div className="status-pill">
              <span className={`status-dot ${health.status === "ok" ? "ok" : "down"}`} />
              {health.status === "ok" ? (
                <span>
                  API <b>{t.online}</b> · {health.llm_provider} · {health.kb_resources} res.
                </span>
              ) : (
                <span>API <b>{t.offline}</b></span>
              )}
            </div>
          )}

          {/* FR / AR Language Selector */}
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === "fr" ? "sel" : ""}`} onClick={() => setLang("fr")}>FR</button>
            <button className={`lang-btn ${lang === "ar" ? "sel" : ""}`} onClick={() => setLang("ar")}>العربية</button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{error}</span>
        </div>
      )}

      {/* PHASE 1: Landing / Start Page */}
      {phase === "start" && (
        <div className="hero-container">
          <div className="hero">
            <h2>{t.tagline}</h2>
            <p>{t.taglineSub}</p>
            
            <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
              <div className="panel" style={{ width: "100%", maxWidth: "540px", margin: "0 auto", textAlign: "left" }}>
                <div dir={lang === "ar" ? "rtl" : "ltr"}>
                  <label htmlFor="proj-name">{t.projectNameLabel}</label>
                  <input
                    id="proj-name"
                    value={name}
                    placeholder={t.projectNamePlaceholder}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  />
                  <div style={{ marginTop: "18px" }}>
                    <button className="primary" onClick={handleStart} disabled={busy || !name.trim() || health?.status === "down"}>
                      {busy ? <span className="spinner" /> : t.startAudit}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pillars">
            <div className="pillar">
              <div className="icon">1</div>
              <h3>{t.pillar1Title}</h3>
              <p>{t.pillar1Desc}</p>
            </div>
            <div className="pillar">
              <div className="icon">2</div>
              <h3>{t.pillar2Title}</h3>
              <p>{t.pillar2Desc}</p>
            </div>
            <div className="pillar">
              <div className="icon">3</div>
              <h3>{t.pillar3Title}</h3>
              <p>{t.pillar3Desc}</p>
            </div>
          </div>

          {/* Audits History / Load by ID section */}
          <div className="history-section">
            <div className="grid-2">
              <div>
                <h3 className="history-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {t.recentAudits}
                </h3>
                {history.length > 0 ? (
                  <div className="history-grid">
                    {history.map((h, i) => (
                      <div key={i} className="history-card" onClick={() => handleResume(h.project_id)}>
                        <div className="history-info">
                          <h4>{h.name}</h4>
                          <div className="meta">
                            ID: <span className="mono">{h.project_id}</span> · {h.sector ? SECTOR_TRANSLATIONS[lang][h.sector] : t.noSector}
                          </div>
                        </div>
                        <button style={{ padding: "5px 12px", fontSize: "0.8rem" }}>{t.resume}</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: "0.9rem" }}>{t.noRecent}</p>
                )}
              </div>

              <div>
                <h3 className="history-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {t.loadByIdLabel}
                </h3>
                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <input
                    value={loadIdInput}
                    placeholder="Ex. 3a7b8c..."
                    onChange={(e) => setLoadIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadIdInput.trim() && handleResume(loadIdInput.trim())}
                  />
                  <button onClick={() => loadIdInput.trim() && handleResume(loadIdInput.trim())} disabled={busy || !loadIdInput.trim()}>
                    {t.loadByIdBtn}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: Adaptive Intake Flow */}
      {phase === "intake" && question && (
        <div className="panel" style={{ maxWidth: "720px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>{t.adaptiveIntake}</h2>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {progress ? `${progress.answered} / ${progress.total}` : ""}
            </span>
          </div>
          <div className="sub">{t.adaptiveIntakeSub}</div>
          
          <div className="progressbar">
            <div style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="qcard">
            {question.triggered_by && (
              <span className="badge-probe">
                {lang === "ar" && question.prompt_ar ? "سؤال مخصص للتحقق" : "Sonde d'évaluation ciblée"}
              </span>
            )}
            
            <div className="prompt">
              {lang === "ar" && question.prompt_ar ? question.prompt_ar : question.prompt_fr}
            </div>

            {question.help_fr && (
              <div className="help">
                {lang === "ar" && question.help_ar ? question.help_ar : question.help_fr}
              </div>
            )}

            {/* Inputs based on qtype */}
            {question.qtype === "enum" && (
              <div className="opts">
                {question.options.map((opt) => {
                  let displayVal = opt;
                  if (question.id === "sector") {
                    displayVal = SECTOR_TRANSLATIONS[lang][opt] || opt;
                  } else if (question.id === "declared_stage") {
                    displayVal = STAGE_TRANSLATIONS[lang][parseInt(opt)] || opt;
                  }
                  return (
                    <div
                      key={opt}
                      className={`opt ${value === opt ? "sel" : ""}`}
                      onClick={() => setValue(opt)}
                    >
                      {displayVal}
                    </div>
                  );
                })}
              </div>
            )}

            {question.qtype === "bool" && (
              <div className="boolrow">
                <div className={`opt ${value === true ? "sel" : ""}`} onClick={() => setValue(true)}>
                  {t.yes}
                </div>
                <div className={`opt ${value === false ? "sel" : ""}`} onClick={() => setValue(false)}>
                  {t.no}
                </div>
              </div>
            )}

            {(question.qtype === "int" || question.qtype === "float") && (
              <input
                type="number"
                value={value}
                step={question.qtype === "float" ? "0.1" : "1"}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {question.qtype === "text" && (
              <textarea
                value={value}
                rows={3}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Saisissez votre texte..."
              />
            )}

            {question.qtype === "tags" && (
              <div>
                <input
                  value={value}
                  placeholder={t.commaSeparated}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            )}

            {question.qtype === "sdg" && (
              <div>
                <div className="sdg-selector">
                  {Array.from({ length: 17 }, (_, i) => i + 1).map((num) => {
                    const isSelected = Array.isArray(value) && value.includes(num);
                    return (
                      <div
                        key={num}
                        className={`sdg-item ${isSelected ? "sel" : ""}`}
                        onClick={() => toggleSdgItem(num)}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
                <div className="muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>
                  Selected: {Array.isArray(value) ? value.join(", ") : "Aucun"}
                </div>
              </div>
            )}
          </div>

          <div className="wizard-actions">
            <button onClick={handleRunAudit} disabled={busy}>
              {t.partialAuditBtn}
            </button>
            
            <button className="primary" onClick={handleAnswerSubmit} disabled={busy || value === ""}>
              {busy ? <span className="spinner" /> : t.validateContinue}
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: Complete Audit Dashboard */}
      {phase === "audit" && audit && (
        <div className="audit-container">
          {/* Dashboard Header */}
          <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ marginBottom: "4px" }}>{audit.project_name}</h2>
              <div className="muted" style={{ fontSize: "0.88rem" }}>
                {audit.sector ? `${t.projectNameLabel} · ${SECTOR_TRANSLATIONS[lang][audit.sector] || audit.sector}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <span className="status-pill mono" style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
                ID: {audit.project_id}
              </span>
              <button onClick={restart}>{t.newAuditBtn}</button>
            </div>
          </div>

          {/* Perception-Reality Gap Banner */}
          {audit.perception_reality_gap && (
            <div className={`gap-banner gap-${audit.perception_reality_gap.severity || "aligned"}`}>
              <div className="gap-head">
                <div className="gap-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  {t.perceptionGapTitle}
                </div>
                {audit.perception_reality_gap.override_applied && (
                  <span className="override-tag">{t.reallocationMsg}</span>
                )}
              </div>
              <div className="gap-msg">
                {audit.perception_reality_gap.message_fr}
              </div>
              <div className="gap-stages">
                {audit.perception_reality_gap.declared_stage && (
                  <div className="s decl">
                    {t.declaredStage}
                    <b>{STAGE_TRANSLATIONS[lang][audit.perception_reality_gap.declared_stage]}</b>
                  </div>
                )}
                <div className="s class">
                  {t.evidenceStage}
                  <b>{STAGE_TRANSLATIONS[lang][audit.perception_reality_gap.classified_stage]}</b>
                </div>
              </div>
            </div>
          )}

          {/* Dashboard Split Column Layout */}
          <div className="dashboard-grid">
            
            {/* Main Diagnostics Column */}
            <div className="dashboard-main-col">
              
              {/* Anomaly / Inconsistency Cards */}
              {audit.anomalies && audit.anomalies.length > 0 && (
                <div className="panel anomalies-panel">
                  <h2>{t.anomaliesTitle}</h2>
                  <div className="sub">{t.anomaliesSub}</div>
                  <div className="anomalies-list">
                    {audit.anomalies.map((anom, idx) => (
                      <div key={idx} className={`anomaly-card ${anom.severity}`}>
                        <div className="anomaly-header">
                          <span className="anomaly-title">{anom.title_fr}</span>
                          <span className={`anomaly-badge ${anom.severity}`}>{anom.severity}</span>
                        </div>
                        <div className="anomaly-detail">{anom.detail_fr}</div>
                        <div className="anomaly-signals">
                          {anom.signals.map((sig, sIdx) => (
                            <span key={sIdx} className="anomaly-signal mono">{sig}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6-Stage Maturity Gate Ladder */}
              {audit.diagnostic && (
                <div className="panel">
                  <h2>{t.gateLadderTitle}</h2>
                  <div className="sub">
                    {t.confidence} : <b>{(audit.diagnostic.confidence * 100).toFixed(0)}%</b>
                  </div>
                  <div className="gate-ladder-container">
                    {audit.diagnostic.gates.map((g) => {
                      const isActiveBlocking = audit.diagnostic.next_blocking_gate && audit.diagnostic.next_blocking_gate.stage === g.stage;
                      return (
                        <div key={g.stage} className={`gate ${isActiveBlocking ? "cur" : ""}`}>
                          <div className={`dot ${g.passed ? "pass" : "fail"}`}>
                            {g.passed ? "✓" : g.stage}
                          </div>
                          <div className="gbody">
                            <div className="gname">{STAGE_TRANSLATIONS[lang][g.stage]}</div>
                            <div className="greq">{g.requirement_fr}</div>
                            <div className={`gev ${g.passed ? "passed" : "failed"}`}>{g.evidence}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Explainable Scores */}
              {audit.scores && (
                <div className="panel">
                  <h2>{t.scorePanelTitle}</h2>
                  <div className="sub">
                    {t.scorePanelSub} · {t.scoreVector} : <span className="mono">[{audit.scores.vector.join(", ")}]</span>
                  </div>
                  
                  <div className="scoregrid">
                    {["market", "commercial", "innovation", "scalability", "green"].map((key) => {
                      const res = audit.scores[key];
                      const isExpanded = expandedScore === key;
                      
                      // Fetch delta evolution
                      const delta = audit.score_deltas?.deltas?.[key];
                      
                      return (
                        <div key={key} className="scorerow">
                          <div className="scorehead" onClick={() => setExpandedScore(isExpanded ? null : key)}>
                            <div className="dim">
                              {res.dimension}
                            </div>
                            <div className="bar">
                              <div
                                style={{
                                  width: `${res.final_score}%`,
                                  background: res.gate_triggered ? "var(--red)" : res.final_score >= 66 ? "var(--green)" : res.final_score >= 40 ? "var(--amber)" : "var(--red)"
                                }}
                              />
                            </div>
                            <div className="scoreval">
                              <span className="final">{res.final_score}</span>
                              {res.base_score !== res.final_score && (
                                <span className="base">/ {res.base_score}</span>
                              )}
                            </div>
                            
                            {/* Score Delta Badge */}
                            {delta !== undefined && delta !== 0 && (
                              <span className={`score-delta-badge ${delta > 0 ? "plus" : "minus"}`}>
                                {delta > 0 ? `+${delta}` : delta}
                              </span>
                            )}

                            {res.gate_triggered && <span className="gateflag">GATE</span>}
                          </div>

                          {isExpanded && (
                            <div className="contribs">
                              <div className="anchor">{t.referenceFramework} : {res.anchor}</div>
                              {res.gate_triggered && res.gate_reason && (
                                <div className="gate-reason">⚠️ {t.gateReason} : {res.gate_reason}</div>
                              )}
                              
                              <div style={{ marginTop: "10px" }}>
                                {res.contributions.map((c, i) => (
                                  <div key={i} className="contrib">
                                    <span style={{ fontWeight: 600 }}>{c.criterion}</span>
                                    <span className="cdetail">{c.detail}</span>
                                    <span className="weight-badge mono">w: {c.weight}</span>
                                    <span className="mono" style={{ fontWeight: 700 }}>{c.weighted}</span>
                                  </div>
                                ))}
                              </div>

                              {res.missing_inputs && res.missing_inputs.length > 0 && (
                                <div className="gate-reason muted" style={{ color: "var(--muted)" }}>
                                  ⚠️ {t.missingData} : {res.missing_inputs.join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RAG Roadmap & AI Advisor Column */}
            <div className="dashboard-side-col">
              
              {/* RAG-Grounded Roadmap */}
              {audit.roadmap && (
                <div className="panel">
                  <h2>{t.roadmapTitle}</h2>
                  <div className="sub">{t.roadmapSub}</div>
                  
                  <div>
                    {audit.roadmap.map((m, idx) => {
                      const uniqueKey = `${pid}_${m.order}`;
                      const isChecked = !!checkedMilestones[uniqueKey];
                      return (
                        <div key={idx} className={`milestone ${isChecked ? "checked" : ""}`}>
                          {/* Checklist Checkbox */}
                          <div
                            className={`roadmap-checkbox ${isChecked ? "checked" : ""}`}
                            onClick={() => toggleMilestone(m.order)}
                          >
                            {isChecked && "✓"}
                          </div>
                          
                          <div className="mbody">
                            <div className="mhead">
                              <span className="mtitle">{m.title}</span>
                              <span className="horizon">{m.horizon_fr}</span>
                            </div>
                            <div className="mrationale">{m.rationale_fr}</div>
                            {m.action_fr && <div className="maction">{m.action_fr}</div>}
                            
                            <div className="sources">
                              {m.sources.map((src, sIdx) => (
                                <span key={sIdx} className="source">
                                  <span className="inst">{src.institution}</span> ·{" "}
                                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                                    {src.title}
                                  </a>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conversational Assistant */}
              <div className="panel">
                <h2>{t.assistantTitle}</h2>
                <div className="sub">{t.assistantSub}</div>
                
                <div className="chatlog">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`msg ${msg.role}`}>
                      {msg.text}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="msg bot">
                      <span className="spinner" />
                    </div>
                  )}
                </div>

                <form className="chatform" onSubmit={handleChatSubmit}>
                  <input
                    value={chatInput}
                    placeholder={t.askAssistantPlaceholder}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                  />
                  <button type="submit" className="primary" disabled={chatLoading || !chatInput.trim()}>
                    {t.send}
                  </button>
                </form>

                {grounding && (
                  <div style={{ marginTop: "12px" }}>
                    <div className="grounding-toggle" onClick={() => setShowGrounding(!showGrounding)}>
                      {showGrounding ? "▾" : "▸"} {t.groundingContext}
                    </div>
                    {showGrounding && (
                      <div className="grounding-box mono">
                        {grounding}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
