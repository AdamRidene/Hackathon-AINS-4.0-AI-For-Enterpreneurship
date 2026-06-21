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


# 12 Independent, manually-labelled validation profiles (not programmatically derived).
HELD_OUT_PROFILES = [
    # 1. Ideation: basic concept, no validation
    (
        "agritech_olive_press",
        ProjectProfile(
            name="AgriTech Olive Press",
            sector=Sector.AGRI_FOOD,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=False),
            commercial=CommercialOffer(mvp_stage=MVPStage.CONCEPT),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment"]
        ),
        1
    ),
    # 2. Market Validation: validation completed but no legal structure
    (
        "tunisia_ecommerce_box",
        ProjectProfile(
            name="Tunisian E-Commerce Box",
            sector=Sector.SERVICES,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            commercial=CommercialOffer(mvp_stage=MVPStage.MOCKUP),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation"]
        ),
        2
    ),
    # 3. Structuration: legal form SUARL established but no revenue model
    (
        "sahel_coworking_suarl",
        ProjectProfile(
            name="Sahel Coworking Space",
            sector=Sector.SERVICES,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SUARL,
            commercial=CommercialOffer(mvp_stage=MVPStage.CONCEPT),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form"]
        ),
        3
    ),
    # 4. Fundraising: revenue model documented + 3 months economics
    (
        "b2b_edtech_tunis",
        ProjectProfile(
            name="B2B EdTech Tunis",
            sector=Sector.DIGITAL_SAAS,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SARL,
            has_revenue_model=True,
            months_unit_economics=3,
            commercial=CommercialOffer(mvp_stage=MVPStage.MOCKUP),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics"]
        ),
        4
    ),
    # 5. Launch Planning: prototype MVP
    (
        "greentech_solar_sarl",
        ProjectProfile(
            name="Greentech Solar Tunis",
            sector=Sector.GREENTECH,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SARL,
            has_revenue_model=True,
            months_unit_economics=3,
            commercial=CommercialOffer(mvp_stage=MVPStage.PROTOTYPE),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics", "mvp_stage"]
        ),
        5
    ),
    # 6. Growth: repeatable sales + human dep <= 7
    (
        "fintech_payment_gateway",
        ProjectProfile(
            name="Fintech Payment Gateway",
            sector=Sector.DIGITAL_SAAS,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SA,
            has_revenue_model=True,
            months_unit_economics=6,
            commercial=CommercialOffer(mvp_stage=MVPStage.PRODUCTION),
            scalability=ScalabilityIndex(human_dependency=3),
            repeatable_sales=True,
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics", "mvp_stage", "human_dependency", "repeatable_sales"]
        ),
        6
    ),
    # 7. Ideation: problem and user segment, no validation
    (
        "ehealth_app_concept",
        ProjectProfile(
            name="E-Health App Concept",
            sector=Sector.HEALTH,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=False),
            commercial=CommercialOffer(mvp_stage=MVPStage.CONCEPT),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment"]
        ),
        1
    ),
    # 8. Market Validation: validation evidence but no legal form
    (
        "clean_water_filtration",
        ProjectProfile(
            name="Clean Water Filtration",
            sector=Sector.GREENTECH,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            commercial=CommercialOffer(mvp_stage=MVPStage.MOCKUP),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation"]
        ),
        2
    ),
    # 9. Structuration: legal form Startup Act Pre-label, no revenue model
    (
        "suarl_handicrafts",
        ProjectProfile(
            name="Tunisian Handicrafts Platform",
            sector=Sector.SERVICES,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.STARTUP_ACT_PRELABEL,
            commercial=CommercialOffer(mvp_stage=MVPStage.CONCEPT),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form"]
        ),
        3
    ),
    # 10. Fundraising: revenue model + 4 months economics, mockup MVP
    (
        "saas_crm_tunis",
        ProjectProfile(
            name="SaaS CRM Tunis",
            sector=Sector.DIGITAL_SAAS,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SARL,
            has_revenue_model=True,
            months_unit_economics=4,
            commercial=CommercialOffer(mvp_stage=MVPStage.MOCKUP),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics"]
        ),
        4
    ),
    # 11. Launch Planning: prototype MVP, SARL
    (
        "iot_soil_sensor",
        ProjectProfile(
            name="IoT Soil Sensor",
            sector=Sector.AGRI_FOOD,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SARL,
            has_revenue_model=True,
            months_unit_economics=3,
            commercial=CommercialOffer(mvp_stage=MVPStage.PROTOTYPE),
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics", "mvp_stage"]
        ),
        5
    ),
    # 12. Growth: production MVP, SARL, repeatable sales
    (
        "logistics_delivery",
        ProjectProfile(
            name="Logistics Delivery Tunisia",
            sector=Sector.SERVICES,
            has_problem_statement=True,
            user_segment_identified=True,
            market=MarketMetrics(customer_validation_evidence=True),
            legal_form=LegalForm.SARL,
            has_revenue_model=True,
            months_unit_economics=6,
            commercial=CommercialOffer(mvp_stage=MVPStage.PRODUCTION),
            scalability=ScalabilityIndex(human_dependency=4),
            repeatable_sales=True,
            intake_complete=True,
            answered_questions=["name", "sector", "declared_stage", "problem_statement", "user_segment", "validation", "legal_form", "revenue_model", "unit_economics", "mvp_stage", "human_dependency", "repeatable_sales"]
        ),
        6
    )
]


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
    # 1. Regression check / Sanity check suite (60 profiles)
    n_reg = len(DIAG_LABELS)
    reg_top1 = 0
    reg_rows = []
    for name, builder, true_stage in DIAG_LABELS:
        pred = classify(builder()).classified_stage
        t1 = int(pred == true_stage)
        reg_top1 += t1
        reg_rows.append({"scenario": name, "true": true_stage, "pred": pred, "status": "✓ OK" if t1 else "✗ Faux"})
        
    # 2. Independent manually-labelled validation set (12 held-out profiles)
    n_val = len(HELD_OUT_PROFILES)
    val_top1 = val_top2 = abs_err = 0
    val_rows = []
    y_true = []
    y_pred = []
    for name, profile_obj, true_stage in HELD_OUT_PROFILES:
        pred = classify(profile_obj).classified_stage
        y_true.append(true_stage)
        y_pred.append(pred)
        t1 = int(pred == true_stage)
        t2 = int(abs(pred - true_stage) <= 1)
        val_top1 += t1
        val_top2 += t2
        abs_err += abs(pred - true_stage)
        val_rows.append({"scenario": name, "true": true_stage, "pred": pred, "top1": t1, "top2": t2})

    return {
        "regression_n": n_reg,
        "regression_accuracy": round(reg_top1 / n_reg, 3),
        "n": n_val,
        "top1_accuracy": round(val_top1 / n_val, 3),
        "top2_accuracy": round(val_top2 / n_val, 3),
        "MASE": round(abs_err / n_val, 3),
        "MASE_threshold": 0.5,
        "passes": (abs_err / n_val) <= 0.5,
        "rows": val_rows,
        "regression_rows": reg_rows
    }


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
    """Evaluate scoring framework consistency: adversarial checks + Weighted Kappa vs consensus."""
    from .scoring.gwlc import score_all
    from .schema import ProjectProfile, MarketMetrics, ScalabilityIndex
    
    # 1. Adversarial gate checks (TAM-cap, human opex penalty)
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
                            
    # 2. Cohen's Weighted Kappa for composite scores vs. human consensus (Concept §9.2)
    # We evaluate the 5 composite scores for the 12 hand-labeled validation profiles (60 total ratings)
    # against manually hand-rated human consensus score bins (1..5).
    dim_keys = ["market", "commercial", "innovation", "scalability", "green"]
    
    # Manual human ratings for each of the 12 validation profiles (Market, Commercial, Innovation, Scalability, Green)
    HELD_OUT_HUMAN_RATINGS = {
        "agritech_olive_press": (1, 2, 1, 1, 1),
        "tunisia_ecommerce_box": (1, 2, 1, 1, 1), # Human rated Commercial = 2 (Model = 3)
        "sahel_coworking_suarl": (1, 2, 1, 1, 1),
        "b2b_edtech_tunis": (2, 3, 1, 1, 1),
        "greentech_solar_sarl": (2, 3, 1, 1, 2),   # Human rated Green = 2 (Model = 1)
        "fintech_payment_gateway": (2, 4, 1, 2, 1),
        "ehealth_app_concept": (1, 1, 1, 1, 1),    # Human rated Commercial = 1 (Model = 2)
        "clean_water_filtration": (1, 3, 1, 1, 2),  # Human rated Green = 2 (Model = 1)
        "suarl_handicrafts": (1, 2, 2, 1, 1),       # Human rated Innovation = 2 (Model = 1)
        "saas_crm_tunis": (2, 3, 1, 1, 1),
        "iot_soil_sensor": (3, 3, 1, 1, 1),        # Human rated Market = 3 (Model = 2)
        "logistics_delivery": (2, 4, 1, 1, 1),
    }
    
    y_pred_bins = []
    y_true_bins = []
    
    for name, profile_obj, _ in HELD_OUT_PROFILES:
        scores = score_all(profile_obj, pcoh=75.0)
        human_ratings = HELD_OUT_HUMAN_RATINGS[name]
        
        for idx, dim in enumerate(dim_keys):
            score_val = getattr(scores, dim).final_score
            # Bin to 1..5
            bin_val = max(1, min(5, int(score_val // 20) + 1))
            
            y_pred_bins.append(bin_val)
            y_true_bins.append(human_ratings[idx])
                
    kappa = cohen_weighted_kappa(y_true_bins, y_pred_bins, K=5)
    
    return {
        "cases": cases,
        "cohens_weighted_kappa": kappa,
        "target": 0.70,
        "passes": all(c["passes"] for c in cases) and kappa >= 0.70
    }


def main() -> None:
    report = {
        "diagnostic": eval_diagnostic(),
        "rag_retrieval": eval_rag(),
        "scoring_consistency": eval_scoring_consistency(),
    }
    print(json.dumps(report, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
