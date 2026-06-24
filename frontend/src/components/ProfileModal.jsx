import { useState, useEffect } from "react";
import { SECTOR_LABELS } from "../constants.js";
import Rive from "@rive-app/react-canvas";
import logoRiv from "../../assets/logo_firasa.riv";
import logoSvg from "../../assets/logo_first.svg";

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
    },
    // New profile keys
    tabProjects: "Mes projets",
    tabEditProfile: "Modifier le profil",
    tabSubscription: "Mon abonnement",
    bioLabel: "Biographie / Description de l'entrepreneur",
    phoneLabel: "Numéro de téléphone",
    roleLabel: "Rôle / Titre (ex. CEO, Directeur Technique)",
    companyLabel: "Nom de l'entreprise / Startup",
    avatarLabel: "Choisissez un avatar de fondateur",
    customPhotoUrl: "Ou URL d'une photo de profil personnalisée",
    saveBtn: "Enregistrer les modifications",
    savingBtn: "Enregistrement en cours...",
    saveSuccess: "Profil mis à jour avec succès !",
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
    },
    // New profile keys
    tabProjects: "مشاريعي",
    tabEditProfile: "تعديل الملف الشخصي",
    tabSubscription: "اشتراكي",
    bioLabel: "السيرة الذاتية / وصف رائد الأعمال",
    phoneLabel: "رقم الهاتف",
    roleLabel: "الدور / المسمى الوظيفي (مثال: الرئيس التنفيذي)",
    companyLabel: "اسم الشركة / المشروع الناشئ",
    avatarLabel: "اختر صورتك الرمزية كمنشئ",
    customPhotoUrl: "أو رابط صورة ملف شخصي مخصصة",
    saveBtn: "حفظ التغييرات",
    savingBtn: "جاري الحفظ...",
    saveSuccess: "تم تحديث الملف الشخصي بنجاح!",
  }
};

const PLAN_LIMITS = {
  free: 1,
  plus: 3,
  pro: 5,
};

const PRESET_AVATARS = [
  { emoji: "👨‍💻", labelFr: "Sami (Tech)", labelAr: "سامي (تقني)" },
  { emoji: "👩‍💼", labelFr: "Amira (Business)", labelAr: "أميرة (أعمال)" },
  { emoji: "🚀", labelFr: "Yassine (Startupeur)", labelAr: "ياسين (مبادر)" },
  { emoji: "🎨", labelFr: "Leila (Designer)", labelAr: "ليلى (مصممة)" },
  { emoji: "📈", labelFr: "Khaled (Growth)", labelAr: "خالد (نمو)" },
  { emoji: "🤖", labelFr: "Meriam (IA)", labelAr: "مريم (ذكاء اصطناعي)" },
  { emoji: "💼", labelFr: "Hedi (Mentor)", labelAr: "هادي (موجه)" },
  { emoji: "🌱", labelFr: "Sarah (Agri)", labelAr: "سارة (زراعة)" }
];

