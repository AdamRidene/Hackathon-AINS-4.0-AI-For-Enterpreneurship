"""Adaptive intake: branching must produce different sequences per profile."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schema import ProjectProfile, MaturityStage, Sector, SelfAssessment  # noqa: E402
from app.intake import IntakeStateMachine  # noqa: E402


def _sequence(profile: ProjectProfile, answers: dict) -> list[str]:
    sm = IntakeStateMachine(profile)
    seq = []
    guard = 0
    while (q := sm.next_question()) is not None and guard < 60:
        seq.append(q.id)
        sm.apply_answer(q.id, answers.get(q.id, _default_for(q)))
        guard += 1
    return seq


def _default_for(q):
    if q.qtype == "bool":
        return True
    if q.qtype in ("int", "float"):
        return 1
    if q.qtype in ("tags", "sdg"):
        return []
    if q.qtype == "enum":
        return q.options[0]
    return "x"


def test_agri_triggers_sector_probe():
    seq = _sequence(ProjectProfile(), {"sector": "agri-food", "declared_stage": "1"})
    assert "agri_footprint" in seq
    assert "agri_circular" in seq
    assert "digital_footprint" not in seq  # digital path bypassed


def test_digital_bypasses_agri_probe():
    seq = _sequence(ProjectProfile(), {"sector": "digital-saas", "declared_stage": "1"})
    assert "digital_footprint" in seq
    assert "agri_footprint" not in seq


def test_advanced_claim_injects_evidence_probes():
    seq = _sequence(ProjectProfile(), {"sector": "services", "declared_stage": "4"})
    assert "validation_proof" in seq      # injected for Fundraising+ claim
    assert "unit_economics" in seq        # hard numeric token demanded


def test_three_profiles_differ():
    a = _sequence(ProjectProfile(), {"sector": "agri-food", "declared_stage": "6"})
    b = _sequence(ProjectProfile(), {"sector": "digital-saas", "declared_stage": "1"})
    c = _sequence(ProjectProfile(), {"sector": "services", "declared