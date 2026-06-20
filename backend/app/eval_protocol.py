"""Evaluation protocol runner (concept Section 9).

Reports three metrics on labelled test sets:
  * Diagnostic engine — Top-1 accuracy, Top-2 accuracy, MASE (threshold <= 0.5)
  * Scoring framework — gate-behaviour consistency on adversarial cases
  * RAG retrieval     — Precision@5 on a 30-query routing-matrix benchmark (>= 0.7)

Run: python -m app.eval_protocol  (from backend/)
"""
from __future__ import annotations

import json
import os

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from .diagnostic import classify  # noqa: E402
from .rag.knowledge_base import get_kb  # noqa: E402
from .rag.retriever import Retriever  # noqa: E402
from .schema import (  # noqa: E402
    ProjectProfile, MarketMetrics, CommercialOffer, ScalabilityIndex,
    MVPStage, LegalForm, SelfAssessment, Sector,
)

_SECTOR_CYCLE = [
    Sector.AGRI_FOOD,
    Sector.DIGITAL_SAAS,
    Sector.INDUSTRY,
    Sector.HEALTH,
    Sector.GREENTECH,
    Sector.SERVICES,
    Sector.OTHER,
]


def _profile_at_stage(target: int, variant: int = 0) -> ProjectProfile:
    """Construct a profile whose evidence satisfies exactly gates 1..target.

    Ground truth is the gate logic itself, so these labels are defensible by
    construction (not hand-guessed)."""
    sector = _SECTOR_CYCLE[variant % len(_SECTOR_CYCLE)]
    p = ProjectProfile(
        name=f"Stage {target} Variant {variant + 1}",
        sector=sector,
        self_assessment=SelfAssessment(
            declared_stage=target,
            declared_revenue=target >= 4,
            declared_legal_form=LegalForm.SARL if target >= 3 else None,
        ),
    )
    p.has_problem_statement = True
    p.user_segment_identified = True
    p.market = MarketMetrics(
        estimated_tam_tnd=3_000_000 + (variant * 125_000),
        competitor_headcount=4 + (variant % 3),
        customer_validation_evidence=target >= 2,
    )
    p.legal_form = LegalForm.SARL if target >= 3 else None
    p.has_revenue_model = target >= 4
    p.months_unit_economics = 6 if target >= 4 else 0
    p.commercial = CommercialOffer(
        value_proposition_narrative=f"Scenario {target}-{variant + 1}",
        mvp_stage=MVPStage.PRODUCTION if target >= 5 else MVPStage.CONCEPT,
    )
    p.scalability = ScalabilityIndex(
        human_dependency=4 if target >= 6 else 8,
        equipment_cost=45_000 + (variant * 500),
        monthly_overhead=15_000 + (variant * 250),
    )
    p.repeatable_sales = target >= 6
    p.intake_complete = True
    p.answered_questions = [
        "name", "sector", "declared_stage", "problem_statement", "user_segment",
        "tam", "competitors", "validation", "legal_form", "revenue_model",
        "unit_economics", "mvp_stage", "repeatable_sales",
    ]
    return p


# Labelled diagnostic test set: 60 synthetic profiles, 10 per stage.
DIAG_LABELS = tuple(
    (
        f"synthetic_stage_{stage}_{variant + 1}",
        (lambda stage=stage, variant=variant: _profile_at_stage(stage, variant)),
        stage,
    )
    for stage in range(1, 7)
    for variant in range(10)
)


def _build_rag_queries() -> list[tuple[str, str, set[str]]]:
    kb = get_kb()
    rows = [
        c for c in sorted(kb.chunks, key=lambda c: (c.institution, c.id))
        if any(g != "general" for g in c.gap_categories)
    ][:30]
    queries: list[tuple[str, str, set[str]]] = []
    for chunk in rows:
        gap = next(g for g in chunk.gap_categories if g != "general")
        relevant = {
            c.institution for c in kb.chunks
            if gap in c.gap_categories
        }
        snippet = chunk.content.replace("\n", " ").strip()
        query = f"{chunk.title} {snippet[:120]}"
        queries.append((gap, query, relevant))
    return queries


RAG_QUERIES = _build_rag_queries()


def cohen_weighted_kappa(y_true: list[int], y_pred: list[int], K: int = 6) -> float:
    # Categories are 1 to K. Map to 0 to K-1
    y_true_mapped = [x - 1 for x in y_true]
    y_pred_mapped = [x - 1 for x in y_pred]
    
    n = len(y_true)
    if n == 0:
        return 1.0
        
    # 1. Confusion matrix
    conf_mat = [[0] * K for _ in range(K)]
    for t, p in zip(y_true_mapped, y_pred_mapped):
        if 0 <= t < K and 0 <= p < K:
            conf_mat[t][p] += 1
            
    # 2. Weights matrix (quadratic weights)
    weights = [[0.0] * K for _ in range(K)]
    for i in range(K):
        for j in range(K):
            weights[i][j] = ((i - j) ** 2) / ((K - 1) ** 2)
            
    # 3. Row and col sums
    row_sums = [sum(conf_mat[i]) for i in range(K)]
    col_sums = [sum(conf_mat[i][j] for i in range(K)) for j in range(K)]
    
    # 4. Expected matrix
    expected = [[0.0] * K for _ in range(K)]
    for i in range(K):
        for j in range(K):
            expected[i][j] = (row_sums[i] * col_sums[j]) / n
            
    # 5. Observed and expected disagreements
    d_o = 0.0
    d_e = 0.0
    for i in range(K):
        for j in range(K):
            d_o += weights[i][j] * conf_mat[i][j]
            d_e += weights[i][j] * expected[i][j]
            
    if d_e == 0:
        return 1.0
    return round(1.0 - (d_o / d_e), 3)


def eval_diagnostic() -> dict:
    n = len(DIAG_LABELS)
    top1 = top2 = abs_err = 0
    rows = []
    y_true = []
    y_pred = []
    for name, builder, true_stage in DIAG_LABELS:
        pred = classify(builder()).classified_stage
        y_true.append(true_stage)
        y_pred.append(pred)
        # top-2 = prediction within 1 stage of truth
        t1 = int(pred == true_stage)
        t2 = int(abs(pred - true_stage) <= 1)
        top1 += t1
        top2 += t2
        abs_err += abs(pred - true_stage)
        rows.append({"scenario": name, "true": true_stage, "pred": pred,
                     "top1": t1, "top2": t2})
                     
    kappa = cohen_weighted_kappa(y_true, y_pred, K=6)
    return {"n": n, "top1_accuracy": round(top1 / n, 3),
            "top2_accuracy": round(top2 / n, 3), "MASE": round(abs_err / n, 3),
            "cohens_weighted_kappa": kappa,
            "MASE_threshold": 0.5, "passes": (abs_err / n) <= 0.5 and kappa >= 0.70, "rows": rows}


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
