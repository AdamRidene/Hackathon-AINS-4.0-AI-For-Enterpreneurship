import { useState, useEffect } from "react";
import { SECTOR_LABELS } from "../constants.js";

const TEXTS = {
  fr: {
    title: "Espace Entrepreneur",
    tabProjects: "Mes projets",
    tabEditProfile: "Modifier le profil",
    activeProjects: "Vos projets récents",
    noProjects: "Aucun audit en cours.",
    bioLabel: "Biographie / Description de l'entrepreneur",
    phoneLabel: "Numéro de téléphone",
    roleLabel: "Rôle / Titre (ex. CEO, Directeur Technique)",
    companyLabel: "Nom de l'entreprise / Startup",
    avatarLabel: "Choisissez un avatar de fondateur",
    customPhotoUrl: "Ou URL d'une photo de profil personnalisée",
    saveBtn: "Enregistrer les modifications",
    savingBtn: "Enregistrement en cours...",
    saveSuccess: "Profil mis à jour avec succès !",
    name: "Nom complet",
  },
  ar: {
    title: "فضاء رائد الأعمال",
    tabProjects: "مشاريعي",
    tabEditProfile: "تعديل الملف الشخصي",
    activeProjects: "مشاريعك الحالية",
    noProjects: "لا توجد تدقيقات جارية.",
    bioLabel: "السيرة الذاتية / وصف رائد الأعمال",
    phoneLabel: "رقم الهاتف",
    roleLabel: "الدور / المسمى الوظيفي (مثال: الرئيس التنفيذي)",
    companyLabel: "اسم الشركة / المشروع الناشئ",
    avatarLabel: "اختر صورتك الرمزية كمنشئ",
    customPhotoUrl: "أو رابط صورة ملف شخصي مخصصة",
    saveBtn: "حفظ التغييرات",
    savingBtn: "جاري الحفظ...",
    saveSuccess: "تم تحديث الملف الشخصي بنجاح!",
    name: "الاسم الكامل",
  }
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

export default function ProfileModal({ isOpen, onClose, user, onLogin, onLogout, plan, onUpgrade, history, lang, onResume, api }) {
  const [activeTab, setActiveTab] = useState("projects");

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

  if (!isOpen) return null;

  const t = TEXTS[lang];
  const ar = lang === "ar";

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
      onLogin(nextUser);
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
    } catch (err) {
      setProfileSaveError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} dir={ar ? "rtl" : "ltr"}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: activeTab === "edit" ? 600 : 750 }}>

        <div className="modal-header">
          <h2 className="modal-title">{t.title}</h2>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Tabs */}
          <div className="results-tabs" style={{ marginBottom: 20, justifyContent: "center" }}>
            <button
              className={`res-tab${activeTab === "projects" ? " active" : ""}`}
              onClick={() => { setActiveTab("projects"); setProfileSaveSuccess(false); setProfileSaveError(null); }}
            >
              {t.tabProjects}
            </button>
            <button
              className={`res-tab${activeTab === "edit" ? " active" : ""}`}
              onClick={() => { setActiveTab("edit"); setProfileSaveSuccess(false); setProfileSaveError(null); }}
            >
              {t.tabEditProfile}
            </button>
          </div>

          {/* TAB: Mes Projets */}
          {activeTab === "projects" && (
            <div>
              {user && (
                <div className="profile-info-row" style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: 16 }}>
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
                      {user.role && <div style={{ fontSize: "0.8rem", color: "var(--orange)", fontWeight: 600 }}>{user.role}{user.company ? ` @ ${user.company}` : ""}</div>}
                    </div>
                  </div>
                </div>
              )}

              {user && user.bio && (
                <div style={{ padding: "12px 16px", borderRadius: "var(--r-md)", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", marginBottom: 20, fontSize: "0.85rem", color: "var(--text-sub)", fontStyle: "italic", lineHeight: 1.4 }}>
                  {user.bio}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <h4 style={{ marginBottom: 12, fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: "0.95rem" }}>{t.activeProjects}</h4>
                {history.length === 0 ? (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{t.noProjects}</p>
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
            </div>
          )}

          {/* TAB: Modifier le profil */}
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
                  <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>{t.phoneLabel}</label>
                  <input type="text" placeholder="+216 -- --- ---" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label>{t.roleLabel}</label>
                  <input type="text" placeholder="e.g. CEO / Fondateur" value={profileRole} onChange={e => setProfileRole(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t.companyLabel}</label>
                  <input type="text" placeholder="e.g. MyStartup" value={profileCompany} onChange={e => setProfileCompany(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>{t.bioLabel}</label>
                <textarea
                  rows={3}
                  value={profileBio}
                  onChange={e => setProfileBio(e.target.value)}
                  placeholder="..."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)", fontFamily: "var(--f-body)", resize: "vertical" }}
                />
              </div>

              <div className="form-group">
                <label style={{ marginBottom: "6px", display: "block" }}>{t.avatarLabel}</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "8px" }}>
                  {PRESET_AVATARS.map((av) => {
                    const isSelected = profilePhoto === av.emoji;
                    return (
                      <button
                        key={av.emoji}
                        type="button"
                        onClick={() => setProfilePhoto(av.emoji)}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                          padding: "8px", borderRadius: "var(--r-md)", border: "1px solid",
                          borderColor: isSelected ? "var(--orange)" : "var(--border)",
                          background: isSelected ? "var(--orange-soft)" : "rgba(255,255,255,0.02)",
                          boxShadow: isSelected ? "0 0 10px var(--orange-glow)" : "none",
                          cursor: "pointer", transition: "all 0.15s ease"
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
                  <label style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginBottom: "4px", display: "block" }}>{t.customPhotoUrl}</label>
                  <input
                    type="text"
                    placeholder="https://example.com/avatar.jpg"
                    value={profilePhoto && (profilePhoto.startsWith("http") || profilePhoto.startsWith("/")) ? profilePhoto : ""}
                    onChange={(e) => setProfilePhoto(e.target.value || "👨‍💻")}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }}
                  />
                </div>
              </div>

              <button type="submit" className="primary" style={{ marginTop: "8px" }} disabled={profileSaving}>
                {profileSaving ? t.savingBtn : t.saveBtn}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
