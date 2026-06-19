import { useEffect, useState } from "react";
import { api } from "./api.js";
import Landing    from "./components/Landing.jsx";
import Interview  from "./components/Interview.jsx";
import Processing from "./components/Processing.jsx";
import Results    from "./components/Results.jsx";
import History    from "./components/History.jsx";
import ProfileModal from "./components/ProfileModal.jsx";

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

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("firasa_user")); }
    catch { return null; }
  });
  const [plan, setPlan] = useState(() => localStorage.getItem("firasa_plan") || "free");
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem("firasa_user", JSON.stringify(user));
    else localStorage.removeItem("firasa_user");
  }, [user]);

  useEffect(() => {
    localStorage.setItem("firasa_plan", plan);
  }, [plan]);

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
    try { setHistory(JSON.parse(localStorage.getItem("firasa_history") || "[]")); }
    catch {}
    api.health().then(setHealth).catch(() => setHealth({ status: "down" }));
  }, []);

  useEffect(() => {
    localStorage.setItem("firasa_milestones", JSON.stringify(checked));
  }, [checked]);

  /* ── Helpers ── */
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
    const limit = plan === "pro" ? 5 : plan === "plus" ? 3 : 1;
    if (history.length >= limit) {
      setError(lang === "ar" 
        ? `لقد وصلت إلى الحد الأقصى للمشاريع في خطتك الحالية (${limit} مشاريع). يرجى ترقية حسابك.` 
        : `Vous avez atteint la limite de projets de votre plan actuel (${limit} projets). Veuillez mettre à niveau votre compte.`
      );
      setShowProfileModal(true);
      return;
    }
    setBusy(true); setError(null);
    try {
      const res = await api.createProject(name, lang);
      setPid(res.project_id);
      setQuestion(res.next_question);
      setProgress(res.progress);
      saveHistory(res.project_id, name, null);
      setPhase("intake");
    } catch (err) { setError(err.message); }
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

  /* ── Render ── */
  return (
    <>
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
          openProfile={() => setShowProfileModal(true)}
          health={health}
          history={history}
          busy={busy}
          onStart={handleStart}
          onResume={handleResume}
          onViewHistory={() => setPhase("history")}
        />
      )}

      {phase === "history" && (
        <History
          lang={lang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={() => setShowProfileModal(true)}
          api={api}
          onBack={() => setPhase("start")}
          onView={handleViewFromHistory}
        />
      )}

      {phase === "intake" && question && (
        <Interview
          lang={lang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={() => setShowProfileModal(true)}
          question={question}
          progress={progress}
          busy={busy}
          onSubmit={handleAnswer}
          onSkipToAudit={handleRunAudit}
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
          openProfile={() => setShowProfileModal(true)}
          onNewAudit={restart}
          checkedMilestones={checked}
          onToggleMilestone={toggleMilestone}
          api={api}
        />
      )}

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onLogin={setUser}
        onLogout={() => { setUser(null); setPlan("free"); }}
        plan={plan}
        onUpgrade={setPlan}
        history={history}
        lang={lang}
        onResume={handleResume}
      />
    </>
  );
}
