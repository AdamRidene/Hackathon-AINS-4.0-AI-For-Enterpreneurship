"""Perception–reality gap detector + deterministic anomaly engine.

A first-class output, not a side effect (core differentiator). Compares the
founder's declared self-assessment against the system's evidence-based
classification and surfaces the specific dimensions causing any divergence.

Severity model:
  * OVERESTIMATION  declared > classified  (the dangerous case — founder pursues
    a track they don't qualify for). Magnitude = declared - classified.
  * UNDERESTIMATION declared < classified  (structuring work already done is
    being undervalued).
  * ALIGNED         declared == classified.

When overestimation is severe (>= 2 stages) we recommend an active override:
the engine reallocates the venture to its correct objective stage and explains
which gates are unmet between the two.

Anomaly Detection Architecture (v2 — two-stage pipeline):
  Stage 1: Deterministic pre-filter — rules catch obvious, high-value
           contradictions. Each rule returns no_issue, clear_anomaly, or
           needs_semantic_validation.
  Stage 2: Semantic LLM validator — runs only on ambiguous cases (tech/sector
           fit, SDG plausibility) where rigid rules are too brittle.
  Fallback: Conservative deterministic heuristic when LLM unavailable.
           Results marked source=fallback, confidence=low.

Confidence contract on every anomaly:
  source      ∈ {deterministic, semantic_llm, fallback}
  confidence  ∈ {high, medium, low}
  validated   ∈ {true, false}  — true when a human or LLM has confirmed
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from ..schema import ProjectProfile, IPStatus, Sector
from ..llm import get_llm
from .classifier import DiagnosticResult, STAGE_NAMES, STAGE_NAMES_AR


DOMAIN_TO_GAP_CAT = {
    "market": "missing_market_validation",
    "commercial": "missing_commercial_offer",
    "innovation": "tech_hype",
    "scalability": "scalability",
    "green": "green",
}


@dataclass
class GapReport:
    has_gap: bool
    kind: str                     # aligned | overestimation | underestimation
    declared_stage: Optional[int]
    classified_stage: int
    magnitude: int
    severity: str                 # none | mild | severe
    override_applied: bool
    diverging_dimensions: list[dict] = field(default_factory=list)
    message_fr: str = ""
    message_ar: str = ""
    gap_categories: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "has_gap": self.has_gap,
            "kind": self.kind,
            "declared_stage": self.declared_stage,
            "declared_stage_name": STAGE_NAMES.get(self.declared_stage) if self.declared_stage else None,
            "classified_stage": self.classified_stage,
            "classified_stage_name": STAGE_NAMES[self.classified_stage],
            "magnitude": self.magnitude,
            "severity": self.severity,
            "override_applied": self.override_applied,
            "diverging_dimensions": self.diverging_dimensions,
            "message_fr": self.message_fr,
            "message_ar": self.message_ar,
            "gap_categories": self.gap_categories,
        }


def detect_gap(p: ProjectProfile, diag: DiagnosticResult) -> GapReport:
    declared = int(p.self_assessment.declared_stage) if p.self_assessment.declared_stage else None
    classified = diag.classified_stage

    if declared is None:
        return GapReport(
            has_gap=False, kind="aligned", declared_stage=None,
            classified_stage=classified, magnitude=0, severity="none",
            override_applied=False,
            message_fr="Aucune auto-évaluation déclarée; classification objective seule.",
            message_ar="لم يتم تحديد تقييم ذاتي، التشخيص الموضوعي فقط.",
        )

    magnitude = declared - classified

    if magnitude == 0:
        return GapReport(
            has_gap=False, kind="aligned", declared_stage=declared,
            classified_stage=classified, magnitude=0, severity="none",
            override_applied=False,
            message_fr=(f"Auto-évaluation alignée sur la réalité: "
                        f"{STAGE_NAMES[classified]}."),
            message_ar=(f"التقييم الذاتي متوافق مع الواقع: "
                        f"{STAGE_NAMES_AR[classified]}."),
        )

    # Dimensions causing the divergence = the unmet gates between the two stages.
    diverging = []
    if magnitude > 0:  # overestimation: gates between classified+1 .. declared
        for g in diag.gates:
            if classified < g.stage <= declared and not g.passed:
                diverging.append({"stage": g.stage, "name": g.name, "name_ar": STAGE_NAMES_AR[g.stage],
                                  "domain": g.domain, "missing": g.evidence, "missing_ar": g.evidence_ar})
        severity = "severe" if magnitude >= 2 else "mild"
        override = severity == "severe"
        msg = (
            f"Écart perception–réalité détecté. Vous vous déclarez au stade "
            f"'{STAGE_NAMES[declared]}' mais les preuves placent le projet à "
            f"'{STAGE_NAMES[classified]}'. "
            + ("Réallocation automatique appliquée au stade objectif. " if override else "")
            + "Portes manquantes: "
            + ", ".join(d["name"] for d in diverging) + "."
        )
        msg_ar = (
            f"تم كشف فجوة بين التقييم الذاتي والواقع. لقد صرحت بمرحلة "
            f"'{STAGE_NAMES_AR[declared]}' ولكن الأدلة تضع المشروع في مرحلة "
            f"'{STAGE_NAMES_AR[classified]}'. "
            + ("تم تطبيق إعادة التخصيص التلقائي للمرحلة الموضوعية. " if override else "")
            + "البوابات الناقصة: "
            + ", ".join(d["name_ar"] for d in diverging) + "."
        )
        gap_cats = list({DOMAIN_TO_GAP_CAT[d["domain"]] for d in diverging if d["domain"] in DOMAIN_TO_GAP_CAT})
        return GapReport(
            has_gap=True, kind="overestimation", declared_stage=declared,
            classified_stage=classified, magnitude=magnitude, severity=severity,
            override_applied=override, diverging_dimensions=diverging, message_fr=msg,
            message_ar=msg_ar, gap_categories=gap_cats,
        )

    # Underestimation
    for g in diag.gates:
        if declared < g.stage <= classified and g.passed:
            diverging.append({"stage": g.stage, "name": g.name, "name_ar": STAGE_NAMES_AR[g.stage],
                              "domain": g.domain, "achieved": g.evidence, "achieved_ar": g.evidence_ar})
    msg = (
        f"Sous-évaluation détectée. Vous vous déclarez à '{STAGE_NAMES[declared]}' "
        f"alors que les preuves justifient '{STAGE_NAMES[classified]}'. "
        "Travail de structuration déjà accompli: "
        + ", ".join(d["name"] for d in diverging) + "."
    )
    msg_ar = (
        f"تم كشف تقييم ذاتي أقل من الواقع. لقد صرحت بمرحلة '{STAGE_NAMES_AR[declared]}' "
        f"في حين أن الأدلة تؤكد مرحلة '{STAGE_NAMES_AR[classified]}'. "
        "العمل الهيكلي المنجز بالفعل: "
        + ", ".join(d["name_ar"] for d in diverging) + "."
    )
    gap_cats = list({DOMAIN_TO_GAP_CAT[d["domain"]] for d in diverging if d["domain"] in DOMAIN_TO_GAP_CAT})
    return GapReport(
        has_gap=True, kind="underestimation", declared_stage=declared,
        classified_stage=classified, magnitude=magnitude, severity="mild",
        override_applied=False, diverging_dimensions=diverging, message_fr=msg,
        message_ar=msg_ar, gap_categories=gap_cats,
    )


# --------------------------------------------------------------------------- #
# Inconsistency / anomaly detection — two-stage pipeline (v2)                  #
# --------------------------------------------------------------------------- #
# Distinct from the perception–reality gap (declared vs. classified stage): this
# pass flags *internally contradictory evidence* — pairs of tokens that should
# not coexist. Each anomaly is explainable: it names the conflicting signals so
# the founder sees exactly why the combination is implausible, not just a score.


class AnomalySource(str, Enum):
    DETERMINISTIC = "deterministic"
    SEMANTIC_LLM = "semantic_llm"
    FALLBACK = "fallback"


class AnomalyConfidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class Anomaly:
    """Single explainable contradiction with confidence contract."""
    code: str
    severity: str                # high | medium | low
    title_fr: str
    title_ar: str
    detail_fr: str
    detail_ar: str
    signals: list[str] = field(default_factory=list)
    source: AnomalySource = AnomalySource.DETERMINISTIC
    confidence: AnomalyConfidence = AnomalyConfidence.HIGH
    validated: bool = False
    # Which scoring dimensions are affected (for confidence annotation)
    affects_dimensions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity,
            "title_fr": self.title_fr,
            "title_ar": self.title_ar,
            "detail_fr": self.detail_fr,
            "detail_ar": self.detail_ar,
            "signals": self.signals,
            "source": self.source.value,
            "confidence": self.confidence.value,
            "validated": self.validated,
            "affects_dimensions": self.affects_dimensions,
        }


def _contrib_raw(score, criterion: str) -> Optional[float]:
    for c in score.contributions:
        if c.criterion == criterion:
            return c.raw
    return None


# --------------------------------------------------------------------------- #
# Stage 1 — Deterministic anomaly rules (A1–A8)                               #
# --------------------------------------------------------------------------- #

def _rule_a1_tam_without_validation(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Large addressable market asserted with no customer validation."""
    m = p.market
    if (m.estimated_tam_tnd and m.estimated_tam_tnd > 1_000_000
            and m.customer_validation_evidence is not True):
        return Anomaly(
            code="tam_without_validation",
            severity="high",
            title_fr="Marché large revendiqué sans validation client",
            title_ar="سوق مستهدفة واسعة دون تحقق من العملاء",
            detail_fr=(
                f"Un TAM de {m.estimated_tam_tnd:,.0f} TND est avancé alors qu'aucune "
                "preuve de validation client n'a été collectée. Une demande de cette "
                "ampleur devrait être étayée par des signaux terrain; en leur absence, "
                "le score Marché est plafonné à 30."),
            detail_ar=(
                f"تم التصريح بحجم سوق مستهدف (TAM) قدره {m.estimated_tam_tnd:,.0f} دينار تونسي دون وجود أي دليل على التحقق من العملاء. "
                "يجب أن يتم دعم مثل هذا الطلب الواسع بمؤشرات ميدانية، وفي غيابها يتم وضع سقف لنتيجة السوق عند 30."),
            signals=[
                f"TAM = {m.estimated_tam_tnd:,.0f} TND",
                "customer_validation_evidence = absent/faux",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["market"],
        )
    return None


def _rule_a2_cheap_but_labour_bound(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Cheap to operate yet cannot scale without proportional headcount."""
    s = p.scalability
    decouple = _contrib_raw(scores.scalability, "cost_decoupling")
    if (decouple is not None and decouple >= 60.0
            and s.human_dependency is not None and s.human_dependency > 7):
        return Anomaly(
            code="cheap_but_labour_bound",
            severity="medium",
            title_fr="Coûts récurrents faibles mais dépendance humaine élevée",
            title_ar="تكاليف تشغيلية منخفضة واعتماد بشري مرتفع",
            detail_fr=(
                "La structure de coûts est légère (faibles charges mensuelles), ce qui "
                "suggère un bon découplage, mais la dépendance humaine déclarée est "
                f"élevée (D_man = {s.human_dependency}/10). Une opération dont la "
                "croissance exige du personnel proportionnel ne passe pas à l'échelle "
                "malgré des coûts faibles — d'où la pénalité de 0,5 sur la Scalabilité."),
            detail_ar=(
                "هيكل التكاليف خفيف (تكاليف شهرية منخفضة)، مما يوحي بفك ارتباط جيد، لكن الاعتماد البشري المصرح به مرتفع "
                f"(D_man = {s.human_dependency}/10). العمليات التي يتطلب نموها موظفين بشكل طردي لا تتوسع بشكل جيد رغم التكاليف المنخفضة - مما يسبب خصم 50% على قابلية التوسع."),
            signals=[
                f"découplage coût = {decouple:.0f}/100 (élevé)",
                f"dépendance humaine = {s.human_dependency}/10 (élevée)",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["scalability"],
        )
    return None


def _rule_a3_advanced_stage_no_revenue(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Declares an advanced stage (Fundraising+) without a revenue model."""
    declared = int(p.self_assessment.declared_stage) if p.self_assessment.declared_stage else None
    if declared is not None and declared >= 4 and not p.has_revenue_model:
        return Anomaly(
            code="advanced_stage_no_revenue",
            severity="high",
            title_fr="Stade avancé déclaré sans modèle de revenus",
            title_ar="مرحلة متقدمة مصرح بها دون نموذج إيرادات",
            detail_fr=(
                f"Le projet se déclare au stade '{STAGE_NAMES[declared]}' mais aucun "
                "modèle de revenus n'a été défini. Lever des fonds ou se lancer sans "
                "modèle de monétisation est une incohérence structurelle majeure."),
            detail_ar=(
                f"تم التصريح بالمشروع في مرحلة '{STAGE_NAMES_AR[declared]}' ولكن لم يتم تحديد نموذج إيرادات موثق. "
                "السعي لجمع الأموال أو الإطلاق دون نموذج ربحية يعد تناقضاً هيكلياً رئيسياً."),
            signals=[
                f"stade déclaré = {STAGE_NAMES[declared]}",
                "modèle de revenus = absent",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["commercial"],
        )
    return None


def _rule_a4_market_claim_no_product(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Strong, validated market signal but the product is still a concept."""
    mvp = p.commercial.mvp_stage
    mvp_val = mvp.value if mvp is not None else None
    if scores.market.final_score >= 50.0 and mvp_val in (None, "Concept"):
        return Anomaly(
            code="market_claim_no_product",
            severity="medium",
            title_fr="Signal marché fort mais produit au stade concept",
            title_ar="مؤشرات سوق قوية ولكن المنتج في مرحلة الفكرة",
            detail_fr=(
                f"Le score Marché ({scores.market.final_score:.0f}/100) indique une "
                "demande crédible, mais le MVP est encore au stade concept (ou non "
                "renseigné). Une traction marché sans produit à montrer est à "
                "consolider avant toute mise à l'échelle."),
            detail_ar=(
                f"مؤشر السوق ({scores.market.final_score:.0f}/100) يدل على طلب موثوق، ولكن المنتج الأولي (MVP) لا يزال في مرحلة الفكرة "
                "(أو غير محدد). الجاذبية في السوق دون منتج ملموس يجب تعزيزها قبل أي توسع."),
            signals=[
                f"score Marché = {scores.market.final_score:.0f}/100",
                f"stade MVP = {mvp_val or 'non renseigné'}",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["commercial", "market"],
        )
    return None


# ── NEW RULES (Phase 1: Broaden Detection) ──────────────────────────────────

def _rule_a5_tech_sector_mismatch(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Tech stack doesn't align with declared sector — ambiguous, needs semantic check.

    Deterministic pre-filter: flag when sector is Digital-SaaS but tech stack
    shows no web/API/cloud markers. Returns needs_semantic_validation for the
    two-stage pipeline; falls back to a conservative deterministic heuristic
    when LLM is unavailable.
    """
    sector = p.sector
    tech_stack = p.innovation.tech_stack if p.innovation.tech_stack else []

    if sector != Sector.DIGITAL_SAAS:
        return None
    if not tech_stack:
        return None  # no tech data to check

    tech_text = " ".join(tech_stack).lower()
    digital_markers = ["api", "cloud", "saas", "web", "mobile", "database",
                       "backend", "frontend", "microservice", "aws", "azure",
                       "gcp", "docker", "kubernetes", "react", "angular", "vue",
                       "node", "python", "java", "typescript", "javascript"]

    has_digital_tech = any(m in tech_text for m in digital_markers)

    if has_digital_tech:
        return None  # tech looks plausible for digital-saas

    # Tech stack exists but has no recognisable digital markers — ambiguous.
    # Returns as deterministic with medium confidence; can be upgraded via
    # semantic LLM validation in stage 2.
    return Anomaly(
        code="tech_sector_mismatch",
        severity="medium",
        title_fr="Secteur Digital-SaaS sans pile technologique web/API",
        title_ar="قطاع رقمي بدون بنية تقنية ويب/API",
        detail_fr=(
            f"Vous opérez en Digital-SaaS mais la pile technologique déclarée "
            f"({', '.join(tech_stack[:5])}) ne contient aucun marqueur numérique "
            "reconnaissable (API, cloud, SaaS, web, base de données). "
            "Vérifiez la cohérence entre votre secteur et vos choix techniques."),
        detail_ar=(
            f"أنت تعمل في قطاع البرمجيات كخدمة (Digital-SaaS) لكن البنية التقنية المصرح بها "
            f"({', '.join(tech_stack[:5])}) لا تحتوي على أي مؤشرات رقمية معروفة "
            "(API، سحابة، SaaS، ويب، قاعدة بيانات). "
            "تحقق من الاتساق بين قطاعك وخياراتك التقنية."),
        signals=[
            f"Secteur: {sector.value}",
            f"Stack technique: {', '.join(tech_stack[:8])}",
        ],
        source=AnomalySource.DETERMINISTIC,
        confidence=AnomalyConfidence.MEDIUM,
        affects_dimensions=["innovation"],
    )


def _rule_a6_innovation_without_ip(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """High innovation score with no IP protection — directly addresses jury M4 concern.

    Jury feedback: 'Innovation can be maxed by confident self-reporting.
    Claim Global novelty + list five tech words + Registered IP → Innovation ≈ 100
    with zero evidence.'

    This rule flags when innovation score >= 70 but IP status is None.
    It also detects the pure-self-report pattern: high geo_novelty + tech_stack
    contributions with zero ip_status contribution.
    """
    innovation_score = scores.innovation
    if innovation_score.final_score < 60:
        return None

    ip_status = p.innovation.ip_status
    ip_raw = _contrib_raw(innovation_score, "ip_status") or 0

    # Check: is the innovation score mostly from self-report categoricals?
    geo_raw = _contrib_raw(innovation_score, "geo_novelty") or 0
    stack_raw = _contrib_raw(innovation_score, "tech_stack") or 0
    categorical_sum = geo_raw + stack_raw
    evidence_sum = ip_raw

    # Pattern 1: No IP declared at all
    if ip_status in (None, IPStatus.NONE):
        severity = "high" if innovation_score.final_score >= 70 else "medium"
        return Anomaly(
            code="innovation_no_ip",
            severity=severity,
            title_fr="Score Innovation élevé sans protection de propriété intellectuelle",
            title_ar="نتيجة ابتكار مرتفعة دون حماية ملكية فكرية",
            detail_fr=(
                f"Score Innovation ({innovation_score.final_score:.0f}/100) mais aucun "
                "brevet, copyright, ou marque n'a été déclaré. Une innovation réelle "
                "devrait envisager la protection IP. Le score actuel repose "
                "principalement sur des déclarations auto-rapportées (nouveauté "
                "géographique, pile technique) sans ancrage dans des preuves tangibles."),
            detail_ar=(
                f"نتيجة الابتكار ({innovation_score.final_score:.0f}/100) لكن لم يتم التصريح "
                "بأي براءة اختراع أو حق مؤلف أو علامة تجارية. الابتكار الحقيقي يجب أن "
                "يفكر في حماية الملكية الفكرية. تعتمد النتيجة الحالية بشكل أساسي على "
                "التصريحات الذاتية (الجدة الجغرافية، المجموعة التقنية) دون أدلة ملموسة."),
            signals=[
                f"Innovation score = {innovation_score.final_score:.0f}/100",
                f"IP status = {ip_status.value if ip_status else 'aucun'}",
                f"Geo novelty contribution = {geo_raw:.0f}",
                f"Tech stack contribution = {stack_raw:.0f}",
                f"IP evidence contribution = {evidence_sum:.0f}",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["innovation"],
        )

    # Pattern 2: IP declared but score is dominated by self-report (80%+ from categoricals)
    total = categorical_sum + evidence_sum
    if total > 0 and evidence_sum / total < 0.2 and innovation_score.final_score >= 70:
        return Anomaly(
            code="innovation_pure_self_report",
            severity="medium",
            title_fr="Score Innovation fondé principalement sur déclarations (peu de preuves)",
            title_ar="نتيجة الابتكار تعتمد أساساً على التصريحات (أدلة محدودة)",
            detail_fr=(
                f"Score Innovation ({innovation_score.final_score:.0f}/100) provient à "
                f"{categorical_sum/total*100:.0f}% de catégories auto-déclarées "
                "(nouveauté géographique, pile technique). La contribution des preuves "
                f"tangibles (PI) n'est que de {evidence_sum/total*100:.0f}%. "
                "Renforcez votre dossier avec des brevets, prototypes ou publications."),
            detail_ar=(
                f"نتيجة الابتكار ({innovation_score.final_score:.0f}/100) تأتي بنسبة "
                f"{categorical_sum/total*100:.0f}% من فئات ذاتية التصريح "
                "(الجدة الجغرافية، المجموعة التقنية). مساهمة الأدلة الملموسة "
                f"(الملكية الفكرية) لا تتجاوز {evidence_sum/total*100:.0f}%. "
                "عزز ملفك ببراءات اختراع أو نماذج أولية أو منشورات."),
            signals=[
                f"Innovation score = {innovation_score.final_score:.0f}/100",
                f"Self-report share = {categorical_sum/total*100:.0f}%",
                f"Evidence share = {evidence_sum/total*100:.0f}%",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["innovation"],
        )

    return None


def _rule_a7_green_without_footprint(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """High Green score in footprint-relevant sectors without actual footprint data.

    For agri-food and greentech sectors, Green claims should be grounded in
    measured footprint data. High SDG claims alone can inflate the score.
    """
    green_score = scores.green
    if green_score.final_score < 50:
        return None

    sector = p.sector
    if sector not in (Sector.AGRI_FOOD, Sector.GREENTECH):
        return None

    # For these sectors, footprint data is the evidence anchor
    has_footprint = p.green.footprint_category is not None
    has_circularity = p.green.circular_recycling is not None
    sdg_count = len(p.green.sdg_targets) if p.green.sdg_targets else 0

    fp_raw = _contrib_raw(green_score, "footprint") or 0
    sdg_raw = _contrib_raw(green_score, "sdg") or 0

    if not has_footprint and sdg_count >= 2:
        # SDG claims without sector-appropriate footprint data
        return Anomaly(
            code="green_without_footprint",
            severity="medium" if green_score.final_score < 70 else "high",
            title_fr="Score Green élevé sans données d'empreinte environnementale",
            title_ar="نتيجة بيئية مرتفعة دون بيانات البصمة البيئية",
            detail_fr=(
                f"Secteur {sector.value}: le score Green ({green_score.final_score:.0f}/100) "
                f"repose sur {sdg_count} cibles ODD mais aucune catégorie d'empreinte "
                "n'a été renseignée. Pour ce secteur, les allégations environnementales "
                "devraient être ancrées dans des données mesurées (empreinte carbone, "
                "déchets, circularité)."),
            detail_ar=(
                f"قطاع {sector.value}: النتيجة البيئية ({green_score.final_score:.0f}/100) "
                f"تستند إلى {sdg_count} هدفاً من أهداف التنمية المستدامة ولكن لم يتم "
                "تحديد أي فئة للبصمة البيئية. في هذا القطاع، يجب أن ترتكز الادعاءات "
                "البيئية على بيانات مقاسة (البصمة الكربونية، النفايات، التدوير)."),
            signals=[
                f"Secteur: {sector.value}",
                f"Green score = {green_score.final_score:.0f}/100",
                f"SDG targets = {sdg_count}",
                f"Footprint data = {'absente' if not has_footprint else 'présente'}",
                f"Footprint contribution = {fp_raw:.0f}",
                f"SDG contribution = {sdg_raw:.0f}",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["green"],
        )
    return None


def _rule_a8_revenue_commercial_mismatch(p: ProjectProfile, scores) -> Optional[Anomaly]:
    """Revenue model declared but Commercial score is low — structural misalignment.

    Having a documented revenue model should correlate with a decent Commercial
    score. A large gap suggests the revenue model is not credible or the
    commercial offer is poorly defined despite claiming monetisation.
    """
    if not p.has_revenue_model:
        return None

    commercial_score = scores.commercial
    if commercial_score.final_score >= 40:
        return None

    # Revenue model present but commercial fundamentals are weak
    return Anomaly(
        code="revenue_commercial_mismatch",
        severity="medium",
        title_fr="Modèle de revenus défini mais offre commerciale faible",
        title_ar="نموذج إيرادات محدد ولكن العرض التجاري ضعيف",
        detail_fr=(
            f"Un modèle de revenus est documenté, mais le score Offre Commerciale "
            f"({commercial_score.final_score:.0f}/100) reste faible. "
            "Ce décalage suggère que le modèle de monétisation n'est pas encore "
            "crédible ou que l'offre commerciale sous-jacente (MVP, pricing, "
            "proposition de valeur) nécessite un renforcement."),
        detail_ar=(
            f"تم توثيق نموذج الإيرادات، لكن نتيجة العرض التجاري "
            f"({commercial_score.final_score:.0f}/100) لا تزال ضعيفة. "
            "يشير هذا التباين إلى أن نموذج تحقيق الدخل ليس موثوقاً بعد أو أن "
            "العرض التجاري الأساسي (MVP، التسعير، عرض القيمة) يحتاج إلى تعزيز."),
        signals=[
            f"Revenue model: présent",
            f"Commercial score = {commercial_score.final_score:.0f}/100",
            f"MVP stage = {p.commercial.mvp_stage.value if p.commercial.mvp_stage else 'non renseigné'}",
        ],
        source=AnomalySource.DETERMINISTIC,
        confidence=AnomalyConfidence.MEDIUM,
        affects_dimensions=["commercial"],
    )


# ── Cross-rule compound detection ───────────────────────────────────────────

def _detect_compound_anomalies(anomalies: list[Anomaly], p: ProjectProfile,
                               scores) -> list[Anomaly]:
    """Detect compound risks when multiple independent anomalies co-exist.

    Compound rules check combinations that individually are medium/low but
    together signal a systemic credibility problem.
    """
    compounds: list[Anomaly] = []
    codes = {a.code for a in anomalies}

    # C1: TAM without validation (A1) + no IP (A6) = systemic evidence vacuum
    if "tam_without_validation" in codes and "innovation_no_ip" in codes:
        compounds.append(Anomaly(
            code="compound_evidence_vacuum",
            severity="high",
            title_fr="Double déficit de preuves: Marché + Innovation non étayés",
            title_ar="عجز مزدوج في الأدلة: السوق والابتكار غير مدعومين",
            detail_fr=(
                "Le projet revendique simultanément un large marché ET une forte "
                "innovation, sans preuve tangible dans les deux dimensions. "
                "Ce cumul de déclarations non étayées constitue un risque "
                "systémique pour la crédibilité du dossier."),
            detail_ar=(
                "يدعي المشروع في نفس الوقت سوقاً واسعة وابتكاراً قوياً، دون أدلة "
                "ملموسة في كلا البعدين. يشكل تراكم التصريحات غير المدعومة خطراً "
                "نظامياً على مصداقية الملف."),
            signals=[
                "A1: TAM sans validation client",
                "A6: Innovation sans protection IP",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["market", "innovation"],
        ))

    # C2: No revenue model (A3) + revenue/commercial mismatch (A8) = monetisation blind spot
    if "advanced_stage_no_revenue" in codes and "revenue_commercial_mismatch" in codes:
        compounds.append(Anomaly(
            code="compound_monetisation_blind_spot",
            severity="high",
            title_fr="Angle mort de monétisation: stade avancé + offre commerciale fragile",
            title_ar="نقطة عمياء في تحقيق الدخل: مرحلة متقدمة + عرض تجاري هش",
            detail_fr=(
                "Vous déclarez un stade avancé sans modèle de revenus ET votre "
                "offre commerciale est structurellement faible. Cette double "
                "fragilité rend le projet non finançable en l'état."),
            detail_ar=(
                "أنت في مرحلة متقدمة بدون نموذج إيرادات وعرضك التجاري ضعيف هيكلياً. "
                "هذه الهشاشة المزدوجة تجعل المشروع غير قابل للتمويل في وضعه الحالي."),
            signals=[
                "A3: Stade avancé sans modèle de revenus",
                "A8: Modèle de revenus défini mais offre commerciale faible",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["commercial"],
        ))

    # C3: Market claim no product (A4) + TAM no validation (A1) = narrative inflation
    if "market_claim_no_product" in codes and "tam_without_validation" in codes:
        compounds.append(Anomaly(
            code="compound_narrative_inflation",
            severity="high",
            title_fr="Inflation narrative: traction marché revendiquée sans produit ni preuve",
            title_ar="تضخيم سردي: جاذبية سوقية مدعاة بدون منتج أو دليل",
            detail_fr=(
                "Le projet affiche un signal marché fort ET un large TAM, mais "
                "sans produit concret (MVP concept) ni validation client. "
                "Cet écart entre le discours et les faits est un drapeau rouge "
                "pour tout évaluateur."),
            detail_ar=(
                "يظهر المشروع إشارة سوق قوية وسوق مستهدف كبير، ولكن بدون منتج "
                "ملموس (MVP فكرة) أو تحقق من العملاء. هذه الفجوة بين الخطاب "
                "والحقائق هي علامة تحذير لأي مقيم."),
            signals=[
                "A1: TAM sans validation client",
                "A4: Signal marché fort sans produit",
            ],
            source=AnomalySource.DETERMINISTIC,
            confidence=AnomalyConfidence.HIGH,
            affects_dimensions=["market", "commercial"],
        ))

    return compounds


# ── Stage 2: Semantic LLM validation (stub — runs only on ambiguous cases) ──

async def _validate_ambiguous_semantic(
    anomaly: Anomaly,
    p: ProjectProfile,
    scores,
) -> Anomaly:
    """Run semantic LLM validation for an ambiguous anomaly.

    Currently validates:
    - tech_sector_mismatch: Is the tech stack appropriate for Digital-SaaS?
    - Other ambiguous anomalies in the future
    """
    llm = get_llm()
    
    # Validate tech_sector_mismatch
    if anomaly.code == "tech_sector_mismatch":
        tech_stack = p.innovation.tech_stack if p.innovation.tech_stack else []
        sector = p.sector
        
        prompt = (
            "You are an anomaly validator for a Tunisian startup diagnostic system.\n"
            f"Sector declared: {sector.value}\n"
            f"Tech stack declared: {', '.join(tech_stack)}\n\n"
            "Task: Is this tech stack appropriate for a Digital-SaaS startup?\n"
            "Return ONLY a JSON object with:\n"
            "- \"is_anomaly\": boolean (true if mismatch, false if appropriate)\n"
            "- \"confidence\": \"high\" | \"medium\" | \"low\"\n"
            "- \"detail_fr\": short French explanation if anomaly\n"
            "- \"detail_ar\": short Arabic explanation if anomaly\n"
        )
        
        try:
            raw = await llm._complete_with_retry(prompt, max_tokens=300)
            # Parse the JSON
            from ..llm.provider import parse_llm_json
            result = parse_llm_json(raw, {})
            
            if result.get("is_anomaly"):
                # Keep the anomaly, update confidence and details
                anomaly.confidence = result.get("confidence", "medium")
                anomaly.source = AnomalySource.SEMANTIC_LLM
                if result.get("detail_fr"):
                    anomaly.detail_fr = result["detail_fr"]
                if result.get("detail_ar"):
                    anomaly.detail_ar = result["detail_ar"]
                anomaly.validated = True
            else:
                # No anomaly - return None (we'll handle this in validate_anomalies_semantic)
                return None
        except Exception:
            # LLM failed - keep the original deterministic anomaly with fallback source
            anomaly.source = AnomalySource.FALLBACK
            anomaly.confidence = AnomalyConfidence.LOW
    
    # TODO: Add validation for other ambiguous anomalies in the future (SDG plausibility, etc.)
    
    return anomaly


# ── Public API ──────────────────────────────────────────────────────────────

def detect_anomalies(p: ProjectProfile, diag: DiagnosticResult, scores) -> list[dict]:
    """Return a list of contradictory-signal flags. `scores` is a
    CompositeScores. Empty list means no internal inconsistencies found.

    Two-stage pipeline:
      1. All 8 deterministic rules + compound detection run.
      2. Ambiguous results are flagged for semantic validation (stub).
         The anomaly dict includes source/confidence/validated fields so
         downstream consumers know whether to trust, display, or suggest.
    """
    # Stage 1 — deterministic pre-filter (all 8 rules)
    rules = [
        _rule_a1_tam_without_validation,
        _rule_a2_cheap_but_labour_bound,
        _rule_a3_advanced_stage_no_revenue,
        _rule_a4_market_claim_no_product,
        _rule_a5_tech_sector_mismatch,
        _rule_a6_innovation_without_ip,
        _rule_a7_green_without_footprint,
        _rule_a8_revenue_commercial_mismatch,
    ]

    anomalies: list[Anomaly] = []
    for rule in rules:
        result = rule(p, scores)
        if result is not None:
            anomalies.append(result)

    # Cross-rule compound detection (runs on already-detected anomalies)
    compounds = _detect_compound_anomalies(anomalies, p, scores)
    anomalies.extend(compounds)

    # Stage 2 — semantic validation is async and optional; called separately
    # via validate_anomalies_semantic() by the orchestrator for ambiguous cases.

    return [a.to_dict() for a in anomalies]


async def validate_anomalies_semantic(
    anomaly_dicts: list[dict],
    p: ProjectProfile,
    scores,
) -> list[dict]:
    """Stage 2: run semantic LLM validation on ambiguous anomaly results.

    Only validates anomalies with confidence=MEDIUM or source=fallback.
    High-confidence deterministic results pass through unchanged.
    When LLM is unavailable, keeps the conservative deterministic result.

    Called by the orchestrator after detect_anomalies() for the optional
    second pass. This is a separate async step so the deterministic core
    always completes even if the LLM is slow or unavailable.
    """
    validated: list[dict] = []
    for ad in anomaly_dicts:
        confidence = ad.get("confidence", "high")
        code = ad.get("code", "")

        # Only validate ambiguous/medium-confidence results
        if confidence == "high" and ad.get("source") == "deterministic":
            validated.append(ad)
            continue

        # Reconstruct Anomaly from dict for the validator
        anomaly = Anomaly(
            code=ad["code"],
            severity=ad["severity"],
            title_fr=ad["title_fr"],
            title_ar=ad["title_ar"],
            detail_fr=ad["detail_fr"],
            detail_ar=ad["detail_ar"],
            signals=ad.get("signals", []),
            source=AnomalySource(ad.get("source", "deterministic")),
            confidence=AnomalyConfidence(confidence),
            validated=ad.get("validated", False),
            affects_dimensions=ad.get("affects_dimensions", []),
        )

        try:
            result = await _validate_ambiguous_semantic(anomaly, p, scores)
            if result is not None:  # Only add if it's still an anomaly
                validated.append(result.to_dict())
        except Exception:
            # LLM unavailable — keep conservative deterministic result
            anomaly.source = AnomalySource.FALLBACK
            anomaly.confidence = AnomalyConfidence.LOW
            validated.append(anomaly.to_dict())

    return validated


def get_anomaly_dimension_notes(anomaly_dicts: list[dict]) -> dict[str, list[str]]:
    """Extract per-dimension confidence notes from anomaly results.

    Returns a dict mapping dimension name -> list of note strings.
    Used by the scoring module to add anomaly-derived confidence annotations
    without mutating scores directly (Section 10 recommendation).

    Example:
        {"innovation": ["IP status unclear — innovation score confidence reduced"],
         "market": ["TAM without validation — market score capped at 30"]}
    """
    notes: dict[str, list[str]] = {}
    for ad in anomaly_dicts:
        for dim in ad.get("affects_dimensions", []):
            if dim not in notes:
                notes[dim] = []
            severity = ad.get("severity", "medium")
            prefix = "[ANOMALIE-CRITIQUE] " if severity == "high" else "[ANOMALIE] "
            notes[dim].append(
                f"{prefix}{ad['title_fr']}: {ad['detail_fr'][:120]}"
            )
    return notes
