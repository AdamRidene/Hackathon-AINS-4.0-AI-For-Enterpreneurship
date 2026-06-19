import logoSvg from "../../assets/logo_first.svg";

export default function Topbar({ lang, setLang, theme, setTheme, user, plan, openProfile, health, onLogoClick }) {
  const ar = lang === "ar";

  return (
    <header className="global-topbar" dir="ltr">
      <div className="topbar-left-controls">


        <div className="lang-toggle">
          <button className={`lang-btn${lang === "fr" ? " active" : ""}`} onClick={() => setLang("fr")}>
            FR
          </button>
          <button className={`lang-btn${lang === "ar" ? " active" : ""}`} onClick={() => setLang("ar")}>
            عربي
          </button>
        </div>

        <button
          className="theme-toggle-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle Theme"
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>

        <button className="profile-btn" onClick={openProfile}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>{user ? user.name : ar ? "دخول" : "Connexion"}</span>
          {user && (
            <span className={`plan-badge ${plan}`}>
              {plan === "free" ? (ar ? "مجاني" : "Gratuit") : plan === "plus" ? (ar ? "بلس" : "Plus") : ar ? "برو" : "Pro"}
            </span>
          )}
        </button>
      </div>

      <div className="topbar-brand" onClick={onLogoClick} style={{ cursor: "pointer" }}>
        <img src={logoSvg} alt="Firasa Logo" className="brand-logo-img brand-logo-large landing-brand-logo" />
      </div>
    </header>
  );
}
