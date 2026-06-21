"""Explainability layer (Phase 3).

Turns the structured outputs of the deterministic modules into traceable,
plain-language justifications. The structured trace is always present (every
contribution, gate and gate-reason is computed deterministically); the LLM only
rephrases it into natural French. If the LLM is unavailable, the structured
context itself is returned — so an explanation is *never* missing.
"""
from __future__ import annotations

import asyncio

from .llm import get_llm
from .scoring.gwlc import ScoreResult, CompositeScores
from .diagnostic.gap import GapReport
from .diagnostic.classifier import STAGE_NAMES_AR


async def explain_score(s: ScoreResult, lang: str = "fr") -> dict:
    if lang == "ar":
        dim_map_ar = {
            "Market": "السوق",
            "Commercial Offer": "العرض التجاري",
            "Innovation": "الابتكار",
            "Scalability": "قابلية التوسع",
            "Green": "المسؤولية البيئية"
        }
        dim_ar = dim_map_ar.get(s.dimension, s.dimension)
        contrib_lines = "؛ ".join(
            f"{c.criterion} (الوزن {c.weight:.2f}): {c.detail} -> {c.weighted:.1f} نقاط"
            for c in s.contributions
        )
        context = (
            f"البعد {dim_ar}. النتيجة الأساسية {s.base_score:.1f}، "
            f"النتيجة النهائية {s.final_score:.1f}. الركيزة: {s.anchor}. "
            f"المساهمات: {contrib_lines}. "
            + (f"تم تفعيل البوابة: {s.gate_reason}" if s.gate_triggered else "لم يتم تفعيل أي بوابة.")
            + (f" البيانات المفقودة: {', '.join(s.missing_inputs)}." if s.missing_inputs else "")
        )
    else:
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
        "natural_language": await get_llm().justify(context, lang=lang),
    }


async def explain_gap(gap: GapReport, lang: str = "fr") -> dict:
    if lang == "ar":
        if not gap.has_gap:
            return {"has_gap": False, "natural_language": gap.message_ar}
        dims = "؛ ".join(
            f"{d.get('name_ar', d.get('name'))} (مجال {d.get('domain')})" for d in gap.diverging_dimensions
        )
        kind_map = {"overestimation": "مبالغة في التقدير", "underestimation": "تقدير أقل من الواقع", "aligned": "متوافق"}
        severity_map = {"none": "لا يوجد", "mild": "خفيف", "severe": "شديد"}
        declared_name = STAGE_NAMES_AR.get(gap.declared_stage) if gap.declared_stage else "غير محدد"
        classified_name = STAGE_NAMES_AR.get(gap.classified_stage, "غير محدد")
        context = (
            f"نوع الفجوة: {kind_map.get(gap.kind, gap.kind)}، الخطورة: {severity_map.get(gap.severity, gap.severity)}، المدى: {gap.magnitude} مرحلة/مراحل. "
            f"المصرح به: مرحلة {declared_name}، الواقع: مرحلة {classified_name}. "
            f"الأبعاد المتباعدة: {dims}. "
            + ("تم تطبيق إعادة التخصيص التلقائي للمرحلة المستهدفة." if gap.override_applied else "")
        )
    else:
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
        "natural_language": await get_llm().justify(context, lang=lang),
    }


async def explain_all_scores(scores: CompositeScores, lang: str = "fr") -> dict:
    # Run all 5 dimension explanations in parallel (independent LLM calls).
    results = await asyncio.gather(
        explain_score(scores.market, lang=lang),
        explain_score(scores.commercial, lang=lang),
        explain_score(scores.innovation, lang=lang),
        explain_score(scores.scalability, lang=lang),
        explain_score(scores.green, lang=lang),
    )
    return {
        "market": results[0],
        "commercial": results[1],
        "innovation": results[2],
        "scalability": results[3],
        "green": results[4],
    }
