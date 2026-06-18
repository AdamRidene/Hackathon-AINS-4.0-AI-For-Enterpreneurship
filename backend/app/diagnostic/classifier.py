"""Deterministic 6-stage maturity classifier (Phase 2).

The classifier is strictly rule-based: a venture is assigned to stage k if and
only if every evidence gate 1..k (Figure 1 of the concept) is satisfied by the
typed tokens in the shared profile. We deliberately do NOT let an LLM guess the
stage — the spec mandates that every stage assignment links to specific
collected data points, a property only rule-based logic can guarantee. The LLM
is a secondary audit layer (natural-language justification only), never the
classification authority.

Output carries a full evidence trace per gate so the UI can show exactly which
tokens drove (or blocked) the classification.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..schema import ProjectProfile, MaturityStage, MVPStage, LegalForm

STAGE_NAMES = {
    1: "Ideation", 2: "Market Validation", 3: "Structuration",
    4: "Fundraising", 5: "Launch Planning", 6: "Growth",
}

# Domain tag per gate, used by blocker ranking and RAG routing.
GATE_DOMAIN = {
    1: "market", 2: "market", 3: "legal", 4: "financial", 5: "technical", 6: "organisational",
}


@dataclass
class StageGate:
    stage: int
    name: str
    passed: bool
    requirement_fr: str
    evidence: str          # what satisfied / what is missing
    domain: str


_REGISTERED_FORMS = {
    LegalForm.SUARL, LegalForm.SARL, LegalForm.SA,
    LegalForm.STARTUP_ACT_PRELABEL, LegalForm.STARTUP_ACT_LABEL,
}
_MVP_READY = {MVPStage.PROTOTYPE, MVPStage.PRODUCTION}  # R_mvp >= 0.75


def _eval_gates(p: ProjectProfile) -> list[StageGate]:
    gates: list[StageGate] = []

    # Gate 1 — Ideation: problem statement + >=1 user segment
    g1 = bool(p.has_problem_statement) and bool(p.user_segment_identified)
    gates.append(StageGate(
        1, STAGE_NAMES[1], g1,
        "Énoncé de problème écrit + au moins un segment utilisateur",
        ("Énoncé + segment présents" if g1 else
         f"Manque: {'énoncé de problème ' if not p.has_problem_statement else ''}"
         f"{'segment utilisateur' if not p.user_segment_identified else ''}".strip()),
        GATE_DOMAIN[1]))

    # Gate 2 — Market Validation: Boolean validation token V_e = True
    g2 = p.market.customer_validation_evidence is True
    gates.append(StageGate(
        2, STAGE_NAMES[2], g2,
        "Au moins un token de validation client (V_e = vrai)",
        ("Preuve de validation client fournie" if g2 else
         "Aucune preuve de validation client (V_e absent ou faux)"),
        GATE_DOMAIN[2]))

    # Gate 3 — Structuration: registered legal form or Startup Act pre-label
    g3 = p.legal_form in _REGISTERED_FORMS
    gates.append(StageGate(
        3, STAGE_NAMES[3], g3,
        "Forme juridique enregistrée (SARL/SUARL/…) ou pré-label Startup Act",
        (f"Forme juridique: {p.legal_form.value}" if g3 else
         "Aucune forme juridique enregistrée"),
        GATE_DOMAIN[3]))

    # Gate 4 — Fundraising: documented revenue model + >=3 months unit economics
    months = p.months_unit_economics or 0
    g4 = bool(p.has_revenue_model) and months >= 3
    gates.append(StageGate(
        4, STAGE_NAMES[4], g4,
        "Modèle de revenus documenté + >= 3 mois d'unit economics",
        ("Modèle de revenus + unit economics suffisants" if g4 else
         f"Manque: {'modèle de revenus ' if not p.has_revenue_model else ''}"
         f"{f'unit economics ({months}/3 mois)' if months < 3 else ''}".strip()),
        GATE_DOMAIN[4]))

    # Gate 5 — Launch Planning: working MVP at Prototype/Production (R_mvp >= 0.75)
    g5 = p.commercial.mvp_stage in _MVP_READY
    gates.append(StageGate(
        5, STAGE_NAMES[5], g5,
        "MVP fonctionnel à l'état Prototype ou Production (R_mvp >= 0.75)",
        (f"MVP: {p.commercial.mvp_stage.value}" if g5 else
         f"MVP insuffisant: {p.commercial.mvp_stage.value if p.commercial.mvp_stage else 'aucun'}"),
        GATE_DOMAIN[5]))

    # Gate 6 — Growth: repeatable sales + human dependency <= 7
    dman = p.scalability.human_dependency
    g6 = bool(p.repeatable_sales) and dman is not None and dman <= 7
    gates.append(StageGate(
        6, STAGE_NAMES[6], g6,
        "Processus de vente répétable + dépendance humaine <= 7",
        ("Vente répétable + faible dépendance humaine" if g6 else
         f"Manque: {'vente répétable ' if not p.repeatable_sales else ''}"
         f"{f'dépendance humaine={dman} (>7)' if dman is not None and dman > 7 else ''}"
         f"{'dépendance humaine inconnue' if dman is None else ''}".strip()),
        GATE_DOMAIN[6]))

    return gates


@dataclass
class DiagnosticResult:
    classified_stage: int
    classified_stage_name: str
    gates: list[StageGate]
    next_blocking_gate: Optional[StageGate]
    confidence: float
    rationale_fr: str = ""
    blockers: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "classified_stage": self.classified_stage,
            "classified_stage_name": self.classified_stage_name,
            "confidence": round(self.confidence, 2),
            "rationale_fr": self.rationale_fr,
            "gates": [
                {"stage": g.stage, "name": g.name, "passed": g.passed,
                 "requirement_fr": g.requirement_fr, "evidence": g.evidence,
                 "domain": g.domain}
                for g in self.gates
            ],
            "next_blocking_gate": (
                {"stage": self.next_blocking_gate.stage,
                 "name": self.next_blocking_gate.name,
                 "evidence": self.next_blocking_gate.evidence}
                if self.next_blocking_gate else None
            ),
            "blockers": self.blockers,
        }


def _rank_blockers(p: ProjectProfile, gates: list[StageGate]) -> list[dict]:
    """Priority blockers = unmet gates, ordered by stage (earliest first).
    Distinguishes a structural gap (evidence proves absence) from missing
    information (token simply not collected yet)."""
    blockers: list[dict] = []
    for g in gates:
        if g.passed:
            continue
        # Heuristic: if intake answered the relevant question, it's structural;
        # otherwise it's missing information.
        kind = "structural_gap"
        if not p.intake_complete:
            kind = "missing_information"
        blockers.append({
            "priority": len(blockers) + 1,
            "stage": g.stage,
            "stage_name": g.name,
            "domain": g.domain,
            "kind": kind,
            "detail_fr": g.evidence,
            "requirement_fr": g.requirement_fr,
        })
    return blockers


def classify(p: ProjectProfile) -> DiagnosticResult:
    gates = _eval_gates(p)

    # Largest k such that gates 1..k all pass (contiguous from stage 1).
    k = 0
    for g in gates:
        if g.passed:
            k = g.stage
        else:
            break
    classified = max(1, k)  # taxonomy entry stage is Ideation

    next_blocking = next((g for g in gates if not g.passed), None)

    # Confidence: high when the next gate is cleanly unmet and all collected;
    # reduced when key inputs are missing (uncertainty surfaced, not hidden).
    answered = len(p.answered_questions)
    completeness = min(answered / 12.0, 1.0)
    confidence = round(0.5 + 0.5 * completeness, 2)

    passed_names = [g.name for g in gates if g.passed]
    rationale = (
        f"Stade objectif = {STAGE_NAMES[classified]} (niveau {classified}). "
        f"Portes franchies: {', '.join(passed_names) if passed_names else 'aucune'}. "
        + (f"Prochaine porte bloquante: {next_blocking.name} — {next_blocking.evidence}."
           if next_blocking else "Toutes les portes sont franchies.")
    )

    return DiagnosticResult(
        classified_stage=classified,
        classified_stage_name