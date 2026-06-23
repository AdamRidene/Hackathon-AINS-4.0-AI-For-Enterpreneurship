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

import asyncio
from datetime import date, timedelta
from dataclasses import dataclass, field
from typing import Optional

from ..llm import get_llm
from ..schema import ProjectProfile, MVPStage
from ..diagnostic.classifier import DiagnosticResult, STAGE_NAMES_AR as _STAGE_NAMES_AR
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
    timeline_fr: str = ""
    timeline_ar: str = ""
    timeline_start: str = ""
    timeline_end: str = ""
    timeline_weeks: int = 0
    timeline_basis: str = ""
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
            "timeline_fr": self.timeline_fr,
            "timeline_ar": self.timeline_ar,
            "timeline_start": self.timeline_start,
            "timeline_end": self.timeline_end,
            "timeline_weeks": self.timeline_weeks,
            "timeline_basis": self.timeline_basis,
            "action_fr": self.action_fr,
            "action_ar": self.action_ar,
            "sources": self.sources,
        }


def _anomaly_to_gap_category(code: str) -> str:
    """Map an anomaly code to a retriever gap category for roadmap routing."""
    mapping = {
        "tam_without_validation": "missing_market_validation",
        "cheap_but_labour_bound": "scalability",
        "advanced_stage_no_revenue": "missing_market_validation",
        "market_claim_no_product": "tech_hype",
        "tech_sector_mismatch": "tech_hype",
        "innovation_no_ip": "tech_hype",
        "innovation_pure_self_report": "tech_hype",
        "green_without_footprint": "green",
        "revenue_commercial_mismatch": "missing_market_validation",
        "compound_evidence_vacuum": "missing_market_validation",
        "compound_monetisation_blind_spot": "missing_market_validation",
        "compound_narrative_inflation": "missing_market_validation",
    }
    return mapping.get(code, "general")


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


def _timeline_profile_factor(profile: ProjectProfile) -> tuple[float, list[str]]:
    """Return a multiplier and explanation tokens used to personalize timing."""
    factor = 1.0
    notes: list[str] = []

    runway = profile.runway_months
    if runway is not None:
        if runway <= 3:
            factor *= 0.75
            notes.append(f"runway {runway} mois")
        elif runway <= 6:
            factor *= 0.9
            notes.append(f"runway {runway} mois")
        elif runway >= 12:
            factor *= 1.1
            notes.append(f"runway {runway} mois")

    team_size = profile.team_size
    if team_size is not None:
        if team_size <= 2:
            factor *= 0.9
            notes.append(f"équipe réduite ({team_size})")
        elif team_size >= 8:
            factor *= 1.1
            notes.append(f"équipe large ({team_size})")

    if profile.has_revenue_model is False:
        factor *= 0.9
        notes.append("pas encore de modèle de revenus")

    mvp = profile.commercial.mvp_stage
    if mvp in (None, MVPStage.CONCEPT):
        factor *= 0.85
        notes.append("MVP concept")
    elif mvp == MVPStage.PRODUCTION:
        factor *= 1.1
        notes.append("MVP déjà opérationnel")

    return max(0.7, min(1.3, factor)), notes


def _base_timeline_window(horizon: str, stage: int) -> tuple[int, int]:
    if horizon == "immediate":
        return (1, 2 if stage <= 1 else 3)
    if horizon == "short_term":
        return (2, 4 if stage <= 2 else 6)
    return (4, 8 if stage <= 2 else 12)


def _personalize_timeline(profile: ProjectProfile, horizon: str, stage: int) -> tuple[str, str, str, int, str]:
    start_days, end_days = _base_timeline_window(horizon, stage)
    factor, notes = _timeline_profile_factor(profile)
    adjusted_start = max(1, round(start_days * factor))
    adjusted_end = max(adjusted_start, round(end_days * factor))

    today = date.today()
    start_date = today + timedelta(days=adjusted_start * 7)
    end_date = today + timedelta(days=adjusted_end * 7)
    basis = ", ".join(notes) if notes else "profil standard"

    if profile.language == "ar":
        if adjusted_end <= 2:
            label = "فوري"
        elif adjusted_end <= 4:
            label = "قصير المدى"
        else:
            label = "متوسط المدى"
        timeline = f"{label} ({adjusted_start}–{adjusted_end} semaines, {basis})"
    else:
        if adjusted_end <= 2:
            label = "Immédiat"
        elif adjusted_end <= 4:
            label = "Court terme"
        else:
            label = "Moyen terme"
        timeline = f"{label} ({adjusted_start} à {adjusted_end} semaines, {basis})"

    return timeline, timeline, start_date.isoformat(), end_date.isoformat(), basis


def _timeline_weeks(profile: ProjectProfile, horizon: str, stage: int) -> int:
    """Return the personalized number of weeks for a milestone."""
    _, end_days = _base_timeline_window(horizon, stage)
    factor, _ = _timeline_profile_factor(profile)
    adjusted_end = max(1, round(end_days * factor))
    return adjusted_end


