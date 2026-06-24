import { useState } from "react";
import { auth } from "../auth.js";

const T = {
  fr: {
    title: "Confirmez votre adresse e-mail",
    subtitle: (email) =>
      `Un lien de confirmation a été envoyé à ${email}. Cliquez sur le lien dans cet e-mail pour activer votre compte.`,
    resend: "Renvoyer l'e-mail",
    resending: "Envoi en cours…",
    resent: "E-mail renvoyé !",
    logout: "Se connecter avec un autre compte",
    badge: "En attente",
    waiting: "En attente de confirmation",
    hint: "Vérifiez vos spams si vous ne le trouvez pas dans votre boîte de réception.",
    error: "Erreur lors de l'envoi. Réessayez dans quelques instants.",
  },
  ar: {
    title: "تأكيد عنوان بريدك الإلكتروني",
    subtitle: (email) =>
      `تم إرسال رابط التأكيد إلى ${email}. انقر على الرابط في هذا البريد لتفعيل حسابك.`,
    resend: "إعادة إرسال البريد الإلكتروني",
    resending: "جاري الإرسال…",
    resent: "تم إعادة الإرسال!",
    logout: "تسجيل الدخول بحساب آخر",
    badge: "قيد المراجعة",
    waiting: "في انتظار التأكيد",
    hint: "تحقق من مجلد البريد العشوائي إن لم تجده في صندوق الوارد.",
    error: "حدث خطأ أثناء الإرسال. حاول مجدداً بعد لحظات.",
  },
};

export default function EmailConfirmationGate({ lang = "fr", user, onLogout }) {
  const t = T[lang] || T.fr;
  const ar = lang === "ar";
  const [resendState, setResendState] = useState("idle"); // idle | sending | done | error

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
            fontSize: "1.8rem",
            flexShrink: 0,
          }}
        >
          ✉️
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
          {resendState === "sending"
            ? t.resending
            : resendState === "done"
            ? t.resent
            : resendState === "error"
            ? t.error
            : t.resend}
        </button>

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
          }}
        >
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
