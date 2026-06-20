import { useEffect, useState } from "react";
import { api } from "./api.js";
import Landing    from "./components/Landing.jsx";
import Interview  from "./components/Interview.jsx";
import Processing from "./components/Processing.jsx";
import Results    from "./components/Results.jsx";
import History    from "./components/History.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import Topbar from "./components/Topbar.jsx";
import EvaluationReport from "./components/EvaluationReport.jsx";


export default function App() {
  /* ── Global state ── */
  const [phase,  setPhase]  = useState("start");   // start | intake | processing | audit | history
  const [lang,   setLang]   = useState(() => localStorage.getItem("firasa_lang") || "fr");
  const [health, setHealth] = useState(null);
  const [error,  setError]  = useState(null);

  /* ── Project / intake state ── */
  const [pid,      setPid]      = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [audit,    setAudit]    = useState(null);
  const [busy,     setBusy]     = useState(false);

  /* ── Persistent state ── */
  const [history,  setHistory]  = useState([]);
  const [checked,  setChecked]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("firasa_milestones") || "{}"); }
    catch { return {}; }
  });

  const [theme, setTheme] = useState(() => localStorage.getItem("firasa_theme") || "dark");

  const [user, setUser] = useState({ name: "Entrepreneur", plan: "free" });
  const [plan, setPlan] = useState("free");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileReturnPhase, setProfileReturnPhase] = useState("start");
  const [showLimitModal, setShowLimitModal] = useState(false);

  async function autoLogin() {
    const mockCredentials = {
      email: "mock.developer@firasa.tn",
      password: "password123",
      name: "Entrepreneur",
    };
    try {
      const res = await api.login(mockCredentials);
      setUser(res);
      setPlan(res.plan || "free");
      await refreshHistory();
    } catch {
      try {
        const res = await api.register(mockCredentials);
        setUser(res);
        setPlan(res.plan || "free");
        await refreshHistory();
      } catch (err) {
        console.error("Auto login failed:", err);
      }
    }
  }

  /* ── Bootstrap ── */
  useEffect(() => {
    localStorage.setItem("firasa_theme", theme);
    if (theme === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("firasa_lang", lang);
    document.documentElement.dir  = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: "down" }));
    const token = api.getToken();
    if (token) {
      api.me()
        .then((me) => {
          setUser(me);
          setPlan(me.plan || "free");
          return refreshHistory();
        })
        .catch(() => {
          api.setToken(null);
          autoLogin();
        });
    } else {
      autoLogin();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("firasa_milestones", JSON.stringify(checked));
  }, [checked]);

  /* ── Helpers ── */
  async function refreshHistory() {
    const projects = await api.listProjects();
    const normalised = projects.map((p) => ({
      project_id: p.project_id,
      name: p.name || "Projet",
      sector: p.sector || null,
      ts: p.audited_at ? Date.parse(p.audited_at) : Date.now(),
      ...p,
    }));
    setHistory(normalised);
    localStorage.setItem("firasa_history", JSON.stringify(normalised));
    return normalised;
  }

  function saveHistory(project_id, name, sector) {
    const entry   = { project_id, name, sector, ts: Date.now() };
    const updated = [entry, ...history.filter(h => h.project_id !== project_id)].slice(0, 6);
    setHistory(updated);
    localStorage.setItem("firasa_history", JSON.stringify(updated));
  }

  function saveVector(projectId, vector) {
    try {
      const v = JSON.parse(localStorage.getItem("firasa_vectors") || "{}");
      v[projectId] = vector;
      localStorage.setItem("firasa_vectors", JSON.stringify(v));
    } catch {}
  }

  /* ── Phase: start → intake ── */
  async function handleStart(name) {
    if (!user) {
      await autoLogin();
    }
    setBusy(true); setError(null);
    try {
      const projectName = name || "";
      const res = await api.createProject(projectName, lang);
      setPid(res.project_id);
      setQuestion(res.next_question);
      setProgress(res.progress);
      saveHistory(res.project_id, projectName || (lang === "ar" ? "مشروع جديد" : "Nouveau Projet"), null);
      setPhase("intake");
    } catch (err) {
      if (err.message.includes("limit reached") || err.message.includes("Limit reached") || err.message.includes("limite")) {
        setShowLimitModal(true);
      } else {
        setError(err.message);
      }
    }
    finally { setBusy(false); }
  }

  /* ── Phase: resume existing ── */
  async function handleResume(existingId) {
    setBusy(true); setError(null);
    try {
      const proj = await api.getProject(existingId);
      setPid(existingId);
      const qRes = await api.nextQuestion(existingId);
      saveHistory(existingId, proj.name || "Projet", proj.sector);

      if (qRes.next_question) {
        setQuestion(qRes.next_question);
        setProgress(qRes.progress);
        setPhase("intake");
      } else {
        await runAudit(existingId);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  /* ── Phase: intake → answer ── */
  async function handleAnswer(questionId, value) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.answer(pid, questionId, value);
      if (questionId === "sector") {
        saveHistory(pid, history.find(h => h.project_id === pid)?.name || "", value);
      }
      if (res.intake_complete || !res.next_question) {
        // transition to processing — fire audit in parallel with minimum wait
        await handleRunAudit();
      } else {
        setQuestion(res.next_question);
        setProgress(res.progress);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  /* ── Phase: intake → processing → audit ── */
  async function handleRunAudit() {
    setPhase("processing");
    setError(null);
    try {
      const [res] = await Promise.all([
        api.audit(pid),
        new Promise(r => setTimeout(r, 2800)),  // minimum animation time
      ]);
      if (res.scores?.vector) saveVector(pid, res.scores.vector);
      setAudit(res);
      setPhase("audit");
    } catch (err) {
      setError(err.message);
      setPhase("intake");  // back to intake on error
    }
  }

  async function runAudit(projectId) {
    setPhase("processing");
    try {
      const [res] = await Promise.all([
        api.audit(projectId),
        new Promise(r => setTimeout(r, 2800)),
      ]);
      if (res.scores?.vector) saveVector(projectId, res.scores.vector);
      setAudit(res);
      setPhase("audit");
    } catch (err) {
      setError(err.message);
      setPhase("start");
    }
  }

  /* ── Milestone toggle ── */
  function toggleMilestone(order) {
    const key = `${pid}_${order}`;
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ── Restart ── */
  function restart() {
    setPhase("start"); setPid(null); setAudit(null);
    setQuestion(null); setProgress(null); setError(null);
  }

  /* ── History: load saved audit without re-running pipeline ── */
  function handleViewFromHistory(projectId, auditData) {
    setPid(projectId);
    setAudit(auditData);
    setPhase("audit");
  }

  function handleProjectDeleted(projectId) {
    const nextHistory = history.filter(h => h.project_id !== projectId);
    setHistory(nextHistory);
    localStorage.setItem("firasa_history", JSON.stringify(nextHistory));
    setChecked(prev => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (!key.startsWith(`${projectId}_`)) next[key] = value;
      });
      return next;
    });
    if (pid === projectId) {
      setPid(null);
      setAudit(null);
      setQuestion(null);
      setProgress(null);
    }
  }

  function handleAuthUser(nextUser) {
    setUser(nextUser);
    setPlan(nextUser?.plan || "free");
    refreshHistory().catch(() => {});
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setPlan("free");
    setHistory([]);
    restart();
  }

  function handlePlanUser(nextUser) {
    setUser(nextUser);
    setPlan(nextUser?.plan || "free");
  }

  function openProfilePage() {
    if (!user) {
      setShowProfileModal(true);
      return;
    }
    setProfileReturnPhase(phase);
    setPhase("profile");
  }

  function closeProfilePage() {
    setPhase(profileReturnPhase || "start");
  }

  function openHistory() {
    if (!user) {
      setError(lang === "ar"
        ? "سجّل الدخول لعرض مشاريعك."
        : "Connectez-vous pour afficher vos projets.");
      setShowProfileModal(true);
      return;
    }
    setPhase("history");
  }

  /* ── Render ── */
  return (
    <>
      {phase !== "processing" && (
        <Topbar
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          health={health}
          onLogoClick={restart}
          onEvalClick={() => setPhase("eval")}
        />
      )}

      {error && (
        <div className="error-banner" style={{ maxWidth:900, margin:"16px auto", borderRadius:10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {phase === "start" && (
        <Landing
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          health={health}
          history={history}
          busy={busy}
          onStart={handleStart}
          onResume={handleResume}
          onViewHistory={openHistory}
        />
      )}

      {phase === "history" && (
        <History
          lang={lang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          api={api}
          onBack={() => setPhase("start")}
          onView={handleViewFromHistory}
          onResume={handleResume}
          onDeleted={handleProjectDeleted}
        />
      )}

      {phase === "intake" && question && (
        <Interview
          lang={lang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          question={question}
          progress={progress}
          busy={busy}
          onSubmit={handleAnswer}
          onSkipToAudit={handleRunAudit}
          pid={pid}
          api={api}
        />
      )}

      {phase === "processing" && (
        <Processing lang={lang} />
      )}

      {phase === "audit" && audit && (
        <Results
          audit={audit}
          pid={pid}
          lang={lang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          onNewAudit={restart}
          checkedMilestones={checked}
          onToggleMilestone={toggleMilestone}
          api={api}
          onAuditUpdated={setAudit}
        />
      )}

      {phase === "profile" && user && (
        <ProfilePage
          user={user}
          plan={plan}
          history={history}
          lang={lang}
          api={api}
          onBack={closeProfilePage}
          onLogout={handleLogout}
          onUserUpdated={handleAuthUser}
          onProjectDeleted={handleProjectDeleted}
          onResumeProject={async (projectId) => {
            closeProfilePage();
            await handleResume(projectId);
          }}
        />
      )}

      {phase === "eval" && (
        <EvaluationReport
          lang={lang}
          api={api}
          onBack={restart}
        />
      )}

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onLogin={handleAuthUser}
        onLogout={handleLogout}
        plan={plan}
        onUpgrade={handlePlanUser}
        history={history}
        lang={lang}
        onResume={handleResume}
        api={api}
      />

      {showLimitModal && (
        <div className="modal-overlay" onClick={() => setShowLimitModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: "2.8rem", lineHeight: 1 }}>🔒</div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
              {lang === "ar" ? "تم الوصول إلى الحد الأقصى للمشاريع" : "Limite de projets atteinte"}
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--text-sub)", lineHeight: 1.4, margin: 0 }}>
              {lang === "ar"
                ? `باقة اشتراكك الحالية (${plan === "free" ? "مجاني" : plan === "plus" ? "بلس" : "برو"}) تسمح لك بحد أقصى من المشاريع. يرجى ترقية اشتراكك أو حذف بعض المشاريع السابقة من ملفك الشخصي لإتاحة مساحة.`
                : `Votre abonnement actuel (${plan === "free" ? "Gratuit" : plan === "plus" ? "Plus" : "Pro"}) a atteint sa limite de projets. Veuillez mettre à niveau votre plan ou supprimer des projets existants depuis votre profil pour continuer.`}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
              <button
                className="ghost"
                onClick={() => setShowLimitModal(false)}
                style={{ minWidth: 120 }}
              >
                {lang === "ar" ? "إلغاء" : "Fermer"}
              </button>
              <button
                className="primary"
                onClick={() => {
                  setShowLimitModal(false);
                  openProfilePage();
                }}
                style={{ minWidth: 120 }}
              >
                {lang === "ar" ? "الملف الشخصي" : "Voir mon profil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