async def build_roadmap(
    profile: ProjectProfile,
    diagnostic: DiagnosticResult,
    scores: CompositeScores,
    gap: Optional[GapReport] = None,
    k_per_gap: int = 2,
    anomalies: Optional[list[dict]] = None,
) -> list[Milestone]:
    """Build an ordered, grounded action plan from gaps, scores, and anomalies.

    Anomalies influence priority: high-severity anomalies escalate to stage 1
    (immediate), medium to stage 2 (short-term), so anomaly-driven milestones
    bubble up above routine blockers.
    """
    retriever = Retriever()
    llm = get_llm()
    milestones: list[Milestone] = []
    seen_resources: set[str] = set()

    # 1) Diagnostic blockers (unmet gates) -> remediation milestones.
    triggers: list[tuple[str, str, str, str, str, int]] = []  # gap_cat, label_fr, label_ar, rationale_fr, rationale_ar, stage
    for b in diagnostic.blockers:
        gap_cat = DOMAIN_TO_GAP.get(b["domain"], "general")
        label_fr = f"Débloquer: {b['stage_name']}"
        label_ar = f"تفعيل: {_STAGE_NAMES_AR.get(b['stage'])}"

        rat_fr = f"Porte de maturité non franchie ({b['stage_name']}): {b['detail_fr']}"
        rat_ar = f"بوابة النضج غير مستوفاة ({_STAGE_NAMES_AR.get(b['stage'])}): {b['detail_ar']}"
        triggers.append((gap_cat, label_fr, label_ar, rat_fr, rat_ar, b["stage"]))

    # 2) Score-driven triggers (cross-module: low/gated scores -> roadmap).
    for gap_cat, label_fr, label_ar, rat_fr, rat_ar in _score_triggers(scores):
        triggers.append((gap_cat, label_fr, label_ar, rat_fr, rat_ar, diagnostic.classified_stage))

    # 2b) Gap-category triggers from GapReport (unmet gates -> retriever routing).
    if gap and gap.gap_categories:
        existing_cats = {t[0] for t in triggers}
        for cat in gap.gap_categories:
            if cat not in existing_cats:
                triggers.append((cat, f"Porte manquante: {cat}", f"بوابة ناقصة: {cat}",
                                  gap.message_fr, gap.message_ar, diagnostic.classified_stage))

    # 3) Anomaly-driven triggers — escalate priority for structural inconsistencies.
    if anomalies:
        for anom in anomalies:
            severity = anom.get("severity", "medium")
            if severity not in ("high", "medium"):
                continue
            # Map anomaly code to a gap category for retrieval routing
            anom_code = anom.get("code", "")
            anom_gap_cat = _anomaly_to_gap_category(anom_code)
            # Escalate: high → stage 1 (immediate), medium → stage 2 (short-term)
            anom_stage = 1 if severity == "high" else 2
            triggers.append((
                anom_gap_cat,
                anom.get("title_fr", "Anomalie détectée"),
                anom.get("title_ar", "تم اكتشاف تناقض"),
                anom.get("detail_fr", ""),
                anom.get("detail_ar", ""),
                anom_stage,
            ))

    # Order by stage (earliest first); anomaly-triggered items with escalated
    # priority (stage 1/2) naturally bubble above routine blockers.
    triggers.sort(key=lambda t: t[5])

    # Phase 1: Collect all retrievals (no LLM calls yet).
    trigger_plans: list[dict] = []
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
        timeline_fr, timeline_ar, timeline_start, timeline_end, timeline_basis = _personalize_timeline(
            profile, horizon, _stage
        )
        timeline_weeks = _timeline_weeks(profile, horizon, _stage)
        milestone_id = f"{gap_cat}_{fresh[0].id}" if fresh else f"{gap_cat}_{label_fr.replace(' ', '_').lower()}"
        trigger_plans.append({
            "milestone_id": milestone_id,
            "gap_cat": gap_cat,
            "label_fr": label_fr,
            "label_ar": label_ar,
            "rat_fr": rat_fr,
            "rat_ar": rat_ar,
            "horizon": horizon,
            "timeline_fr": timeline_fr,
            "timeline_ar": timeline_ar,
            "timeline_start": timeline_start,
            "timeline_end": timeline_end,
            "timeline_weeks": timeline_weeks,
            "timeline_basis": timeline_basis,
            "sources": sources,
            "chunks": [c.content for c in fresh],
        })

    # Phase 2: Fire ALL LLM prose-generation calls in parallel.
    async def _generate_action(plan: dict) -> str:
        return await llm.generate_roadmap_prose(
            gap=f"{plan['label_fr']}: {plan['rat_fr']} | Timeline: {plan['timeline_fr']}",
            chunks=plan["chunks"],
            lang=profile.language,
        )

    actions = await asyncio.gather(
        *[_generate_action(p) for p in trigger_plans],
        return_exceptions=True,
    )

    # Phase 3: Assemble milestones with their generated prose.
    order = 1
    for plan, action in zip(trigger_plans, actions):
        if isinstance(action, Exception):
            # LLM call failed — fall back to first chunk with a truncation note
            raw = plan["chunks"][0] if plan["chunks"] else ""
            if profile.language == "ar":
                note = "(تم إنشاؤه بدون مساعدة الذكاء الاصطناعي — فشل نموذج اللغة)"
            else:
                note = "(Généré sans aide IA — échec du modèle de langue)"
            action = f"{note}\n\n{raw[:300]}{'...' if len(raw) > 300 else ''}"

        m = Milestone(
            id=plan["milestone_id"],
            order=order,
            title=plan["label_fr"],
            title_ar=plan["label_ar"],
            rationale_fr=plan["rat_fr"],
            rationale_ar=plan["rat_ar"],
            horizon=plan["horizon"],
            horizon_fr=_HORIZON_FR.get(plan["horizon"], plan["horizon"]),
            horizon_ar=_HORIZON_AR.get(plan["horizon"], plan["horizon"]),
            trigger=plan["gap_cat"],
            timeline_fr=plan["timeline_fr"],
            timeline_ar=plan["timeline_ar"],
            timeline_start=plan["timeline_start"],
            timeline_end=plan["timeline_end"],
            timeline_weeks=plan["timeline_weeks"],
            timeline_basis=plan["timeline_basis"],
            sources=plan["sources"],
        )
        if profile.language == "ar":
            m.action_ar = action
            m.action_fr = ""
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
