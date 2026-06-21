import { useEffect, useMemo, useRef, useState } from "react";
import { SECTOR_LABELS } from "../constants.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const TEXTS = {
  fr: {
    title: "Profil",
    subtitle: "Une vue simple, claire et orientée action.",
    back: "Retour",
    edit: "Enregistrer les modifications",
    editSaving: "Enregistrement...",
    photo: "Photo de profil",
    upload: "Téléverser une photo",
    replace: "Remplacer la photo",
    basicInfo: "Infos essentielles",
    sections: "Sections",
    projects: "Projets",
    subscriptions: "Abonnement",
    about: "À propos de moi",
    account: "Compte",
    email: "E-mail",
    role: "Rôle",
    company: "Startup / Société",
    phone: "Téléphone",
    birthDate: "Date de naissance",
    location: "Ville / Pays",
    bio: "Biographie courte",
    noProjects: "Aucun projet pour le moment.",
    activePlan: "Plan actif",
    accountSince: "Compte créé le",
    upgradeHint: "Choisissez une formule ci-dessous pour débloquer de nouvelles limites.",
    currentSubscription: "Abonnement actuel",
    planFree: "Gratuit",
    planPlus: "Plus",
    planPro: "Pro",
    recentProjects: "Projets récents",
    openProject: "Ouvrir",
    checkoutTitle: "Paiement sécurisé & Activation",
    cardNumber: "Numéro de carte",
    expiry: "Expiration (MM/AA)",
    cvc: "Code CVC",
    payBtn: "Valider le paiement",
    loadingPay: "Traitement en cours...",
    checkoutSuccess: "Paiement réussi ! Votre plan a été mis à niveau.",
    cancel: "Annuler",
    deleteConfirmTitle: "Supprimer le projet",
    deleteConfirmDesc: "Êtes-vous sûr de vouloir supprimer définitivement le projet",
    deleteConfirmWarn: "Cette action est irréversible et supprimera également tous les rapports d'audit associés.",
    deleteBtn: "Supprimer",
    upgradeBtn: "S'abonner"
  },
  ar: {
    title: "الملف الشخصي",
    subtitle: "واجهة بسيطة وواضحة ومباشرة.",
    back: "رجوع",
    edit: "حفظ التغييرات",
    editSaving: "جارٍ الحفظ...",
    photo: "صورة الملف",
    upload: "رفع صورة",
    replace: "تبديل الصورة",
    basicInfo: "المعلومات الأساسية",
    sections: "الأقسام",
    projects: "المشاريع",
    subscriptions: "الاشتراك",
    about: "نبذة عني",
    account: "الحساب",
    email: "البريد الإلكتروني",
    role: "الدور",
    company: "الشركة / المشروع",
    phone: "الهاتف",
    birthDate: "تاريخ الميلاد",
    location: "المدينة / البلد",
    bio: "نبذة قصيرة",
    noProjects: "لا توجد مشاريع حالياً.",
    activePlan: "الاشتراك الحالي",
    accountSince: "أنشئ الحساب في",
    upgradeHint: "اختر إحدى الباقات أدناه لفتح ميزات إضافية وسقوف أعلى.",
    currentSubscription: "الاشتراك الحالي",
    planFree: "مجاني",
    planPlus: "بلس",
    planPro: "برو",
    recentProjects: "المشاريع الأخيرة",
    openProject: "فتح",
    checkoutTitle: "تأكيد الدفع والترقية",
    cardNumber: "رقم البطاقة",
    expiry: "تاريخ انتهاء الصلاحية (MM/AA)",
    cvc: "رمز CVC",
    payBtn: "دفع وتفعيل",
    loadingPay: "جاري المعالجة...",
    checkoutSuccess: "تم الدفع بنجاح! تم ترقية اشتراكك.",
    cancel: "إلغاء",
    deleteConfirmTitle: "حذف المشروع",
    deleteConfirmDesc: "هل أنت متأكد من حذف المشروع",
    deleteConfirmWarn: "هذه العملية نهائية ولا يمكن التراجع عنها، وستحذف كافة تقارير التدقيق المرتبطة.",
    deleteBtn: "حذف",
    upgradeBtn: "ترقية"
  },
};

