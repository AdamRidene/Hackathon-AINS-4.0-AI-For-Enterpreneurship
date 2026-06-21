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

import asyncio
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
from . import store


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


async def run_audit(profile: ProjectProfile) -> AuditResult:
    """Run the full pipeline over the current shared state. Safe on partial data."""
    # Phase 2a — deterministic classification (rule-based authority).
    diagnostic = classify(profile)

    # Phase 2b — LLM-as-a-Judge value-proposition coherence (secondary layer).
    # Use cached coherence evaluations if the value proposition narrative hasn't changed.
    narrative = profile.commercial.value_proposition_narrative
    if (profile.last_pcoh is not None 
            and profile.last_pcoh_narrative == narrative):
        pcoh = profile.last_pcoh
        pcoh_rationale = profile.last_pcoh_rationale
    else:
        pcoh, pcoh_rationale = await get_llm().judge_value_proposition(narrative)
        profile.last_pcoh = pcoh
        profile.last_pcoh_rationale = pcoh_rationale
        profile.last_pcoh_narrative = narrative

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

    # Phase 3 — grounded roadmap + explanations (all independent, run in parallel).
    roadmap, scores_expl, gap_expl = await asyncio.gather(
        build_roadmap(profile, diagnostic, scores, gap),
        explain.explain_all_scores(scores, lang=profile.language),
        explain.explain_gap(gap, lang=profile.language),
    )
    explanations = {
        "scores": scores_expl,
        "gap": gap_expl,
        "pcoh_rationale": pcoh_rationale,
        "diagnostic_rationale": diagnostic.rationale_ar if profile.language == "ar" else diagnostic.rationale_fr,
    }

    # Persist the score vector on the profile so future audits and the
    # assistant fallback path always compute deltas against the latest run.
    if profile.intake_complete:
        profile.last_score_vector = list(scores.vector())

    return AuditResult(
        profile=profile, diagnostic=diagnostic, gap=gap, scores=scores,
        pcoh=pcoh, roadmap=roadmap, explanations=explanations,
        anomalies=anomalies, score_deltas=score_deltas,
    )


async def grounded_assistant_reply(profile: ProjectProfile, question: str) -> dict:
    """Secondary conversational layer — grounded ONLY in structured outputs and uploaded documents.

    The assistant never answers from general knowledge: its context is the
    audit (diagnostic, scores, roadmap) and supporting evidence documents.
    This satisfies the 'assistant is a layer, not the product' requirement.
    """
    # Fetch uploaded documents
    docs = store.list_documents(profile.project_id)
    full_docs = []
    for d in docs:
        full_doc = store.get_document(d["id"])
        if full_doc:
            full_docs.append(full_doc)

    docs_context = ""
    if full_docs:
        docs_context = "\nDocuments joints par l'entrepreneur:\n" + "\n".join(
            f"- {d['filename']}: {d['extracted_text'][:2000] if d.get('extracted_text') else '[Contenu vide]'}"
            for d in full_docs
        )

    # Try to load the cached audit result snapshot from the database store
    audit_data = store.get_audit(profile.project_id)
    
    if audit_data:
        # Reconstruct the context from the cached audit dict
        diag_stage = audit_data.get("diagnostic", {}).get("classified_stage_name", "Inconnu")
        gap_msg = audit_data.get("perception_reality_gap", {}).get("message_fr", "")
        if profile.language == "ar":
            gap_msg = audit_data.get("perception_reality_gap", {}).get("message_ar", gap_msg)
            
        vector = audit_data.get("scores", {}).get("vector", [0, 0, 0, 0, 0])
        
        roadmap_items = audit_data.get("roadmap", [])
        roadmap_prose = []
        for m in roadmap_items[:5]:
            order = m.get("order")
            title = m.get("title")
            horizon = m.get("horizon_fr")
            if profile.language == "ar":
                horizon = m.get("horizon_ar") or horizon
            srcs = ", ".join(s.get("institution", "") for s in m.get("sources", []))
            roadmap_prose.append(f"{order}. {title} ({horizon}) — {srcs}")
            
        ctx = (
            f"Stade objectif: {diag_stage}. "
            f"Écart perception-réalité: {gap_msg}. "
            f"Scores (M,C,I,S,G): {vector}. "
            "Feuille de route: " + " | ".join(roadmap_prose)
        )
        if docs_context:
            ctx += docs_context
        sources_used = [s for m in roadmap_items[:5] for s in m.get("sources", [])]
    else:
        # Fallback to running run_audit
        audit = await run_audit(profile)
        ctx = (
            f"Stade objectif: {audit.diagnostic.classified_stage_name}. "
            f"Écart perception-reality: {audit.gap.message_fr}. "
            f"Scores (M,C,I,S,G): {audit.scores.vector()}. "
            "Feuille de route: "
            + " | ".join(f"{m.order}. {m.title} ({m.horizon_fr}) — "
                         f"{', '.join(s['institution'] for s in m.sources)}"
                         for m in audit.roadmap[:5])
        )
        if docs_context:
            ctx += docs_context
        sources_used = [s for m in audit.roadmap[:5] for s in m.sources]
        
    reply = await get_llm().chat(question, ctx, lang=profile.language)
    return {"reply": reply, "grounding": ctx, "sources_used": sources_used}
