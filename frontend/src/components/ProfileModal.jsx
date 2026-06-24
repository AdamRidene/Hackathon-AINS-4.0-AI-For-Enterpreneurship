import { useState, useEffect, useRef } from "react";
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
    otpTitle: "Vérification",
    otpSubtitle: "Veuillez saisir le code de 6 chiffres envoyé par e-mail.",
    otpLabel: "Code de confirmation",
    otpSubmit: "Confirmer le code",
    otpCountdown: "Le code expire dans",
    otpResend: "Renvoyer le code",
    otpExpired: "Code expiré",
    forgotPassword: "Mot de passe oublié ?",
    forgotTitle: "Mot de passe oublié",
    forgotSubtitle: "Saisissez votre e-mail pour recevoir un code de réinitialisation.",
    sendOtp: "Envoyer le code",
    backToLogin: "Retour à la connexion",
    resetOtpSubtitle: "Saisissez le code de 6 chiffres envoyé par e-mail pour réinitialiser votre mot de passe.",
    resetPasswordTitle: "Nouveau mot de passe",
    resetPasswordSubtitle: "Saisissez votre nouveau mot de passe ci-dessous.",
    newPasswordLabel: "Nouveau mot de passe",
    confirmPasswordLabel: "Confirmer le mot de passe",
    submitReset: "Enregistrer le mot de passe",
    passwordMismatch: "Les mots de passe ne correspondent pas.",
    passwordUpdated: "Votre mot de passe a été mis à jour avec succès !",
    passwordMinLength: "Au moins 8 caractères",
    passwordUppercase: "Au moins une lettre majuscule",
    passwordLowercase: "Au moins une lettre minuscule",
    passwordNumber: "Au moins un chiffre",
    passwordSpecial: "Au moins un caractère spécial (ex. @, #, $, !)",
    passwordWeak: "Faible",
    passwordMedium: "Moyen",
    passwordStrong: "Fort",
    passwordValidationError: "Le mot de passe ne respecte pas les critères de sécurité.",
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
    otpTitle: "التحقق من الحساب",
    otpSubtitle: "الرجاء إدخال الرمز المكون من 6 أرقام المرسل إلى بريدك الإلكتروني.",
    otpLabel: "رمز التأكيد",
    otpSubmit: "تأكيد الرمز",
    otpCountdown: "تنتهي صلاحية الرمز خلال",
    otpResend: "إعادة إرسال الرمز",
    otpExpired: "انتهت صلاحية الرمز",
    forgotPassword: "نسيت كلمة المرور؟",
    forgotTitle: "نسيت كلمة المرور",
    forgotSubtitle: "أدخل بريدك الإلكتروني لتلقي رمز إعادة التعيين.",
    sendOtp: "إرسال الرمز",
    backToLogin: "العودة لتسجيل الدخول",
    resetOtpSubtitle: "أدخل الرمز المكون من 6 أرقام المرسل إلى بريدك الإلكتروني لإعادة تعيين كلمة المرور الخاصة بك.",
    resetPasswordTitle: "كلمة مرور جديدة",
    resetPasswordSubtitle: "أدخل كلمة المرور الجديدة الخاصة بك أدناه.",
    newPasswordLabel: "كلمة المرور الجديدة",
    confirmPasswordLabel: "تأكيد كلمة المرور",
    submitReset: "حفظ كلمة المرور",
    passwordMismatch: "كلمتا المرور غير متطابقتين.",
    passwordUpdated: "تم تحديث كلمة المرور بنجاح!",
    passwordMinLength: "8 أحرف على الأقل",
    passwordUppercase: "حرف كبير واحد على الأقل",
    passwordLowercase: "حرف صغير واحد على الأقل",
    passwordNumber: "رقم واحد على الأقل",
    passwordSpecial: "رمز خاص واحد على الأقل (مثل @، #، $، !)",
    passwordWeak: "ضعيف",
    passwordMedium: "متوسط",
    passwordStrong: "قوي",
    passwordValidationError: "كلمة المرور لا تستوفي معايير الأمان المطلوبة.",
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