export default function ProfileModal({ isOpen, onClose, user, onLogin, onLogout, plan, onUpgrade, history, lang, onResume, api, theme, setTheme }) {
  const [activeTab, setActiveTab] = useState(() => plan === "free" ? "pricing" : "projects");
  const [isRegister, setIsRegister] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Auth anim state
  const [animState, setAnimState] = useState("loading"); // loading | transitioning | revealed

  useEffect(() => {
    if (isOpen && !user) {
      setAnimState("loading");
      setIsRegister(false);
      const timer1 = setTimeout(() => {
        setAnimState("transitioning");
      }, 2200);
      const timer2 = setTimeout(() => {
        setAnimState("revealed");
      }, 3000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      setAnimState("revealed");
    }
  }, [isOpen, user]);
  
  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetMode, setResetMode] = useState(false); // forgot-password / reset flow
  const [resetToken, setResetToken] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  
  // Checkout State
  const [checkoutPlan, setCheckoutPlan] = useState(null); // null | 'plus' | 'pro'
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Profile Edit Form State
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [profileCompany, setProfileCompany] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("👨‍💻");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(null);

  // Reset / sync profile edit form state when user changes or modal opens
  useEffect(() => {
    if (user) {
      setProfileName(user.name || "");
      setProfileBio(user.bio || "");
      setProfilePhone(user.phone || "");
      setProfileRole(user.role || "");
      setProfileCompany(user.company || "");
      setProfilePhoto(user.photo || "👨‍💻");
      setProfileSaveSuccess(false);
      setProfileSaveError(null);
    }
  }, [user, isOpen]);

  // Adjust active tab when plan changes
  useEffect(() => {
    if (plan) {
      setActiveTab(plan === "free" ? "pricing" : "projects");
    }
  }, [plan]);

  if (!isOpen) return null;

  const t = TEXTS[lang] || TEXTS.fr;
  const ar = lang === "ar";
  const limit = PLAN_LIMITS[plan] || 1;

  async function handleSubmitAuth(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const nextUser = isRegister
        ? await api.register({
            email: email.trim(),
            password,
            name: name.trim(),
          })
        : await api.login({ email: email.trim(), password });
      onLogin(nextUser);
      setEmail("");
      setPassword("");
      setName("");
      onClose();
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

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!profileName.trim()) return;
    setProfileSaving(true);
    setProfileSaveSuccess(false);
    setProfileSaveError(null);
    try {
      const nextUser = await api.updateProfile({
        name: profileName.trim(),
        bio: profileBio.trim() || null,
        phone: profilePhone.trim() || null,
        role: profileRole.trim() || null,
        company: profileCompany.trim() || null,
        photo: profilePhoto.trim() || null,
      });
      onLogin(nextUser); // updates global user state
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
    } catch (err) {
      setProfileSaveError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  const isAuthView = !user || animState !== "revealed";

  return (
    <div className="modal-overlay" onClick={onClose} dir={ar ? "rtl" : "ltr"}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: isAuthView ? 480 : (activeTab === "edit" ? 600 : 750), maxHeight: isAuthView ? "none" : "85vh" }}>
        
        {/* Header */}
        <div className="modal-header" style={{ padding: "12px 20px" }}>
          <h2 className="modal-title" style={{ fontSize: "1.1rem" }}>{t.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {theme && setTheme && (
              <button
                className="theme-toggle-btn"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={ar ? "تغيير المظهر" : "Changer le thème"}
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "transparent", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
              >
                {theme === "dark" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            )}
            <button className="modal-close-btn" onClick={onClose} aria-label={ar ? "إغلاق" : "Fermer"} style={{ width: "32px", height: "32px" }}>&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={isAuthView ? { overflow: "visible" } : {}}>
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
              {!user ? (
                <div className="modal-auth-container" style={{ position: "relative", height: "520px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  {animState !== "revealed" && (
                    <div className={`modal-rive-container ${animState === "transitioning" ? "fade-out" : ""}`} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "260px" }}>
                      <Rive src={logoRiv} style={{ width: "200px", height: "200px" }} />
                    </div>
                  )}

                  {animState !== "loading" && (
                    <div className={`modal-auth-panel ${animState === "revealed" ? "fade-in" : ""}`}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16, marginTop: -12 }}>
                        <img src={logoSvg} alt="Firasa Logo" style={{ height: "60px", width: "auto", marginBottom: 6 }} />
                        <h3 style={{ margin: 0, fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: "1.2rem", fontWeight: 700 }}>
                          {ar ? "الدخول إلى فراسة" : "Accéder à Firasa"}
                        </h3>
                      </div>
                      
                      <form className="auth-form" onSubmit={handleSubmitAuth} style={{ gap: "10px" }}>
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
                          {!isRegister && (
                            <div style={{ textAlign: ar ? "left" : "right", marginTop: "6px" }}>
                              <span
                                onClick={() => setResetMode(true)}
                                style={{
                                  fontSize: "0.78rem",
                                  color: "var(--orange)",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  fontWeight: "500"
                                }}
                              >
                                {ar ? "نسيت كلمة المرور؟" : "Mot de passe oublié ?"}
                              </span>
                            </div>
                          )}
                        </div>
                        <button type="submit" className="primary" style={{ marginTop: 8 }} disabled={authBusy}>
                          {authBusy ? t.loadingPay : (isRegister ? t.submitRegister : t.submitLogin)}
                        </button>

                        <div className="auth-divider">
                          <span>{ar ? "أو" : "ou"}</span>
                        </div>

                        <button className="google-btn" type="button" onClick={async () => {
                          setAuthBusy(true);
                          setAuthError(null);
                          try {
                            await api.loginWithGoogle();
                          } catch (err) {
                            setAuthError(err.message);
                          } finally {
                            setAuthBusy(false);
                          }
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          <span>{ar ? "تسجيل الدخول باستخدام Google" : "Se connecter avec Google"}</span>
                        </button>
                      </form>

                      {resetMode ? (
                        <div style={{ width: "100%", marginTop: 8 }}>
                          {resetToken ? (
                            <form className="auth-form" onSubmit={async (e) => {
                              e.preventDefault();
                              setAuthBusy(true);
                              setAuthError(null);
                              try {
                                const res = await api.resetPassword({ token: resetToken, new_password: password });
                                setResetMsg(res.message || (ar ? "تم تحديث كلمة المرور." : "Mot de passe mis à jour."));
                                setResetToken("");
                                setPassword("");
                              } catch (err) {
                                setAuthError(err.message);
                              } finally {
                                setAuthBusy(false);
                              }
                            }} style={{ gap: "10px" }}>
                              <p style={{ fontSize: "0.85rem", color: "var(--text-sub)", textAlign: "center", margin: 0 }}>
                                {ar ? "أدخل كلمة مرور جديدة" : "Entrez un nouveau mot de passe"}
                              </p>
                              <div className="form-group">
                                <label>{t.password}</label>
                                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                              </div>
                              <button type="submit" className="primary" disabled={authBusy}>{authBusy ? t.loadingPay : (ar ? "تحديث" : "Mettre à jour")}</button>
                              <button type="button" onClick={() => { setResetMode(false); setResetToken(""); setResetMsg(""); setAuthError(null); }} style={{ background: "transparent", borderColor: "var(--border)" }}>
                                {ar ? "إلغاء" : "Annuler"}
                              </button>
                            </form>
                          ) : (
                            <>
                              <p style={{ fontSize: "0.85rem", color: "var(--text-sub)", textAlign: "center", margin: "0 0 12px" }}>
                                {ar ? "أدخل بريدك الإلكتروني لإعادة تعيين كلمة المرور" : "Entrez votre email pour réinitialiser le mot de passe"}
                              </p>
                              <form className="auth-form" onSubmit={async (e) => {
                                e.preventDefault();
                                if (!email.trim()) return;
                                setAuthBusy(true);
                                setAuthError(null);
                                try {
                                  const res = await api.forgotPassword(email.trim());
                                  setResetToken(res.message?.replace("Reset token: ", "") || "");
                                  setResetMsg(res.message || "");
                                } catch (err) {
                                  setAuthError(err.message);
                                } finally {
                                  setAuthBusy(false);
                                }
                              }} style={{ gap: "10px" }}>
                                <div className="form-group">
                                  <label>{t.email}</label>
                                  <input type="email" placeholder="entrepreneur@firasa.tn" value={email} onChange={e => setEmail(e.target.value)} required />
                                </div>
                                <button type="submit" className="primary" disabled={authBusy}>{authBusy ? t.loadingPay : (ar ? "إرسال" : "Envoyer")}</button>
                                <button type="button" onClick={() => { setResetMode(false); setAuthError(null); }} style={{ background: "transparent", borderColor: "var(--border)" }}>
                                  {ar ? "رجوع" : "Retour"}
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="auth-toggle-msg">
                          {isRegister ? (
                            <p>{t.hasAccount}<span onClick={() => setIsRegister(false)}>{t.login}</span></p>
                          ) : (
                            <p>{t.noAccount}<span onClick={() => setIsRegister(true)}>{t.register}</span></p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* 3. Authenticated Profile & Pricing tabs */
                <div>
                  {/* Local Navigation Tabs */}
                  <div className="results-tabs" style={{ marginBottom: 20, justifyContent: "center" }}>
                    <button 
                      className={`res-tab${activeTab === "projects" ? " active" : ""}`}
                      onClick={() => {
                        setActiveTab("projects");
                        setProfileSaveSuccess(false);
                        setProfileSaveError(null);
                      }}
                    >
                      {t.tabProjects}
                    </button>
                    <button 
                      className={`res-tab${activeTab === "edit" ? " active" : ""}`}
                      onClick={() => {
                        setActiveTab("edit");
                        setProfileSaveSuccess(false);
                        setProfileSaveError(null);
                      }}
                    >
                      {t.tabEditProfile}
                    </button>
                    <button 
                      className={`res-tab${activeTab === "pricing" ? " active" : ""}`}
                      onClick={() => {
                        setActiveTab("pricing");
                        setProfileSaveSuccess(false);
                        setProfileSaveError(null);
                      }}
                    >
                      {t.tabSubscription}
                    </button>
                  </div>

                  {/* TAB 1: Mes Projets */}
                  {activeTab === "projects" && (
                    <div>
                      {/* Profile details summary card */}
                      <div className="profile-info-row" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                          {user.photo ? (
                            user.photo.startsWith("http") || user.photo.startsWith("/") ? (
                              <img src={user.photo} alt={user.name} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--orange-border)" }} />
                            ) : (
                              <span style={{ fontSize: "2.4rem", lineHeight: 1 }}>{user.photo}</span>
                            )
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--border)", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.02)" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user.name}</div>
                            {user.role && <div style={{ fontSize: "0.8rem", color: "var(--orange)", fontWeight: 600 }}>{user.role} {user.company ? `@ ${user.company}` : ""}</div>}
                            <div style={{ fontSize: "0.78rem", color: "var(--text-sub)", marginTop: 2 }}>{user.email}</div>
                          </div>
                        </div>
                        <span className={`plan-badge ${plan}`}>{plan === "free" ? t.freeLabel : plan === "plus" ? t.plusLabel : t.proLabel}</span>
                      </div>

                      {/* Bio if exists */}
                      {user.bio && (
                        <div style={{ padding: "12px 16px", borderRadius: "var(--r-md)", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", margin: "16px 0", fontSize: "0.85rem", color: "var(--text-sub)", fontStyle: "italic", lineHeight: 1.4 }}>
                          {user.bio}
                        </div>
                      )}

                      {/* Project count indicator */}
                      <div style={{ marginBottom: 20, marginTop: 16 }}>
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
                                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{h.name && h.name.trim() && h.name !== "—" ? h.name : (ar ? "مشروع بدون اسم" : "Projet sans nom")}</span>
                                  {h.sector && <span className="hist-tag cyan" style={{ marginLeft: 8, marginRight: 8, fontSize: "0.6rem", padding: "1px 6px" }}>{SECTOR_LABELS[lang]?.[h.sector] || h.sector}</span>}
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
                  )}

                  {/* TAB 2: Modifier le profil */}
                  {activeTab === "edit" && (
                    <form className="auth-form" onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {profileSaveError && <div className="error-banner">{profileSaveError}</div>}
                      {profileSaveSuccess && (
                        <div className="success-banner" style={{ background: "var(--green-soft)", color: "var(--green)", border: "1px solid rgba(34,197,94,0.25)", padding: "10px 14px", borderRadius: "var(--r-md)", fontSize: "0.88rem", fontWeight: 600, textAlign: "center" }}>
                          {t.saveSuccess}
                        </div>
                      )}
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div className="form-group">
                          <label>{t.name}</label>
                          <input 
                            type="text" 
                            value={profileName} 
                            onChange={e => setProfileName(e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group">
                          <label>{t.phoneLabel}</label>
                          <input 
                            type="text" 
                            placeholder="+216 -- --- ---"
                            value={profilePhone} 
                            onChange={e => setProfilePhone(e.target.value)} 
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div className="form-group">
                          <label>{t.roleLabel}</label>
                          <input 
                            type="text" 
                            placeholder="e.g. CEO / Fondateur"
                            value={profileRole} 
                            onChange={e => setProfileRole(e.target.value)} 
                          />
                        </div>
                        <div className="form-group">
                          <label>{t.companyLabel}</label>
                          <input 
                            type="text" 
                            placeholder="e.g. MyStartup"
                            value={profileCompany} 
                            onChange={e => setProfileCompany(e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>{t.bioLabel}</label>
                        <textarea 
                          rows={3} 
                          value={profileBio} 
                          onChange={e => setProfileBio(e.target.value)} 
                          placeholder="..."
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            borderRadius: "var(--r-md)",
                            border: "1px solid var(--border)",
                            background: "rgba(255,255,255,0.02)",
                            color: "var(--text)",
                            fontFamily: "var(--f-body)",
                            resize: "vertical"
                          }}
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ marginBottom: "6px", display: "block" }}>{t.avatarLabel}</label>
                        <div className="avatar-grid" style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: "8px",
                          marginTop: "4px",
                          marginBottom: "8px"
                        }}>
                          {PRESET_AVATARS.map((av) => {
                            const isSelected = profilePhoto === av.emoji;
                            return (
                              <button
                                key={av.emoji}
                                type="button"
                                onClick={() => setProfilePhoto(av.emoji)}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "8px",
                                  borderRadius: "var(--r-md)",
                                  border: "1px solid",
                                  borderColor: isSelected ? "var(--orange)" : "var(--border)",
                                  background: isSelected ? "var(--orange-soft)" : "rgba(255, 255, 255, 0.02)",
                                  boxShadow: isSelected ? "0 0 10px var(--orange-glow)" : "none",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease"
                                }}
                              >
                                <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{av.emoji}</span>
                                <span style={{ fontSize: "0.65rem", color: isSelected ? "var(--text)" : "var(--text-sub)", textAlign: "center" }}>
                                  {lang === "ar" ? av.labelAr : av.labelFr}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="form-group" style={{ marginTop: "8px" }}>
                          <label style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginBottom: "4px", display: "block" }}>
                            {t.customPhotoUrl}
                          </label>
                          <input
                            type="text"
                            placeholder="https://example.com/avatar.jpg"
                            value={profilePhoto && (profilePhoto.startsWith("http") || profilePhoto.startsWith("/")) ? profilePhoto : ""}
                            onChange={(e) => setProfilePhoto(e.target.value || "👨‍💻")}
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              borderRadius: "var(--r-md)",
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,0.02)",
                              color: "var(--text)"
                            }}
                          />
                        </div>
                      </div>

                      <button type="submit" className="primary" style={{ marginTop: "8px" }} disabled={profileSaving}>
                        {profileSaving ? t.savingBtn : t.saveBtn}
                      </button>
                    </form>
                  )}

                  {/* TAB 3: Mon Abonnement */}
                  {activeTab === "pricing" && (
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
