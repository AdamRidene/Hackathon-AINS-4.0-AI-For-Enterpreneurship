import { useState } from "react";

const TEXTS = {
  fr: {
    title: "Espace Entrepreneur",
    login: "Connexion",
    register: "Inscription",
    email: "Adresse e-mail",
    password: "Mot de passe",
    name: "Nom complet",
    submitLogin: "Se connecter",
    submitRegister: "Créer mon compte",
    noAccount: "Pas encore de compte ? ",
    hasAccount: "Déjà un compte ? ",
    logout: "Se déconnecter",
    activePlan: "Plan actif",
    projectLimit: "Limite de projets",
    activeProjects: "Vos projets récents",
    unlimited: "Illimité",
    upgradeBtn: "Mettre à niveau",
    pricingTitle: "Plans & Tarifs",
    monProfil: "Mon Profil",
    checkoutTitle: "Paiement sécurisé",
    cardNumber: "Numéro de carte",
    expiry: "Date d'expiration (MM/AA)",
    cvc: "Code CVC",
    payBtn: "Valider le paiement (Simulé)",
    loadingPay: "Traitement en cours...",
    checkoutSuccess: "Paiement réussi ! Votre plan a été mis à niveau.",
    freeLabel: "Gratuit",
    plusLabel: "Plus",
    proLabel: "Pro",
    freeDesc: "Idéal pour tester",
    plusDesc: "Pour les créateurs",
    proDesc: "Pour les professionnels",
    features: {
      projects1: "1 Projet maximum",
      projects3: "3 Projets maximum",
      projects5: "5 Projets maximum",
      diagOnly: "Accès au Diagnostic uniquement",
      diagScores: "Accès au Diagnostic & Scores",
      allFeatures: "Toutes les fonctionnalités (Roadmap)",
    }
  },
  ar: {
    title: "فضاء رائد الأعمال",
    login: "تسجيل الدخول",
    register: "إنشاء حساب",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    name: "الاسم الكامل",
    submitLogin: "تسجيل الدخول",
    submitRegister: "إنشاء الحساب",
    noAccount: "ليس لديك حساب؟ ",
    hasAccount: "لديك حساب بالفعل؟ ",
    logout: "تسجيل الخروج",
    activePlan: "الاشتراك الحالي",
    projectLimit: "سقف المشاريع",
    activeProjects: "مشاريعك الحالية",
    unlimited: "غير محدود",
    upgradeBtn: "ترقية الحساب",
    pricingTitle: "الخطط والأسعار",
    monProfil: "ملفي الشخصي",
    checkoutTitle: "الدفع الآمن",
    cardNumber: "رقم البطاقة",
    expiry: "تاريخ انتهاء الصلاحية (MM/AA)",
    cvc: "رمز CVC",
    payBtn: "تأكيد الدفع (محاكاة)",
    loadingPay: "جاري المعالجة...",
    checkoutSuccess: "تم الدفع بنجاح! تم ترقية اشتراكك.",
    freeLabel: "مجاني",
    plusLabel: "بلس",
    proLabel: "برو",
    freeDesc: "للتجربة والاستكشاف",
    plusDesc: "لرواد الأعمال الناشئين",
    proDesc: "للمحترفين والمستشارين",
    features: {
      projects1: "مشروع واحد كحد أقصى",
      projects3: "3 مشاريع كحد أقصى",
      projects5: "5 مشاريع كحد أقصى",
      diagOnly: "دخول للتشخيص فقط",
      diagScores: "دخول للتشخيص والمؤشرات",
      allFeatures: "جميع الميزات (خارطة الطريق)",
    }
  }
};

const PLAN_LIMITS = {
  free: 1,
  plus: 3,
  pro: 5,
};

