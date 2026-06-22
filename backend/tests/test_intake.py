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
    c = _sequence(ProjectProfile(), {"sector": "services", "declared_stage": "4"})
    assert a != b and b != c and a != c


def test_engine_handles_every_sector():
    for sector in [s.value for s in Sector]:
        seq = _sequence(ProjectProfile(), {"sector": sector, "declared_stage": "1"})
        assert "name" in seq
        assert "sector" in seq
        assert "declared_stage" in seq
        assert len(seq) > 0


def test_skipping_list_questions():
    profile = ProjectProfile()
    sm = IntakeStateMachine(profile)
    sm.apply_answer("tech_stack", None)
    sm.apply_answer("sdg", None)
    
    assert profile.innovation.tech_stack == []
    assert profile.green.sdg_targets == []
    
    from app.scoring.gwlc import score_all
    scores = score_all(profile)
    assert scores.innovation.final_score is not None
    assert scores.green.final_score is not None


def test_model_validation_null_lists():
    # Simulate database JSON with null lists
    json_data = """{
        "project_id": "test1234",
        "name": "Test Project",
        "innovation": {
            "tech_stack": null
        },
        "scalability": {
            "cross_border_zones": null
        },
        "green": {
            "sdg_targets": null
        },
        "competitor_names": null
    }"""
    profile = ProjectProfile.model_validate_json(json_data)
    assert profile.innovation.tech_stack == []
    assert profile.scalability.cross_border_zones == []
    assert profile.green.sdg_targets == []
    assert profile.competitor_names == []


# --------------------------------------------------------------------------- #
# LangGraph adaptive-intake layer (content-aware AI probes)                   #
# --------------------------------------------------------------------------- #
import asyncio  # noqa: E402

import app.intake.graph as graph  # noqa: E402
from app.intake import run_intake_turn, MAX_PROBES  # noqa: E402
from app.llm.provider import LLMProvider, StubProvider  # noqa: E402


class _FakeProbe(LLMProvider):
    """Always proposes a follow-up probe for any free-text answer."""
    name = "fake"

    async def _complete(self, prompt, max_tokens=400):
        return "{}"

    async def propose_probe(self, question_prompt, answer, lang="fr"):
        return "Quel segment client précis, avec quelle preuve chiffrée ?"


def _with_llm(provider):
    """Swap the graph's runtime LLM lookup; returns a restore() callable."""
    original = graph.get_llm
    graph.get_llm = lambda: provider
    return lambda: setattr(graph, "get_llm", original)


def test_probe_injected_for_text_answer():
    restore = _with_llm(_FakeProbe())
    try:
        p = ProjectProfile()
        turn = asyncio.run(run_intake_turn(p, "name", "un truc un peu vague"))
        nq = turn["next_question"]
        assert nq["triggered_by"] == "ai_probe"
        assert nq["qtype"] == "text"
        assert len(p.dynamic_probes) == 1 and p.dynamic_probes[0]["answer"] is None
        assert turn["intake_complete"] is False
    finally:
        restore()


def test_probe_answer_recorded_then_deterministic_next():
    restore = _with_llm(_FakeProbe())
    try:
        p = ProjectProfile()
        turn = asyncio.run(run_intake_turn(p, "name", "vague"))
        probe_id = turn["next_question"]["id"]
        turn = asyncio.run(run_intake_turn(p, probe_id, "B2B, 12 LOIs signées"))
        assert p.dynamic_probes[0]["answer"] == "B2B, 12 LOIs signées"
        # backbone resumes: the deterministic next question is served
        assert turn["next_question"]["id"] == "sector"
        assert turn["next_question"]["triggered_by"] != "ai_probe"
    finally:
        restore()


def test_no_probe_when_llm_unavailable():
    # StubProvider.name == "stub" => llm_available False => pure state machine.
    restore = _with_llm(StubProvider())
    try:
        p = ProjectProfile()
        turn = asyncio.run(run_intake_turn(p, "name", "un truc vague"))
        assert p.dynamic_probes == []
        assert turn["next_question"]["id"] == "sector"
        assert "deterministic_next" in turn["trace"]
    finally:
        restore()


def test_one_probe_per_trigger():
    restore = _with_llm(_FakeProbe())
    try:
        p = ProjectProfile()
        asyncio.run(run_intake_turn(p, "name", "vague"))          # emits probe #1
        probe_id = p.dynamic_probes[0]["id"]
        asyncio.run(run_intake_turn(p, probe_id, "détails"))      # answer it
        turn = asyncio.run(run_intake_turn(p, "name", "encore vague"))  # same trigger
        assert turn["next_question"]["triggered_by"] != "ai_probe"
        assert len(p.dynamic_probes) == 1
    finally:
        restore()


def test_probe_global_cap():
    restore = _with_llm(_FakeProbe())
    try:
        p = ProjectProfile()
        for qid in ("name", "vp_narrative", "differentiation", "validation_proof"):
            try:
                turn = asyncio.run(run_intake_turn(p, qid, "réponse libre vague"))
            except (KeyError, ValueError):
                continue  # question not applicable to this profile state
            nq = turn["next_question"]
            if nq and nq.get("triggered_by") == "ai_probe":
                asyncio.run(run_intake_turn(p, nq["id"], "détails concrets"))
        assert len(p.dynamic_probes) <= MAX_PROBES
    finally:
        restore()
