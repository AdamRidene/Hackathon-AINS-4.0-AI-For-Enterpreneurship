import { useEffect, useState } from "react";

const SECTOR_LABELS = {
  fr: { "agri-food":"Agri-food","digital-saas":"SaaS & Numérique","industry":"Industrie","health":"Santé","greentech":"CleanTech","services":"Services","other":"Autre" },
  ar: { "agri-food":"الصناعات الغذائية","digital-saas":"البرمجيات الرقمية","industry":"الصناعة","health":"الصحة","greentech":"التكنولوجيا الخضراء","services":"الخدمات","other":"قطاع آخر" },
};

const STAGE_NAMES = {
  fr: ["","Idéation","Validation","Développement","Lancement","Croissance","Maturité","Pivot"],
  ar: ["","فكرة","تحقق","تطوير","إطلاق","نمو","نضج","محور"],
};

const DIM_LABELS = ["M","C","I","S","G"];

function MiniScoreBar({ vector }) {
  if (!vector || vector.length < 5) return null;
  return (
    <div className="hist-vector">
      {vector.map((val, i) => (
        <div key={i} className="hist-vec-col">
          <div className="hist-vec-track">
            <div
              className="hist-vec-fill"
              style={{ height: `${Math.round(val * 100)}%` }}
            />
          </div>
          <div className="hist-vec-label">{DIM_LABELS[i]}</div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso, lang) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "ar" ? "ar-TN" : "fr-TN", {
      day:"2-digit", month:"short", year:"numeric",
    });
  } catch { return iso.slice(0, 10); }
}

const TEXTS = {
  fr: {
    title: "Historique des audits",
    sub: "Tous vos projets analysés, triés par date",
    back: "← Retour",
    empty: "Aucun audit enregistré.",
    emptySub: "Lancez votre premier audit depuis l'accueil.",
    view: "Voir les résultats",
    delete: "Supprimer",
    confirmDelete: "Supprimer ce projet et ses données ?",
    stage: "Stade",
    sector: "Secteur",
    audited: "Audité le",
    filters: "Tous",
    loading: "Chargement…",
    error: "Erreur lors du chargement.",
  },
  ar: {
    title: "سجل التدقيقات",
    sub: "جميع مشاريعك المُدققة، مرتبة بالتاريخ",
    back: "رجوع →",
    empty: "لا توجد تدقيقات محفوظة.",
    emptySub: "أطلق تدقيقك الأول من الصفحة الرئيسية.",
    view: "عرض النتائج",
    delete: "حذف",
    confirmDelete: "هل تريد حذف هذا المشروع وبياناته؟",
    stage: "المرحلة",
    sector: "القطاع",
    audited: "تاريخ التدقيق",
    filters: "الكل",
    loading: "جارٍ التحميل…",
    error: "خطأ أثناء التحميل.",
  },
};

const SECTORS = ["agri-food","digital-saas","industry","health","greentech","services","other"];

export default function History({ lang, api, onBack, onView }) {
  const [audits,  setAudits]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState("all");
  const [deleting, setDeleting] = useState(null);
  const [viewing,  setViewing]  = useState(null);

  const ar = lang === "ar";
  const t  = TEXTS[lang];

  useEffect(() => {
    api.listProjects()
      .then(data => { setAudits(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, []);

  const visible = filter === "all"
    ? audits
    : audits.filter(a => a.sector === filter);

  async function handleView(pid) {
    setViewing(pid);
    try {
      const audit = await api.getLastAudit(pid);
      onView(pid, audit);
    } catch (err) {
      setError(err.message);
    } finally {
      setViewing(null);
    }
  }

  async function handleDelete(pid) {
    if (!window.confirm(t.confirmDelete)) return;
    setDeleting(pid);
    try {
      await api.deleteProject(pid);
      setAudits(prev => prev.filter(a => a.project_id !== pid));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  const sectorCounts = {};
  audits.forEach(a => { if (a.sector) sectorCounts[a.sector] = (sectorCounts[a.sector]||0)+1; });
  const presentSectors = SECTORS.filter(s => sectorCounts[s]);

  return (
    <div className="hist-wrap" dir={ar ? "rtl" : "ltr"}>

      {/* ── Header ── */}
      <header className="hist-header">
        <div className="hist-header-inner">
          <div className="hist-header-top">
            <div>
              <button className="ghost-btn" onClick={onBack}>{t.back}</button>
              <h1 className="hist-title">{t.title}</h1>
              <p className="hist-sub">{t.sub}</p>
            </div>
            <div className="hist-count-pill">{audits.length}</div>
          </div>

          {/* Sector filter chips */}
          {presentSectors.length > 0 && (
            <div className="hist-filters">
              <button
                className={`hist-filter-chip${filter === "all" ? " active" : ""}`}
                onClick={() => setFilter("all")}
              >
                {t.filters} · {audits.length}
              </button>
              {presentSectors.map(s => (
                <button
                  key={s}
                  className={`hist-filter-chip${filter === s ? " active" : ""}`}
                  onClick={() => setFilter(s)}
                >
                  {SECTOR_LABELS[lang][s]} · {sectorCounts[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="hist-content">
        {error && (
          <div className="error-banner" style={{ marginBottom: 24 }}>
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="hist-loading">{t.loading}</div>
        )}

        {!loading && visible.length === 0 && (
          <div className="hist-empty">
            <div className="hist-empty-icon">◎</div>
            <div className="hist-empty-title">{t.empty}</div>
            <div className="hist-empty-sub">{t.emptySub}</div>
            <button className="primary" style={{ marginTop: 24 }} onClick={onBack}>{t.back}</button>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="hist-grid">
            {visible.map((a, i) => {
              const stageName = a.stage ? (STAGE_NAMES[lang][a.stage] || `S${a.stage}`) : "—";
              const sectorName = a.sector ? (SECTOR_LABELS[lang][a.sector] || a.sector) : null;
              const isViewing  = viewing  === a.project_id;
              const isDeleting = deleting === a.project_id;

              return (
                <div
                  key={a.project_id}
                  className="hist-card"
                  style={{ animationDelay: `${i * 0.045}s` }}
                >
                  {/* Card header */}
                  <div className="hist-card-top">
                    <div className="hist-card-info">
                      <div className="hist-card-name">
                        {a.name || <span style={{ opacity:.4 }}>Sans nom</span>}
                      </div>
                      <div className="hist-card-meta">
                        {sectorName && (
                          <span className="hist-tag cyan">{sectorName}</span>
                        )}
                        {a.stage && (
                          <span className="hist-tag orange">
                            {t.stage} {a.stage} · {stageName}
                          </span>
                        )}
                      </div>
                    </div>
                    <MiniScoreBar vector={a.vector} />
                  </div>

                  {/* Date row */}
                  <div className="hist-card-date">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {t.audited} {formatDate(a.audited_at, lang)}
                    <span className="hist-pid">{a.project_id.slice(0,8)}…</span>
                  </div>

                  {/* Actions */}
                  <div className="hist-card-actions">
                    <button
                      className="primary"
                      style={{ flex: 1 }}
                      onClick={() => handleView(a.project_id)}
                      disabled={isViewing || isDeleting}
                    >
                      {isViewing ? <span className="spinner" /> : t.view}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => handleDelete(a.project_id)}
                      disabled={isViewing || isDeleting}
                      title={t.delete}
                    >
                      {isDeleting ? <span className="spinner" /> : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