function getPasswordStrength(pwd) {
  const criteria = {
    length: pwd.length >= 8,
    lowercase: /[a-z]/.test(pwd),
    uppercase: /[A-Z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^a-zA-Z0-9]/.test(pwd),
  };
  const score = Object.values(criteria).filter(Boolean).length;
  return { criteria, score };
}

export default function ProfileModal({ isOpen, onClose, user, onLogin, onLogout, plan, onUpgrade, history, lang, onResume, api, theme, setTheme, initialAuthMode = "login" }) {
  const [activeTab, setActiveTab] = useState(() => plan === "free" ? "pricing" : "projects");
  const [authMode, setAuthMode] = useState(initialAuthMode); // login | register | forgot | forgot-otp | reset-password
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Auth anim state
  const [animState, setAnimState] = useState("loading"); // loading | transitioning | revealed

  // Forgot password OTP states
  const [forgotOtp, setForgotOtp] = useState(["", "", "", "", "", ""]);
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotOtpSuccess, setForgotOtpSuccess] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [timer, setTimer] = useState(120);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetSuccess, setIsResetSuccess] = useState(false);

  const forgotInputRefs = useRef([]);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (isOpen && !user) {
      setAnimState("loading");
      setAuthMode(initialAuthMode);
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
  }, [isOpen, user, initialAuthMode]);

  useEffect(() => {
    if (authMode !== "forgot-otp" || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [authMode, timer]);
  
  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function handleForgotPassword(e) {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setAuthError(lang === "ar" ? "الرجاء إدخال البريد الإلكتروني أولاً" : "Veuillez saisir votre adresse e-mail d'abord.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.forgotPassword(email.trim());
      setForgotOtp(["", "", "", "", "", ""]);
      setForgotOtpCode("");
      setForgotOtpSuccess(false);
      setTimer(120);
      setAuthMode("forgot-otp");
    } catch (err) {
      console.error(err);
      setAuthError(err.message || String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  const handleForgotOtpChange = (value, index) => {
    setOtpError(false);
    setForgotOtpSuccess(false);
    setAuthError(null);
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned && value !== "") return;

    const newOtp = [...forgotOtp];
    if (cleaned.length > 1) {
      const chars = cleaned.split("").slice(0, 6 - index);
      for (let i = 0; i < chars.length; i++) {
        newOtp[index + i] = chars[i];
      }
      setForgotOtp(newOtp);
      const targetIndex = Math.min(index + chars.length, 5);
      forgotInputRefs.current[targetIndex]?.focus();
    } else {
      newOtp[index] = cleaned;
      setForgotOtp(newOtp);
      if (cleaned && index < 5) {
        forgotInputRefs.current[index + 1]?.focus();
      }
    }

    const currentFullCode = newOtp.join("");
    setForgotOtpCode(currentFullCode);

    if (currentFullCode.length < 6) {
      verifyingRef.current = false;
    }

    if (newOtp.every((val) => val !== "") && currentFullCode.length === 6) {
      triggerVerifyForgotOtp(currentFullCode);
    }
  };

  const handleForgotOtpKeyDown = (e, index) => {
    if (e.key === "Backspace" && !forgotOtp[index] && index > 0) {
      const newOtp = [...forgotOtp];
      newOtp[index - 1] = "";
      setForgotOtp(newOtp);
      setForgotOtpCode(newOtp.join(""));
      forgotInputRefs.current[index - 1]?.focus();
    }
  };

  const handleForgotOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    setOtpError(false);
    setForgotOtpSuccess(false);
    setAuthError(null);
    const newOtp = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
    setForgotOtp(newOtp);
    const fullCode = newOtp.join("");
    setForgotOtpCode(fullCode);
    const lastFilled = Math.min(pasted.length, 5);
    forgotInputRefs.current[lastFilled]?.focus();
    if (pasted.length === 6) triggerVerifyForgotOtp(fullCode);
  };

  const triggerVerifyForgotOtp = async (codeToVerify) => {
    if (verifyingRef.current) return;
    if (!codeToVerify || codeToVerify.length < 6) return;
    if (timer <= 0) {
      setOtpError(true);
      setAuthError(t.otpExpired);
      return;
    }
    verifyingRef.current = true;
    setAuthBusy(true);
    setAuthError(null);
    setForgotOtpSuccess(false);
    try {
      await api.verifyForgotOtp(email.trim(), codeToVerify.trim());
      setForgotCode(codeToVerify.trim());
      setForgotOtpSuccess(true);
      setTimeout(() => {
        setPassword("");
        setConfirmPassword("");
        setAuthError(null);
        setAuthMode("reset-password");
        setForgotOtpSuccess(false);
        verifyingRef.current = false;
      }, 700);
    } catch (err) {
      console.error("Forgot OTP verify error:", err);
      setOtpError(true);
      setAuthError(err.message || String(err));
      verifyingRef.current = false;
    } finally {
      setAuthBusy(false);
    }
  };

  async function submitResetPassword(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setAuthError(t.passwordMismatch);
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.resetPasswordCustom({ email: email.trim(), code: forgotCode, password });
      setIsResetSuccess(true);
      
      setTimeout(async () => {
        try {
          const nextUser = await api.login({ email: email.trim(), password });
          onLogin(nextUser);
          setAuthMode("login");
          setIsResetSuccess(false);
          setEmail("");
          setPassword("");
          setConfirmPassword("");
          onClose();
        } catch (loginErr) {
          console.error("Autologin error after reset:", loginErr);
          setAuthMode("login");
          setIsResetSuccess(false);
          setPassword("");
          setConfirmPassword("");
        }
      }, 1800);
    } catch (err) {
      console.error("Password reset error:", err);
      setAuthError(err.message || String(err));
      setAuthBusy(false);
    }
  }

  async function handleResendCode() {
    setAuthBusy(true);
    setAuthError(null);
    setOtpError(false);
    setForgotOtpSuccess(false);
    try {
      await api.forgotPassword(email.trim());
      setForgotOtp(["", "", "", "", "", ""]);
      setForgotOtpCode("");
      verifyingRef.current = false;
      setTimer(120);
    } catch (err) {
      console.error("Resend OTP error:", err);
      setAuthError(err.message || String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  
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
    if (authMode === "register") {
      const { score } = getPasswordStrength(password);
      if (score < 5) {
        setAuthError(t.passwordValidationError);
        return;
      }
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const nextUser = authMode === "register"
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
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: isAuthView ? 460 : (activeTab === "edit" ? 600 : 750), maxHeight: isAuthView ? "fit-content" : "85vh", overflow: isAuthView ? "visible" : "hidden" }}>
        
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
            <button className="modal-close-btn" onClick={onClose} style={{ width: "32px", height: "32px" }}>&times;</button>
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
                <div className="modal-auth-container" style={{ position: "relative", minHeight: "380px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  {animState !== "revealed" && (
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      width: "100%",
                      animation: animState === "transitioning" ? "fadeOut 0.8s forwards" : "none"
                    }}>
                      <div style={{ width: "160px", height: "160px", marginBottom: "20px", marginTop: "-40px" }}>
                        <Rive src={logoRiv} style={{ width: "100%", height: "100%" }} />
                      </div>
                      <h3 style={{ 
                        margin: 0, 
                        fontFamily: "var(--f-display)", 
                        fontStyle: "italic", 
                        fontSize: "1.6rem", 
                        fontWeight: 700,
                        color: "var(--text)"
                      }}>
                        {ar ? "الدخول إلى فراسة" : "Accéder à Firasa"}
                      </h3>
                      <p style={{ marginTop: "8px", fontSize: "0.9rem", color: "var(--text-sub)" }}>
                        {ar ? "جاري التحميل..." : "Chargement..."}
                      </p>
                    </div>
                  )}

                  {animState === "revealed" && (
                    <div className="fade-in" style={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      width: "100%",
                      padding: "16px 0 8px 0"
                    }}>
                      {/* Logo & Title */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: authMode === "register" ? "10px" : "20px" }}>
                        <img src={logoSvg} alt="Firasa Logo" style={{ height: authMode === "register" ? "48px" : "64px", width: "auto", marginBottom: authMode === "register" ? "0px" : "8px" }} />
                        {authMode !== "register" && (
                          <h3 style={{ margin: 0, fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: "1.4rem", fontWeight: 700 }}>
                            {authMode === "forgot" ? (ar ? "نسيت كلمة المرور" : "Mot de passe oublié") : 
                             authMode === "forgot-otp" ? (ar ? "التحقق من الحساب" : "Vérification") :
                             authMode === "reset-password" ? (ar ? "كلمة مرور جديدة" : "Nouveau mot de passe") :
                             (ar ? "الدخول إلى فراسة" : "Accéder à Firasa")}
                          </h3>
                        )}
                        {authMode !== "login" && authMode !== "register" && (
                          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-sub)", textAlign: "center" }}>
                            {authMode === "forgot" ? (ar ? "أدخل بريدك الإلكتروني لتلقي رمز إعادة التعيين." : "Saisissez votre e-mail pour recevoir un code de réinitialisation.") :
                             authMode === "forgot-otp" ? (ar ? "أدخل الرمز المكون من 6 أرقام المرسل إلى بريدك الإلكتروني لإعادة تعيين كلمة المرور الخاصة بك." : "Saisissez le code de 6 chiffres envoyé par e-mail.") :
                             authMode === "reset-password" ? (ar ? "أدخل كلمة المرور الجديدة الخاصة بك أدناه." : "Saisissez votre nouveau mot de passe ci-dessous.") : null}
                          </p>
                        )}
                      </div>
                      
                      {/* Forms */}
                      {(authMode === "login" || authMode === "register") && (
                        <form className="auth-form" onSubmit={handleSubmitAuth} style={{ gap: "8px", display: "flex", flexDirection: "column" }}>
                          {authError && <div className="error-banner">{authError}</div>}
                          {authMode === "register" && (
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
                            <div className="password-input-wrap">
                              <input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                              />
                              <button type="button" className="password-eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                                {showPassword ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                )}
                              </button>
                            </div>
                            {authMode === "register" && password.length > 0 && (
                              <div className="password-criteria-wrap">
                                <div className="password-strength-container">
                                  <span className="password-strength-label">
                                    {ar ? "قوة كلمة المرور:" : "Force :"}
                                  </span>
                                  <div className="password-strength-bar-bg">
                                    <div 
                                      className={`password-strength-bar-fill ${
                                        getPasswordStrength(password).score <= 2 ? "weak" :
                                        getPasswordStrength(password).score <= 4 ? "medium" : "strong"
                                      }`}
                                      style={{ width: `${(getPasswordStrength(password).score / 5) * 100}%` }}
                                    />
                                  </div>
                                  <span className={`password-strength-text ${
                                    getPasswordStrength(password).score <= 2 ? "weak" :
                                    getPasswordStrength(password).score <= 4 ? "medium" : "strong"
                                  }`}>
                                    {
                                      getPasswordStrength(password).score <= 2 ? t.passwordWeak :
                                      getPasswordStrength(password).score <= 4 ? t.passwordMedium : t.passwordStrong
                                    }
                                  </span>
                                </div>
                                <div className="password-criteria-list">
                                  <div className={`password-criterion ${password.length >= 8 ? "valid" : ""}`}>
                                    <span className="password-criterion-icon">{password.length >= 8 ? "✓" : "○"}</span>
                                    <span>{t.passwordMinLength}</span>
                                  </div>
                                  <div className={`password-criterion ${/[A-Z]/.test(password) ? "valid" : ""}`}>
                                    <span className="password-criterion-icon">{/[A-Z]/.test(password) ? "✓" : "○"}</span>
                                    <span>{t.passwordUppercase}</span>
                                  </div>
                                  <div className={`password-criterion ${/[a-z]/.test(password) ? "valid" : ""}`}>
                                    <span className="password-criterion-icon">{/[a-z]/.test(password) ? "✓" : "○"}</span>
                                    <span>{t.passwordLowercase}</span>
                                  </div>
                                  <div className={`password-criterion ${/[0-9]/.test(password) ? "valid" : ""}`}>
                                    <span className="password-criterion-icon">{/[0-9]/.test(password) ? "✓" : "○"}</span>
                                    <span>{t.passwordNumber}</span>
                                  </div>
                                  <div className={`password-criterion ${/[^a-zA-Z0-9]/.test(password) ? "valid" : ""}`}>
                                    <span className="password-criterion-icon">{/[^a-zA-Z0-9]/.test(password) ? "✓" : "○"}</span>
                                    <span>{t.passwordSpecial}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            {authMode === "login" && (
                              <div style={{ textAlign: ar ? "left" : "right", marginTop: "4px" }}>
                                <span
                                  onClick={() => {
                                    setAuthError(null);
                                    setAuthMode("forgot");
                                  }}
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
                          <button type="submit" className="primary" style={{ marginTop: 6, width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center" }} disabled={authBusy}>
                            {authBusy ? t.loadingPay : (authMode === "register" ? t.submitRegister : t.submitLogin)}
                          </button>

                          <div className="auth-divider" style={{ margin: "4px 0" }}>
                            <span>{ar ? "أو" : "ou"}</span>
                          </div>

                          <button
                            className="google-btn"
                            type="button"
                            style={{ width: "100%" }}
                            disabled={authBusy}
                            onClick={async () => {
                              setAuthBusy(true);
                              setAuthError(null);
                              try {
                                await api.loginWithGoogle();
                              } catch (err) {
                                setAuthError(err.message || String(err));
                                setAuthBusy(false);
                              }
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            <span>{ar ? "تسجيل الدخول باستخدام Google" : "Se connecter avec Google"}</span>
                          </button>

                          <div className="auth-toggle-msg" style={{ marginTop: "auto", paddingTop: "12px", textAlign: "center" }}>
                            {authMode === "register" ? (
                              <p>{t.hasAccount}<span style={{ color: "var(--orange)", cursor: "pointer", textDecoration: "underline", fontWeight: "600" }} onClick={() => setAuthMode("login")}>{t.login}</span></p>
                            ) : (
                              <p>{t.noAccount}<span style={{ color: "var(--orange)", cursor: "pointer", textDecoration: "underline", fontWeight: "600" }} onClick={() => setAuthMode("register")}>{t.register}</span></p>
                            )}
                          </div>
                        </form>
                      )}

                      {authMode === "forgot" && (
                        <form className="auth-form" onSubmit={handleForgotPassword} style={{ gap: "20px", display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", padding: "8px 0" }}>
                          {authError && <div className="error-banner">{authError}</div>}
                          <div className="form-group">
                            <label style={{ fontSize: "0.86rem", fontWeight: 600 }}>{t.email}</label>
                            <input
                              type="email"
                              placeholder="entrepreneur@firasa.tn"
                              value={email}
                              onChange={e => setEmail(e.target.value)}
                              required
                              disabled={authBusy}
                              style={{ padding: "14px 18px", fontSize: "1rem" }}
                            />
                          </div>
                          <button type="submit" className="primary" style={{ width: "100%", height: "48px", fontSize: "0.95rem" }} disabled={authBusy}>
                            {authBusy ? t.loadingPay : t.sendOtp}
                          </button>
                          <div style={{ textAlign: "center" }}>
                            <span
                              onClick={() => {
                                setAuthError(null);
                                setAuthMode("login");
                              }}
                              style={{
                                fontSize: "0.84rem",
                                color: "var(--orange)",
                                cursor: "pointer",
                                textDecoration: "underline",
                                fontWeight: "500"
                              }}
                            >
                              {t.backToLogin}
                            </span>
                          </div>
                        </form>
                      )}

                      {authMode === "forgot-otp" && (
                        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); triggerVerifyForgotOtp(forgotOtp.join("")); }} style={{ gap: "12px", display: "flex", flexDirection: "column" }}>
                          {authError && !otpError && <div className="error-banner">{authError}</div>}
                          <label style={{ textAlign: "center", display: "block", marginBottom: "8px", fontSize: "0.9rem", color: "var(--text-sub)" }}>{t.otpLabel}</label>
                          <div className="otp-input-wrapper" style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", margin: "10px 0" }}>
                            <div className={`otp-boxes-container ${authBusy && !forgotOtpSuccess ? "checking" : ""} ${otpError ? "error" : ""} ${forgotOtpSuccess ? "success" : ""}`} style={{ display: "flex", gap: "8px" }}>
                              {forgotOtp.map((digit, i) => (
                                <input
                                  key={i}
                                  ref={(el) => (forgotInputRefs.current[i] = el)}
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={1}
                                  value={digit}
                                  onChange={(e) => handleForgotOtpChange(e.target.value, i)}
                                  onKeyDown={(e) => handleForgotOtpKeyDown(e, i)}
                                  onPaste={handleForgotOtpPaste}
                                  className={`otp-digit-box ${digit ? "filled" : ""}`}
                                  style={{
                                    pointerEvents: "auto",
                                    textAlign: "center",
                                    outline: "none",
                                    width: "48px",
                                    height: "54px",
                                    fontSize: "1.4rem",
                                    borderRadius: "var(--r-md)",
                                    border: "1px solid var(--border)",
                                    background: "rgba(255,255,255,0.02)",
                                    color: "var(--text)"
                                  }}
                                  disabled={authBusy}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="otp-timer-box" style={{ textAlign: "center", margin: "12px 0", fontSize: "0.88rem" }}>
                            {timer > 0 ? (
                              <span className="muted">
                                {t.otpCountdown} : <strong style={{ color: "var(--orange)" }}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</strong>
                              </span>
                            ) : (
                              <span style={{ color: "var(--red)", fontWeight: "600" }}>{t.otpExpired}</span>
                            )}
                          </div>
                          <button className="primary" type="submit" disabled={authBusy} style={{ display: "none" }}>
                            {t.otpSubmit}
                          </button>
                          <div style={{ textAlign: "center", marginTop: "16px" }}>
                            <span
                              onClick={authBusy ? undefined : handleResendCode}
                              style={{
                                fontSize: "0.82rem",
                                color: "var(--orange)",
                                cursor: authBusy ? "not-allowed" : "pointer",
                                textDecoration: "underline",
                                fontWeight: "500",
                                opacity: authBusy ? 0.5 : 1,
                              }}
                            >
                              {t.otpResend}
                            </span>
                          </div>
                          <div style={{ textAlign: "center", marginTop: "8px" }}>
                            <span
                              onClick={() => {
                                setAuthError(null);
                                setAuthMode("login");
                              }}
                              style={{
                                fontSize: "0.78rem",
                                color: "var(--text-sub)",
                                cursor: "pointer",
                                textDecoration: "underline"
                              }}
                            >
                              {t.backToLogin}
                            </span>
                          </div>
                        </form>
                      )}

                      {authMode === "reset-password" && (
                        <>
                          {!isResetSuccess ? (
                            <form className="auth-form" onSubmit={submitResetPassword} style={{ gap: "16px", display: "flex", flexDirection: "column" }}>
                              {authError && <div className="error-banner">{authError}</div>}
                              <div className="form-group">
                                <label>{t.newPasswordLabel}</label>
                                <div className="password-input-wrap">
                                  <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder=""
                                    required
                                    disabled={authBusy}
                                  />
                                  <button type="button" className="password-eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                                    {showPassword ? (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="form-group" style={{ marginBottom: "12px" }}>
                                <label>{t.confirmPasswordLabel}</label>
                                <div className="password-input-wrap">
                                  <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder=""
                                    required
                                    disabled={authBusy}
                                  />
                                  <button type="button" className="password-eye-btn" onClick={() => setShowConfirmPassword(v => !v)} tabIndex={-1}>
                                    {showConfirmPassword ? (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                              <button className="primary" type="submit" disabled={authBusy}>
                                {authBusy ? t.loadingPay : t.submitReset}
                              </button>
                            </form>
                          ) : (
                            <div className="otp-success-animation" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                              <div className="lock-icon-container" style={{ margin: "0 auto 16px", background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.25)", color: "var(--green)", boxShadow: "0 0 20px var(--green-glow)" }}>✓</div>
                              <h2 className="success-title" style={{ marginTop: "12px", color: "var(--text)", fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: "1.2rem", textAlign: "center" }}>
                                {lang === "ar" ? "تم تحديث كلمة المرور بنجاح" : "Mot de passe mis à jour"}
                              </h2>
                            </div>
                          )}
                        </>
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
                              <img src={user.photo} alt={user.name} referrerPolicy="no-referrer" crossOrigin="anonymous" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--orange-border)" }} />
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
