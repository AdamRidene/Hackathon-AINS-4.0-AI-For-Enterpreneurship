"""Explainability layer (Phase 3).

Turns the structured outputs of the deterministic modules into traceable,
plain-language justifications. The structured trace is always present (every
contribution, gate and gate-reason is computed deterministically); the LLM only
rephrases it into natural French. If the LLM is unavailable, the structured
context itself is returned — so an explanation is *never* missing.
"""
from __future__ import annotations

from .llm import get_llm
from .scoring.gwlc import ScoreResult, CompositeScores
from .diagnostic.gap import GapReport


def explain_score(s: ScoreResult) -> dict:
    contrib_lines = "; ".join(
        f"{c.criterion} (poids {c.weight:.2f}): {c.detail} -> {c.weighted:.1f} pts"
        for c in s.contributions
    )
    context = (
        f"Dimension {s.dimension}. Score de base {s.base_score:.1f}, "
        f"score final {s.final_score:.1f}. Ancrage: {s.anchor}. "
        f"Contributions: {contrib_lines}. "
        + (f"PORTE déclenchée: {s.gate_reason}" if s.gate_triggered else "Aucune porte déclenchée.")
        + (f" Données manquantes: {', '.join(s.missing_inputs)}." if s.missing_inputs else "")
    )
    return {
        "dimension": s.dimension,
        "final_score": round(s.final_score, 1),
        "structured_trace": context,
        "natural_language": get_llm().justify(context),
    }


def explain_gap(gap: GapReport) -> dict:
    if not gap.has_gap:
        return {"has_gap": False, "natural_language": gap.message_fr}
    dims = "; ".join(
        f"{d['name']} (domaine {d['domain']})" for d in gap.diverging_dimensions
    )
    context = (
        f"Type d'écart: {gap.kind}, sévérité {gap.severity}, amplitude {gap.magnitude} stade(s). "
        f"Déclaré: stade {gap.declared_stage}, classé: stade {gap.classified_stage}. "
        f"Dimensions divergentes: {dims}. "
        + ("Réallocation automatique au stade objectif appliquée." if gap.override_applied else "")
    )
    return {
        "has_gap": True,
        "kind": gap.kind,
        "severity": gap.severity,
        "structured_trace": context,
        "natural_language": get_llm().justify(context),
    }


def explain_all_scores(scores: CompositeScores) -> dict:
    return {
        "market": explain_score(scores.market),
        "commercial": explain_score(scores.commercial),
        "innovation": explain_score(scores.innovation),
        "scalability": explain_score(scores.scala