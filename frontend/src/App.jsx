import { Component, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { auth } from "./auth.js";
import Landing    from "./components/Landing.jsx";
import Interview  from "./components/Interview.jsx";
import Processing from "./components/Processing.jsx";
import Results    from "./components/Results.jsx";
import History    from "./components/History.jsx";
import ProfileModal from "./components/ProfileModal.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import ProjectDashboard from "./components/ProjectDashboard.jsx";
import MonParcours from "./components/MonParcours.jsx";
import Topbar from "./components/Topbar.jsx";
import EvaluationReport from "./components/EvaluationReport.jsx";
import Toast from "./components/Toast.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import Assistant from "./components/Assistant.jsx";
import EmailConfirmationGate from "./components/EmailConfirmationGate.jsx";


function phaseToPath(phase, pid) {
  if (!phase || phase === "start" || phase === "processing") return "/";
  if (pid) return `/${phase}/${pid}`;
  return `/${phase}`;
}

function pathToState(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const seg = parts[0];
  const id = parts[1] || null;
  const withPid = ["dashboard", "intake", "audit", "parcours"];
  const solo = ["history", "profile", "eval"];
  if (!seg) return { phase: "start", pid: null };
  if (solo.includes(seg)) return { phase: seg, pid: null };
  if (withPid.includes(seg) && id) return { phase: seg, pid: id };
  return { phase: "start", pid: null };
}

/** React Error Boundary — prevents white-screen crashes in production. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: 40,
          textAlign: "center", gap: 16,
        }}>
          <div style={{ fontSize: "3rem" }}>⚠️</div>
          <h2 style={{ fontFamily: "var(--f-display)", fontStyle: "italic" }}>
            Une erreur est survenue
          </h2>
          <p style={{ color: "var(--text-sub)", maxWidth: 480 }}>
            {this.state.error?.message || "Erreur inattendue."}
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


export default function App() {
  /* ── Global state ── */
  const [phase,  setPhase]  = useState("start");   // start | intake | processing | audit | history | dashboard | profile | eval
  const [lang,   setLang]   = useState(() => { const stored = localStorage.getItem("firasa_lang"); return (stored === "fr" || stored === "ar") ? stored : "fr"; });
  const [health, setHealth] = useState(null);
  const [error,  setError]  = useState(null);

  /* ── Project / intake state ── */
  const [pid,      setPid]      = useState(null);
  const [question, setQuestion] = useState(null);
  // {trace, value} from the last POST /answer — drives the agent decision timeline
  const [agentTrace, setAgentTrace] = useState(null);
  const [progress, setProgress] = useState(null);
  const [audit,    setAudit]    = useState(null);
  const [busy,     setBusy]     = useState(false);

  /* ── Persistent state ── */
  const [history,  setHistory]  = useState([]);
  const [checked,  setChecked]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("firasa_checked") || localStorage.getItem("firasa_milestones") || "{}"); }
    catch { return {}; }
  });

  const [theme, setTheme] = useState(() => localStorage.getItem("firasa_theme") || "dark");

  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState("free");
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [authModalInitMode, setAuthModalInitMode] = useState("login");
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmLabel, cancelLabel, variant, onConfirm }

  /* ── Browser back/forward: sync phase+pid with the history stack so the
        browser arrows and mouse back/forward buttons navigate views. ── */
  const restoringNav = useRef(false);
  const firstNav = useRef(true);
  useEffect(() => {
    if (restoringNav.current) { restoringNav.current = false; return; }
    if (phase === "processing") return;          // transient spinner — no history entry
    const entry = { phase, pid };
    const path = phaseToPath(phase, pid);
    if (firstNav.current) { firstNav.current = false; window.history.replaceState(entry, "", path); }
    else window.history.pushState(entry, "", path);
  }, [phase, pid]);
  useEffect(() => {
    const onPop = (e) => {
      restoringNav.current = true;
      const s = e.state || {};
      setPid(s.pid ?? null);
      setPhase(s.phase || "start");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // ponytail: views restored from in-memory state; refresh/deep-link to a
  // sub-view isn't supported — that needs a real router with URL paths.

  async function autoLogin() {
    // Only auto-login in dev mode with local/none auth — NEVER in production.
    const mode = auth.getMode();
    if (!import.meta.env.DEV || (mode !== "local" && mode !== "none")) {
      return;
    }
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
    async function bootstrap() {
      // Initialise the auth module first (discovers mode from backend)
      await auth.init();

      // Check health
      api.health().then(setHealth).catch(() => setHealth({ status: "down" }));

      // Restore session from token or Supabase
      try {
        const me = await auth.me();
        if (me) {
          setUser(me);
          setPlan(me.plan || "free");
          await refreshHistory();
          return;
        }
      } catch {
        // No valid session — continue to autoLogin fallback
      }

      // DEV ONLY: auto-create mock user for local development
      await autoLogin();

      // If redirected back from /verify after email confirmation, open login modal
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("verified") === "true") {
        setToast({
          message: lang === "ar"
            ? "تم التحقق من بريدك الإلكتروني! يرجى تسجيل الدخول."
            : "E-mail vérifié ! Connectez-vous pour accéder à votre compte.",
          type: "success",
        });
        setAuthModalInitMode("login");
        setShowProfileModal(true);
        window.history.replaceState({}, "", "/");
      }

      // Restore view from URL path after auth resolves (deep-link support)
      const { phase: urlPhase, pid: urlPid } = pathToState(window.location.pathname);
      if (urlPhase !== "start") {
        if (urlPid) setPid(urlPid);
        setPhase(urlPhase);
      }
    }
    bootstrap().catch((err) => {
      console.error("Bootstrap failed:", err);
      setError(lang === "ar"
        ? "فشل تهيئة التطبيق. يرجى تحديث الصفحة."
        : "Échec de l'initialisation. Veuillez rafraîchir la page.");
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("firasa_checked", JSON.stringify(checked));
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
  async function handleStart(projectName) {
    if (!user) {
      await autoLogin();
    }
    setBusy(true); setError(null);
    try {
      const res = await api.createProject(projectName, lang);
      setPid(res.project_id);
      setQuestion(res.next_question);
      setProgress(res.progress);
      saveHistory(res.project_id, projectName, null);
      setPhase("dashboard");
    } catch (err) {
      if (err.message.includes("limit reached") || err.message.includes("Limit reached") || err.message.includes("limite")) {
        setShowLimitModal(true);
      } else {
        setError(err.message);
      }
    }
    finally { setBusy(false); }
  }

  /* ── Phase: resume existing (Continue intake) ── */
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
        await runAudit(existingId, "start");
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  /* ── Phase: view project (Dashboard — READ-ONLY) ── */
  function handleViewProject(projectId) {
    setPid(projectId);
    setPhase("dashboard");
  }

  /* ── Phase: view audit from dashboard ── */
  function handleViewAuditFromDashboard(projectId, auditData) {
    setPid(projectId);
    setAudit(auditData);
    setPhase("audit");
  }

  /* ── Phase: continue intake from dashboard ── */
  async function handleContinueIntake(projectId) {
    await handleResume(projectId);
  }

  /* ── Phase: edit project from dashboard ── */
  async function handleEditProject(projectId) {
    // Go to intake with the existing project for editing
    await handleResume(projectId);
  }

  /* ── Phase: Mon Parcours ── */
  function handleMonParcours(projectId) {
    setPid(projectId);
    setPhase("parcours");
  }

  /* ── Skip to audit confirmation ── */
  function handleSkipConfirm() {
    setConfirmDialog({
      title: lang === "ar"
        ? "إطلاق التدقيق الآن؟"
        : "Lancer l'audit maintenant ?",
      message: lang === "ar"
        ? "لم تجِب بعد على بعض الأسئلة. قد تكون المؤشرات منقوصة أو مغلقة:\n\n• مؤشر السوق: قد يُسقف عند 30 بسبب غياب التحقق من العملاء\n• مؤشر القابلية للتوسع: سيظل منخفضًا دون معطيات التكاليف\n• المؤشر البيئي: قد يكون صفرًا دون معطيات الاستدامة\n\nننصح بإكمال الأسئلة للحصول على تشخيص أدق."
        : "Vous n'avez pas répondu à toutes les questions. Vos scores pourraient être incomplets ou plafonnés :\n\n• Score Marché : peut être plafonné à 30 sans preuve de validation client\n• Score Scalabilité : restera bas sans données de coûts\n• Score Green : peut être à zéro sans données de durabilité\n\nNous vous conseillons de compléter le questionnaire pour un diagnostic plus précis.",
      confirmLabel: lang === "ar" ? "تدقيق الآن" : "Auditer maintenant",
      cancelLabel: lang === "ar" ? "متابعة الأسئلة" : "Continuer le questionnaire",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        runAudit(pid, "intake");
      },
    });
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
        await runAudit(pid, "intake");
      } else {
        setQuestion(res.next_question);
        setProgress(res.progress);
        setAgentTrace({ trace: res.trace, value });
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  /* ── Phase: intake → processing → audit ── */
  async function runAudit(projectId, returnPhase = "start") {
    setPhase("processing");
    setError(null);
    try {
      const [res] = await Promise.all([
        api.audit(projectId),
        new Promise(r => setTimeout(r, 2800)),  // minimum animation time
      ]);
      if (res.scores?.vector) saveVector(projectId, res.scores.vector);
      setAudit(res);
      setPhase("audit");
    } catch (err) {
      if (err.name === "AbortError") {
        // User navigated away — no error to display
        setPhase(returnPhase);
        return;
      }
      setError(err.message);
      setPhase(returnPhase);
    }
  }

  /* ── Milestone toggle ── */
  function toggleMilestone(milestoneId) {
    const key = `${pid}_${milestoneId}`;
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ── Restart ── */
  function restart() {
    setPhase("start"); setPid(null); setAudit(null);
    setQuestion(null); setProgress(null); setError(null);
  }

  /* ── Project deletion handler ── */
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
      setPhase("start");
    }
    refreshHistory().catch(() => {});
    setToast({ message: lang === "ar" ? "تم حذف المشروع" : "Projet supprimé", type: "success" });
  }

  function handleAuthUser(nextUser) {
    if (nextUser?.pendingEmailConfirmation) {
      setUser(nextUser);
      setPendingEmailConfirmation(true);
      return;
    }
    setPendingEmailConfirmation(false);
    setUser(nextUser);
    setPlan(nextUser?.plan || "free");
    refreshHistory().catch(() => {});
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setPlan("free");
    setPendingEmailConfirmation(false);
    setHistory([]);
    restart();
  }

  function handlePlanUser(nextUser) {
    setUser(nextUser);
    setPlan(nextUser?.plan || "free");
  }

  function openProfilePage() {
    if (!user) {
      setAuthModalInitMode("login");
      setShowProfileModal(true);
      return;
    }
    setPhase("profile");
  }

  function openAuth(mode = "login") {
    setAuthModalInitMode(mode);
    setShowProfileModal(true);
  }

  function closeProfilePage() {
    // Always return to the main landing page — not the previous phase
    setPhase("start");
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
    <ErrorBoundary>
    <>
      {/* Email confirmation gate — blocks the entire app until confirmed */}
      {pendingEmailConfirmation && user && (
        <EmailConfirmationGate
          lang={lang}
          user={user}
          onLogout={handleLogout}
          onVerified={async () => {
            setPendingEmailConfirmation(false);
            const credsRaw = sessionStorage.getItem("firasa_pending_creds");
            if (credsRaw) {
              try {
                const creds = JSON.parse(credsRaw);
                sessionStorage.removeItem("firasa_pending_creds");
                const loggedInUser = await auth.login(creds);
                if (loggedInUser) {
                  handleAuthUser(loggedInUser);
                  setToast({
                    message: lang === "ar"
                      ? "مرحباً! تم التحقق من حسابك وتسجيل دخولك."
                      : "Bienvenue ! Votre compte est vérifié et vous êtes connecté.",
                    type: "success",
                  });
                  return;
                }
              } catch {
                // Fall through to login modal
              }
            }
            setUser(null);
            setAuthModalInitMode("login");
            setShowProfileModal(true);
          }}
        />
      )}

      {!pendingEmailConfirmation && phase !== "processing" && (
        <Topbar
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          openAuth={openAuth}
          onLogout={handleLogout}
          openHistory={openHistory}
          health={health}
          onLogoClick={restart}
          onHome={restart}
          onEvalClick={() => setPhase("eval")}
        />
      )}

      {!pendingEmailConfirmation && error && (
        <div className="error-banner" role="alert" style={{ maxWidth:900, margin:"16px auto", borderRadius:10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {!pendingEmailConfirmation && phase === "start" && (
        <Landing
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          openAuth={openAuth}
          health={health}
          history={history}
          busy={busy}
          onStart={handleStart}
          onViewProject={handleViewProject}
          onViewHistory={openHistory}
        />
      )}

      {!pendingEmailConfirmation && phase === "dashboard" && pid && (
        <ProjectDashboard
          pid={pid}
          lang={lang}
          api={api}
          onBack={() => setPhase("history")}
          onViewAudit={handleViewAuditFromDashboard}
          onRunAudit={(projectId) => runAudit(projectId, "dashboard")}
          onContinueIntake={handleContinueIntake}
          onEditProject={handleEditProject}
          onDeleted={handleProjectDeleted}
          onMonParcours={handleMonParcours}
        />
      )}

      {!pendingEmailConfirmation && phase === "parcours" && pid && (
        <MonParcours
          pid={pid}
          lang={lang}
          api={api}
          onBack={() => setPhase("dashboard")}
          checkedMilestones={checked}
          onToggleMilestone={toggleMilestone}
          onAuditUpdated={async () => {
            try { const a = await api.getLastAudit(pid); if (a) setAudit(a); } catch (_) { /* silent */ }
          }}
        />
      )}

      {!pendingEmailConfirmation && phase === "history" && (
        <History
          lang={lang}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          api={api}
          onBack={() => setPhase("start")}
          onViewProject={handleViewProject}
          onDeleted={handleProjectDeleted}
        />
      )}

      {!pendingEmailConfirmation && phase === "intake" && question && (
        <Interview
          lang={lang}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          question={question}
          progress={progress}
          busy={busy}
          onSubmit={handleAnswer}
          onSkipConfirm={handleSkipConfirm}
          pid={pid}
          api={api}
          agentTrace={agentTrace}
        />
      )}

      {!pendingEmailConfirmation && phase === "processing" && (
        <Processing lang={lang} />
      )}

      {!pendingEmailConfirmation && phase === "audit" && audit && (
        <Results
          audit={audit}
          pid={pid}
          lang={lang}
          user={user}
          plan={plan}
          openProfile={openProfilePage}
          onNewAudit={restart}
          onBackToDashboard={() => setPhase("dashboard")}
          checkedMilestones={checked}
          onToggleMilestone={toggleMilestone}
          api={api}
          onAuditUpdated={setAudit}
        />
      )}

      {!pendingEmailConfirmation && phase === "profile" && user && (
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
          onViewProject={(projectId) => {
            closeProfilePage();
            handleViewProject(projectId);
          }}
        />
      )}

      {!pendingEmailConfirmation && phase === "eval" && (
        <EvaluationReport
          lang={lang}
          api={api}
          onBack={restart}
        />
      )}

      {!pendingEmailConfirmation && <ProfileModal
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
        theme={theme}
        setTheme={setTheme}
        initialAuthMode={authModalInitMode}
      />}

      {!pendingEmailConfirmation && showLimitModal && (
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
      {/* Floating assistant — visible whenever a project is loaded */}
      {!pendingEmailConfirmation && pid && phase !== "processing" && phase !== "intake" && (
        <>
          <button
            className="float-assistant-btn"
            onClick={() => setAssistantOpen(o => !o)}
            title={lang === "ar" ? "المستشار" : "Assistant"}
          >
            {assistantOpen ? "✕" : "💬"}
          </button>
          {assistantOpen && (
            <div className="float-assistant-panel" dir={lang === "ar" ? "rtl" : "ltr"}>
              <Assistant pid={pid} lang={lang} />
            </div>
          )}
        </>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} lang={lang} />
      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        confirmLabel={confirmDialog?.confirmLabel || ""}
        cancelLabel={confirmDialog?.cancelLabel || ""}
        variant={confirmDialog?.variant || "warning"}
        onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))}
        onCancel={() => setConfirmDialog(null)}
        lang={lang}
      />
    </ErrorBoundary>
  );
}
