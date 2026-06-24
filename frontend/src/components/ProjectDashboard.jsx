import { useState, useEffect } from "react";
import { SECTOR_LABELS, STAGE_LABELS } from "../constants.js";
import AgentTrace from "./AgentTrace.jsx";
import AutoFill from "./AutoFill.jsx";

/* ── Helpers ─────────────────────────────────────────────────────────── */

const DIM_LABELS = ["M", "C", "I", "S", "G"];
const DIM_NAMES = {
  fr: ["Marché", "Commercial", "Innovation", "Scalabilité", "Green"],
  ar: ["السوق", "التجاري", "الابتكار", "قابلية التوسع", "الأثر البيئي"],
};

const SECTORS = ["agri-food","digital-saas","industry","health","greentech","services","other"];
const STAGES = [1,2,3,4,5,6];
const INTAKE_GROUPS = [
  { id: "context", labelFr: "Contexte", labelAr: "السياق", qids: ["name", "sector", "location", "declared_stage", "legal_form", "problem_statement", "user_segment", "revenue_model", "accompaniment_history"] },
  { id: "market", labelFr: "Marché", labelAr: "السوق", qids: ["tam", "competitors", "validation", "validation_proof", "user_count", "growth_rate", "cac", "ltv", "competitor_names", "differentiation"] },
  { id: "commercial", labelFr: "Offre", labelAr: "العرض", qids: ["vp_narrative", "mvp_stage", "pricing", "repeatable_sales"] },
  { id: "innovation", labelFr: "Innovation", labelAr: "الابتكار", qids: ["geo_novelty", "tech_stack", "ip_status"] },
  { id: "scalability", labelFr: "Scalabilite", labelAr: "التوسع", qids: ["human_dependency", "equipment_cost", "monthly_overhead", "cross_border", "team_size", "key_hires", "monthly_revenue", "burn_rate", "runway_months", "unit_economics"] },
  { id: "green", labelFr: "Green / ESG", labelAr: "البيئة", qids: ["agri_footprint", "agri_circular", "digital_footprint", "footprint", "circular", "sdg"] },
];

function formatDate(iso, lang) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-TN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso?.slice(0, 10) || ""; }
}

