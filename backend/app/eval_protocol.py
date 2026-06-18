"""Evaluation protocol runner (concept Section 9).

Reports three metrics on small labelled test sets:
  * Diagnostic engine — Top-1 accuracy, Top-2 accuracy, MASE (threshold <= 0.5)
  * Scoring framework — gate-behaviour consistency on adversarial cases
  * RAG retrieval     — Precision@5 on a routing-matrix query set (>= 0.7)

Run: python -m app.eval_protocol  (from backend/)
"""
from __future__ import annotations

import json
import os

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from .diagnostic import classify  # noqa: E402
from .rag.retriever import Retriever  # noqa: E402
from .seed_scenarios import SCENARIOS  # noqa: E402
from .schema import (  # noqa: E402
    ProjectProfile, MarketMetrics, CommercialOffer, ScalabilityIndex,
    MVPStage, LegalForm,
)


def _profile_at_stage(target: int) -> ProjectProfile:
    """Construct a profile whose evidence satisfies exactly gates 1..target.

    Ground truth is the gate logic itself, so these labels are defensible by
    construction (not hand-guessed)."""
    p = ProjectProfile()
    if target >= 1:
        p.has_problem_statement = True
        p.user_segment_identified = True
    p.market = MarketMetrics(
        estimated_tam_tnd=3_000_000, competitor_headcount=4,
        customer_validation_evidence=target >= 2)
    if target >= 3:
        p.legal_form = LegalForm.SARL
    if target >= 4:
        p.has_revenue_model = True
        p.months_unit_economics = 6
    p.commercial = CommercialOffer(
        mvp_stage=MVPStage.PRODUCTION if target >= 5 else MVPStage.CONCEPT)
    p.scalability = ScalabilityIndex(human_dependency=4)
    if target >= 6:
        p.repeatable_sales = True
    p.intake_complete = True
    p.answered_questions = ["name"] * 12  # mark as complete for confidence
    return p


# Labelled diagnostic test set: (label, profile builder, true objective stage).
# 6 constructed-by-gate cases (one per stage) + 4 narrative seed scenarios.
DIAG_LABELS = (
    [(f"constructed_stage_{k}", (lambda k=k: _profile_at_stage(k)), k) for k in range(1, 7)]
    + [
        ("agritech_overclaimer", SCENARIOS["agritech_overclaimer"], 1),
        ("saas_validated", SCENARIOS["saas_validated"], 5),   # clears gates 1-5
        ("services_underclaimer", SCENARIOS["services_underclaimer"], 3),
        ("greentech_prelabel", SCENARIOS["greentech_prelabel"], 5),
    ]
)

# RAG query set: (gap_category, query, set of relevant institutions).
RAG_QUERIES = [
    ("missing_legal_form", "enregistrer la forme juridique SARL", {"APII", "RNE", "ANETI"}),
    ("premature_fundraising", "financement seed et crédit PME", {"BFPME", "BTS", "Flat6Labs Tunis", "SOTUGAR", "CDC", "Caisse des Dépôts (CDC)", "AFD", "BH Bank / banques commerciales", "Union Européenne"}),
    ("missing_market_validation", "valider la demande client enquête terrain", {"UNDP Tunisia", "CCI Tunisie"}),
    ("tech_hype", "label startup act et propriété intellectuelle", {"Startup Act", "Smart Capital", "INNORPI", "Novation City", "Elgazala / IPTIC", "Union Européenne", "Flat6Labs Tunis"}),
    ("green", "objectifs de développement durable et énergie", {"ONU / SDG", "World Bank", "ANME", "APIA", "AFD"}),
]


def eval_diagnostic() -> dict:
    n = len(DIAG_LABELS)
    top1 = top2 = abs_err = 0
    rows = []
    for name, builder, true_stage in DIAG_LABELS:
        pred = classify(builder()).classified_stage
        # top-2 = prediction within 1 stage of truth
        t1 = int(pred == true_stage)
        t2 = int(abs(pred - true_stage) <= 1)
        top1 += t1
        top2 += t2
        abs_err += abs(pred - true_stage)
        rows.append({"scenario": name, "true": true_stage, "pred": pred,
                     "top1": t1, "top2": t2})
    return {"n": n, "top1_accuracy": round(top1 / n, 3),
            "top2_accuracy": round(top2 / n, 3), "MASE": round(abs_err / n, 3),
            "MASE_threshold": 0.5, "passes": (abs_err / n) <= 0.5, "rows": rows}


def eval_rag() -> dict:
    r = Retriever()
    precisions = []
    rows = []
    for gap, query, relevant in RAG_QUERIES:
        res = r.retrieve(gap, query, k=5)
        hits = [c.institution in relevant for c in res.chunks]
        p_at_5 = sum(hits) / max(len(hits), 1)
        precisions.append(p_at_5)
        rows.append({"gap": gap, "p@5": round(p_at_5, 2),
                     "retrieved": [c.institution for c in res.chunks]})
    mean_p = sum(precisions) / len(precisions)
    return {"queries": len(RAG_QUERIES), "mean_precision_at_5": round(mean_p, 3),
            "threshold": 0.7, "passes": mean_p >= 0.7, "rows": rows}


def eval_scoring_consistency() -> dict:
    """Adversarial gate checks: confident claims with no evidence must be capped."""
    from .scoring.gwlc import score_all
    from .schema import ProjectProfile, MarketMetrics, ScalabilityIndex
    cases = []
    # Huge TAM but no validation -> market capped at 30.
    p1 = ProjectProfile(market=MarketMetrics(estimated_tam_tnd=9_000_000,
                        competitor_headcount=0, customer_validation_evidence=False))
    s1 = score_all(p1, pcoh=90)
    cases.append({"case": "huge_TAM_no_validation", "market_final": s1.market.final_score,
                  "expected_cap": 30, "passes": s1.market.final_score <= 30})
    # Strong base scalability but Dman=10 -> 50% penalty.
    p2 = ProjectProfile(scalability=ScalabilityIndex(human_dependency=10,
                        equipment_cost=90_000, monthly_overhead=1_000,
                        cross_border_zones=["a", "b", "c"]))
    s2 = score_all(p2)
    cases.append({"case": "high_base_high_dependency", "scal_base": round(s2.scalability.base_score, 1),
                  "scal_final": round(s2.scalability.final_score, 1),
                  "passes": s2.scalability.gate_triggered and
                            abs(s2.scalability.final_score - 0.5 * s2.scalability.base_score) < 0.1})
    return {"cases": cases, "passes": all(c["passes"] for c in cases)}


def main() -> None:
    report = {
        "diagnostic": eval_diagnostic(),
        "rag_retrieval": eval_rag(),
        "scoring_consistency": eval_scoring_consistency(),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
