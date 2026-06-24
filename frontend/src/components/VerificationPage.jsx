import { useEffect, useState } from "react";

const T = {
  fr: {
    title: "Vérification de votre compte",
    subtitle: "Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et activer votre compte Firasa.",
    verifyBtn: "Vérifier mon compte",
    notMeBtn: "Ce n'était pas moi",
    verifying: "Vérification en cours…",
    deleting: "Suppression en cours…",
    successTitle: "Compte vérifié !",
    successSub: "Votre adresse e-mail a été confirmée avec succès. Votre compte Firasa est maintenant actif. Vous pouvez fermer cette page et vous connecter.",
    closePage: "Fermer cette page",
    closeHint: "Vous pouvez fermer cet onglet manuellement.",
    deletedTitle: "Compte supprimé",
    deletedSub: "Votre demande a été traitée. Ce compte a été supprimé. Vous pouvez fermer cette page.",
    errorTitle: "Une erreur est survenue",
    errorTokenMissing: "Lien de vérification invalide ou expiré. Veuillez demander un nouveau lien depuis la page d'accueil.",
    goHome: "Retour à l'accueil",
  },
  ar: {
    title: "تأكيد حسابك",
    subtitle: "انقر على الزر أدناه لتأكيد عنوان بريدك الإلكتروني وتفعيل حسابك في فراسة.",
    verifyBtn: "تأكيد حسابي",
    notMeBtn: "لم أكن أنا",
    verifying: "جاري التحقق…",
    deleting: "جاري الحذف…",
    successTitle: "تم تأكيد الحساب!",
    successSub: "تم تأكيد عنوان بريدك الإلكتروني بنجاح. حسابك في فراسة أصبح نشطاً. يمكنك إغلاق هذه الصفحة وتسجيل الدخول.",
    closePage: "إغلاق هذه الصفحة",
    closeHint: "يمكنك إغلاق هذا التبويب يدوياً.",
    deletedTitle: "تم حذف الحساب",
    deletedSub: "تمت معالجة طلبك. تم حذف هذا الحساب. يمكنك إغلاق هذه الصفحة.",
    errorTitle: "حدث خطأ",
    errorTokenMissing: "رابط التحقق غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد من الصفحة الرئيسية.",
    goHome: "العودة إلى الصفحة الرئيسية",
  },
};

const VERIFIED_KEY = "firasa_email_verified";
const BASE = import.meta.env.VITE_API_BASE || "";

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    token: p.get("token") || "",
    email: (p.get("email") || "").toLowerCase(),
    lang: p.get("lang") || localStorage.getItem("firasa_lang") || "fr",
  };
}

