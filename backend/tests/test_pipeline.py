"""End-to-end pipeline + perception-reality gap on the seed scenarios."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")  # deterministic in CI

from app.orchestrator import run_audit  # noqa: E402
from app.seed_scenarios import (  # noqa: E402
    agritech_overclaimer, greentech_prelabel, saas_validated, services_underclaimer,
)


def test_overclaimer_severe_gap_and_override():
    r = run_audit(agritech_overclaimer())
    assert r.gap.kind == "overestimation"
    assert r.gap.severity == "severe"
    assert r.gap.override_applied is True
    # declared Growth(6) but no validation/legal/revenue -> classified Ideation(1)
    assert r.diagnostic.classified_stage == 1
    # market gate caps (no validation), scalability gate penalises (Dman=8)
    assert r.scores.market.gate_triggered is True
    assert r.scores.scalability.gate_triggered is True


def test_validated_saas_is_aligned_or_mild():
    r = run_audit(saas_validated())
    assert r.diagnostic.classified_stage >= 3   # legal form + validation present
    assert r.scores.market.gate_triggered is False
    assert r.scores.scalability.gate_triggered is False  # Dman=3


def test_underclaimer_detected():
    r = run_audit(services_underclaimer())
    assert r.gap.kind == "underestimation"
    assert r.diagnostic.classified_stage > 1


def test_greentech_prelabel_is_aligned_at_launch_planning():
    r = run_audit(greentech_prelabel())
    assert r.diagnostic.classified_stage == 5
    assert r.gap.kind == "aligned"
    assert r.scores.market.gate_triggered is False
    assert r.scores.scalability.gate_triggered is False
    assert r.scores.green.missing_inputs == []


def test_roadmap_is_grounded_and_ordered():
    r = run_audit(agritech_overclaimer())
    assert len(r.roadmap) >= 1
    for m in r.roadmap:
        assert m.sources, "every milestone must cite a real resource"
        for s in m.sources:
            assert s["url"].startswith("http")
    orders = [m.order for m in r.roadmap]
    assert orders == sorted(orders)


def test_pipeline_handles_empty_profile():
    from app.schema import ProjectProfile
    r = run_audit(ProjectProfile())  # nothing collected
    assert r.diagnostic.classified_stage == 1
    assert r.to_dict()["intake_complete"] is False
