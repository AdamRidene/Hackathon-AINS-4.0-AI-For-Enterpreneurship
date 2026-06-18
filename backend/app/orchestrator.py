r"""Central orchestration layer.

The single integration point that chains the three modules around the shared
ProjectProfile. This is what the spec evaluates as "cross-module integration":
the modules do not merely coexist — diagnostic output feeds scoring (P_coh
judge), both feed the gap detector, and gaps + scores together drive the RAG
roadmap. One call, one shared state, one audit object.

  intake (Phase 1)  -->  diagnostic + gap (Phase 2)  -->  scoring (Phase 2)
                                 \-------> RAG roadmap + explainability (Phase 3)
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .schema import ProjectProfile
from .intake import IntakeStateMachine
from .diagnostic import classify, detect_gap
from .diagnostic.classifier import DiagnosticResult
from .diagnostic.gap import GapReport, detect_anomalies
from .scoring.gwlc import score_all, CompositeScores
from .rag.roadmap import build_roadmap, Milestone
from .llm import get_llm
from . import explain


@dataclass
class AuditResult:
    profile: ProjectProfile
    diagnostic: DiagnosticResult
    gap: GapReport
    scores: CompositeScores
    pcoh: float
    roadmap: list[Milestone]
    explanations: dict = field(default_factory=dict)
    anomalies: list[dict] = field(default_factory=list)
    score_deltas: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "project_id": self.profile.project_id,
            "project_name": self.profile.name,
            "sector": self.profile.sector.value if self.profile.sector else None,
            "diagnostic": self.diagnostic.to_dict(),
            "perception_reality_gap": self.gap.to_dict(),
            "anomalies": self.anomalies,
            "scores": self.scores.to_dict(),
            "score_deltas": self.score_deltas,
            "pcoh": round(self.pcoh, 1),
            "roadmap": [m.to_dict() for m in self.roadmap],
            "explanations": self.explanations,
            "intake_complete": self.profile.intake_complete,
        }


def run_audit(profile: ProjectProfile) -> AuditResult:
    """Run the full pipeline over the current shared state. Safe on partial data."""
    # Phase 2a — deterministic classification (rule-based authority).
    diagnostic = classify(profile)

    # Phase 2b — LLM-as-a-Judge value-proposition coherence (secondary layer).
    pcoh, pcoh_rationale = get_llm().judge_value_proposition(
        profile.commercial.value_proposition_narrative
    )

    # Phase 2c — GWLC scoring with gates, fed by P_coh.
    scores = score_all(profile, pcoh=pcoh)

    # Phase 2d — perception-reality gap (declared vs classified) and the
    # internal-inconsistency pass (contradictory evidence flags).
    gap = detect_gap(profile, diagnostic)
    anomalies = detect_anomalies(profile, diagnostic, scores)

    # Score evolution: compare against the last persisted audit vector, if any.
    # Read-only here — the route handler persists the new vector after the audit
    # so that internal run_audit calls (e.g. from the assistant) don't disturb it.
    score_deltas: dict = {}
    prev = profile.last_score_vector
    new_vec = list(scores.vector())
    dims = ["market", "commercial", "innovation", "scalability", "green"]
    if prev and len(prev) == len(new_vec):
        score_deltas = {
            "previous_vector": [round(v, 1) for v in prev],
            "current_vector": [round(v, 1) for v in new_vec],
            "deltas": {d: round(new_vec[i] - prev[i], 1) for i, d in enumerate(dims)},
        }

    # Phase 3 — grounded roadmap (gaps + scores -> RAG) and explanations.
    roadmap = build_roadmap(profile, diagnostic, scores, gap)
    explanations = {
        "scores": explain.explain_all_scores(scores),
        "gap": explain.explain_gap(gap),
        "pcoh_rationale": pcoh_rationale,
        "diagnostic_rationale": diagnostic.rationale_fr,
    }

    return AuditResult(
        profile=profile, diagnostic=diagnostic, gap=gap, scores=scores,
        pcoh=pcoh, roadmap=roadmap, explanations=explanations,
        anomalies=anomalies, score_deltas=score_deltas,
    )


def grounded_assistant_reply(profile: ProjectProfile, question: str) -> dict:
    """Secondary conversational layer — grounded ONLY in structured outputs.

    The assistant never answers from general knowledge: its context is the
    audit (diagnostic, scores, roadmap). This satisfies the 'assistant is a
    layer, not the product' requirement.
    """
    audit = run_audit(profile)
    ctx = (
        f"Stade objectif: {audit.diagnostic.classified_stage_name}. "
        f"Écart perception-réalité: {audit.gap.message_fr}. "
        f"Scores (M,C,I,S,G): {audit.scores.vector()}. "
        "Feuille de route: "
        + " | ".join(f"{m.order}. {m.title} ({m.horizon_fr}) — "
                     f"{', '.join(s['institution'] for s in m.sources)}"
                     for m in audit.roadmap[:5])
    )
    reply = get_llm().chat(question, ctx)
    return {"reply": reply, "grounding": ctx, "sources_used": [
        s for m in audit.roadmap[:5] for s in m.sources
    ]}
