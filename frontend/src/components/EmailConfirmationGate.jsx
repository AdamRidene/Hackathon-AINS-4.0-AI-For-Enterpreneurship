import { useEffect, useState } from "react";
import { auth } from "../auth.js";

const T = {
  fr: {
    title: "Vérifiez votre boîte e-mail",
    subtitle: (email) =>
      `Un e-mail a été envoyé à ${email}. Ouvrez-le et cliquez sur le bouton « Vérifier mon compte » pour activer votre compte.`,
    resend: "Renvoyer l'e-mail",
    resending: "Envoi en cours…",
    resent: "E-mail renvoyé !",
    alreadyVerified: "J'ai vérifié mon compte → Me connecter",
    logout: "Se connecter avec un autre compte",
    badge: "En attente",
    waiting: "En attente de confirmation",
    hint: "Vérifiez vos spams si vous ne le trouvez pas. Le bouton de vérification se trouve directement dans l'e-mail.",
    error: "Erreur lors de l'envoi. Réessayez dans quelques instants.",
    autoDetecting: "Détection automatique de la vérification…",
  },
  ar: {
    title: "تحقق من بريدك الإلكتروني",
    subtitle: (email) =>
      `تم إرسال بريد إلكتروني إلى ${email}. افتحه وانقر على زر «تأكيد حسابي» لتفعيل حسابك.`,
    resend: "إعادة إرسال البريد الإلكتروني",
    resending: "جاري الإرسال…",
    resent: "تم إعادة الإرسال!",
    alreadyVerified: "لقد أكدت حسابي ← تسجيل الدخول",
    logout: "تسجيل الدخول بحساب آخر",
    badge: "قيد المراجعة",
    waiting: "في انتظار التأكيد",
    hint: "تحقق من مجلد البريد العشوائي إن لم تجده. زر التأكيد موجود مباشرة داخل البريد الإلكتروني.",
    error: "حدث خطأ أثناء الإرسال. حاول مجدداً بعد لحظات.",
    autoDetecting: "جاري الكشف التلقائي عن التحقق…",
  },
};

const VERIFIED_KEY = "firasa_email_verified";

export default function EmailConfirmationGate({ lang = "fr", user, onLogout, onVerified }) {
  const t = T[lang] || T.fr;
  const ar = lang === "ar";
  const [resendState, setResendState] = useState("idle"); // idle | sending | done | error

  // Auto-detect verification across tabs via localStorage + storage event
  useEffect(() => {
    const userEmail = (user?.email || "").toLowerCase();
    if (!userEmail || !onVerified) return;

    function check() {
      const val = localStorage.getItem(VERIFIED_KEY);
      if (val === userEmail) {
        localStorage.removeItem(VERIFIED_KEY);
        onVerified();
      }
    }

    // storage event fires in OTHER tabs when localStorage changes
    function onStorage(e) {
      if (e.key === VERIFIED_KEY) check();
    }

    window.addEventListener("storage", onStorage);
    // Interval poll as fallback (same tab, or missed event)
    const interval = setInterval(check, 1500);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [user?.email, onVerified]);

  async function handleResend() {
    if (resendState === "sending" || resendState === "done") return;
    setResendState("sending");
    try {
      await auth.resendConfirmation(user?.email);
      setResendState("done");
    } catch {
      setResendState("error");
    }
  }

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg, #0e0e10)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "0",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--card-bg, #1a1a1f)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          borderRadius: 16,
          padding: "40px 36px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(251, 191, 36, 0.12)",
            border: "1.5px solid rgba(251, 191, 36, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <i className="fa-solid fa-envelope" style={{ fontSize: "1.6rem", color: "#fbbf24" }} />
        </div>

        {/* Badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 10px",
            borderRadius: 20,
            background: "rgba(251, 191, 36, 0.15)",
            border: "1px solid rgba(251, 191, 36, 0.4)",
            color: "#fbbf24",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#fbbf24",
              flexShrink: 0,
              animation: "pulse 2s infinite",
            }}
          />
          {t.waiting}
        </span>

        {/* Title */}
        <h2
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--text, #f0f0f0)",
            lineHeight: 1.3,
          }}
        >
          {t.title}
        </h2>

        {/* Subtitle */}
        <p
          style={{
            margin: 0,
            fontSize: "0.88rem",
            color: "var(--text-sub, rgba(255,255,255,0.55))",
            lineHeight: 1.6,
          }}
        >
          {t.subtitle(user?.email || "")}
        </p>

        {/* Hint */}
        <p
          style={{
            margin: 0,
            fontSize: "0.78rem",
            color: "var(--text-sub, rgba(255,255,255,0.38))",
            lineHeight: 1.5,
            padding: "10px 14px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.06)",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {t.hint}
        </p>

        {/* Auto-detect indicator */}
        <p
          style={{
            margin: 0,
            fontSize: "0.73rem",
            color: "var(--text-sub, rgba(255,255,255,0.28))",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "0.65rem" }} />
          {t.autoDetecting}
        </p>

        {/* Resend button */}
        <button
          onClick={handleResend}
          disabled={resendState === "sending" || resendState === "done"}
          style={{
            width: "100%",
            padding: "11px 20px",
            borderRadius: 10,
            border: "1.5px solid rgba(251,191,36,0.4)",
            background:
              resendState === "done"
                ? "rgba(34,197,94,0.12)"
                : "rgba(251,191,36,0.1)",
            color:
              resendState === "done"
                ? "#22c55e"
                : resendState === "error"
                ? "#f87171"
                : "#fbbf24",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor:
              resendState === "sending" || resendState === "done"
                ? "default"
                : "pointer",
            transition: "all 0.2s",
            opacity: resendState === "sending" ? 0.7 : 1,
          }}
        >
          {resendState === "done" && <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />}
          {resendState === "error" && <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />}
          {resendState === "sending" && <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />}
          {resendState === "idle" && <i className="fa-solid fa-paper-plane" style={{ marginRight: 6 }} />}
          {resendState === "sending"
            ? t.resending
            : resendState === "done"
            ? t.resent
            : resendState === "error"
            ? t.error
            : t.resend}
        </button>

        {/* Already verified — manual fallback */}
        {onVerified && (
          <button
            onClick={onVerified}
            style={{
              width: "100%",
              padding: "11px 20px",
              borderRadius: 10,
              border: "1.5px solid rgba(34,197,94,0.4)",
              background: "rgba(34,197,94,0.08)",
              color: "#22c55e",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <i className="fa-solid fa-circle-check" />
            {t.alreadyVerified}
          </button>
        )}

        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-sub, rgba(255,255,255,0.38))",
            fontSize: "0.78rem",
            cursor: "pointer",
            padding: "4px 0",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <i className="fa-solid fa-arrow-right-from-bracket" style={{ fontSize: "0.7rem" }} />
          {t.logout}
        </button>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
