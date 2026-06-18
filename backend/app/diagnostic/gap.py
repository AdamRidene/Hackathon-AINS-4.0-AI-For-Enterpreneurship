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
        classified_stage=classified, magnitude=m