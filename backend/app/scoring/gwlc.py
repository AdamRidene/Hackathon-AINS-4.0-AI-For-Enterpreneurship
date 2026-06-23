"""Explainable Gated Weighted Linear Combination (GWLC) scoring engine.

Implements the five composite scores of the Firasa concept (Section 6),
Eqs. (1)-(11), each anchored to a recognised framework:

  S_M  Market        -> Lean Startup validated learning (Ries)      Eq. 1-2
  S_C  Commercial    -> Value Proposition Canvas (Strategyzer)       Eq. 3-4
  S_I  Innovation    -> OECD Oslo Manual 2018                        Eq. 5-7
  S_S  Scalability   -> VC marginal-cost decoupling                  Eq. 8-9
  S_G  Green         -> UN SDG / World Bank ESG                      Eq. 10-11

A *gate* is a non-linear override applied AFTER the linear base score, enforcing
that a weak score on a fundamental dimension cannot be masked by strong scores
elsewhere. Every score returns a full contribution trace so the UI can answer
"why was this score given?" per criterion (Explainability requirement).

The engine never raises on missing data: absent inputs are treated as the
neutral/zero contribution and recorded in `missing_inputs`, so the pipeline is
robust to incomplete profiles (NFR: Reliability).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from ..schema import ProjectProfile
from . import weights as W


# --------------------------------------------------------------------------- #
# Result containers (carry the explainability trace)                          #
# --------------------------------------------------------------------------- #
@dataclass
class Contribution:
    criterion: str
    weight: float
    raw: float            # criterion value on a 0-100 scale before weighting
    weighted: float       # weight * raw
    detail: str           # human-readable explanation of how raw was derived


@dataclass
class ScoreResult:
    dimension: str
    base_score: float
    final_score: float
    gate_triggered: bool
    gate_reason_fr: Optional[str] = None
    gate_reason_ar: Optional[str] = None
    contributions: list[Contribution] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)
    anchor_fr: str = ""
    anchor_ar: str = ""
    # Anomaly-derived confidence notes (Section 10: don't mutate scores,
    # attach confidence annotations for downstream decision support).
    anomaly_notes: list[str] = field(default_factory=list)
    improvement_guidance_fr: Optional[str] = None
    improvement_guidance_ar: Optional[str] = None

    def to_dict(self) -> dict:
        what_if = None
        if self.contributions:
            best = max(self.contributions, key=lambda c: c.weight * (100.0 - c.raw))
            gain = round(best.weight * (100.0 - best.raw), 1)
            if gain >= 5:
                what_if = {"criterion": best.criterion, "potential_gain": gain}
        return {
            "dimension": self.dimension,
            "base_score": round(self.base_score, 1),
            "final_score": round(self.final_score, 1),
            "gate_triggered": self.gate_triggered,
            "gate_reason_fr": self.gate_reason_fr,
            "gate_reason_ar": self.gate_reason_ar,
            "anchor_fr": self.anchor_fr,
            "anchor_ar": self.anchor_ar,
            "missing_inputs": self.missing_inputs,
            "anomaly_notes": self.anomaly_notes,
            "what_if_hint": what_if,
            "improvement_guidance_fr": self.improvement_guidance_fr,
            "improvement_guidance_ar": self.improvement_guidance_ar,
            "contributions": [
                {
                    "criterion": c.criterion,
                    "weight": c.weight,
                    "raw": round(c.raw, 1),
                    "weighted": round(c.weighted, 1),
                    "detail": c.detail,
                }
                for c in self.contributions
            ],
        }


@dataclass
class CompositeScores:
    market: ScoreResult
    commercial: ScoreResult
    innovation: ScoreResult
    scalability: ScoreResult
    green: ScoreResult

    def vector(self) -> tuple[float, float, float, float, float]:
        return (
            self.market.final_score,
            self.commercial.final_score,
            self.innovation.final_score,
            self.scalability.final_score,
            self.green.final_score,
        )

    def to_dict(self) -> dict:
        return {
            "market": self.market.to_dict(),
            "commercial": self.commercial.to_dict(),
            "innovation": self.innovation.to_dict(),
            "scalability": self.scalability.to_dict(),
            "green": self.green.to_dict(),
            "vector": [round(v, 1) for v in self.vector()],
        }


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


# --------------------------------------------------------------------------- #
# 6.1 Market Score S_M  — Lean Startup validation                             #
# --------------------------------------------------------------------------- #
def score_market(p: ProjectProfile) -> ScoreResult:
    w = W.WEIGHTS["market"]
    missing: list[str] = []
    m = p.market

    # TAM term: w1 * min(ln T / ln 1e7, 1) * 100
    if m.estimated_tam_tnd and m.estimated_tam_tnd > 0:
        tam_norm = min(math.log(m.estimated_tam_tnd) / math.log(W.TAM_BASELINE), 1.0)
        tam_raw = _clamp(tam_norm * 100)
        tam_detail = (
            f"TAM {m.estimated_tam_tnd:,.0f} TND -> log-normalised "
            f"ln(T)/ln(1e7) = {tam_norm:.3f}"
        )
    else:
        tam_raw = 0.0
        missing.append("estimated_tam_tnd")
        tam_detail = "No TAM provided -> 0"

    # Competition term: w2 * max(0, 100 - 5C)
    if m.competitor_headcount is not None:
        comp_raw = max(0.0, 100.0 - 5.0 * m.competitor_headcount)
        comp_detail = f"{m.competitor_headcount} competitors -> max(0,100-5C) = {comp_raw:.0f}"
    else:
        comp_raw = 0.0
        missing.append("competitor_headcount")
        comp_detail = "No competitor count -> 0"

    # Revenue-model viability term (3rd sub-dimension): a declared, structured
    # revenue model is a binary signal of how the market is monetised. Without
    # it a large TAM is theoretical demand the venture has no means to capture.
    if p.has_revenue_model is None:
        rev_raw = 0.0
        missing.append("has_revenue_model")
        rev_detail = "No revenue-model declaration -> 0"
    elif p.has_revenue_model:
        rev_raw = 100.0
        rev_detail = "Revenue model declared -> 100 (market is monetisable)"
    else:
        rev_raw = 0.0
        rev_detail = "No revenue model -> 0 (TAM is un-capturable demand)"

    contribs = [
        Contribution("tam", w["tam"], tam_raw, w["tam"] * tam_raw, tam_detail),
        Contribution("competition", w["competition"], comp_raw,
                     w["competition"] * comp_raw, comp_detail),
        Contribution("revenue_viability", w["revenue_viability"], rev_raw,
                     w["revenue_viability"] * rev_raw, rev_detail),
    ]
    base = sum(c.weighted for c in contribs)

    # Gate (Eq. 2): hard cap at 30 if validation token absent.
    ve = m.customer_validation_evidence
    if ve is None:
        missing.append("customer_validation_evidence")
    gate_triggered = ve is not True  # absent or False both trigger the cap
    if gate_triggered:
        final = min(base, W.GATES["market_validation_cap"])
        reason_fr = (
            "Preuve de validation client absente (V_e != 1) : Score Marché "
            f"plafonné à {W.GATES['market_validation_cap']:.0f} indépendamment du TAM "
            "(Lean Startup : pas d'apprentissage validé, pas de signal marché)."
        )
        reason_ar = (
            "دليل التحقق من العملاء غير موجود (V_e != 1): يتم تقييد "
            f"السوق إلى {W.GATES['market_validation_cap']:.0f} بغض النظر عن حجم السوق "
            "(Lean Startup: بدون تعلم موثق، لا توجد إشارة سوق)."
        )
    else:
        final = base
        reason_fr = None
        reason_ar = None

    # Improvement guidance
    guidance_fr_lines = []
    guidance_ar_lines = []
    if "customer_validation_evidence" in missing or gate_triggered:
        guidance_fr_lines.append("Priorité la plus haute : Collectez des preuves de validation client (témoignages, interviews, paiements initiaux) — cela débloquera votre score marché.")
        guidance_ar_lines.append("الأعلى الأولوية: اجمع أدلة التحقق من العملاء (شهادات، مقابلات، مدفوعات أولية) — هذا سيفتح نقاط سوقك.")
    if "estimated_tam_tnd" in missing:
        guidance_fr_lines.append("Estimez votre marché adressable total (TAM) en dinars tunisiens — cela renforcera la crédibilité de votre potentiel de croissance.")
        guidance_ar_lines.append("قدّر حجم السوق المستهدف الكلّي (TAM) بالدينار التونسي — هذا يعزز مصداقية إمكانيات نموك.")
    if "competitor_headcount" in missing:
        guidance_fr_lines.append("Indiquez le nombre approximatif d'employés de vos principaux concurrents — cela aide à calibrer la saturation du marché.")
        guidance_ar_lines.append("أذكر عدد موظفي منافسيك الرئيسيين تقريبًا — هذا يساعد في تقييم تشبع السوق.")
    if "has_revenue_model" in missing:
        guidance_fr_lines.append("Déclarez clairement votre modèle de revenus — cela est essentiel pour montrer comment vous monétisez votre marché.")
        guidance_ar_lines.append("أعلن بوضوح عن نموذج إيراداتك — هذا ضروري لإظهار كيف تقوم بإيراد سوقك.")
    guidance_fr = "\n".join(guidance_fr_lines) if guidance_fr_lines else None
    guidance_ar = "\n".join(guidance_ar_lines) if guidance_ar_lines else None

    return ScoreResult(
        dimension="Market", base_score=base, final_score=final,
        gate_triggered=gate_triggered, gate_reason_fr=reason_fr, gate_reason_ar=reason_ar,
        contributions=contribs, missing_inputs=missing,
        anchor_fr="Apprentissage validé Lean Startup (Ries, 2011)",
        anchor_ar="التعلم الموثق Lean Startup (Ries, 2011)",
        improvement_guidance_fr=guidance_fr,
        improvement_guidance_ar=guidance_ar,
    )


# --------------------------------------------------------------------------- #
# 6.2 Commercial Offer Score S_C — Value Proposition Canvas                    #
# --------------------------------------------------------------------------- #
def score_commercial(p: ProjectProfile, pcoh: Optional[float] = None) -> ScoreResult:
    """`pcoh` is the LLM-as-a-Judge value-proposition quality index [0,100].
    If None it is treated as a missing input (neutral 0 contribution)."""
    w = W.WEIGHTS["commercial"]
    missing: list[str] = []
    c = p.commercial

    if pcoh is None:
        pcoh_raw = 0.0
        missing.append("value_proposition_narrative")
        pcoh_detail = "No value-proposition narrative judged -> 0"
    else:
        pcoh_raw = _clamp(pcoh)
        pcoh_detail = f"LLM-as-a-Judge VP coherence P_coh = {pcoh_raw:.0f}/100"

    if c.mvp_stage is not None:
        rmvp = W.MVP_MAP[c.mvp_stage.value]
        mvp_raw = rmvp * 100
        mvp_detail = f"MVP stage '{c.mvp_stage.value}' -> R_mvp {rmvp:.2f} x100"
    else:
        mvp_raw = 0.0
        missing.append("mvp_stage")
        mvp_detail = "No MVP stage -> 0"

    if c.pricing_coherence is not None:
        price_raw = _clamp(c.pricing_coherence)
        price_detail = f"Pricing coherence A_price = {price_raw:.0f}/100"
    elif c.pricing_framework is not None:
        # Proxy when no explicit coherence score: a declared framework -> 60.
        price_raw = 60.0
        price_detail = f"Pricing framework '{c.pricing_framework.value}' declared -> proxy 60"
    else:
        price_raw = 0.0
        missing.append("pricing_framework")
        price_detail = "No pricing framework -> 0"

    contribs = [
        Contribution("vp_coherence", w["vp_coherence"], pcoh_raw,
                     w["vp_coherence"] * pcoh_raw, pcoh_detail),
        Contribution("mvp_readiness", w["mvp_readiness"], mvp_raw,
                     w["mvp_readiness"] * mvp_raw, mvp_detail),
        Contribution("pricing", w["pricing"], price_raw,
                     w["pricing"] * price_raw, price_detail),
    ]
    base = sum(c_.weighted for c_ in contribs)
    
    # Improvement guidance
    guidance_fr_lines = []
    guidance_ar_lines = []
    if "value_proposition_narrative" in missing:
        guidance_fr_lines.append("Rédigez une proposition de valeur claire qui explique comment vous résolvez un problème pour vos clients.")
        guidance_ar_lines.append("اكتب عرض قيمة واضح يشرح كيف تحل مشكلة لعملائك.")
    if "mvp_stage" in missing:
        guidance_fr_lines.append("Définissez clairement votre stade MVP pour montrer la préparation de votre offre.")
        guidance_ar_lines.append("حدّد بوضوح مرحلة MVP لإظهار استعداد عرضك.")
    if "pricing_framework" in missing:
        guidance_fr_lines.append("Documentez votre stratégie de tarification — cela renforce la cohérence de votre offre commerciale.")
        guidance_ar_lines.append("وثّق استراتيجية التسعير — هذا يحسن تناسق عرضك التجاري.")
    guidance_fr = "\n".join(guidance_fr_lines) if guidance_fr_lines else None
    guidance_ar = "\n".join(guidance_ar_lines) if guidance_ar_lines else None
    
    # No gate: commercial-offer signals are continuous, not binary.
    return ScoreResult(
        dimension="Commercial Offer", base_score=base, final_score=base,
        gate_triggered=False, gate_reason_fr=None, gate_reason_ar=None,
        contributions=contribs, missing_inputs=missing,
        anchor_fr="Value Proposition Canvas (Strategyzer)",
        anchor_ar="لوحة عرض القيمة (Strategyzer)",
        improvement_guidance_fr=guidance_fr,
        improvement_guidance_ar=guidance_ar,
    )


# --------------------------------------------------------------------------- #
# 6.3 Innovation Score S_I — OECD Oslo Manual                                  #
# --------------------------------------------------------------------------- #
def score_innovation(p: ProjectProfile) -> ScoreResult:
    w = W.WEIGHTS["innovation"]
    missing: list[str] = []
    i = p.innovation

    if i.geo_novelty is not None:
        geo_raw = float(W.GEO_MAP[i.geo_novelty.value])
        geo_detail = f"Geo novelty '{i.geo_novelty.value}' -> {geo_raw:.0f}"
    else:
        geo_raw = 0.0
        missing.append("geo_novelty")
        geo_detail = "No geo-novelty tier -> 0"

    n_stack = len(i.tech_stack) if i.tech_stack is not None else 0
    if n_stack > 0:
        stack_raw = min(n_stack / 5.0 * 100, 100)
        stack_detail = f"{n_stack} tech-stack layers -> min(|T|/5 x100,100) = {stack_raw:.0f}"
    else:
        stack_raw = 0.0
        missing.append("tech_stack")
        stack_detail = "No tech-stack layers -> 0"

    if i.ip_status is not None:
        ip_raw = float(W.IP_MAP[i.ip_status.value])
        ip_detail = f"IP status '{i.ip_status.value}' -> {ip_raw:.0f}"
    else:
        ip_raw = 0.0
        missing.append("ip_status")
        ip_detail = "No IP status -> 0"

    contribs = [
        Contribution("geo_novelty", w["geo_novelty"], geo_raw,
                     w["geo_novelty"] * geo_raw, geo_detail),
        Contribution("tech_stack", w["tech_stack"], stack_raw,
                     w["tech_stack"] * stack_raw, stack_detail),
        Contribution("ip_status", w["ip_status"], ip_raw,
                     w["ip_status"] * ip_raw, ip_detail),
    ]
    base = sum(c.weighted for c in contribs)
    
    # Improvement guidance
    guidance_fr_lines = []
    guidance_ar_lines = []
    if "geo_novelty" in missing:
        guidance_fr_lines.append("Indiquez le niveau de nouveauté géographique de votre offre — locale, régionale, nationale ou internationale.")
        guidance_ar_lines.append("أذكر مستوى التجديد الجغرافي لعرضك — محلي، إقليمي، وطني أو دولي.")
    if "tech_stack" in missing:
        guidance_fr_lines.append("Documentez votre pile technologique — plus vous en mentionnez, plus cela renforce votre score d'innovation.")
        guidance_ar_lines.append("وثّق كومة تقنياتك — كلما زادت التقنيات المذكورة، زادت نقاط ابتكارك.")
    if "ip_status" in missing:
        guidance_fr_lines.append("Définissez le statut de votre propriété intellectuelle — cela protège votre avantage compétitif.")
        guidance_ar_lines.append("حدّد حالة ملكيتك الفكرية — هذا يحمي ميزتك التنافسية.")
    guidance_fr = "\n".join(guidance_fr_lines) if guidance_fr_lines else None
    guidance_ar = "\n".join(guidance_ar_lines) if guidance_ar_lines else None
    
    return ScoreResult(
        dimension="Innovation", base_score=base, final_score=base,
        gate_triggered=False, gate_reason_fr=None, gate_reason_ar=None,
        contributions=contribs, missing_inputs=missing,
        anchor_fr="Manuel d'Oslo de l'OCDE 2018",
        anchor_ar="دليل أوسلو للمنظمة التعاون الاقتصادي والتنمية 2018",
        improvement_guidance_fr=guidance_fr,
        improvement_guidance_ar=guidance_ar,
    )


# --------------------------------------------------------------------------- #
# 6.4 Scalability Score S_S — VC marginal-cost decoupling                      #
# --------------------------------------------------------------------------- #
def score_scalability(p: ProjectProfile) -> ScoreResult:
    w = W.WEIGHTS["scalability"]
    missing: list[str] = []
    s = p.scalability

    # Operating-cost decoupling (rewritten — see SCORING_METHODOLOGY.md for the
    # deliberate deviation from concept-note Eq. 8). Scalability is the ability
    # to grow revenue without proportional growth in recurring cost, so LOW
    # monthly overhead must yield a HIGH score. We map C_month against a
    # baseline: 100 - C_month/OPEX_BASELINE x100, clamped to [0,100]. A near-zero
    # opex (e.g. SaaS) scores ~100; a >=20k TND/month opex scores 0. The old
    # ratio C_up/(C_up+C_month) perversely rewarded high capex and punished
    # asset-light software, which is backwards for marginal-cost decoupling.
    cmonth = s.monthly_overhead
    if cmonth is not None:
        decouple = _clamp(100.0 - (cmonth / W.OPEX_BASELINE) * 100.0)
        decouple_detail = (
            f"Monthly overhead {cmonth:,.0f} TND vs baseline "
            f"{W.OPEX_BASELINE:,.0f} -> 100 - C_month/baseline x100 = {decouple:.0f} "
            "(low recurring cost => high marginal-cost decoupling)"
        )
    else:
        decouple = 0.0
        missing.append("monthly_overhead")
        decouple_detail = "No monthly overhead -> 0"

    n_zones = len(s.cross_border_zones) if s.cross_border_zones is not None else 0
    if n_zones > 0:
        reach = min(n_zones / 3.0 * 100, 100)
        reach_detail = f"{n_zones} cross-border zones -> min(|E|/3 x100,100) = {reach:.0f}"
    else:
        reach = 0.0
        missing.append("cross_border_zones")
        reach_detail = "No cross-border zones -> 0"

    # Frictionless deployment (3rd sub-dimension): the inverse of human
    # dependency. A venture whose growth needs little incremental human effort
    # deploys frictionlessly. D_man in [0,10] -> (10 - D_man)/10 x100.
    dman = s.human_dependency
    if dman is not None:
        deploy = _clamp((10.0 - dman) / 10.0 * 100.0)
        deploy_detail = (
            f"Human dependency D_man = {dman}/10 -> (10-D_man)/10 x100 = {deploy:.0f} "
            "(low human dependency => frictionless deployment)"
        )
    else:
        deploy = 0.0
        deploy_detail = "No human-dependency rating -> 0"

    contribs = [
        Contribution("cost_decoupling", w["cost_decoupling"], decouple,
                     w["cost_decoupling"] * decouple, decouple_detail),
        Contribution("geo_reach", w["geo_reach"], reach,
                     w["geo_reach"] * reach, reach_detail),
        Contribution("deployment", w["deployment"], deploy,
                     w["deployment"] * deploy, deploy_detail),
    ]
    base = sum(c.weighted for c in contribs)

    # Gate (Eq. 9): 0.5 penalty multiplier when human dependency > 7.
    dman = s.human_dependency
    if dman is None:
        missing.append("human_dependency")
        gate_triggered = False
        final = base
        reason_fr = None
        reason_ar = None
    elif dman > W.GATES["human_dependency_threshold"]:
        gate_triggered = True
        final = W.GATES["scalability_penalty"] * base
        reason_fr = (
            f"Dépendance humaine D_man = {dman} > 7 : Score Scalabilité multiplié par "
            f"{W.GATES['scalability_penalty']} (le projet ne s'adapte pas sans "
            "proportionnellement plus de personnel — principe de découplage des coûts marginaux du VC échoue)."
        )
        reason_ar = (
            f"الاعتماد البشري D_man = {dman} > 7: يتم ضرب قابلية التوسع في "
            f"{W.GATES['scalability_penalty']} (المشروع لا يتوسع دون زيادة متناسبة في عدد الموظفين — مبدأ فصل التكاليف الهامشية لشركات رأس المال الاستثماري غير مقبول)."
        )
    else:
        gate_triggered = False
        final = base
        reason_fr = None
        reason_ar = None
        
    # Improvement guidance
    guidance_fr_lines = []
    guidance_ar_lines = []
    if "monthly_overhead" in missing:
        guidance_fr_lines.append("Estimez vos charges mensuelles récurrentes — moins elles sont élevées, plus votre score de scalabilité est fort.")
        guidance_ar_lines.append("قدّر تكاليفك الشهرية المتكررة — كلما كانت أقل، زادت نقاط قابلية التوسع.")
    if "cross_border_zones" in missing:
        guidance_fr_lines.append("Indiquez les zones géographiques ciblées pour votre expansion — plus vous en avez, plus votre score augmente.")
        guidance_ar_lines.append("أذكر المناطق الجغرافية المستهدفة لتوسعك — كلما زادت المناطق، زادت النقاط.")
    if "human_dependency" in missing or (dman is not None and dman > 7):
        guidance_fr_lines.append("Réduisez votre dépendance humaine pour améliorer votre capacité à évoluer sans augmentation proportionnelle des effectifs.")
        guidance_ar_lines.append("قلل من اعتمادك البشري لتحسين قدرتك على التوسع دون زيادة متناسبة في عدد الموظفين.")
    guidance_fr = "\n".join(guidance_fr_lines) if guidance_fr_lines else None
    guidance_ar = "\n".join(guidance_ar_lines) if guidance_ar_lines else None

    return ScoreResult(
        dimension="Scalability", base_score=base, final_score=final,
        gate_triggered=gate_triggered, gate_reason_fr=reason_fr, gate_reason_ar=reason_ar,
        contributions=contribs, missing_inputs=missing,
        anchor_fr="Principe de découplage des coûts marginaux du VC",
        anchor_ar="مبدأ فصل التكاليف الهامشية لشركات رأس المال الاستثماري",
        improvement_guidance_fr=guidance_fr,
        improvement_guidance_ar=guidance_ar,
    )


# --------------------------------------------------------------------------- #
# 6.5 Green Score S_G — UN SDG / World Bank ESG                                #
# --------------------------------------------------------------------------- #
def score_green(p: ProjectProfile) -> ScoreResult:
    w = W.WEIGHTS["green"]
    missing: list[str] = []
    g = p.green

    if g.footprint_category is not None:
        fp_raw = float(W.FOOTPRINT_MAP[g.footprint_category.value])
        fp_detail = f"Footprint '{g.footprint_category.value}' -> {fp_raw:.0f}"
    else:
        fp_raw = 0.0
        missing.append("footprint_category")
        fp_detail = "No footprint category -> 0"

    if g.circular_recycling is not None:
        circ_raw = 100.0 if g.circular_recycling else 0.0
        circ_detail = f"Circular recycling = {g.circular_recycling} -> {circ_raw:.0f}"
    else:
        circ_raw = 0.0
        missing.append("circular_recycling")
        circ_detail = "No circularity check -> 0"

    n_sdg = len(g.sdg_targets) if g.sdg_targets is not None else 0
    sdg_raw = min(n_sdg / 17.0 * 100, 100)
    sdg_detail = f"{n_sdg}/17 SDGs targeted -> {sdg_raw:.0f}"
    if n_sdg == 0:
        missing.append("sdg_targets")

    contribs = [
        Contribution("footprint", w["footprint"], fp_raw,
                     w["footprint"] * fp_raw, fp_detail),
        Contribution("circularity", w["circularity"], circ_raw,
                     w["circularity"] * circ_raw, circ_detail),
        Contribution("sdg", w["sdg"], sdg_raw, w["sdg"] * sdg_raw, sdg_detail),
    ]
    base = sum(c.weighted for c in contribs)
    
    # Improvement guidance
    guidance_fr_lines = []
    guidance_ar_lines = []
    if "footprint_category" in missing:
        guidance_fr_lines.append("Définissez la catégorie de votre empreinte carbone/environnementale — cela est la base de votre score vert.")
        guidance_ar_lines.append("حدّد فئة بصمتك الكربونية/البيئية — هذا أساس نقاطك الخضراء.")
    if "circular_recycling" in missing:
        guidance_fr_lines.append("Indiquez si vous intégrez des principes de réutilisation ou de recyclage — cela améliore votre score d'économie circulaire.")
        guidance_ar_lines.append("أذكر إن كنت تدمج مبادئ إعادة الاستخدام أو التدوير — هذا يحسن نقاطك في الاقتصاد الدائري.")
    if "sdg_targets" in missing or n_sdg == 0:
        guidance_fr_lines.append("Choisissez des Objectifs de Développement Durable (ODD) pertinents pour votre projet — plus vous en ciblez, plus votre score augmente.")
        guidance_ar_lines.append("اختر أهداف التنمية المستدامة (ODD) ذات صلة بمشروعك — كلما زادت الأهداف المستهدفة، زادت النقاط.")
    guidance_fr = "\n".join(guidance_fr_lines) if guidance_fr_lines else None
    guidance_ar = "\n".join(guidance_ar_lines) if guidance_ar_lines else None
    
    return ScoreResult(
        dimension="Green", base_score=base, final_score=base,
        gate_triggered=False, gate_reason_fr=None, gate_reason_ar=None,
        contributions=contribs, missing_inputs=missing,
        anchor_fr="Indicateurs ODD des Nations Unies / ESG de la Banque mondiale",
        anchor_ar="مؤشرات أهداف التنمية المستدامة للأمم المتحدة / ESG للبنك الدولي",
        improvement_guidance_fr=guidance_fr,
        improvement_guidance_ar=guidance_ar,
    )


# --------------------------------------------------------------------------- #
# Orchestrated computation of the full composite vector                        #
# --------------------------------------------------------------------------- #
def score_all(p: ProjectProfile, pcoh: Optional[float] = None,
              anomaly_dimension_notes: Optional[dict[str, list[str]]] = None
              ) -> CompositeScores:
    """Compute all five dimension scores.

    Args:
        p: The project profile.
        pcoh: LLM-as-a-Judge value-proposition coherence [0,100].
        anomaly_dimension_notes: Optional per-dimension confidence notes from
            the anomaly detector. Applied as read-only annotations — scores
            are never mutated by anomalies (Section 10 recommendation).
    """
    market = score_market(p)
    commercial = score_commercial(p, pcoh=pcoh)
    innovation = score_innovation(p)
    scalability = score_scalability(p)
    green = score_green(p)

    # Attach anomaly-derived confidence notes without mutating scores
    if anomaly_dimension_notes:
        dim_map = {
            "market": market,
            "commercial": commercial,
            "innovation": innovation,
            "scalability": scalability,
            "green": green,
        }
        for dim_name, notes in anomaly_dimension_notes.items():
            if dim_name in dim_map:
                dim_map[dim_name].anomaly_notes.extend(notes)

    return CompositeScores(
        market=market,
        commercial=commercial,
        innovation=innovation,
        scalability=scalability,
        green=green,
    )


def annotate_scores_with_anomalies(
    scores: CompositeScores,
    anomaly_dimension_notes: dict[str, list[str]],
) -> CompositeScores:
    """Apply anomaly-derived confidence notes to already-computed scores.

    Use this when scores were computed before anomaly detection. Never mutates
    scores — only adds read-only confidence annotations.

    Args:
        scores: Previously computed CompositeScores.
        anomaly_dimension_notes: Per-dimension notes from get_anomaly_dimension_notes().

    Returns:
        The same CompositeScores with anomaly_notes populated.
    """
    dim_map = {
        "market": scores.market,
        "commercial": scores.commercial,
        "innovation": scores.innovation,
        "scalability": scores.scalability,
        "green": scores.green,
    }
    for dim_name, notes in anomaly_dimension_notes.items():
        if dim_name in dim_map:
            for note in notes:
                if note not in dim_map[dim_name].anomaly_notes:
                    dim_map[dim_name].anomaly_notes.append(note)
    return scores
