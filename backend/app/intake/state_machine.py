"""State-driven adaptive intake graph (Phase 1).

A deterministic state machine, NOT a static form. The next question is a pure
function of the current ProjectProfile, so branching is fully auditable:

  * Sector-aware: selecting 'agri-food' loads sector compliance/footprint probes
    and bypasses digital-platform paths entirely.
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
             "commercial.value_proposition_narrative", "text",
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

    # --- Sector-specific branch: digital (bypasses agri footprint) --------- #
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

    # --- Stage 3/4 gate evidence ------------------------------------------ #
    Question("legal_form", "Forme juridique enregistrée ?",
             "legal_form", "enum", [lf.value for lf in LegalForm],
             prompt_ar="الشكل القانوني المسجّل ؟"),
 