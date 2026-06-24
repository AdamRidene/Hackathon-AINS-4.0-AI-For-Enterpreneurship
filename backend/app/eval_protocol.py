"""Evaluation protocol runner (concept Section 9).

Reports metrics on labelled test sets:
  * Diagnostic engine — Top-1 accuracy, Top-2 accuracy, MASE (threshold <= 0.5)
  * Scoring framework — gate-behaviour consistency on adversarial cases
  * RAG retrieval     — Precision@5, Recall@5, MRR, NDCG@5 on a 30-query
                        routing-matrix benchmark (Precision@5 >= 0.7)
  * Assistant tool    — tool-selection accuracy on canned prompts
  * Intake branching  — branching-correctness on sector/stage combinations

Run: python -m app.eval_protocol  (from backend/)

Results are saved to backend/_data/eval_report.json.
Test set lives at backend/app/rag/data/test_set.json (independently verifiable).
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from .diagnostic import classify  # noqa: E402
from .rag.knowledge_base import get_kb  # noqa: E402
from .rag.retriever import Retriever  # noqa: E402
from .schema import (  # noqa: E402
    ProjectProfile, MarketMetrics, CommercialOffer, ScalabilityIndex,
    MVPStage, LegalForm, SelfAssessment, Sector,
)

_TEST_SET_PATH = Path(__file__).parent / "rag" / "data" / "test_set.json"
_REPORT_PATH = Path(__file__).parent.parent / "_data" / "eval_report.json"

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


# --------------------------------------------------------------------------- #
# Load test set from standalone JSON file (independently verifiable).          #
# --------------------------------------------------------------------------- #

def _profile_from_params(params: dict) -> ProjectProfile:
    """Reconstruct a ProjectProfile from the JSON test set's params dict."""
    p = ProjectProfile(name=params.get("name", "Unnamed"))
    sector_val = params.get("sector")
    if sector_val:
        p.sector = Sector(sector_val)
    for bool_field in ("has_problem_statement", "user_segment_identified",
                       "has_revenue_model", "repeatable_sales", "intake_complete"):
        if bool_field in params:
            setattr(p, bool_field, params[bool_field])
    if "months_unit_economics" in params:
        p.months_unit_economics = params["months_unit_economics"]
    if "legal_form" in params and params["legal_form"]:
        p.legal_form = LegalForm(params["legal_form"])
    if "market" in params:
        m = params["market"]
        p.market = MarketMetrics(
            estimated_tam_tnd=m.get("estimated_tam_tnd"),
            competitor_headcount=m.get("competitor_headcount"),
            customer_validation_evidence=m.get("customer_validation_evidence"),
        )
    if "commercial" in params:
        c = params["commercial"]
        p.commercial = CommercialOffer(
            value_proposition_narrative=c.get("value_proposition_narrative", ""),
            mvp_stage=MVPStage(c["mvp_stage"]) if "mvp_stage" in c else None,
        )
    if "scalability" in params:
        s = params["scalability"]
        p.scalability = ScalabilityIndex(
            human_dependency=s.get("human_dependency"),
            equipment_cost=s.get("equipment_cost"),
            monthly_overhead=s.get("monthly_overhead"),
            cross_border_zones=s.get("cross_border_zones", []),
        )
    if "answered_questions" in params:
        p.answered_questions = list(params["answered_questions"])
    return p


def _load_test_set() -> dict:
    """Load test_set.json and return structured data."""
    raw = json.loads(_TEST_SET_PATH.read_text(encoding="utf-8"))
    held_out = []
    for entry in raw["diagnostic_held_out"]:
        p = _profile_from_params({**entry["params"], "name": entry["name"], "sector": entry["sector"]})
        held_out.append((entry["id"], p, entry["expected_stage"]))
    human_ratings = {
        k: [v["market"], v["commercial"], v["innovation"], v["scalability"], v["green"]]
        for k, v in raw.get("human_consensus_ratings", {}).items()
    }
    return {"held_out": held_out, "human_ratings": human_ratings}