function ScoreGrid({ vector, lang }) {
  if (!vector || vector.length < 5) return null;
  const names = DIM_NAMES[lang] || DIM_NAMES.fr;
  return (
    <div className="dash-score-grid">
      {vector.map((val, i) => {
        const color = val >= 66 ? "var(--green)" : val >= 40 ? "var(--amber)" : "var(--red)";
        return (
          <div key={i} className="dash-score-cell" title={names[i]}>
            <div className="dash-score-bar-track">
              <div className="dash-score-bar-fill" style={{ width: `${Math.round(val)}%`, background: color }} />
            </div>
            <div className="dash-score-num" style={{ color }}>{Math.round(val)}</div>
            <div className="dash-score-dim">{DIM_LABELS[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Inline field editors ─────────────────────────────────────────────── */

function TextField({ label, value, onChange, placeholder, ar }) {
  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <input className="pf-input" type="text" value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} dir={ar ? "rtl" : "ltr"} />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder, ar }) {
  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <textarea className="pf-textarea" value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} dir={ar ? "rtl" : "ltr"} rows={3} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, ar }) {
  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <select className="pf-select" value={value || ""} onChange={e => onChange(e.target.value || null)} dir={ar ? "rtl" : "ltr"}>
        <option value="">—</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }) {
  return (
    <div className="pf-field pf-toggle-row">
      <label className="pf-label">{label}</label>
      <button className={`pf-toggle${value ? " on" : ""}`} onClick={() => onChange(!value)}>
        {value ? "✓" : "—"}
      </button>
    </div>
  );
}

function NumField({ label, value, onChange, placeholder }) {
  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <input className="pf-input" type="number" value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={placeholder} />
    </div>
  );
}

function TagsField({ label, value, onChange, placeholder, ar }) {
  const [input, setInput] = useState("");
  const tags = value || [];

  function addTag() {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  }

  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <div style={{ display:"flex", gap:6 }}>
        <input className="pf-input" type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder} dir={ar ? "rtl" : "ltr"} style={{ flex:1 }} />
        <button type="button" className="ghost" onClick={addTag} style={{ padding:"6px 12px" }}>+</button>
      </div>
      {tags.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
          {tags.map((t, i) => (
            <span key={i} className="dash-chip" style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
              {t}
              <button type="button" onClick={() => onChange(tags.filter((_,j) => j !== i))}
                style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", fontSize:"0.9rem", padding:0, lineHeight:1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SDGField({ label, value, onChange }) {
  const selected = value || [];
  function toggle(n) {
    onChange(selected.includes(n) ? selected.filter(s => s !== n) : [...selected, n].sort((a,b)=>a-b));
  }
  return (
    <div className="pf-field">
      <label className="pf-label">{label}</label>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {Array.from({length:17}, (_,i) => i+1).map(n => (
          <button key={n} type="button" onClick={() => toggle(n)}
            className={`pf-sdg-btn${selected.includes(n) ? " on" : ""}`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Read-only field display ──────────────────────────────────────────── */

function FieldValue({ label, value, empty }) {
  return (
    <div className="pf-ro-field">
      <span className="pf-ro-label">{label}</span>
      <span className="pf-ro-value">{value || empty || "—"}</span>
    </div>
  );
}

/* ── Documents Manager ────────────────────────────────────────────────── */

function DocumentsManager({ pid, lang, api }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const ar = lang === "ar";
  const t = {
    fr: {
      uploadBtn: "Sélectionner un fichier",
      dragDrop: "ou glisser-déposer le fichier ici",
      sizeLimit: "Taille maximale : 10 Mo. Formats PDF, MD ou TXT.",
      uploadedDocs: "Documents de preuve",
      noDocs: "Aucun document associé à ce projet.",
      deleteConfirm: "Supprimer ce document ?",
      cancel: "Annuler",
      delete: "Supprimer",
      uploading: "Téléchargement et extraction de texte...",
      errorSize: "Le fichier dépasse la limite de 10 Mo.",
      errorGeneric: "Erreur lors du traitement du fichier.",
      date: "Ajouté le",
      extracted: "Texte extrait avec succès",
      emptyExtracted: "Aucun texte extrait (image ou PDF scanné)",
    },
    ar: {
      uploadBtn: "اختر ملفاً",
      dragDrop: "أو اسحب وأفلت الملف هنا",
      sizeLimit: "الحد الأقصى: 10 ميغابايت. صيغ PDF أو MD أو TXT.",
      uploadedDocs: "وثائق الإثبات المرفقة",
      noDocs: "لا توجد وثائق مرفقة بهذا المشروع.",
      deleteConfirm: "حذف هذا المستند ؟",
      cancel: "إلغاء",
      delete: "حذف",
      uploading: "جاري رفع الملف واستخراج النصوص...",
      errorSize: "الملف يتجاوز الحد الأقصى 10 ميغابايت.",
      errorGeneric: "حدث خطأ أثناء معالجة الملف.",
      date: "أضيف في",
      extracted: "تم استخراج النص بنجاح",
      emptyExtracted: "لم يتم استخراج أي نص (صورة أو ملف ممسوح ضوئياً)",
    }
  }[lang] || {
    uploadBtn: "Sélectionner un fichier",
    dragDrop: "ou glisser-déposer le fichier ici",
    sizeLimit: "Taille maximale : 10 Mo. Format PDF ou TXT.",
    uploadedDocs: "Documents de preuve",
    noDocs: "Aucun document associé à ce projet.",
    deleteConfirm: "Supprimer ce document ?",
    cancel: "Annuler",
    delete: "Supprimer",
    uploading: "Téléchargement et extraction de texte...",
    errorSize: "Le fichier dépasse la limite de 10 Mo.",
    errorGeneric: "Erreur lors du traitement du fichier.",
    date: "Ajouté le",
    extracted: "Texte extrait avec succès",
    emptyExtracted: "Aucun texte extrait",
  };

  useEffect(() => {
    loadDocs();
  }, [pid]);

  async function loadDocs() {
    try {
      setLoading(true);
      const res = await api.listDocuments(pid);
      setDocs(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(t.errorSize);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await api.uploadDocument(pid, file);
      await loadDocs();
    } catch (err) {
      setError(err.message || t.errorGeneric);
    } finally {
      setUploading(false);
    }
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  async function handleDelete(docId) {
    try {
      await api.deleteDocument(pid, docId);
      setDocs(prev => prev.filter(d => d.id !== docId));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="doc-manager-wrap">
      {error && <div className="error-banner" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

      <div 
        className={`doc-dropzone${dragActive ? " active" : ""}${uploading ? " loading" : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="doc-dropzone-inner" style={{ textAlign: "center" }}>
            <span className="spinner" style={{ width: 28, height: 28, marginBottom: 8 }} />
            <p style={{ fontSize: "0.84rem", color: "var(--text-sub)" }}>{t.uploading}</p>
          </div>
        ) : (
          <div className="doc-dropzone-inner" style={{ textAlign: "center" }}>
            <svg className="doc-dropzone-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--primary)", marginBottom: 8 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <div>
              <label htmlFor={`file-upload-${pid}`} className="doc-upload-label-btn" style={{
                background: "var(--orange-soft)",
                color: "var(--orange)",
                border: "1px solid var(--orange-border)",
                padding: "4px 10px",
                borderRadius: "var(--r-sm)",
                fontSize: "0.8rem",
                cursor: "pointer",
                display: "inline-block",
                marginRight: 6
              }}>
                {t.uploadBtn}
              </label>
              <input 
                id={`file-upload-${pid}`}
                type="file"
                className="sr-only"
                accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>
                {t.dragDrop}
              </span>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 6 }}>{t.sizeLimit}</p>
          </div>
        )}
      </div>

      <div className="doc-list-section" style={{ marginTop: 16 }}>
        <h4 style={{ fontSize: "0.86rem", fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
          {t.uploadedDocs} ({docs.length})
        </h4>

        {loading ? (
          <div style={{ padding: "12px 0", textAlign: "center" }}><span className="spinner" /></div>
        ) : docs.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>
            {t.noDocs}
          </p>
        ) : (
          <div className="doc-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map(doc => (
              <div key={doc.id} className="doc-item" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                  <div style={{ color: "var(--primary)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontSize: "0.84rem", fontWeight: 600, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={doc.filename}>{doc.filename}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>
                      <span>{t.date} {new Date(doc.uploaded_at).toLocaleDateString(ar ? "ar-TN" : "fr-TN")}</span>
                      {doc.extracted_preview ? (
                        <span style={{ color: "var(--green)", marginLeft: 8, marginRight: 8, fontWeight: 600 }}>
                          ✓ {t.extracted}
                        </span>
                      ) : (
                        <span style={{ color: "var(--amber)", marginLeft: 8, marginRight: 8 }}>
                          ⚠ {t.emptyExtracted}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setConfirmDelete(doc.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-sub)",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center"
                  }}
                  title={t.delete}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--red)" }}>
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, padding: 20, textAlign: "center" }}>
            <h4 style={{ marginBottom: 12, fontWeight: 700, fontSize: "0.95rem" }}>{t.deleteConfirm}</h4>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="ghost" onClick={() => setConfirmDelete(null)}>{t.cancel}</button>
              <button className="primary" onClick={() => handleDelete(confirmDelete)} style={{ background: "var(--red)", borderColor: "var(--red)" }}>{t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

const TEXTS = {
  fr: {
    title: "Profil du projet",
    editing: "Modifier le profil",
    save: "Enregistrer",
    cancel: "Annuler",
    back: "← Retour aux projets",
    loading: "Chargement…",
    noAudit: "Pas encore audité",
    scores: "Scores",
    stage: "Stade",
    declared: "Déclaré",
    classified: "Classifié",
    actions: "Actions",
    runAudit: "Lancer l'audit",
    viewAudit: "Voir l'audit",
    continueIntake: "Continuer le questionnaire",
    monParcours: "Mon Parcours",
    deleteProject: "Supprimer",
    confirmDelete: "Supprimer ce projet ?",
    progress: "Progression",
    identity: "Identité",
    selfAssessment: "Auto-évaluation",
    market: "Marché",
    commercial: "Offre commerciale",
    innovation: "Innovation",
    scalability: "Scalabilité",
    green: "Green / ESG",
    teamFinance: "Équipe & Finance",
    validation: "Validation",
    name: "Nom du projet",
    sector: "Secteur",
    language: "Langue",
    declaredStage: "Stade déclaré",
    declaredRevenue: "Revenu déclaré",
    legalForm: "Forme juridique",
    problemStatement: "Problème identifié",
    userSegment: "Segment utilisateur",
    tam: "TAM estimé (TND)",
    competitors: "Concurrents",
    customerValidation: "Validation client",
    competitorNames: "Noms concurrents",
    differentiation: "Différenciation",
    userCount: "Utilisateurs actifs",
    growthRate: "Croissance mensuelle (%)",
    cac: "CAC (TND)",
    ltv: "LTV (TND)",
    mvpStage: "Stade MVP",
    pricing: "Modèle de prix",
    valueProposition: "Proposition de valeur",
    geoNovelty: "Nouveauté géographique",
    techStack: "Stack technique",
    ipStatus: "Propriété intellectuelle",
    humanDependency: "Dépendance humaine (1–10)",
    equipmentCost: "Coût équipement (TND)",
    monthlyOverhead: "Frais mensuels (TND)",
    crossBorder: "Zones transfrontalières",
    footprint: "Empreinte",
    circularRecycling: "Recyclage circulaire",
    sdg: "Objectifs ODD (1–17)",
    teamSize: "Taille équipe",
    keyHires: "Recrutements clés",
    monthlyRevenue: "CA mensuel (TND)",
    burnRate: "Burn rate (TND)",
    runwayMonths: "Runway (mois)",
    incorporationDate: "Date création",
    fiscalRegime: "Régime fiscal",
    validationProof: "Preuve de validation",
    created: "Créé le",
    intakeComplete: "Questionnaire complété",
    intakeIncomplete: "En cours",
    questionsAnswered: "réponses",
    adaptiveTitle: "Diagnostic adaptatif : Question recommandée",
    adaptiveSub: "Répondez aux questions adaptatives pour affiner la précision de votre audit de maturité.",
    provisionalStage: "Diagnostic provisoire",
    provisionalSub: "Estimation en direct basée sur les réponses déjà collectées.",
    nextGate: "Prochaine porte à débloquer",
    activeArea: "Zone active",
    answerBasis: "Base actuelle",
    valider: "Valider la réponse",
    passer: "Passer cette question",
    auditNow: "Lancer l'audit maintenant",
    recalculateAudit: "Mettre à jour le diagnostic",
    viewLastAudit: "Voir le rapport d'audit",
    noQuestionLeft: "Toutes les questions recommandées ont été complétées !",
    yes: "Oui",
    no: "Non",
    tagsPlaceholder: "Séparez par des virgules",
    sdgNone: "Aucun sélectionné",
  },
  ar: {
    title: "ملف المشروع",
    editing: "تعديل الملف",
    save: "حفظ",
    cancel: "إلغاء",
    back: "العودة إلى المشاريع ←",
    loading: "جاري التحميل…",
    noAudit: "لم يتم التدقيق بعد",
    scores: "المؤشرات",
    stage: "المرحلة",
    declared: "مصرح",
    classified: "مصنف",
    actions: "إجراءات",
    runAudit: "إطلاق التدقيق",
    viewAudit: "عرض التدقيق",
    continueIntake: "متابعة الاستبيان",
    monParcours: "مسارِي",
    deleteProject: "حذف",
    confirmDelete: "حذف هذا المشروع؟",
    progress: "التقدم",
    identity: "الهوية",
    selfAssessment: "التقييم الذاتي",
    market: "السوق",
    commercial: "العرض التجاري",
    innovation: "الابتكار",
    scalability: "قابلية التوسع",
    green: "البيئي",
    teamFinance: "الفريق والمالية",
    validation: "التحقق",
    name: "اسم المشروع",
    sector: "القطاع",
    language: "اللغة",
    declaredStage: "المرحلة المصرح بها",
    declaredRevenue: "إيراد مصرح",
    legalForm: "الصيغة القانونية",
    problemStatement: "تحديد المشكل",
    userSegment: "تحديد الشريحة",
    tam: "السوق المقدر (د.ت)",
    competitors: "المنافسون",
    customerValidation: "التحقق من العملاء",
    competitorNames: "أسماء المنافسين",
    differentiation: "التمايز",
    userCount: "المستخدمون النشطون",
    growthRate: "نسبة النمو (%)",
    cac: "تكلفة اكتساب العميل (د.ت)",
    ltv: "القيمة مدى الحياة (د.ت)",
    mvpStage: "مرحلة المنتج",
    pricing: "نموذج التسعير",
    valueProposition: "عرض القيمة",
    geoNovelty: "الجدة الجغرافية",
    techStack: "التقنيات المستخدمة",
    ipStatus: "الملكية الفكرية",
    humanDependency: "الاعتماد البشري (1–10)",
    equipmentCost: "تكلفة المعدات (د.ت)",
    monthlyOverhead: "المصاريف الشهرية (د.ت)",
    crossBorder: "المناطق العابرة للحدود",
    footprint: "البصمة",
    circularRecycling: "إعادة التدوير",
    sdg: "أهداف التنمية المستدامة (1–17)",
    teamSize: "حجم الفريق",
    keyHires: "التوظيفات الأساسية",
    monthlyRevenue: "رقم المعاملات الشهري (د.ت)",
    burnRate: "معدل الاستهلاك (د.ت)",
    runwayMonths: "السيولة المتبقية (أشهر)",
    incorporationDate: "تاريخ التأسيس",
    fiscalRegime: "النظام الجبائي",
    validationProof: "إثبات التحقق",
    created: "أنشئ في",
    intakeComplete: "اكتمل الاستبيان",
    intakeIncomplete: "قيد الإنجاز",
    questionsAnswered: "إجابة",
    adaptiveTitle: "التشخيص التكيفي: سؤال مقترح",
    adaptiveSub: "أجب عن الأسئلة التكيفية لتحسين دقة تقرير تدقيق النضج الخاص بك.",
    provisionalStage: "تشخيص أولي",
    provisionalSub: "تقدير مباشر بناءً على الإجابات التي تم جمعها حتى الآن.",
    nextGate: "البوابة التالية المطلوب فتحها",
    activeArea: "المجال النشط",
    answerBasis: "الأساس الحالي",
    valider: "تأكيد الإجابة",
    passer: "تخطي هذا السؤال",
    auditNow: "إطلاق التدقيق الآن",
    recalculateAudit: "تحديث التشخيص",
    viewLastAudit: "عرض تقرير التدقيق",
    noQuestionLeft: "تم إكمال جميع الأسئلة المقترحة !",
    yes: "نعم",
    no: "لا",
    tagsPlaceholder: "افصل بفواصل",
    sdgNone: "لم يتم الاختيار",
  },
};

export default function ProjectDashboard({
  pid, lang, api, onBack, onViewAudit, onRunAudit, onContinueIntake, onEditProject,
  onDeleted, onMonParcours,
}) {
  const [project, setProject] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // States for adaptive intake card
  const [nextQ, setNextQ] = useState(null);
  const [agentTrace, setAgentTrace] = useState(null);
  const [progress, setProgress] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [provisional, setProvisional] = useState(null);
  const [qValue, setQValue] = useState("");
  const [answering, setAnswering] = useState(false);

  const ar = lang === "ar";
  const t = TEXTS[lang];
  const dir = ar ? "rtl" : "ltr";

  function initialQuestionValue(q) {
    if (!q) return "";
    if (q.qtype === "bool")  return true;
    if (q.qtype === "enum")  return q.options[0] ?? "";
    if (q.qtype === "tags" || q.qtype === "sdg") return [];
    if (q.qtype === "int"  || q.qtype === "float") return 0;
    return "";
  }

  function coerceValue(q, v) {
    if (q.qtype === "int")   return parseInt(v, 10) || 0;
    if (q.qtype === "float") return parseFloat(v)  || 0;
    if (q.qtype === "tags")  return Array.isArray(v) ? v : String(v).split(",").map(s=>s.trim()).filter(Boolean);
    if (q.qtype === "sdg")   return Array.isArray(v) ? v : String(v).split(",").map(s=>parseInt(s.trim(),10)).filter(Number.isInteger);
    return v;
  }

  function optLabel(q, opt, lang) {
    if (q.id === "sector")         return SECTOR_LABELS[lang]?.[opt] || opt;
    if (q.id === "declared_stage") return STAGE_LABELS[lang]?.[parseInt(opt)] || opt;
    return opt;
  }

  async function refreshProjectState() {
    const withTimeout = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    const [proj, lastAudit, nextQRes, qList, provisionalDiag] = await Promise.all([
      withTimeout(api.getProject(pid)),
      withTimeout(api.getLastAudit(pid)).catch(() => null),
      withTimeout(api.nextQuestion(pid)).catch(() => null),
      withTimeout(api.getQuestions(pid)).catch(() => []),
      withTimeout(api.provisionalDiagnosis(pid)).catch(() => null),
    ]);
    setProject(proj);
    setAudit(lastAudit);
    setDraft(proj);
    setQuestions(qList);
    setProvisional(provisionalDiag);
    if (nextQRes) {
      setNextQ(nextQRes.next_question);
      setProgress(nextQRes.progress);
    } else {
      setNextQ(null);
      setProgress(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        await refreshProjectState();
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pid]);

  useEffect(() => {
    if (nextQ) {
      setQValue(initialQuestionValue(nextQ));
    } else {
      setQValue("");
    }
  }, [nextQ?.id]);

  async function handleAnswerQuestion(questionId, val) {
    setAnswering(true);
    try {
      const res = await api.answer(pid, questionId, val);
      await refreshProjectState();
      if (res.next_question) setAgentTrace({ trace: res.trace, value: val });
    } catch (err) {
      setError(err.message);
    } finally {
      setAnswering(false);
    }
  }

  // Document auto-fill applied: refresh profile/audit + resume intake.
  async function handleAutofillApplied(result) {
    try {
      await refreshProjectState();
      setAgentTrace(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSkipQuestion(questionId) {
    handleAnswerQuestion(questionId, null);
  }

  /* ── Handlers ── */
  function startEditing() {
    setDraft({ ...project });
    setEditing(true);
  }

  function cancelEditing() {
    setDraft({ ...project });
    setEditing(false);
  }

  async function saveProfile() {
    setSaving(true);
    try {
      // Build patch: only changed fields
      const patch = {};
      for (const [k, v] of Object.entries(draft)) {
        if (v !== project[k]) {
          patch[k] = v;
        }
      }
      // Also check nested objects
      for (const sub of ["market","commercial","innovation","scalability","green","self_assessment"]) {
        if (draft[sub] && project[sub]) {
          for (const [k, v] of Object.entries(draft[sub])) {
            const projectVal = project[sub]?.[k];
            if (JSON.stringify(v) !== JSON.stringify(projectVal)) {
              patch[k] = v;  // state machine uses flat field paths
            }
          }
        }
      }
      if (Object.keys(patch).length > 0) {
        await api.updateProject(pid, patch);
      }
      await refreshProjectState();
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteProject(pid);
      onDeleted(pid);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  /* ── Derived data ── */
  const data = editing ? draft : project;
  if (loading || !project) {
    return <div className="dash-wrap" dir={dir}><div className="dash-loading">{t.loading}</div></div>;
  }

  const sectorName = project?.sector ? (SECTOR_LABELS[lang]?.[project.sector] || project.sector) : null;
  const effectiveDiagnostic = audit?.diagnostic || provisional?.diagnostic || null;
  const classifiedStage = effectiveDiagnostic?.classified_stage;
  const declaredStage = audit?.perception_reality_gap?.declared_stage || project?.self_assessment?.declared_stage;
  const classifiedName = classifiedStage
    ? (STAGE_LABELS[lang]?.[classifiedStage] || effectiveDiagnostic?.classified_stage_name || `Stade ${classifiedStage}`)
    : "—";
  const declaredName = declaredStage ? STAGE_LABELS[lang]?.[declaredStage] : "—";
  const scoreVector = audit?.scores?.vector;
  const hasAudit = !!audit;
  const intakeComplete = project?.intake_complete;
  const answeredCount = project?.answered_questions?.length || 0;
  const intakePct = progress?.total ? Math.round((progress.answered / progress.total) * 100) : Math.round((answeredCount / 31) * 100);
  const confidencePct = Math.round((effectiveDiagnostic?.confidence || 0) * 100);
  const nextBlockingGate = effectiveDiagnostic?.next_blocking_gate || null;
  const diagnosisRationale = ar ? effectiveDiagnostic?.rationale_ar : effectiveDiagnostic?.rationale_fr;
  const intakeGroups = INTAKE_GROUPS
    .map((group) => {
      const items = questions.filter((q) => group.qids.includes(q.id));
      if (!items.length) return null;
      const answered = items.filter((q) => q.answered).length;
      return {
        id: group.id,
        label: ar ? group.labelAr : group.labelFr,
        answered,
        total: items.length,
        active: !!nextQ && group.qids.includes(nextQ.id),
      };
    })
    .filter(Boolean);
  const activeGroup = intakeGroups.find((group) => group.active) || null;

  const sectorOpts = SECTORS.map(s => ({ value: s, label: SECTOR_LABELS[lang]?.[s] || s }));
  const stageOpts = STAGES.map(s => ({ value: s, label: `${STAGE_LABELS[lang]?.[s] || `Stage ${s}`} (${s}/6)` }));

  const renderAdaptiveInput = () => {
    if (!nextQ) return null;

    const value = qValue;
    const setValue = setQValue;

    const toggleSdg = (num) => {
      setValue(prev => {
        const list = Array.isArray(prev) ? [...prev] : [];
        return list.includes(num) ? list.filter(n => n !== num) : [...list, num];
      });
    };

    switch (nextQ.qtype) {
      case "enum":
        return (
          <div className="interview-opts">
            {nextQ.options.map((opt, idx) => (
              <div
                key={opt}
                className={`interview-opt${value === opt ? " sel" : ""}`}
                onClick={() => setValue(opt)}
              >
                <span>{optLabel(nextQ, opt, lang)}</span>
                <span className="opt-key">{idx + 1}</span>
              </div>
            ))}
          </div>
        );
      case "bool":
        return (
          <div className="interview-bool">
            <div className={`interview-bool-btn${value === true ? " sel" : ""}`} onClick={() => setValue(true)}>
              <span className="bool-label">{t.yes}</span>
              <span className="bool-key">Y</span>
            </div>
            <div className={`interview-bool-btn${value === false ? " sel" : ""}`} onClick={() => setValue(false)}>
              <span className="bool-label">{t.no}</span>
              <span className="bool-key">N</span>
            </div>
          </div>
        );
      case "int":
      case "float":
        return (
          <input
            className="interview-number-input"
            type="number"
            value={value}
            step={nextQ.qtype === "float" ? "0.1" : "1"}
            min="0"
            onChange={e => setValue(e.target.value)}
          />
        );
      case "text":
        return (
          <textarea
            className="pf-textarea"
            rows={3}
            value={value}
            onChange={e => setValue(e.target.value)}
            style={{ width: "100%", background: "rgba(255,255,255,0.03)", color: "var(--text)" }}
          />
        );
      case "tags":
        return (
          <input
            className="interview-tags-input"
            value={value}
            placeholder={t.tagsPlaceholder}
            onChange={e => setValue(e.target.value)}
          />
        );
      case "sdg":
        return (
          <div>
            <div className="interview-sdg-grid">
              {Array.from({ length: 17 }, (_, i) => i + 1).map(num => (
                <div
                  key={num}
                  className={`sdg-cell${Array.isArray(value) && value.includes(num) ? " sel" : ""}`}
                  onClick={() => toggleSdg(num)}
                >
                  {num}
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: "0.76rem", marginTop: 8 }}>
              {Array.isArray(value) && value.length > 0 ? value.join(", ") : t.sdgNone}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dash-wrap" dir={dir}>
      <div className="dash-content">

        {/* ── Header ── */}
        <div className="dash-header">
          <button className="ghost-btn" onClick={onBack} style={{ padding: "8px 16px", marginBottom: 16 }}>
            {t.back}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {editing ? (
              <input className="pf-input pf-name-input" type="text" value={data?.name || ""}
                onChange={e => updateField("name", e.target.value)}
                placeholder={t.name} dir={dir} autoFocus
                style={{ fontSize: "1.6rem", fontWeight:700, fontFamily:"var(--f-display)", flex:1, minWidth:200 }} />
            ) : (
              <h1 className="dash-title">{project?.name || (ar ? "مشروع بدون اسم" : "Projet sans nom")}</h1>
            )}
            {intakeComplete ? (
              <span className="dash-chip" style={{ background:"rgba(34,197,94,0.12)", color:"var(--green)" }}>✓ {t.intakeComplete}</span>
            ) : (
              <span className="dash-chip" style={{ background:"rgba(245,158,11,0.12)", color:"var(--amber)" }}>{t.intakeIncomplete}</span>
            )}
          </div>

          <div className="dash-meta">
            {sectorName && <span className="dash-chip sector">{sectorName}</span>}
            {project?.language && (
              <span className="dash-chip lang">{project.language === "ar" ? "العربية" : "Français"}</span>
            )}
            <span className="dash-chip date">{t.created} {formatDate(project?.created_at, lang)}</span>
            <span className="dash-chip" style={{ background:"rgba(255,255,255,0.04)" }}>
              {t.progress}: {answeredCount} {t.questionsAnswered}
              <span style={{
                display:"inline-block", width:60, height:6, borderRadius:3, background:"rgba(255,255,255,0.1)", marginLeft:8, verticalAlign:"middle"
              }}>
                <span style={{ display:"block", width:`${intakePct}%`, height:"100%", borderRadius:3, background:"var(--orange)", transition:"width 0.4s" }} />
              </span>
            </span>
          </div>
        </div>

        {error && <div className="error-banner" role="alert" style={{ marginBottom: 20 }}>{error}</div>}

        {/* ── Two-column layout ── */}
        <div className="pf-shell">
          {/* ── Left sidebar ── */}
          <aside className="pf-aside">
            {/* Stage card */}
            <div className="pf-card">
              <h3 className="pf-card-title">{t.stage}</h3>
              <div className="dash-stage-row" style={{ gridTemplateColumns: "1fr" }}>
                <div className="dash-stage-card">
                  <div className="dash-stage-label">{hasAudit ? t.classified : t.provisionalStage}</div>
                  <div className="dash-stage-name">{classifiedName}</div>
                  <div className="dash-stage-num">{classifiedStage ? `Stade ${classifiedStage}/6` : "—"}</div>
                  {!hasAudit && effectiveDiagnostic && (
                    <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-sub)" }}>
                      {confidencePct}%
                    </div>
                  )}
                </div>
                {declaredStage && (
                  <div className="dash-stage-card declared">
                    <div className="dash-stage-label">{t.declared}</div>
                    <div className="dash-stage-name">{declaredName}</div>
                    <div className="dash-stage-num">Stade {declaredStage}/6</div>
                  </div>
                )}
                {!hasAudit && !effectiveDiagnostic && (
                  <div className="dash-stage-card empty">
                    <div className="dash-stage-name">{t.noAudit}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Scores */}
            {scoreVector && (
              <div className="pf-card">
                <h3 className="pf-card-title">{t.scores}</h3>
                <ScoreGrid vector={scoreVector} lang={lang} />
              </div>
            )}

            {/* Actions */}
            <div className="pf-card">
              <h3 className="pf-card-title">{t.actions}</h3>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {hasAudit ? (
                  <>
                    <button className="primary" onClick={() => onViewAudit(pid, audit)} style={{ width:"100%" }}>
                      {t.viewLastAudit}
                    </button>
                    <button className="primary" onClick={() => onRunAudit(pid)} style={{ width:"100%", background:"var(--cyan)", borderColor:"var(--cyan)" }}>
                      {t.recalculateAudit}
                    </button>
                  </>
                ) : (
                  <button className="primary" onClick={() => onRunAudit(pid)} style={{ width:"100%" }}>
                    {t.auditNow}
                  </button>
                )}
                <button className="ghost" onClick={() => onMonParcours(pid)} style={{ width:"100%", borderColor:"var(--orange-border)", color:"var(--orange)" }}>
                  🗺 {t.monParcours}
                </button>
                <button className="danger-btn" onClick={() => setShowDelete(true)} disabled={deleting} style={{ width:"100%" }}>
                  {deleting ? <span className="spinner" /> : t.deleteProject}
                </button>
              </div>
            </div>
          </aside>

          {/* ── Right main: Profile sections ── */}
          <main className="pf-main">
            {/* Edit / Save bar */}
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16, gap:8 }}>
              {editing ? (
                <>
                  <button className="ghost" onClick={cancelEditing} disabled={saving}>{t.cancel}</button>
                  <button className="primary" onClick={saveProfile} disabled={saving}>
                    {saving ? <span className="spinner" /> : t.save}
                  </button>
                </>
              ) : (
                <button className="ghost" onClick={startEditing}>{t.editing}</button>
              )}
            </div>

            {/* Adaptive Intake Card */}
            {nextQ && !editing && (
              <section className="pf-card adaptive-card" style={{ marginBottom: 16 }}>
                <AutoFill pid={pid} api={api} lang={lang} onApplied={handleAutofillApplied} />
                <div className="adaptive-header">
                  {nextQ.triggered_by === "ai_probe" ? (
                    <span className="adaptive-badge ai-probe" style={{ background: "rgba(124, 109, 245, 0.10)", border: "1px solid rgba(124, 109, 245, 0.45)", color: "#9b8cff" }}>
                      🤖 {ar ? "متابعة بالذكاء الاصطناعي" : "Suivi IA"}
                    </span>
                  ) : (
                    <span className="adaptive-badge">⚡ {ar ? "سؤال تكيفي مقترح" : "Question adaptative recommandée"}</span>
                  )}
                  {progress && (
                    <span style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>
                      {progress.answered} / {progress.total} {ar ? "إجابة" : "réponses"} ({Math.round((progress.answered / progress.total) * 100)}%)
                    </span>
                  )}
                </div>

                {!!intakeGroups.length && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, margin: "14px 0 10px" }}>
                    {intakeGroups.map((group) => {
                      const pct = Math.round((group.answered / Math.max(group.total, 1)) * 100);
                      return (
                        <div
                          key={group.id}
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            border: group.active ? "1px solid var(--orange-border)" : "1px solid var(--border)",
                            background: group.active ? "var(--orange-soft)" : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: group.active ? "var(--orange)" : "var(--text)" }}>{group.label}</span>
                            <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{group.answered}/{group.total}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: group.active ? "var(--orange)" : "var(--cyan)" }} />
                          </div>
                          {group.active && (
                            <div style={{ marginTop: 6, fontSize: "0.7rem", color: "var(--orange)" }}>{t.activeArea}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {effectiveDiagnostic && !intakeComplete && (
                  <div style={{ margin: "10px 0 16px", padding: 14, borderRadius: 12, border: "1px solid var(--orange-border)", background: "rgba(245, 158, 11, 0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--orange)" }}>{t.provisionalStage}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-sub)", marginTop: 4 }}>{t.provisionalSub}</div>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>{classifiedName} · {confidencePct}%</div>
                    </div>
                    {nextBlockingGate && (
                      <div style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--text)" }}>
                        <strong>{t.nextGate}:</strong>{" "}
                        {STAGE_LABELS[lang]?.[nextBlockingGate.stage] || nextBlockingGate.name}
                        {" — "}
                        {ar ? nextBlockingGate.evidence_ar || nextBlockingGate.evidence : nextBlockingGate.evidence}
                      </div>
                    )}
                    {diagnosisRationale && (
                      <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-sub)", lineHeight: 1.5 }}>
                        <strong>{t.answerBasis}:</strong> {diagnosisRationale}
                      </div>
                    )}
                    {activeGroup && (
                      <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-sub)" }}>
                        {t.activeArea}: <strong style={{ color: "var(--text)" }}>{activeGroup.label}</strong>
                      </div>
                    )}
                  </div>
                )}

                {agentTrace && (
                  <AgentTrace trace={agentTrace.trace} value={agentTrace.value} question={nextQ} lang={lang} />
                )}

                <div style={{ margin: "12px 0" }}>
                  <h2 className="adaptive-prompt" style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 6px 0" }}>
                    {ar && nextQ.prompt_ar ? nextQ.prompt_ar : nextQ.prompt_fr}
                  </h2>
                  {(ar && nextQ.help_ar ? nextQ.help_ar : nextQ.help_fr) && (
                    <p className="adaptive-help" style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: "0 0 16px 0" }}>
                      {ar && nextQ.help_ar ? nextQ.help_ar : nextQ.help_fr}
                    </p>
                  )}
                </div>

                <div className="adaptive-input-container" style={{ margin: "16px 0" }}>
                  {renderAdaptiveInput()}
                </div>

                <div className="adaptive-actions" style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
                  <button
                    className="primary"
                    disabled={answering || qValue === "" || qValue === null}
                    onClick={() => handleAnswerQuestion(nextQ.id, coerceValue(nextQ, qValue))}
                    style={{ minWidth: 140 }}
                  >
                    {answering ? <span className="spinner" /> : t.valider}
                  </button>
                  <button
                    className="ghost"
                    disabled={answering}
                    onClick={() => handleSkipQuestion(nextQ.id)}
                  >
                    {t.passer}
                  </button>
                  <button
                    className="ghost"
                    disabled={answering}
                    onClick={() => onRunAudit(pid)}
                    style={{ color: "var(--orange)", borderColor: "var(--orange-border)", marginLeft: "auto" }}
                  >
                    {t.auditNow} →
                  </button>
                </div>
              </section>
            )}

            {/* Section: Identity */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.identity}</h3>
              {editing ? (
                <div className="pf-grid">
                  <TextField label={t.name} value={data?.name} onChange={v => updateField("name", v)} ar={ar} />
                  <SelectField label={t.sector} value={data?.sector} onChange={v => updateField("sector", v)} options={sectorOpts} ar={ar} />
                  <SelectField label={t.language} value={data?.language} onChange={v => updateField("language", v)}
                    options={[{value:"fr",label:"Français"},{value:"ar",label:"العربية"},{value:"en",label:"English"}]} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.name} value={project?.name} />
                  <FieldValue label={t.sector} value={sectorName} />
                  <FieldValue label={t.language} value={project?.language === "ar" ? "العربية" : project?.language === "en" ? "English" : "Français"} />
                </div>
              )}
            </section>

            {/* Section: Self-Assessment */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.selfAssessment}</h3>
              {editing ? (
                <div className="pf-grid">
                  <SelectField label={t.declaredStage} value={data?.self_assessment?.declared_stage}
                    onChange={v => { const sa = {...data.self_assessment, declared_stage: v}; updateField("self_assessment", sa); }}
                    options={stageOpts} ar={ar} />
                  <ToggleField label={t.declaredRevenue} value={data?.self_assessment?.declared_revenue}
                    onChange={v => { const sa = {...data.self_assessment, declared_revenue: v}; updateField("self_assessment", sa); }} />
                  <SelectField label={t.legalForm} value={data?.legal_form}
                    onChange={v => updateField("legal_form", v)}
                    options={[{value:"None",label:"Aucune"},{value:"SUARL",label:"SUARL"},{value:"SARL",label:"SARL"},{value:"SA",label:"SA"},{value:"Startup Act Pre-label",label:"Startup Act Pre-label"},{value:"Startup Act Label",label:"Startup Act Label"}]} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.declaredStage} value={project?.self_assessment?.declared_stage ? STAGE_LABELS[lang]?.[project.self_assessment.declared_stage] : null} />
                  <FieldValue label={t.declaredRevenue} value={project?.self_assessment?.declared_revenue === true ? "✓" : project?.self_assessment?.declared_revenue === false ? "✗" : null} />
                  <FieldValue label={t.legalForm} value={project?.legal_form} />
                </div>
              )}
            </section>

            {/* Section: Market */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.market}</h3>
              {editing ? (
                <div className="pf-grid">
                  <ToggleField label={t.problemStatement} value={data?.has_problem_statement} onChange={v => updateField("has_problem_statement", v)} />
                  <ToggleField label={t.userSegment} value={data?.user_segment_identified} onChange={v => updateField("user_segment_identified", v)} />
                  <NumField label={t.tam} value={data?.market?.estimated_tam_tnd} onChange={v => updateField("market", {...data.market, estimated_tam_tnd: v})} />
                  <NumField label={t.competitors} value={data?.market?.competitor_headcount} onChange={v => updateField("market", {...data.market, competitor_headcount: v})} />
                  <ToggleField label={t.customerValidation} value={data?.market?.customer_validation_evidence} onChange={v => updateField("market", {...data.market, customer_validation_evidence: v})} />
                  <TagsField label={t.competitorNames} value={data?.competitor_names} onChange={v => updateField("competitor_names", v)} ar={ar} />
                  <TextareaField label={t.differentiation} value={data?.differentiation_narrative} onChange={v => updateField("differentiation_narrative", v)} ar={ar} />
                  <NumField label={t.userCount} value={data?.user_count} onChange={v => updateField("user_count", v)} />
                  <NumField label={t.growthRate} value={data?.growth_rate_pct} onChange={v => updateField("growth_rate_pct", v)} />
                  <NumField label={t.cac} value={data?.cac_tnd} onChange={v => updateField("cac_tnd", v)} />
                  <NumField label={t.ltv} value={data?.ltv_tnd} onChange={v => updateField("ltv_tnd", v)} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.problemStatement} value={project?.has_problem_statement === true ? "✓" : project?.has_problem_statement === false ? "✗" : null} />
                  <FieldValue label={t.userSegment} value={project?.user_segment_identified === true ? "✓" : project?.user_segment_identified === false ? "✗" : null} />
                  <FieldValue label={t.tam} value={project?.market?.estimated_tam_tnd != null ? `${project.market.estimated_tam_tnd.toLocaleString()} TND` : null} />
                  <FieldValue label={t.competitors} value={project?.market?.competitor_headcount} />
                  <FieldValue label={t.customerValidation} value={project?.market?.customer_validation_evidence === true ? "✓" : project?.market?.customer_validation_evidence === false ? "✗" : null} />
                  <FieldValue label={t.competitorNames} value={project?.competitor_names?.join(", ")} />
                  <FieldValue label={t.differentiation} value={project?.differentiation_narrative} />
                  <FieldValue label={t.userCount} value={project?.user_count} />
                  <FieldValue label={t.growthRate} value={project?.growth_rate_pct != null ? `${project.growth_rate_pct}%` : null} />
                  <FieldValue label={t.cac} value={project?.cac_tnd != null ? `${project.cac_tnd} TND` : null} />
                  <FieldValue label={t.ltv} value={project?.ltv_tnd != null ? `${project.ltv_tnd} TND` : null} />
                </div>
              )}
            </section>

            {/* Section: Commercial */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.commercial}</h3>
              {editing ? (
                <div className="pf-grid">
                  <SelectField label={t.mvpStage} value={data?.commercial?.mvp_stage}
                    onChange={v => updateField("commercial", {...data.commercial, mvp_stage: v})}
                    options={[{value:"Concept",label:"Concept"},{value:"Mockup",label:"Mockup"},{value:"Prototype",label:"Prototype"},{value:"Production",label:"Production"}]} ar={ar} />
                  <SelectField label={t.pricing} value={data?.commercial?.pricing_framework}
                    onChange={v => updateField("commercial", {...data.commercial, pricing_framework: v})}
                    options={[{value:"Freemium",label:"Freemium"},{value:"B2B SaaS",label:"B2B SaaS"},{value:"Transactional",label:"Transactional"}]} ar={ar} />
                  <ToggleField label={t.declaredRevenue} value={data?.has_revenue_model} onChange={v => updateField("has_revenue_model", v)} />
                  <ToggleField label={t.problemStatement} value={data?.repeatable_sales} onChange={v => updateField("repeatable_sales", v)} />
                  <NumField label={t.monthlyRevenue} value={data?.monthly_revenue_tnd} onChange={v => updateField("monthly_revenue_tnd", v)} />
                  <TextareaField label={t.valueProposition} value={data?.commercial?.value_proposition_narrative}
                    onChange={v => updateField("commercial", {...data.commercial, value_proposition_narrative: v})} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.mvpStage} value={project?.commercial?.mvp_stage} />
                  <FieldValue label={t.pricing} value={project?.commercial?.pricing_framework} />
                  <FieldValue label={t.declaredRevenue} value={project?.has_revenue_model === true ? "✓" : project?.has_revenue_model === false ? "✗" : null} />
                  <FieldValue label={t.problemStatement} value={project?.repeatable_sales === true ? "✓" : project?.repeatable_sales === false ? "✗" : null} />
                  <FieldValue label={t.monthlyRevenue} value={project?.monthly_revenue_tnd != null ? `${project.monthly_revenue_tnd.toLocaleString()} TND` : null} />
                </div>
              )}
            </section>

            {/* Section: Innovation */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.innovation}</h3>
              {editing ? (
                <div className="pf-grid">
                  <SelectField label={t.geoNovelty} value={data?.innovation?.geo_novelty}
                    onChange={v => updateField("innovation", {...data.innovation, geo_novelty: v})}
                    options={[{value:"Reproduction",label:"Reproduction"},{value:"Local-Opt",label:"Local-Opt"},{value:"Tunisian First-Mover",label:"Tunisian First-Mover"},{value:"Global",label:"Global"}]} ar={ar} />
                  <TagsField label={t.techStack} value={data?.innovation?.tech_stack} onChange={v => updateField("innovation", {...data.innovation, tech_stack: v})} ar={ar} />
                  <SelectField label={t.ipStatus} value={data?.innovation?.ip_status}
                    onChange={v => updateField("innovation", {...data.innovation, ip_status: v})}
                    options={[{value:"None",label:"Aucun"},{value:"Copyright",label:"Copyright"},{value:"Patent Pending",label:"Patent Pending"},{value:"Registered",label:"Registered"}]} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.geoNovelty} value={project?.innovation?.geo_novelty} />
                  <FieldValue label={t.techStack} value={project?.innovation?.tech_stack?.join(", ")} />
                  <FieldValue label={t.ipStatus} value={project?.innovation?.ip_status} />
                </div>
              )}
            </section>

            {/* Section: Scalability */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.scalability}</h3>
              {editing ? (
                <div className="pf-grid">
                  <NumField label={t.humanDependency} value={data?.scalability?.human_dependency} onChange={v => updateField("scalability", {...data.scalability, human_dependency: v})} />
                  <NumField label={t.equipmentCost} value={data?.scalability?.equipment_cost} onChange={v => updateField("scalability", {...data.scalability, equipment_cost: v})} />
                  <NumField label={t.monthlyOverhead} value={data?.scalability?.monthly_overhead} onChange={v => updateField("scalability", {...data.scalability, monthly_overhead: v})} />
                  <TagsField label={t.crossBorder} value={data?.scalability?.cross_border_zones} onChange={v => updateField("scalability", {...data.scalability, cross_border_zones: v})} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.humanDependency} value={project?.scalability?.human_dependency} />
                  <FieldValue label={t.equipmentCost} value={project?.scalability?.equipment_cost != null ? `${project.scalability.equipment_cost.toLocaleString()} TND` : null} />
                  <FieldValue label={t.monthlyOverhead} value={project?.scalability?.monthly_overhead != null ? `${project.scalability.monthly_overhead.toLocaleString()} TND` : null} />
                  <FieldValue label={t.crossBorder} value={project?.scalability?.cross_border_zones?.join(", ")} />
                </div>
              )}
            </section>

            {/* Section: Green / ESG */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.green}</h3>
              {editing ? (
                <div className="pf-grid">
                  <SelectField label={t.footprint} value={data?.green?.footprint_category}
                    onChange={v => updateField("green", {...data.green, footprint_category: v})}
                    options={[{value:"Digital Native",label:"Digital Native"},{value:"Paper Use",label:"Paper Use"},{value:"Compute Intensive",label:"Compute Intensive"},{value:"Agri Waste",label:"Agri Waste"}]} ar={ar} />
                  <ToggleField label={t.circularRecycling} value={data?.green?.circular_recycling}
                    onChange={v => updateField("green", {...data.green, circular_recycling: v})} />
                  <SDGField label={t.sdg} value={data?.green?.sdg_targets}
                    onChange={v => updateField("green", {...data.green, sdg_targets: v})} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.footprint} value={project?.green?.footprint_category} />
                  <FieldValue label={t.circularRecycling} value={project?.green?.circular_recycling === true ? "✓" : project?.green?.circular_recycling === false ? "✗" : null} />
                  <FieldValue label={t.sdg} value={project?.green?.sdg_targets?.join(", ")} />
                </div>
              )}
            </section>

            {/* Section: Team & Finance */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.teamFinance}</h3>
              {editing ? (
                <div className="pf-grid">
                  <NumField label={t.teamSize} value={data?.team_size} onChange={v => updateField("team_size", v)} />
                  <TagsField label={t.keyHires} value={data?.key_hires} onChange={v => updateField("key_hires", v)} ar={ar} />
                  <NumField label={t.burnRate} value={data?.burn_rate_tnd} onChange={v => updateField("burn_rate_tnd", v)} />
                  <NumField label={t.runwayMonths} value={data?.runway_months} onChange={v => updateField("runway_months", v)} />
                  <TextField label={t.incorporationDate} value={data?.incorporation_date} onChange={v => updateField("incorporation_date", v)} ar={ar} />
                  <TextField label={t.fiscalRegime} value={data?.fiscal_regime} onChange={v => updateField("fiscal_regime", v)} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.teamSize} value={project?.team_size} />
                  <FieldValue label={t.keyHires} value={project?.key_hires?.join(", ")} />
                  <FieldValue label={t.burnRate} value={project?.burn_rate_tnd != null ? `${project.burn_rate_tnd.toLocaleString()} TND` : null} />
                  <FieldValue label={t.runwayMonths} value={project?.runway_months} />
                  <FieldValue label={t.incorporationDate} value={project?.incorporation_date} />
                  <FieldValue label={t.fiscalRegime} value={project?.fiscal_regime} />
                </div>
              )}
            </section>

            {/* Section: Validation */}
            <section className="pf-card">
              <h3 className="pf-card-title">{t.validation}</h3>
              {editing ? (
                <div className="pf-grid">
                  <TextareaField label={t.validationProof} value={data?.validation_evidence_narrative}
                    onChange={v => updateField("validation_evidence_narrative", v)} ar={ar} />
                </div>
              ) : (
                <div className="pf-ro-grid">
                  <FieldValue label={t.validationProof} value={project?.validation_evidence_narrative} />
                </div>
              )}
            </section>

            {/* Section: Evidence Documents */}
            {!editing && (
              <section className="pf-card">
                <h3 className="pf-card-title">{ar ? "وثائق الإثبات المرفقة" : "Documents justificatifs & Preuves"}</h3>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
                  {ar
                    ? "أضف وثائق أو تقارير (مثل خطة العمل، استبيان التحقق، بطاقة تقنية) لدعم تشخيصك التكيفي."
                    : "Téléversez des rapports ou fichiers (pitch deck, étude, registre commercial, etc.) pour appuyer votre diagnostic."}
                </p>
                <DocumentsManager pid={pid} lang={lang} api={api} />
              </section>
            )}
          </main>
        </div>

        {/* Delete Confirmation */}
        {showDelete && (
          <div className="modal-overlay" onClick={() => setShowDelete(false)}>
            <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
              <h3 style={{ marginBottom: 12 }}>{t.confirmDelete}</h3>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button className="ghost" onClick={() => setShowDelete(false)}>
                  {ar ? "إلغاء" : "Annuler"}
                </button>
                <button className="danger-btn" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner" /> : (ar ? "حذف" : "Supprimer")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
