import { useState } from "react";
import logoSvg from "../../assets/logo_first.svg";

export default function Topbar({ lang, setLang, theme, setTheme, user, plan, openProfile, openAuth, onLogout, openHistory, health, onLogoClick, onEvalClick, onHome }) {
  const ar = lang === "ar";
  const guestLabel = ar ? "زائر" : "Invité";
  const [menuOpen, setMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const langLabels = {
    ar: { label: "العربيّة", code: "Ar" },
    fr: { label: "Français", code: "Fr" },
  };

  function toggleMenu() {
    setMenuOpen((v) => !v);
    setLangMenuOpen(false);
  }

  function toggleLangMenu() {
    setLangMenuOpen((v) => !v);
    setMenuOpen(false);
  }

  function selectLang(code) {
    setLang(code);
    setLangMenuOpen(false);
  }

  function handleLoginClick() {
    setMenuOpen(false);
    if (openAuth) openAuth();
  }

  async function handleLogoutClick() {
    setMenuOpen(false);
    if (onLogout) await onLogout();
  }

  return (
    <header className="global-topbar" dir="ltr">
      {/* Left section: controls */}
      <div className="topbar-left-controls">
        {/* Home button */}
        <button className="topbar-home-btn" onClick={onHome} title={ar ? "الرئيسية" : "Accueil"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </button>

        {/* Profile Dropdown Container — next to language toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
          <button className="profile-btn" onClick={toggleMenu} aria-haspopup="true" aria-expanded={menuOpen}>
            <div className={`profile-avatar ${!user ? "guest" : ""}`}>
              {user && user.photo ? (
                user.photo.startsWith("http") || user.photo.startsWith("/") ? (
                  <img src={user.photo} alt="" />
                ) : (
                  <span style={{ fontSize: "1.1rem" }}>{user.photo}</span>
                )
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="8" r="4" />
                </svg>
              )}
            </div>
          </button>
          {user && (
            <span className={`plan-badge ${plan}`} style={{ position: "static" }}>
              {plan === "free" ? (ar ? "مجاني" : "Gratuit") : plan === "plus" ? (ar ? "بلس" : "Plus") : (ar ? "برو" : "Pro")}
            </span>
          )}

          {menuOpen && (
            <div className={`profile-menu ${ar ? "rtl" : ""}`} role="menu">
              <div className="profile-menu-header" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", flexDirection: ar ? "row-reverse" : "row" }}>
                <div className={`profile-avatar ${!user ? "guest" : ""}`} style={{ width: "26px", height: "26px", fontSize: "0.7rem", flexShrink: 0, boxShadow: "0 0 8px rgba(74, 123, 247, 0.3)" }}>
                  {user && user.photo ? (
                    user.photo.startsWith("http") || user.photo.startsWith("/") ? (
                      <img src={user.photo} alt="" />
                    ) : (
                      <span>{user.photo}</span>
                    )
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="4" />
                    </svg>
                  )}
                </div>
                <span className="profile-menu-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user ? user.name : guestLabel}</span>
              </div>
              {!user ? (
                <button className="profile-menu-item" onClick={handleLoginClick}>
                  <span className="menu-icon" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  </span>
                  <span className="menu-label">{ar ? "تسجيل الدخول" : "Se connecter"}</span>
                </button>
              ) : (
                <>
                  <button className="profile-menu-item" onClick={() => { setMenuOpen(false); openProfile(); }}>
                    <span className="menu-icon" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                    </span>
                    <span className="menu-label">{ar ? "الإعدادات" : "Paramètres"}</span>
                  </button>
                  <button className="profile-menu-item" onClick={() => { setMenuOpen(false); openHistory(); }}>
                    <span className="menu-icon" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </span>
                    <span className="menu-label">{ar ? "السجل" : "Historique"}</span>
                  </button>
                  <button className="profile-menu-item" onClick={handleLogoutClick}>
                    <span className="menu-icon" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </span>
                    <span className="menu-label">{ar ? "تسجيل الخروج" : "Se déconnecter"}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Language toggle */}
        {/* Language dropdown */}
        <div className="lang-dropdown-wrap">
          <button className="lang-dropdown-btn" onClick={toggleLangMenu} title={ar ? "اللغة" : "Langue"}>
            <span className="lang-dropdown-code">{langLabels[lang]?.code || "Fr"}</span>
            <svg className="lang-dropdown-globe" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </button>
          {langMenuOpen && (
            <div className="lang-dropdown-menu">
              {Object.entries(langLabels).map(([code, { label }]) => (
                <button
                  key={code}
                  className={`lang-dropdown-item${lang === code ? " active" : ""}`}
                  onClick={() => selectLang(code)}
                >
                  <span className="lang-check">{lang === code ? "✓" : ""}</span>
                  <span className="lang-label">{label} ({langLabels[code].code})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          className="theme-toggle-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={ar ? "تغيير المظهر" : "Changer le thème"}
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Eval report button */}
        {onEvalClick && (
          <button className="topbar-home-btn" onClick={onEvalClick} title={ar ? "تقرير التقييم" : "Rapport d'évaluation"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Right: Brand logo */}
      <div className="topbar-brand" onClick={onLogoClick} style={{ cursor: "pointer" }}>
        <img src={logoSvg} alt="Firasa Logo" className="topbar-logo-img" />
      </div>
    </header>
  );
}
