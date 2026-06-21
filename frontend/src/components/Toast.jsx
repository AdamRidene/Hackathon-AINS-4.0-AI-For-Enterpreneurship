/** Toast notification component.

Usage from App.jsx via toast state:
  const [toast, setToast] = useState(null);
  // To show: setToast({ message: "Saved!", type: "success" })
  // Renders: <Toast toast={toast} onDismiss={() => setToast(null)} />
*/
import { useEffect } from "react";

const ICONS = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

const COLORS = {
  success: "var(--green)",
  error: "var(--red)",
  info: "var(--cyan)",
  warning: "var(--amber)",
};

export default function Toast({ toast, onDismiss, lang }) {
  const ar = lang === "ar";

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const icon = ICONS[toast.type] || ICONS.info;
  const color = COLORS[toast.type] || COLORS.info;

  return (
    <div
      className="toast"
      style={{
        position: "fixed",
        bottom: 24,
        [ar ? "left" : "right"]: 24,
        background: "var(--bg-surface)",
        border: `1px solid ${color}`,
        color: "var(--text)",
        padding: "12px 20px",
        borderRadius: "var(--r-md)",
        boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 12px ${color}22`,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 420,
        animation: "toast-in 0.3s ease",
        direction: ar ? "rtl" : "ltr",
      }}
      onClick={onDismiss}
    >
      <span style={{
        display: "grid", placeItems: "center", width: 24, height: 24,
        borderRadius: "50%", background: `${color}22`, color, fontWeight: 700,
        fontSize: "0.8rem", flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ fontSize: "0.88rem", lineHeight: 1.3 }}>{toast.message}</span>
    </div>
  );
}
