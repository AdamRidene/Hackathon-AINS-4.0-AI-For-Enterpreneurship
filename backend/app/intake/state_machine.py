"""State-driven adaptive intake graph (Phase 1).

A deterministic state machine, NOT a static form. The next question is a pure
function of the current ProjectProfile, so branching is fully auditable:

  * Sector-aware: every sector follows the same core diagnostic path, while
    specific sectors can inject extra probes when they need them. agri-food and
    digital-saas currently add specialized green questions, and all other
    sectors fall back to the generalized branch.
  * Stage-aware: claiming an advanced stage (e.g. Fundraising) injects mandatory
    evidence-validation blocks requiring hard numeric tokens — the system steers
    data collection toward the evidence needed to confirm or refute the claim.
  * Typed tokens: each answer is written to a typed field of the shared profile.

Branching is what produces "meaningfully different question sequences for at
least 3 distinct profiles" (acceptance criterion), demonstrated in
tests/test_intake.py and the seed scenarios.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from ..schema import (
    ProjectProfile, MaturityStage, MVPStage, PricingFramework, GeoNovelty,
    IPStatus, FootprintCategory, LegalForm, Sector,
)


@dataclass
class Question:
    id: str
    prompt_fr: str
    field_path: str                      # dotted path into ProjectProfile
    qtype: str                           # enum | bool | int | float | text | tags | sdg
    options: list[str] = field(default_factory=list)
    applies: Callable[[ProjectProfile], bool] = lambda p: True
    help_fr: str = ""
    # Marks a probe injected specifically by a self-assessment claim.
    triggered_by: Optional[str] = None
    # Bilingual surface (BONUS). Arabic prompts mirror prompt_fr; the engine is
    # language-agnostic — only the presentation layer chooses which to render.
    prompt_ar: str = ""
    help_ar: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id, "prompt_fr": self.prompt_fr, "field_path": self.field_path,
            "qtype": self.qtype, "options": self.options, "help_fr": self.help_fr,
            "triggered_by": self.triggered_by,
            "prompt_ar": self.prompt_ar, "help_ar": self.help_ar,
        }


def _advanced_claim(p: ProjectProfile) -> bool:
    s = p.self_assessment.declared_stage
    return s is not None and int(s) >= int(MaturityStage.FUNDRAISING)


def _is_agri(p: ProjectProfile) -> bool:
    return p.sector == Sector.AGRI_FOOD


def _is_digital(p: ProjectProfile) -> bool:
    return p.sector == Sector.DIGITAL_SAAS


# Ordered question bank. The machine serves the first applicable, unanswered one.
# Sector specificity is additive, not restrictive: the generalized branch always
# remains available so the engine can support any sector in the enum.
QUESTIONS: list[Question] = [
    # --- Universal context ------------------------------------------------- #
    Question("name", "Quel est le nom de votre projet ?", "name", "text",
             prompt_ar="ما اسم مشروعك ؟"),
    Question("sector", "Dans quel secteur opérez-vous ?", "sector", "enum",
             [s.value for s in Sector],
             prompt_ar="في أي قطاع تنشط ؟"),
    Question("declared_stage", "À quel stade pensez-vous que votre projet se trouve ?",
             "self_assessment.declared_stage", "enum",
             [str(int(s)) for s in MaturityStage],
             help_fr="Auto-évaluation. Le système la confrontera aux preuves.",
             prompt_ar="في أي مرحلة تعتقد أن مشروعك يقع ؟",
             help_ar="تقييم ذاتي. سيقارنه النظام بالأدلة."),

    # --- Stage 1 gate evidence -------------------------------------------- #
    Question("problem_statement", "Avez-vous un énoncé de problème écrit ?",
             "has_problem_statement", "bool",
             prompt_ar="هل لديك صياغة مكتوبة للمشكلة ؟"),
    Question("user_segment", "Avez-vous identifié au moins un segment d'utilisateurs ?",
             "user_segment_identified", "bool",
             prompt_ar="هل حددت شريحة مستخدمين واحدة على الأقل ؟"),

    # --- Market dimension -------------------------------------------------- #
    Question("tam", "Marché adressable estimé (TAM) en TND ?",
             "market.estimated_tam_tnd", "float",
             prompt_ar="حجم السوق المستهدف المقدّر (TAM) بالدينار التونسي ؟"),
    Question("competitors", "Nombre de concurrents actifs ?",
             "market.competitor_headcount", "int",
             prompt_ar="عدد المنافسين الناشطين ؟"),
    Question("validation", "Disposez-vous d'une preuve de validation client "
             "(enquête, lettres d'intention, ventes) ?",
             "market.customer_validation_evidence", "bool",
             help_fr="Token booléen — déclenche un plafond sur le Score Marché si absent.",
             prompt_ar="هل لديك دليل على التحقق من العملاء "
             "(استبيان، رسائل نوايا، مبيعات) ؟",
             help_ar="قيمة منطقية — يفرض سقفاً على نتيجة السوق في حال غيابها."),

    # --- Stage-claim probe: validation evidence depth ---------------------- #
    Question("validation_proof", "Décrivez la preuve de validation la plus forte "
             "que vous détenez (chiffres réels).",
             "validation_evidence_narrative", "text",
             applies=lambda p: _advanced_claim(p),
             triggered_by="declared_stage>=Fundraising",
             help_fr="Bloc d'évidence injecté car un stade avancé est revendiqué.",
             prompt_ar="صف أقوى دليل تحقق تملكه (أرقام حقيقية).",
             help_ar="كتلة أدلة مُدرجة لأنه تمت المطالبة بمرحلة متقدمة."),

    # --- Commercial offer -------------------------------------------------- #
    Question("vp_narrative", "Décrivez votre proposition de valeur.",
             "commercial.value_proposition_narrative", "text",
             applies=lambda p: not _advanced_claim(p),
             prompt_ar="صف عرض القيمة الخاص بك."),
    Question("mvp_stage", "Quel est l'état de votre MVP ?",
             "commercial.mvp_stage", "enum", [m.value for m in MVPStage],
             prompt_ar="ما حالة المنتج الأولي (MVP) لديك ؟"),
    Question("pricing", "Quel cadre de tarification utilisez-vous ?",
             "commercial.pricing_framework", "enum", [pf.value for pf in PricingFramework],
             prompt_ar="ما إطار التسعير الذي تعتمده ؟"),

    # --- Innovation -------------------------------------------------------- #
    Question("geo_novelty", "Quel est le degré de nouveauté géographique ?",
             "innovation.geo_novelty", "enum", [g.value for g in GeoNovelty],
             prompt_ar="ما درجة الجِدّة الجغرافية ؟"),
    Question("tech_stack", "Listez les couches de votre stack technique.",
             "innovation.tech_stack", "tags",
             prompt_ar="اذكر طبقات البنية التقنية لديك."),
    Question("ip_status", "Statut de propriété intellectuelle ?",
             "innovation.ip_status", "enum", [ip.value for ip in IPStatus],
             prompt_ar="ما وضع الملكية الفكرية ؟"),

    # --- Scalability ------------------------------------------------------- #
    Question("human_dependency", "Dépendance humaine opérationnelle (1=automatisé, "
             "10=accompagnement manuel total) ?",
             "scalability.human_dependency", "int",
             help_fr="Au-delà de 7, le Score Scalabilité est pénalisé de 50%.",
             prompt_ar="الاعتماد البشري التشغيلي (1=آلي بالكامل، "
             "10=مرافقة يدوية تامة) ؟",
             help_ar="فوق 7، تُخفَّض نتيجة قابلية التوسّع بنسبة 50%."),
    Question("equipment_cost", "Coût d'acquisition d'équipement (CAPEX) en TND ?",
             "scalability.equipment_cost", "float",
             prompt_ar="تكلفة اقتناء المعدّات (CAPEX) بالدينار التونسي ؟"),
    Question("monthly_overhead", "Charges mensuelles récurrentes (OPEX) en TND ?",
             "scalability.monthly_overhead", "float",
             prompt_ar="الأعباء الشهرية المتكررة (OPEX) بالدينار التونسي ؟"),
    Question("cross_border", "Zones cibles transfrontalières ?",
             "scalability.cross_border_zones", "tags",
             prompt_ar="المناطق المستهدفة عبر الحدود ؟"),

    # --- Sector-specific branch: agri-food --------------------------------- #
    Question("agri_footprint", "Type d'empreinte opérationnelle (agri) ?",
             "green.footprint_category", "enum", [f.value for f in FootprintCategory],
             applies=_is_agri, triggered_by="sector=agri-food",
             help_fr="Question sectorielle injectée pour l'agri-food.",
             prompt_ar="نوع الأثر التشغيلي (فلاحي) ؟",
             help_ar="سؤال قطاعي مُدرج للقطاع الفلاحي الغذائي."),
    Question("agri_circular", "Mettez-vous en place un processus de recyclage circulaire "
             "des déchets agricoles ?",
             "green.circular_recycling", "bool",
             applies=_is_agri, triggered_by="sector=agri-food",
             prompt_ar="هل تعتمد عملية إعادة تدوير دائري للنفايات الفلاحية ؟"),

    # --- Sector-specific branch: digital (specialized footprint probe) ----- #
    Question("digital_footprint", "Empreinte de calcul de votre plateforme ?",
             "green.footprint_category", "enum",
             ["Digital Native", "Compute Intensive"],
             applies=_is_digital, triggered_by="sector=digital-saas",
             prompt_ar="الأثر الحوسبي لمنصّتك ؟"),

    # --- Generic green (non agri / non digital) ---------------------------- #
    Question("footprint", "Catégorie d'empreinte opérationnelle ?",
             "green.footprint_category", "enum", [f.value for f in FootprintCategory],
             applies=lambda p: not _is_agri(p) and not _is_digital(p),
             prompt_ar="فئة الأثر التشغيلي ؟"),
    Question("circular", "Pratiques d'économie circulaire / recyclage ?",
             "green.circular_recycling", "bool",
             applies=lambda p: not _is_agri(p),
             prompt_ar="ممارسات الاقتصاد الدائري / إعادة التدوير ؟"),
    Question("sdg", "Quels ODD (1-17) visez-vous ?", "green.sdg_targets", "sdg",
             prompt_ar="ما أهداف التنمية المستدامة (1-17) التي تستهدفها ؟"),

    # --- Team & Organization (gate: Structuration+) ------------------------ #
    Question("team_size", "Combien de co-fondateurs et employés compte votre équipe ?",
             "team_size", "int",
             applies=lambda p: p.self_assessment.declared_stage is not None
                 and int(p.self_assessment.declared_stage) >= 3,
             triggered_by="declared_stage>=Structuration",
             help_fr="Taille totale de l'équipe incluant les fondateurs.",
             prompt_ar="كم عدد المؤسسين والموظفين في فريقك ؟",
             help_ar="الحجم الإجمالي للفريق بما في ذلك المؤسسون."),
    Question("key_hires", "Quels sont les profils clés que vous devez recruter en priorité ?",
             "key_hires", "tags",
             applies=lambda p: p.self_assessment.declared_stage is not None
                 and int(p.self_assessment.declared_stage) >= 4,
             triggered_by="declared_stage>=Fundraising",
             help_fr="Ex: CTO, responsable commercial, chef de produit. Séparez par des virgules.",
             prompt_ar="ما هي الكفاءات الأساسية التي تحتاج لتوظيفها بالأولوية ؟",
             help_ar="مثال: مدير تقني، مسؤول تجاري، مدير منتج. افصل بينها بفواصل."),

    # --- Financial probes (gate: Fundraising+) ------------------------------ #
    Question("monthly_revenue", "Quel est votre chiffre d'affaires mensuel actuel (TND) ?",
             "monthly_revenue_tnd", "float",
             applies=lambda p: _advanced_claim(p),
             triggered_by="declared_stage>=Fundraising",
             help_fr="Revenu brut mensuel. Laissez 0 si aucun.",
             prompt_ar="ما هو رقم معاملاتك الشهري الحالي (بالدينار التونسي) ؟",
             help_ar="الإيراد الشهري الإجمالي. اتركه 0 إذا لم يوجد."),
    Question("burn_rate", "Quel est votre taux de consommation mensuel (burn rate) en TND ?",
             "burn_rate_tnd", "float",
             applies=lambda p: _advanced_claim(p),
             triggered_by="declared_stage>=Fundraising",
             help_fr="Dépenses mensuelles totales (salaires, loyer, outils, etc.).",
             prompt_ar="ما هو معدل استهلاكك الشهري (burn rate) بالدينار التونسي ؟",
             help_ar="إجمالي النفقات الشهرية (رواتب، كراء، أدوات، إلخ)."),
    Question("runway_months", "Combien de mois de trésorerie (runway) vous reste-t-il ?",
             "runway_months", "int",
             applies=lambda p: _advanced_claim(p),
             triggered_by="declared_stage>=Fundraising",
             help_fr="Nombre de mois avant épuisement de la trésorerie au rythme actuel.",
             prompt_ar="كم شهراً من السيولة النقدية (runway) تبقى لديك ؟",
             help_ar="عدد الأشهر قبل نفاد السيولة بالوتيرة الحالية."),

    # --- Traction metrics (gate: Market Validation+) ------------------------ #
    Question("user_count", "Combien d'utilisateurs ou clients actifs avez-vous actuellement ?",
             "user_count", "int",
             applies=lambda p: p.market.customer_validation_evidence is True,
             triggered_by="validation_evidence=true",
             help_fr="Nombre d'utilisateurs actifs ou de clients payants.",
             prompt_ar="كم عدد المستخدمين أو العملاء النشطين لديك حالياً ؟",
             help_ar="عدد المستخدمين النشطين أو العملاء الذين يدفعون."),
    Question("growth_rate", "Quel est votre taux de croissance mensuel (%) ?",
             "growth_rate_pct", "float",
             applies=lambda p: p.market.customer_validation_evidence is True,
             triggered_by="validation_evidence=true",
             help_fr="Croissance en pourcentage du nombre d'utilisateurs ou du CA mois sur mois.",
             prompt_ar="ما هو معدل نموك الشهري (%) ؟",
             help_ar="نسبة النمو في عدد المستخدمين أو رقم المعاملات شهرياً."),

    # --- Competition deep-dive (all stages) --------------------------------- #
    Question("competitor_names", "Qui sont vos 3 principaux concurrents directs ?",
             "competitor_names", "tags",
             applies=lambda p: p.market.competitor_headcount is not None
                 and p.market.competitor_headcount > 0,
             triggered_by="competitors>0",
             help_fr="Noms ou descriptions. Séparez par des virgules.",
             prompt_ar="من هم منافسوك المباشرون الثلاثة الرئيسيون ؟",
             help_ar="الأسماء أو الوصف. افصل بينها بفواصل."),
    Question("differentiation", "Qu'est-ce qui différencie votre offre de celle de vos concurrents ?",
             "differentiation_narrative", "text",
             applies=lambda p: p.market.competitor_headcount is not None
                 and p.market.competitor_headcount > 0,
             triggered_by="competitors>0",
             help_fr="En une phrase : votre avantage concurrentiel principal.",
             prompt_ar="ما الذي يميّز عرضك عن منافسيك ؟",
             help_ar="في جملة واحدة: ميزتك التنافسية الرئيسية."),

    # --- Legal & Fiscal detail (gate: Structuration+) ----------------------- #
    Question("incorporation_date", "Date de création officielle de votre entreprise ?",
             "incorporation_date", "text",
             applies=lambda p: p.legal_form is not None
                 and p.legal_form.value not in ("None",),
             triggered_by="legal_form_registered",
             help_fr="Date d'immatriculation au registre des entreprises (AAAA-MM-JJ).",
             prompt_ar="تاريخ الإنشاء الرسمي لمؤسستك ؟",
             help_ar="تاريخ التسجيل في السجل الوطني للمؤسسات (YYYY-MM-DD)."),
    Question("fiscal_regime", "Quel est votre régime fiscal ?",
             "fiscal_regime", "text",
             applies=lambda p: p.legal_form is not None
                 and p.legal_form.value not in ("None",),
             triggered_by="legal_form_registered",
             prompt_ar="ما هو نظامك الجبائي ؟"),

    # --- Market deep-dive (gate: Market Validation+) ------------------------ #
    Question("cac", "Quel est votre coût d'acquisition client (CAC) en TND ?",
             "cac_tnd", "float",
             applies=lambda p: p.market.customer_validation_evidence is True,
             triggered_by="validation_evidence=true",
             help_fr="Coût marketing et commercial moyen pour acquérir un client.",
             prompt_ar="ما هي تكلفة اكتساب العميل (CAC) بالدينار التونسي ؟",
             help_ar="متوسط تكلفة التسويق والمبيعات لاكتساب عميل واحد."),
    Question("ltv", "Quelle est la valeur vie client (LTV) estimée en TND ?",
             "ltv_tnd", "float",
             applies=lambda p: p.market.customer_validation_evidence is True,
             triggered_by="validation_evidence=true",
             help_fr="Revenu total estimé par client sur la durée de la relation.",
             prompt_ar="ما هي القيمة التقديرية للعميل مدى الحياة (LTV) بالدينار التونسي ؟",
             help_ar="إجمالي الإيراد المقدّر لكل عميل طوال مدة العلاقة."),

    # --- Stage 3/4 gate evidence ------------------------------------------ #
    Question("legal_form", "Forme juridique enregistrée ?",
             "legal_form", "enum", [lf.value for lf in LegalForm],
             prompt_ar="الشكل القانوني المسجّل ؟"),
    Question("revenue_model", "Avez-vous un modèle de revenus documenté ?",
             "has_revenue_model", "bool",
             prompt_ar="هل لديك نموذج إيرادات موثّق ؟"),
    Question("unit_economics", "Combien de mois d'unit economics avez-vous ?",
             "months_unit_economics", "int",
             applies=lambda p: _advanced_claim(p),
             triggered_by="declared_stage>=Fundraising",
             prompt_ar="كم شهراً من اقتصاديات الوحدة لديك ؟"),
    Question("repeatable_sales", "Disposez-vous d'un processus de vente répétable ?",
             "repeatable_sales", "bool",
             applies=lambda p: p.self_assessment.declared_stage == MaturityStage.GROWTH,
             triggered_by="declared_stage=Growth",
             prompt_ar="هل لديك عملية بيع قابلة للتكرار ؟"),
]

QUESTION_INDEX = {q.id: q for q in QUESTIONS}

# Typed coercion per question type.
_ENUM_FIELDS = {
    "sector": Sector, "self_assessment.declared_stage": MaturityStage,
    "commercial.mvp_stage": MVPStage, "commercial.pricing_framework": PricingFramework,
    "innovation.geo_novelty": GeoNovelty, "innovation.ip_status": IPStatus,
    "green.footprint_category": FootprintCategory, "legal_form": LegalForm,
}


def _coerce(q: Question, value: Any) -> Any:
    if value is None:
        if q.qtype in ("tags", "sdg"):
            return []
        return None
    if q.qtype == "bool":
        if isinstance(value, str):
            return value.strip().lower() in ("true", "oui", "yes", "1")
        return bool(value)
    if q.qtype == "int":
        return int(value)
    if q.qtype == "float":
        return float(value)
    if q.qtype in ("tags",):
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return list(value) if isinstance(value, (list, tuple)) else [value]
    if q.qtype == "sdg":
        return [int(v) for v in (value if isinstance(value, (list, tuple)) else [value])]
    if q.qtype == "enum":
        enum_cls = _ENUM_FIELDS.get(q.field_path)
        if enum_cls is MaturityStage:
            return MaturityStage(int(value))
        if enum_cls is not None:
            return enum_cls(value)
    return value


def _set_path(profile: ProjectProfile, path: str, value: Any) -> None:
    parts = path.split(".")
    obj: Any = profile
    for p in parts[:-1]:
        obj = getattr(obj, p)
    setattr(obj, parts[-1], value)


def coerce_value(question_id: str, value: Any) -> Any:
    """Public, non-mutating typed coercion for a question's raw answer.

    Used by the document auto-fill layer to validate a proposed value before
    showing it to the user. Raises KeyError (unknown question) or ValueError /
    TypeError (value not coercible to the field type)."""
    q = QUESTION_INDEX.get(question_id)
    if q is None:
        raise KeyError(f"Unknown question '{question_id}'")
    return _coerce(q, value)


class IntakeStateMachine:
    """Serves the next applicable, unanswered question and applies typed answers."""

    def __init__(self, profile: ProjectProfile):
        self.profile = profile

    def next_question(self) -> Optional[Question]:
        for q in QUESTIONS:
            if q.id in self.profile.answered_questions:
                continue
            if q.applies(self.profile):
                return q
        return None

    def apply_answer(self, question_id: str, value: Any) -> ProjectProfile:
        q = QUESTION_INDEX.get(question_id)
        if q is None:
            raise KeyError(f"Unknown question '{question_id}'")
        _set_path(self.profile, q.field_path, _coerce(q, value))
        if question_id not in self.profile.answered_questions:
            self.profile.answered_questions.append(question_id)
        self.profile.touch()
        if self.next_question() is None:
            self.profile.intake_complete = True
        return self.profile

    def progress(self) -> dict:
        applicable = [q for q in QUESTIONS if q.applies(self.profile)]
        answered = [q for q in applicable if q.id in self.profile.answered_questions]
        return {"answered": len(answered), "total": len(applicable),
                "complete": self.profile.intake_complete}
