"""Perception–reality gap detector.

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
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..schema import ProjectProfile
from .classifier import DiagnosticResult, STAGE_NAMES


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
        )

    magnitude = declared - classified

    if magnitude == 0:
        return GapReport(
            has_gap=False, kind="aligned", declared_stage=declared,
            classified_stage=classified, magnitude=0, severity="none",
            override_applied=False,
            message_fr=(f"Auto-évaluation alignée sur la réalité: "
                        f"{STAGE_NAMES[classified]}."),
        )

    # Dimensions causing the divergence = the unmet gates between the two stages.
    diverging = []
    if magnitude > 0:  # overestimation: gates between classified+1 .. declared
        for g in diag.gates:
            if classified < g.stage <= declared and not g.passed:
                diverging.append({"stage": g.stage, "name": g.name,
                                  "domain": g.domain, "missing": g.evidence})
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
        return GapReport(
            has_gap=True, kind="overestimation", declared_stage=declared,
            classified_stage=classified, magnitude=magnitude, severity=severity,
            override_applied=override, diverging_dimensions=diverging, message_fr=msg,
        )

    # Underestimation
    for g in diag.gates:
        if declared < g.stage <= classified and g.passed:
            diverging.append({"stage": g.stage, "name": g.name,
                              "domain": g.domain, "achieved": g.evidence})
    msg = (
        f"Sous-évaluation détectée. Vous vous déclarez à '{STAGE_NAMES[declared]}' "
        f"alors que les preuves justifient '{STAGE_NAMES[classified]}'. "
        "Travail de structuration déjà accompli: "
        + ", ".join(d["name"] for d in diverging) + "."
    )
    return GapReport(
        has_gap=True, kind="underestimation", declared_stage=declared,
        classified_stage=classified, magnitude=magnitude, severity="mild",
        override_applied=False, diverging_dimensions=diverging, message_fr=msg,
    )


# --------------------------------------------------------------------------- #
# Inconsistency / anomaly detection                                            #
# --------------------------------------------------------------------------- #
# Distinct from the perception–reality gap (declared vs. classified stage): this
# pass flags *internally contradictory evidence* — pairs of tokens that should
# not coexist. Each anomaly is explainable: it names the conflicting signals so
# the founder sees exactly why the combination is implausible, not just a score.
def _contrib_raw(score, criterion: str) -> Optional[float]:
    for c in score.contributions:
        if c.criterion == criterion:
            return c.raw
    return None


def detect_anomalies(p: ProjectProfile, diag: DiagnosticResult, scores) -> list[dict]:
    """Return a list of contradictory-signal flags. `scores` is a
    CompositeScores. Empty list means no internal inconsistencies found."""
    flags: list[dict] = []
    m = p.market
    s = p.scalability

    # A1 — Large addressable market asserted with no customer validation.
    if (m.estimated_tam_tnd and m.estimated_tam_tnd > 1_000_000
            and m.customer_validation_evidence is not True):
        flags.append({
            "code": "tam_without_validation",
            "severity": "high",
            "title_fr": "Marché large revendiqué sans validation client",
            "detail_fr": (
                f"Un TAM de {m.estimated_tam_tnd:,.0f} TND est avancé alors qu'aucune "
                "preuve de validation client n'a été collectée. Une demande de cette "
                "ampleur devrait être étayée par des signaux terrain; en leur absence, "
                "le score Marché est plafonné à 30."),
            "signals": [
                f"TAM = {m.estimated_tam_tnd:,.0f} TND",
                "customer_validation_evidence = absent/faux",
            ],
        })

    # A2 — Cheap to operate yet cannot scale without proportional headcount.
    decouple = _contrib_raw(scores.scalability, "cost_decoupling")
    if (decouple is not None and decouple >= 60.0
            and s.human_dependency is not None and s.human_dependency > 7):
        flags.append({
            "code": "cheap_but_labour_bound",
            "severity": "medium",
            "title_fr": "Coûts récurrents faibles mais dépendance humaine élevée",
            "detail_fr": (
                "La structure de coûts est légère (faibles charges mensuelles), ce qui "
                "suggère un bon découplage, mais la dépendance humaine déclarée est "
                f"élevée (D_man = {s.human_dependency}/10). Une opération dont la "
                "croissance exige du personnel proportionnel ne passe pas à l'échelle "
                "malgré des coûts faibles — d'où la pénalité de 0,5 sur la Scalabilité."),
            "signals": [
                f"découplage coût = {decouple:.0f}/100 (élevé)",
                f"dépendance humaine = {s.human_dependency}/10 (élevée)",
            ],
        })

    # A3 — Declares an advanced stage (Fundraising+) without a revenue model.
    declared = int(p.self_assessment.declared_stage) if p.self_assessment.declared_stage else None
    if declared is not None and declared >= 4 and not p.has_revenue_model:
        flags.append({
            "code": "advanced_stage_no_revenue",
            "severity": "high",
            "title_fr": "Stade avancé déclaré sans modèle de revenus",
            "detail_fr": (
                f"Le projet se déclare au stade '{STAGE_NAMES[declared]}' mais aucun "
                "modèle de revenus n'a été défini. Lever des fonds ou se lancer sans "
                "modèle de monétisation est une incohérence structurelle majeure."),
            "signals": [
                f"stade déclaré = {STAGE_NAMES[declared]}",
                "modèle de revenus = absent",
            ],
        })

    # A4 — Strong, validated market signal but the product is still a concept.
    mvp = p.commercial.mvp_stage
    mvp_val = mvp.value if mvp is not None else None
    if scores.market.final_score >= 50.0 and mvp_val in (None, "Concept"):
        flags.append({
            "code": "market_claim_no_product",
            "severity": "medium",
            "title_fr": "Signal marché fort mais produit au stade concept",
            "detail_fr": (
                f"Le score Marché ({scores.market.final_score:.0f}/100) indique une "
                "demande crédible, mais le MVP est encore au stade concept (ou non "
                "renseigné). Une traction marché sans produit à montrer est à "
                "consolider avant toute mise à l'échelle."),
            "signals": [
                f"score Marché = {scores.market.final_score:.0f}/100",
                f"stade MVP = {mvp_val or 'non renseigné'}",
            ],
        })

    return flags