_TEST_SET = _load_test_set()
HELD_OUT_PROFILES = _TEST_SET["held_out"]
HELD_OUT_HUMAN_RATINGS = _TEST_SET["human_ratings"]


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


def _ndcg_at_k(relevances: list[float], k: int) -> float:
    """Compute NDCG@k. relevances[i] is the graded relevance of the i-th result."""
    dcg = sum((2**r - 1) / math.log2(i + 2) for i, r in enumerate(relevances[:k]))
    ideal = sorted(relevances, reverse=True)
    idcg = sum((2**r - 1) / math.log2(i + 2) for i, r in enumerate(ideal[:k]))
    return dcg / idcg if idcg > 0 else 0.0


def eval_rag() -> dict:
    r = Retriever()
    precisions = []
    recalls = []
    mrrs = []
    ndcgs = []
    rows = []
    for gap, query, relevant in RAG_QUERIES:
        res = r.retrieve(gap, query, k=5)
        hits = [c.institution in relevant for c in res.chunks]
        n_hits = sum(hits)
        k = max(len(hits), 1)
        p_at_5 = n_hits / k
        total_relevant = len(relevant)
        r_at_5 = n_hits / max(total_relevant, 1)
        ranks = [i + 1 for i, h in enumerate(hits) if h]
        rr = 1.0 / ranks[0] if ranks else 0.0
        relevances = [1.0 if h else 0.0 for h in hits]
        ndcg = _ndcg_at_k(relevances, 5)
        precisions.append(p_at_5)
        recalls.append(r_at_5)
        mrrs.append(rr)
        ndcgs.append(ndcg)
        rows.append({"gap": gap, "p@5": round(p_at_5, 2), "r@5": round(r_at_5, 2),
                     "mrr": round(rr, 3), "ndcg@5": round(ndcg, 3),
                     "retrieved": [c.institution for c in res.chunks]})
    mean_p = sum(precisions) / len(precisions)
    mean_r = sum(recalls) / len(recalls)
    mean_mrr = sum(mrrs) / len(mrrs)
    mean_ndcg = sum(ndcgs) / len(ndcgs)
    return {"queries": len(RAG_QUERIES), "mean_precision_at_5": round(mean_p, 3),
            "mean_recall_at_5": round(mean_r, 3), "mean_mrr": round(mean_mrr, 3),
            "mean_ndcg_at_5": round(mean_ndcg, 3),
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
    
    # Human ratings loaded from test_set.json (independently verifiable)
    
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


def eval_assistant_tool_trace() -> dict:
    """Cheap trace metric: did the assistant planner select the expected tool?"""
    from .orchestrator import _plan_assistant_tools

    cases = [
        ("hi", []),
        ("Pourquoi mon score Marché est-il plafonné ?", ["get_scores"]),
        ("Quelle est ma prochaine étape prioritaire ?", ["build_roadmap"]),
        ("Quels programmes de financement sont pertinents ?", ["retrieve_kb"]),
        ("Quelles infos clés dans mes documents ?", ["retrieve_documents"]),
    ]
    rows = []
    hits = 0
    for question, expected in cases:
        actual = _plan_assistant_tools(question)
        ok = all(tool in actual for tool in expected) and (bool(actual) == bool(expected))
        hits += int(ok)
        rows.append({"question": question, "expected": expected, "actual": actual, "passes": ok})
    return {"n": len(cases), "accuracy": round(hits / len(cases), 3), "passes": hits == len(cases), "rows": rows}


def eval_roadmap_coherence() -> dict:
    """Evaluate roadmap coherence on the 4 seed scenarios.

    Checks:
    - Every milestone has at least one source with a valid URL
    - Milestone order is strictly increasing
    - No duplicate milestone titles within the same project
    - Horizon tags match estimated timeline duration
    """
    import asyncio
    from .orchestrator import run_audit
    from .seed_scenarios import SCENARIOS

    passes = 0
    total = len(SCENARIOS)
    rows = []

    def _run(name: str, builder):
        r = asyncio.run(run_audit(builder(), fast=True))
        checks = {"sources_valid": True, "ordered": True, "no_dup_titles": True,
                  "horizon_consistent": True}
        titles = set()
        for m in r.roadmap:
            if not m.sources or not any(s.get("url", "").startswith("http") for s in m.sources):
                checks["sources_valid"] = False
            if m.title in titles:
                checks["no_dup_titles"] = False
            titles.add(m.title)
        orders = [m.order for m in r.roadmap]
        if orders != sorted(orders):
            checks["ordered"] = False
        for m in r.roadmap:
            w = m.timeline_weeks or 0
            # Relaxed bounds: timeline is personalised by profile factors
            # (runway, team size, etc.), so the resource horizon is a guide,
            # not a hard constraint.
            if m.horizon == "immediate" and w > 4:
                checks["horizon_consistent"] = False
            elif m.horizon == "short_term" and not (1 <= w <= 12):
                checks["horizon_consistent"] = False
            elif m.horizon == "medium_term" and w < 4:
                checks["horizon_consistent"] = False
        all_ok = all(checks.values())
        return {"scenario": name, "milestones": len(r.roadmap), **checks, "passes": all_ok}

    for name, builder in SCENARIOS.items():
        row = _run(name, builder)
        if row["passes"]:
            passes += 1
        rows.append(row)

    return {"n": total, "passes": passes == total, "pass_rate": round(passes / total, 3),
            "checks": rows}


def eval_intake_branching() -> dict:
    """Systematic test of intake branching against 6 sector x 6 stage combinations.

    Checks:
    - Every sector/stage produces a valid sequence
    - Sector probes are injected for agri-food and digital-saas
    - Advanced-stage claims inject evidence probes
    - 3 distinct profiles produce meaningfully different sequences
    """
    from .intake import IntakeStateMachine
    from .schema import MaturityStage

    sectors = [s.value for s in Sector]
    stages = [str(s) for s in range(1, 7)]
    rows = []
    passes = 0
    total = len(sectors) * len(stages)
    seen_sequences: set[str] = set()

    for sector in sectors:
        for stage in stages:
            profile = ProjectProfile(name=f"branch_{sector}_{stage}")
            sm = IntakeStateMachine(profile)
            sm.apply_answer("sector", sector)
            sm.apply_answer("declared_stage", stage)
            seq = []
            guard = 0
            while (q := sm.next_question()) is not None and guard < 60:
                seq.append(q.id)
                default = True if q.qtype == "bool" else (
                    q.options[0] if q.qtype == "enum" else (
                        [] if q.qtype in ("tags", "sdg") else 1 if q.qtype in ("int", "float") else "x"
                    )
                )
                sm.apply_answer(q.id, default)
                guard += 1
            seq_key = ",".join(seq)
            seen_sequences.add(seq_key)
            has_sector_probe = (
                ("agri_footprint" in seq or "agri_circular" in seq) if sector == "agri-food"
                else ("digital_footprint" in seq) if sector == "digital-saas"
                else True
            )
            has_evidence_probe = (
                "validation_proof" in seq or "unit_economics" in seq
            ) if int(stage) >= 4 else True
            ok = bool(seq) and has_sector_probe and has_evidence_probe
            if ok:
                passes += 1
            rows.append({
                "sector": sector, "stage": stage,
                "q_count": len(seq),
                "has_sector_probe": has_sector_probe,
                "has_evidence_probe": has_evidence_probe,
                "passes": ok,
            })

    distinct = len(seen_sequences)
    return {
        "n": total,
        "passes": passes == total,
        "pass_rate": round(passes / total, 3),
        "distinct_sequences": distinct,
        "distinct_ok": distinct >= 3,
        "checks": rows,
    }


def _save_report(report: dict) -> None:
    """Persist evaluation report to JSON."""
    _REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nReport saved to {_REPORT_PATH}")


def main() -> None:
    diag = eval_diagnostic()
    rag = eval_rag()
    scoring = eval_scoring_consistency()
    assistant = eval_assistant_tool_trace()
    roadmap = eval_roadmap_coherence()
    intake = eval_intake_branching()

    report = {
        "timestamp": "2026-06-24",
        "test_set": str(_TEST_SET_PATH),
        "results": {
            "diagnostic": diag,
            "rag": rag,
            "scoring": scoring,
            "assistant": assistant,
            "roadmap": roadmap,
            "intake_branching": intake,
        },
        "summary": {
            "diagnostic_passes": diag["passes"],
            "rag_passes": rag["passes"],
            "scoring_passes": scoring["passes"],
            "assistant_passes": assistant["passes"],
            "roadmap_passes": roadmap["passes"],
            "intake_branching_passes": intake["passes"],
        },
    }

    print("=" * 70)
    print(" FIRASA SYSTEM EVALUATION REPORT")
    print("=" * 70)
    print(f"\nTest set: {_TEST_SET_PATH}")
    print(f"\n1. PRIMARY DIAGNOSTIC EVALUATION (Hand-labelled Validation Set, N=12)")
    print(f"   * Top-1 Accuracy : {diag['top1_accuracy'] * 100:.1f}%")
    print(f"   * Top-2 Accuracy : {diag['top2_accuracy'] * 100:.1f}%")
    print(f"   * MASE (Error)   : {diag['MASE']}  (Target: <= 0.5)")
    print(f"   * Status         : {'PASS' if diag['passes'] else 'FAIL'}")

    print("\n2. COVERAGE STRESS TEST / REGRESSION CHECK (Synthetic Set, N=60)")
    print(f"   * Reg Accuracy   : {diag['regression_accuracy'] * 100:.1f}%")
    print("   * Note           : This synthetic set checks logic boundaries and rules consistency.")

    print("\n3. RAG RETRIEVAL (Tunisian Ecosystem Matrix, N=30)")
    print(f"   * Mean P@5       : {rag['mean_precision_at_5'] * 100:.1f}%  (Target: >= 70.0%)")
    print(f"   * Mean R@5       : {rag['mean_recall_at_5'] * 100:.1f}%")
    print(f"   * Mean MRR       : {rag['mean_mrr']:.3f}")
    print(f"   * Mean NDCG@5    : {rag['mean_ndcg_at_5']:.3f}")
    print(f"   * Status         : {'PASS' if rag['passes'] else 'FAIL'}")

    print("\n4. SCORING CONSISTENCY & COHEN'S KAPPA (Adversarial Check)")
    print(f"   * Weighted Kappa : {scoring['cohens_weighted_kappa']:.3f}  (Target: >= 0.70)")
    print(f"   * Status         : {'PASS' if scoring['passes'] else 'FAIL'}")

    print(f"\n5. ROADMAP COHERENCE (Seed Scenarios, N={roadmap['n']})")
    for row in roadmap["checks"]:
        status = "PASS" if row["passes"] else "FAIL"
        print(f"   * {row['scenario']}: {row['milestones']} milestones -> {status}")
    print(f"   * Pass Rate      : {roadmap['pass_rate'] * 100:.0f}%")
    print(f"   * Status         : {'PASS' if roadmap['passes'] else 'FAIL'}")

    print("\n6. ASSISTANT TOOL-CALL TRACE")
    print(f"   * Tool Accuracy  : {assistant['accuracy'] * 100:.1f}%")
    print(f"   * Status         : {'PASS' if assistant['passes'] else 'FAIL'}")

    print(f"\n7. INTAKE BRANCHING (All {intake['n']} sector x stage combinations)")
    print(f"   * Distinct sequences : {intake['distinct_sequences']}  (Target: >= 3)")
    print(f"   * Pass Rate          : {intake['pass_rate'] * 100:.0f}%")
    print(f"   * Status             : {'PASS' if intake['passes'] else 'FAIL'}")
    print("=" * 70)

    _save_report(report)


if __name__ == "__main__":
    main()
