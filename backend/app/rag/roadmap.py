"""Mon Parcours roadmap factory.

Translates diagnostic gaps and low sub-scores into an ordered, grounded action
plan. This is where cross-module integration becomes visible: a diagnostic gap
(unmet gate) OR a low/penalised score TRIGGERS retrieval of relevant Tunisian
resources, which become roadmap milestones.

Every milestone is a four-tuple (order, rationale, horizon, source) — what
differentiates a roadmap from a flat list. Generation is extractive over
retrieved chunks (grounded); the LLM only rephrases, never invents a program.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..llm import get_llm
from ..schema import ProjectProfile
from ..diagnostic.classifier import DiagnosticResult
from ..diagnostic.gap import GapReport
from ..scoring.gwlc import CompositeScores
from .retriever import Retriever, DOMAIN_TO_GAP

_HORIZON_ORDER = {"immediate": 0, "short_term": 1, "medium_term": 2}
_HORIZON_FR = {"immediate": "Immédiat", "short_term": "Court terme", "medium_term": "Moyen terme"}
_HORIZON_AR = {"immediate": "عاجل", "short_term": "على المدى القصير", "medium_term": "على المدى المتوسط"}


@dataclass
class Milestone:
    id: str
    order: int
    title: str
    title_ar: str
    rationale_fr: str            # WHY this step, traceable to a gap/score
    rationale_ar: str
    horizon: str
    horizon_fr: str
    horizon_ar: str
    trigger: str                 # what diagnostic gap / score triggered it
    sources: list[dict] = field(default_factory=list)  # grounded citations
    action_fr: str = ""          # grounded prose next-step
    action_ar: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "order": self.order,
            "title": self.title,
            "title_ar": self.title_ar,
            "rationale_fr": self.rationale_fr,
            "rationale_ar": self.rationale_ar,
            "horizon": self.horizon,
            "horizon_fr": self.horizon_fr,
            "horizon_ar": self.horizon_ar,
            "trigger": self.trigger,
            "action_fr": self.action_fr,
            "action_ar": self.action_ar,
            "sources": self.sources,
        }


def _score_triggers(scores: CompositeScores) -> list[tuple[str, str, str, str, str]]:
    """Return (gap_category, label_fr, label_ar, rationale_fr, rationale_ar) for low or gated scores."""
    out: list[tuple[str, str, str, str, str]] = []
    if scores.market.gate_triggered:
        out.append((
            "missing_market_validation",
            "Score Marché plafonné",
            "وضع سقف لنتيجة السوق",
            "Le Score Marché est plafonné à 30 faute de preuve de validation client.",
            "تم وضع سقف لنتيجة السوق عند 30 لعدم تقديم دليل التحقق من العملاء."
        ))
    if scores.scalability.gate_triggered:
        out.append((
            "scalability",
            "Score Scalabilité pénalisé",
            "تطبيق خصم على قابلية التوسع",
            "Le Score Scalabilité est réduit de 50% (dépendance humaine > 7).",
            "تم تخفيض نتيجة قابلية التوسع بنسبة 50% (الاعتماد البشري > 7)."
        ))
    # Low non-gated dimensions (< 50) surface improvement milestones too.
    for res, gap, label_fr, label_ar in [
        (scores.commercial, "tech_hype", "Offre commerciale faible", "عرض تجاري ضعيف"),
        (scores.innovation, "tech_hype", "Score Innovation faible", "نتيجة ابتكار ضعيفة"),
        (scores.green, "green", "Score Green faible", "نتيجة بيئية ضعيفة"),
    ]:
        if res.final_score < 50 and not res.gate_triggered:
            dim_map_ar = {
                "Market": "السوق",
                "Commercial Offer": "العرض التجاري",
                "Innovation": "الابتكار",
                "Scalability": "قابلية التوسع",
                "Green": "الأثر البيئي"
            }
            dim_ar = dim_map_ar.get(res.dimension, res.dimension)
            out.append((
                gap,
                label_fr,
                label_ar,
                f"{res.dimension}: {res.final_score:.0f}/100 — levier d'amélioration prioritaire.",
                f"{dim_ar}: {res.final_score:.0f}/100 — محور تحسين ذو أولوية."
            ))
    return out


async def build_roadmap(
    profile: ProjectProfile,
    diagnostic: DiagnosticResult,
    scores: CompositeScores,
    gap: Optional[GapReport] = None,
    k_per_gap: int = 2,
) -> list[Milestone]:
    retriever = Retriever()
    llm = get_llm()
    milestones: list[Milestone] = []
    seen_resources: set[str] = set()

    # 1) Diagnostic blockers (unmet gates) -> remediation milestones.
    triggers: list[tuple[str, str, str, str, str, int]] = []  # gap_cat, label_fr, label_ar, rationale_fr, rationale_ar, stage
    for b in diagnostic.blockers:
        gap_cat = DOMAIN_TO_GAP.get(b["domain"], "general")
        label_fr = f"Débloquer: {b['stage_name']}"
        from ..diagnostic.classifier import STAGE_NAMES_AR
        label_ar = f"تفعيل: {STAGE_NAMES_AR.get(b['stage'])}"
        
        rat_fr = f"Porte de maturité non franchie ({b['stage_name']}): {b['detail_fr']}"
        rat_ar = f"بوابة النضج غير مستوفاة ({STAGE_NAMES_AR.get(b['stage'])}): {b['detail_ar']}"
        triggers.append((gap_cat, label_fr, label_ar, rat_fr, rat_ar, b["stage"]))

    # 2) Score-driven triggers (cross-module: low/gated scores -> roadmap).
    for gap_cat, label_fr, label_ar, rat_fr, rat_ar in _score_triggers(scores):
        triggers.append((gap_cat, label_fr, label_ar, rat_fr, rat_ar, diagnostic.classified_stage))

    # Order by stage (earliest blocker first); stable for equal stages.
    triggers.sort(key=lambda t: t[5])

    order = 1
    for gap_cat, label_fr, label_ar, rat_fr, rat_ar, _stage in triggers:
        query = f"{label_fr} {rat_fr} secteur {profile.sector.value if profile.sector else ''}"
        routed = retriever.retrieve(gap_cat, query, k=k_per_gap)
        if not routed.chunks:
            continue
        fresh = [c for c in routed.chunks if c.id not in seen_resources]
        if not fresh:
            fresh = routed.chunks  # allow reuse rather than drop the milestone
        for c in fresh:
            seen_resources.add(c.id)
        sources = [{"institution": c.institution, "title": c.title, "url": c.url,
                    "citation": c.cite(), "horizon": c.horizon} for c in fresh]
        horizon = fresh[0].horizon
        
        # Pass language when generating roadmap prose
        action = await llm.generate_roadmap_prose(
            gap=f"{label_fr}: {rat_fr}",
            chunks=[c.content for c in fresh],
            lang=profile.language
        )
        
        # Stable unique identifier
        milestone_id = f"{gap_cat}_{fresh[0].id}" if fresh else f"{gap_cat}_{label_fr.replace(' ', '_').lower()}"
        
        m = Milestone(
            id=milestone_id,
            order=order,
            title=label_fr,
            title_ar=label_ar,
            rationale_fr=rat_fr,
            rationale_ar=rat_ar,
            horizon=horizon,
            horizon_fr=_HORIZON_FR.get(horizon, horizon),
            horizon_ar=_HORIZON_AR.get(horizon, horizon),
            trigger=gap_cat,
            sources=sources,
        )
        if profile.language == "ar":
            m.action_ar = action
            m.action_fr = ""  # or generate on-demand, but setting correct language prose is sufficient
        else:
            m.action_fr = action
            m.action_ar = ""
            
        milestones.append(m)
        order += 1

    # Final ordering: stage already applied; within that, horizon proximity.
    milestones.sort(key=lambda m: (m.order, _HORIZON_ORDER.get(m.horizon, 9)))
    for i, m in enumerate(milestones, start=1):
        m.order = i
    return milestones