function getPhotoNode(photo, name) {
  if (!photo) {
    return (
      <div className="profile-photo-fallback">
        <span>{(name || "E").slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  if (photo.startsWith("http") || photo.startsWith("/") || photo.startsWith("data:")) {
    return <img className="profile-photo-image" src={photo} alt={name || "Profile"} />;
  }

  return <div className="profile-photo-emoji">{photo}</div>;
}

function formatDate(value, lang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-TN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default function ProfilePage({ user, plan, history, lang, api, onBack, onLogout, onUserUpdated, onViewProject, onProjectDeleted }) {
  const t = TEXTS[lang] || TEXTS.fr;
  const ar = lang === "ar";
  const fileRef = useRef(null);

  // States
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(user?.photo || "");
  const [form, setForm] = useState({
    name: user?.name || "",
    role: user?.role || "",
    company: user?.company || "",
    phone: user?.phone || "",
    birth_date: user?.birth_date || "",
    location: user?.location || "",
    bio: user?.bio || "",
    photo: user?.photo || "",
  });

  // Deletion States
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Checkout States
  const [checkoutPlan, setCheckoutPlan] = useState(null); // 'plus' | 'pro' | null
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  useEffect(() => {
    setForm({
      name: user?.name || "",
      role: user?.role || "",
      company: user?.company || "",
      phone: user?.phone || "",
      birth_date: user?.birth_date || "",
      location: user?.location || "",
      bio: user?.bio || "",
      photo: user?.photo || "",
    });
    setPhotoPreview(user?.photo || "");
    setSaved(false);
    setError(null);
  }, [user]);

  const recentProjects = useMemo(() => history.slice(0, 6), [history]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = String(reader.result || "");
      setPhotoPreview(next);
      setForm((prev) => ({ ...prev, photo: next }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const nextUser = await api.updateProfile({
        name: form.name.trim(),
        role: form.role.trim() || null,
        company: form.company.trim() || null,
        phone: form.phone.trim() || null,
        birth_date: form.birth_date || null,
        location: form.location.trim() || null,
        bio: form.bio.trim() || null,
        photo: form.photo || null,
      });
      onUserUpdated?.(nextUser);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Deletion confirm
  async function confirmDeleteProject() {
    if (!deletingProjectId) return;
    setDeletingBusy(true);
    try {
      await api.deleteProject(deletingProjectId);
      onProjectDeleted?.(deletingProjectId);
      setDeletingProjectId(null);
    } catch (err) {
      if (err.message.includes("introuvable") || err.message.includes("not found")) {
        // Project already gone from DB, clean it up locally
        onProjectDeleted?.(deletingProjectId);
        setDeletingProjectId(null);
      } else {
        setError(err.message);
      }
    } finally {
      setDeletingBusy(false);
    }
  }

  // Payment simulated confirm
  function handlePay(e) {
    e.preventDefault();
    setCheckoutBusy(true);
    setTimeout(async () => {
      try {
        const nextUser = await api.updatePlan(checkoutPlan);
        setCheckoutSuccess(true);
        onUserUpdated?.(nextUser);
        setTimeout(() => {
          setCheckoutPlan(null);
          setCheckoutSuccess(false);
        }, 1500);
      } catch (err) {
        setError(err.message);
      } finally {
        setCheckoutBusy(false);
      }
    }, 1200);
  }

  const planLabel = plan === "plus" ? t.planPlus : plan === "pro" ? t.planPro : t.planFree;

  return (
    <div className="profile-page" dir={ar ? "rtl" : "ltr"}>
      <div className="profile-page-header">
        <div>
          <div className="profile-page-kicker">{t.title}</div>
          <h1>{user?.name || t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="profile-page-actions">
          <button className="ghost" onClick={onBack}>{t.back}</button>
          <button className="primary" onClick={onLogout}>{ar ? "تسجيل الخروج" : "Se déconnecter"}</button>
        </div>
      </div>

      <div className="profile-shell">
        <aside className="profile-aside">
          <div className="profile-photo-card">
            <div className="profile-photo-wrap">{getPhotoNode(photoPreview || user?.photo, user?.name)}</div>
            <div className="profile-photo-meta">
              <h2>{user?.name}</h2>
              <div className="profile-role-line">
                {user?.role || t.role}
                {user?.company ? ` · ${user.company}` : ""}
              </div>
              <div className="profile-muted">{user?.location || t.location}</div>
            </div>
            <div className="profile-photo-actions">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
              <button className="ghost" onClick={() => fileRef.current?.click()}>
                {photoPreview ? t.replace : t.upload}
              </button>
            </div>
          </div>

          <div className="profile-summary-card">
            <div className="profile-summary-title">{t.basicInfo}</div>
            <dl className="profile-summary-list">
              <div>
                <dt>{t.email}</dt>
                <dd>{user?.email || "—"}</dd>
              </div>
              <div>
                <dt>{t.phone}</dt>
                <dd>{user?.phone || "—"}</dd>
              </div>
              <div>
                <dt>{t.birthDate}</dt>
                <dd>{formatDate(user?.birth_date, lang)}</dd>
              </div>
              <div>
                <dt>{t.accountSince}</dt>
                <dd>{formatDate(user?.created_at, lang)}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <main className="profile-main">
          <section className="profile-section">
            <div className="profile-section-head">
              <div>
                <h3>{t.about}</h3>
              </div>
              <span className={`plan-badge ${plan}`}>{planLabel}</span>
            </div>

            {error && <div className="error-banner">{error}</div>}
            {saved && <div className="success-banner profile-success">{ar ? "تم حفظ الملف الشخصي" : "Profil mis à jour"}</div>}

            <form className="profile-form-grid" onSubmit={handleSave}>
              <label className="profile-field">
                <span>{ar ? "الاسم الكامل" : "Nom complet"}</span>
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label className="profile-field">
                <span>{t.role}</span>
                <input value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))} placeholder="CEO, Founder..." />
              </label>
              <label className="profile-field">
                <span>{t.company}</span>
                <input value={form.company} onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))} placeholder="MyStartup" />
              </label>
              <label className="profile-field">
                <span>{t.phone}</span>
                <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+216..." />
              </label>
              <label className="profile-field">
                <span>{t.birthDate}</span>
                <input type="date" value={form.birth_date} onChange={(e) => setForm((prev) => ({ ...prev, birth_date: e.target.value }))} />
              </label>
              <label className="profile-field">
                <span>{t.location}</span>
                <input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Tunis, Tunisia" />
              </label>
              <label className="profile-field profile-field-full">
                <span>{t.bio}</span>
                <textarea
                  rows={4}
                  value={form.bio}
                  onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
                  placeholder={ar ? "اكتب نبذة قصيرة..." : "Une courte présentation..."}
                />
              </label>
              <div className="profile-form-actions profile-field-full">
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? t.editSaving : t.edit}
                </button>
              </div>
            </form>
          </section>

          <section className="profile-grid-two">
            {/* Left: Projects list */}
            <article className="profile-section">
              <div className="profile-section-head">
                <div>
                  <h3>{t.projects}</h3>
                  <p>{t.recentProjects}</p>
                </div>
                <span className="profile-count">{recentProjects.length}</span>
              </div>

              <div className="profile-list">
                {recentProjects.length === 0 ? (
                  <div className="profile-empty">{t.noProjects}</div>
                ) : (
                  recentProjects.map((item) => (
                    <div
                      key={item.project_id}
                      className="profile-item"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div
                        style={{ flex: 1, cursor: "pointer", textAlign: ar ? "right" : "left" }}
                        onClick={() => onViewProject?.(item.project_id)}
                      >
                        <strong>{item.name && item.name.trim() && item.name !== "—" ? item.name : (ar ? "مشروع بدون اسم" : "Projet sans nom")}</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-sub)" }}>{item.sector && item.sector !== "—" ? (SECTOR_LABELS[lang]?.[item.sector] || item.sector) : ""}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          className="ghost"
                          style={{ color: "var(--orange)", padding: "4px 8px", fontSize: "0.8rem", border: "none", background: "transparent", cursor: "pointer" }}
                          onClick={() => onViewProject?.(item.project_id)}
                        >
                          {t.openProject}
                        </button>
                        <span style={{ color: "var(--border)" }}>|</span>
                        <button
                          className="ghost"
                          style={{ color: "var(--red)", padding: "4px 8px", fontSize: "0.8rem", border: "none", background: "transparent", cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingProjectId(item.project_id);
                          }}
                        >
                          {ar ? "حذف" : "Supprimer"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            {/* Right: Subscriptions list */}
            <article className="profile-section">
              <div className="profile-section-head">
                <div>
                  <h3>{t.subscriptions}</h3>
                  <p>{t.upgradeHint}</p>
                </div>
                <span className={`plan-badge ${plan}`}>{planLabel}</span>
              </div>

              <div className="subscription-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="subscription-price" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
                  <strong style={{ fontSize: "1.1rem" }}>{planLabel}</strong>
                  <span style={{ color: "var(--orange)", fontWeight: 700 }}>
                    {plan === "free" ? "0 DT" : plan === "plus" ? "49 DT" : "99 DT"}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-sub)", fontWeight: "normal" }}> / mois</span>
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Plus Upgrade Option */}
                  {plan === "free" && (
                    <div className="upgrade-option-card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ fontSize: "0.85rem", display: "block" }}>{ar ? "باقة بلس (Plus)" : "Plan Plus"}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-sub)", display: "block", marginTop: "2px" }}>
                            {ar ? "3 مشاريع · المؤشرات والتشخيص" : "3 projets max · Diag & Scores"}
                          </span>
                        </div>
                        <button
                          className="primary small"
                          onClick={() => setCheckoutPlan("plus")}
                          style={{ padding: "6px 12px", fontSize: "0.75rem", background: "var(--cyan)", borderColor: "var(--cyan-border)", color: "#000", minWidth: "75px" }}
                        >
                          49 DT
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pro Upgrade Option */}
                  {plan !== "pro" && (
                    <div className="upgrade-option-card" style={{ borderColor: "var(--orange-border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ fontSize: "0.85rem", display: "block" }}>{ar ? "باقة برو (Pro)" : "Plan Pro"}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-sub)", display: "block", marginTop: "2px" }}>
                            {ar ? "5 مشاريع · الوصول الكامل (خارطة الطريق)" : "5 projets max · Tout débloqué"}
                          </span>
                        </div>
                        <button
                          className="primary small"
                          onClick={() => setCheckoutPlan("pro")}
                          style={{ padding: "6px 12px", fontSize: "0.75rem", background: "var(--orange)", borderColor: "var(--orange-border)", color: "#000", minWidth: "75px" }}
                        >
                          99 DT
                        </button>
                      </div>
                    </div>
                  )}

                  {plan === "pro" && (
                    <div style={{ padding: "8px 0", fontSize: "0.85rem", color: "var(--green)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>✨</span> {ar ? "أنت تستخدم الباقة الأعلى حالياً. شكراً لك!" : "Vous bénéficiez de notre forfait Pro maximal. Merci !"}
                    </div>
                  )}
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>

      {/* Delete Confirmation — using shared ConfirmDialog */}
      <ConfirmDialog
        isOpen={!!deletingProjectId}
        title={t.deleteConfirmTitle}
        message={`${t.deleteConfirmDesc} "${history.find((h) => h.project_id === deletingProjectId)?.name || ""}" ?\n\n${t.deleteConfirmWarn}`}
        confirmLabel={t.deleteBtn}
        cancelLabel={t.cancel}
        variant="danger"
        busy={deletingBusy}
        onConfirm={confirmDeleteProject}
        onCancel={() => setDeletingProjectId(null)}
        lang={lang}
      />

      {/* Upgrade Checkout — simplified modal */}
      {checkoutPlan && (
        <div className="modal-overlay" onClick={() => setCheckoutPlan(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <h3 style={{ fontSize: "1.1rem", margin: 0 }}>{t.checkoutTitle}</h3>
              <button onClick={() => setCheckoutPlan(null)} style={{ background: "transparent", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "var(--text-sub)", padding: 0 }}>&times;</button>
            </div>

            {checkoutSuccess ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ margin: "0 auto 16px", background: "rgba(34,197,94,0.08)", border: "2px solid rgba(34,197,94,0.25)", color: "var(--green)", width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "1.3rem" }}>✓</div>
                <p style={{ fontWeight: 600, color: "var(--text)" }}>{t.checkoutSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handlePay} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-sub)", lineHeight: 1.4 }}>
                  {ar
                    ? `الترقية إلى ${checkoutPlan === "plus" ? "بلس" : "برو"} — ${checkoutPlan === "plus" ? "49" : "99"} د.ت/شهرياً`
                    : `Abonnement ${checkoutPlan === "plus" ? "Plus" : "Pro"} — ${checkoutPlan === "plus" ? "49 DT" : "99 DT"}/mois`}
                </p>
                <input placeholder={t.cardNumber} value={cardNum} onChange={e => setCardNum(e.target.value)} required
                  style={{ padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <input placeholder={t.expiry} value={cardExp} onChange={e => setCardExp(e.target.value)} required
                    style={{ padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }} />
                  <input type="password" placeholder={t.cvc} value={cardCvc} maxLength={4} onChange={e => setCardCvc(e.target.value)} required
                    style={{ padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }} />
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                  <button type="button" className="ghost" onClick={() => setCheckoutPlan(null)} style={{ flex: 1 }}>{t.cancel}</button>
                  <button type="submit" className="primary" disabled={checkoutBusy} style={{ flex: 1 }}>{checkoutBusy ? t.loadingPay : t.payBtn}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