export default function ProfileModal({ isOpen, onClose, user, onLogin, onLogout, plan, onUpgrade, history, lang, onResume, api }) {
  const [activeTab, setActiveTab] = useState("profile"); // profile | pricing
  const [isRegister, setIsRegister] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  
  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  
  // Checkout State
  const [checkoutPlan, setCheckoutPlan] = useState(null); // null | 'plus' | 'pro'
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  if (!isOpen) return null;

  const t = TEXTS[lang];
  const ar = lang === "ar";
  const limit = PLAN_LIMITS[plan] || 1;

  async function handleSubmitAuth(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const nextUser = isRegister
        ? await api.register({ email: email.trim(), password, name: name.trim() })
        : await api.login({ email: email.trim(), password });
      onLogin(nextUser);
      setEmail("");
      setPassword("");
      setName("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleStartCheckout(planName) {
    setCheckoutPlan(planName);
    setCheckoutSuccess(false);
    setCardNum("");
    setCardExp("");
    setCardCvc("");
  }

  function handlePay(e) {
    e.preventDefault();
    setCheckoutBusy(true);
    setTimeout(() => {
      api.updatePlan(checkoutPlan)
        .then((nextUser) => {
          setCheckoutSuccess(true);
          onUpgrade(nextUser);
          setTimeout(() => setCheckoutPlan(null), 1500);
        })
        .catch((err) => setAuthError(err.message))
        .finally(() => setCheckoutBusy(false));
    }, 1200);
  }

  return (
    <div className="modal-overlay" onClick={onClose} dir={ar ? "rtl" : "ltr"}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{t.title}</h2>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* 1. Checkout Screen */}
          {checkoutPlan ? (
            <div className="checkout-modal">
              <div className="checkout-header">
                <h3>{t.checkoutTitle}</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-sub)", marginTop: 6 }}>
                  Abonnement au plan <b>{checkoutPlan === "plus" ? t.plusLabel : t.proLabel}</b> ({checkoutPlan === "plus" ? "49 DT" : "99 DT"}/mois)
                </p>
              </div>

              {checkoutSuccess ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div className="lock-icon-container" style={{ margin: "0 auto 16px", background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.25)", color: "var(--green)", boxShadow: "0 0 20px var(--green-glow)" }}>✓</div>
                  <p style={{ fontWeight: 600, color: "var(--text)" }}>{t.checkoutSuccess}</p>
                </div>
              ) : (
                <form className="auth-form" onSubmit={handlePay}>
                  <div className="form-group">
                    <label>{t.cardNumber}</label>
                    <input 
                      type="text" 
                      placeholder="4000 1234 5678 9010" 
                      value={cardNum} 
                      onChange={e => setCardNum(e.target.value)} 
                      required 
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-group">
                      <label>{t.expiry}</label>
                      <input 
                        type="text" 
                        placeholder="12/28" 
                        value={cardExp} 
                        onChange={e => setCardExp(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>{t.cvc}</label>
                      <input 
                        type="password" 
                        placeholder="123" 
                        value={cardCvc} 
                        maxLength={4}
                        onChange={e => setCardCvc(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>
                  <button type="submit" className="primary" style={{ marginTop: 10 }} disabled={checkoutBusy}>
                    {checkoutBusy ? t.loadingPay : t.payBtn}
                  </button>
                  <button type="button" onClick={() => setCheckoutPlan(null)} style={{ background: "transparent", borderColor: "var(--border)" }} disabled={checkoutBusy}>
                    {ar ? "إلغاء" : "Annuler"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* 2. Unauthenticated Login Screen */}
              {!user ? (
                <div>
                  <h3 style={{ textAlign: "center", marginBottom: 20, fontFamily: "var(--f-display)", fontStyle: "italic" }}>
                    {isRegister ? t.register : t.login}
                  </h3>
                  
                  <form className="auth-form" onSubmit={handleSubmitAuth}>
                    {authError && <div className="error-banner">{authError}</div>}
                    {isRegister && (
                      <div className="form-group">
                        <label>{t.name}</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Elyes Riden" 
                          value={name} 
                          onChange={e => setName(e.target.value)} 
                          required 
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label>{t.email}</label>
                      <input 
                        type="email" 
                        placeholder="entrepreneur@firasa.tn" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>{t.password}</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required 
                      />
                    </div>
                    <button type="submit" className="primary" style={{ marginTop: 8 }} disabled={authBusy}>
                      {authBusy ? t.loadingPay : (isRegister ? t.submitRegister : t.submitLogin)}
                    </button>
                  </form>

                  <div className="auth-toggle-msg">
                    {isRegister ? (
                      <p>{t.hasAccount}<span onClick={() => setIsRegister(false)}>{t.login}</span></p>
                    ) : (
                      <p>{t.noAccount}<span onClick={() => setIsRegister(true)}>{t.register}</span></p>
                    )}
                  </div>
                </div>
              ) : (
                /* 3. Authenticated Profile & Pricing tabs */
                <div>
                  {/* Local Navigation Tabs */}
                  <div className="results-tabs" style={{ marginBottom: 20, justifyContent: "center" }}>
                    <button 
                      className={`res-tab${activeTab === "profile" ? " active" : ""}`}
                      onClick={() => setActiveTab("profile")}
                    >
                      {t.monProfil}
                    </button>
                    <button 
                      className={`res-tab${activeTab === "pricing" ? " active" : ""}`}
                      onClick={() => setActiveTab("pricing")}
                    >
                      {t.pricingTitle}
                    </button>
                  </div>

                  {activeTab === "profile" ? (
                    <div>
                      {/* Profile details card */}
                      <div className="profile-info-row">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user.name}</div>
                          <div style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: 2 }}>{user.email}</div>
                        </div>
                        <span className={`plan-badge ${plan}`}>{plan === "free" ? t.freeLabel : plan === "plus" ? t.plusLabel : t.proLabel}</span>
                      </div>

                      {/* Project count indicator */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-sub)", marginBottom: 6 }}>
                          <span>{t.projectLimit}</span>
                          <span>{history.length} / {limit}</span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
                          <div 
                            style={{ 
                              height: "100%", 
                              width: `${Math.min((history.length / limit) * 100, 100)}%`, 
                              background: plan === "pro" ? "var(--orange)" : plan === "plus" ? "var(--cyan)" : "var(--text-sub)",
                              transition: "width 0.4s ease"
                            }} 
                          />
                        </div>
                      </div>

                      {/* Active projects list */}
                      <div style={{ marginTop: 24 }}>
                        <h4 style={{ marginBottom: 12, fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: "0.95rem" }}>{t.activeProjects}</h4>
                        {history.length === 0 ? (
                          <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                            {ar ? "لا توجد تدقيقات جارية." : "Aucun audit en cours."}
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {history.map((h) => (
                              <div 
                                key={h.project_id} 
                                className="profile-info-row" 
                                style={{ margin: 0, padding: "10px 14px", cursor: "pointer", transition: "all 0.15s ease" }}
                                onClick={() => { onResume(h.project_id); onClose(); }}
                              >
                                <div>
                                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{h.name}</span>
                                  {h.sector && <span className="hist-tag cyan" style={{ marginLeft: 8, marginRight: 8, fontSize: "0.6rem", padding: "1px 6px" }}>{h.sector}</span>}
                                </div>
                                <span style={{ fontSize: "0.78rem", color: "var(--orange)", fontWeight: 600 }}>
                                  {ar ? "← فتح" : "Ouvrir →"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Logout button */}
                      <button 
                        onClick={onLogout} 
                        style={{ marginTop: 32, width: "100%", background: "transparent", borderColor: "rgba(239,68,68,0.25)", color: "var(--red)" }}
                      >
                        {t.logout}
                      </button>
                    </div>
                  ) : (
                    /* Pricing Grid Tab */
                    <div>
                      <div className="pricing-grid">
                        
                        {/* Gratuit / Free */}
                        <div className={`pricing-card${plan === "free" ? " active-plan" : ""}`}>
                          <div>
                            <div className="price-title">{t.freeLabel}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", marginTop: 2 }}>{t.freeDesc}</div>
                            <div className="price-amt">0 DT<span> / mois</span></div>
                            <ul className="price-features">
                              <li>{t.features.projects1}</li>
                              <li>{t.features.diagOnly}</li>
                            </ul>
                          </div>
                          <button disabled style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                            {t.freeLabel}
                          </button>
                        </div>

                        {/* Plus */}
                        <div className={`pricing-card${plan === "plus" ? " active-plan" : ""}`}>
                          <div>
                            <div className="price-title">{t.plusLabel}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", marginTop: 2 }}>{t.plusDesc}</div>
                            <div className="price-amt">49 DT<span> / mois</span></div>
                            <ul className="price-features">
                              <li>{t.features.projects3}</li>
                              <li>{t.features.diagScores}</li>
                            </ul>
                          </div>
                          {plan === "plus" ? (
                            <button disabled style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                              {ar ? "الخطة النشطة" : "Plan Actif"}
                            </button>
                          ) : plan === "pro" ? (
                            <button disabled style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                              {ar ? "مستوى أدنى" : "Plan inférieur"}
                            </button>
                          ) : (
                            <button className="primary" onClick={() => handleStartCheckout("plus")}>
                              {t.upgradeBtn}
                            </button>
                          )}
                        </div>

                        {/* Pro */}
                        <div className={`pricing-card${plan === "pro" ? " active-plan" : ""}`}>
                          <div>
                            <div className="price-title">{t.proLabel}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", marginTop: 2 }}>{t.proDesc}</div>
                            <div className="price-amt">99 DT<span> / mois</span></div>
                            <ul className="price-features">
                              <li>{t.features.projects5}</li>
                              <li>{t.features.allFeatures}</li>
                            </ul>
                          </div>
                          {plan === "pro" ? (
                            <button disabled style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
                              {ar ? "الخطة النشطة" : "Plan Actif"}
                            </button>
                          ) : (
                            <button className="primary" onClick={() => handleStartCheckout("pro")} style={{ background: "var(--orange)", borderColor: "var(--orange-border)" }}>
                              {t.upgradeBtn}
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