export default function VerificationPage() {
  const { token, email, lang: paramLang } = getParams();
  const lang = paramLang === "ar" ? "ar" : "fr";
  const t = T[lang];
  const ar = lang === "ar";

  // idle | verifying | success | deleting | deleted | error
  const [state, setState] = useState(token && email ? "idle" : "error");
  const [errorMsg, setErrorMsg] = useState(token && email ? "" : t.errorTokenMissing);
  const [showCloseHint, setShowCloseHint] = useState(false);

  useEffect(() => {
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  // Auto-close (deleted state)
  useEffect(() => {
    if (state === "deleted") {
      const timer = setTimeout(() => window.close(), 2800);
      return () => clearTimeout(timer);
    }
  }, [state]);

  async function handleVerify() {
    setState("verifying");
    try {
      const res = await fetch(`${BASE}/api/auth/confirm-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `${res.status}`);
      }
      // Signal the original tab that verification is done
      localStorage.setItem(VERIFIED_KEY, email);
      setState("success");
    } catch (err) {
      setErrorMsg(err?.message || t.errorTokenMissing);
      setState("error");
    }
  }

  async function handleNotMe() {
    setState("deleting");
    try {
      const res = await fetch(`${BASE}/api/auth/delete-unverified`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `${res.status}`);
      }
      setState("deleted");
    } catch (err) {
      setErrorMsg(err?.message || "Erreur lors de la suppression.");
      setState("error");
    }
  }

  function handleClose() {
    window.close();
    // Fallback: browsers block window.close() on non-script-opened tabs
    setTimeout(() => setShowCloseHint(true), 400);
  }

  const isLoading = state === "verifying" || state === "deleting";

  // Icon + colors per state
  const stateStyle = {
    idle:     { icon: "fa-solid fa-envelope",              color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)" },
    verifying:{ icon: "fa-solid fa-envelope",              color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)" },
    success:  { icon: "fa-solid fa-circle-check",          color: "#22c55e", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)"  },
    deleting: { icon: "fa-solid fa-trash-can",             color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)"},
    deleted:  { icon: "fa-solid fa-trash-can",             color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)"},
    error:    { icon: "fa-solid fa-triangle-exclamation",  color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)"},
  }[state] || {};

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      style={{
        position: "fixed", inset: 0,
        background: "var(--bg, #0e0e10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        fontFamily: "var(--f-body, system-ui, sans-serif)",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 460,
        background: "var(--card-bg, #1a1a1f)",
        border: "1px solid var(--border, rgba(255,255,255,0.08))",
        borderRadius: 16,
        padding: "40px 36px",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 20, textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>

        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: stateStyle.bg,
          border: `1.5px solid ${stateStyle.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.3s",
        }}>
          <i className={stateStyle.icon} style={{ fontSize: "1.6rem", color: stateStyle.color }} />
        </div>

        {/* Title */}
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text, #f0f0f0)", lineHeight: 1.3 }}>
          {state === "success" ? t.successTitle
            : state === "deleted" ? t.deletedTitle
            : state === "error" ? t.errorTitle
            : t.title}
        </h2>

        {/* Subtitle */}
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-sub, rgba(255,255,255,0.55))", lineHeight: 1.6 }}>
          {state === "success" ? t.successSub
            : state === "deleted" ? t.deletedSub
            : state === "error" ? errorMsg
            : t.subtitle}
        </p>

        {/* Success: close button */}
        {state === "success" && (
          <>
            <button
              onClick={handleClose}
              style={{
                width: "100%", padding: "13px 20px", borderRadius: 10,
                background: "rgba(34,197,94,0.12)",
                border: "1.5px solid rgba(34,197,94,0.35)",
                color: "#22c55e", fontSize: "0.95rem", fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 10, transition: "opacity 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <i className="fa-solid fa-xmark" />
              {t.closePage}
            </button>
            {showCloseHint && (
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-sub, rgba(255,255,255,0.35))" }}>
                {t.closeHint}
              </p>
            )}
          </>
        )}

        {/* Deleted: auto-closing */}
        {state === "deleted" && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-sub, rgba(255,255,255,0.35))" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
            {ar ? "جاري الإغلاق…" : "Fermeture en cours…"}
          </p>
        )}

        {/* Idle: verify + not me */}
        {state === "idle" && (
          <>
            <button
              onClick={handleVerify}
              style={{
                width: "100%", padding: "13px 20px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #3B82F6, #2563EB)",
                color: "#fff", fontSize: "0.95rem", fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 10,
                boxShadow: "0 4px 16px rgba(59,130,246,0.35)", transition: "opacity 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <i className="fa-solid fa-shield-check" />
              {t.verifyBtn}
            </button>

            <button
              onClick={handleNotMe}
              style={{
                background: "none", border: "none",
                color: "rgba(248,113,113,0.65)", fontSize: "0.8rem",
                cursor: "pointer", padding: "4px 0",
                textDecoration: "underline", textUnderlineOffset: 3,
                display: "flex", alignItems: "center", gap: 6,
                transition: "color 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(248,113,113,0.65)")}
            >
              <i className="fa-solid fa-ban" />
              {t.notMeBtn}
            </button>
          </>
        )}

        {/* Loading */}
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-sub, rgba(255,255,255,0.5))", fontSize: "0.88rem" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ color: "#3B82F6" }} />
            {state === "verifying" ? t.verifying : t.deleting}
          </div>
        )}

        {/* Error: go home */}
        {state === "error" && (
          <a className={"back-btn" + (ar ? " rtl" : "")} href="/" style={{ marginTop: 4, color: "var(--text)", textDecoration: "none" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {t.goHome}
          </a>
        )}
      </div>
    </div>
  );
}
