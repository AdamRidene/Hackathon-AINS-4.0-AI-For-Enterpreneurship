/** In-app confirmation dialog — replaces window.confirm().

Usage:
  <ConfirmDialog
    isOpen={showConfirm}
    title="Lancer l'audit ?"
    message="Vos scores seront affectés..."
    confirmLabel="Auditer quand même"
    cancelLabel="Continuer le questionnaire"
    variant="warning"     // warning | danger | info
    onConfirm={handleConfirm}
    onCancel={() => setShowConfirm(false)}
    lang={lang}
  />
*/

const VARIANTS = {
  warning: { icon: "⚠️", color: "var(--amber)", bg: "rgba(234,179,8,0.08)" },
  danger: { icon: "🗑", color: "var(--red)", bg: "rgba(239,68,68,0.08)" },
  info: { icon: "ℹ️", color: "var(--cyan)", bg: "rgba(6,182,212,0.08)" },
};

export default function ConfirmDialog({
  isOpen, title, message, confirmLabel, cancelLabel,
  variant = "warning", onConfirm, onCancel, lang, busy,
}) {
  if (!isOpen) return null;

  const ar = lang === "ar";
  const v = VARIANTS[variant] || VARIANTS.warning;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-container"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 460, padding: 24, textAlign: "center",
          direction: ar ? "rtl" : "ltr",
        }}
      >
        {/* Icon */}
        <div style={{
          fontSize: "2.4rem", lineHeight: 1, marginBottom: 12,
          width: 56, height: 56, borderRadius: "50%",
          background: v.bg, border: `1px solid ${v.color}33`,
          display: "grid", placeItems: "center", margin: "0 auto 16px",
        }}>
          {v.icon}
        </div>

        {/* Title */}
        <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 700 }}>
          {title}
        </h3>

        {/* Message */}
        <p style={{
          fontSize: "0.88rem", color: "var(--text-sub)", lineHeight: 1.5,
          margin: "0 0 20px", whiteSpace: "pre-line",
        }}>
          {message}
        </p>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="ghost"
            onClick={onCancel}
            disabled={busy}
            style={{ minWidth: 130, padding: "10px 18px" }}
          >
            {cancelLabel}
          </button>
          <button
            className={variant === "danger" ? "danger-btn" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            style={{
              minWidth: 130, padding: "10px 18px",
              ...(variant === "warning" ? { background: "var(--amber)", borderColor: "var(--amber)" } : {}),
            }}
          >
            {busy ? <span className="spinner" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
