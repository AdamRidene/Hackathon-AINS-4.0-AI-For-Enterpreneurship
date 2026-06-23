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


# --------------------------------------------------------------------------- #
# Document-driven auto-fill                                                   #
# --------------------------------------------------------------------------- #
import app.intake.autofill as autofill  # noqa: E402
from app.intake import propose_autofill, apply_autofill  # noqa: E402
from app.schema import Sector  # noqa: E402

_DOC = (
    "Projet AgriTrack. Secteur agri-food. Marché adressable estimé à 500000 TND. "
    "Preuve de validation client: 14 lettres d'intention signées. Concurrents: 3 acteurs."
)


class _FakeExtract(LLMProvider):
    name = "fake"

    async def _complete(self, prompt, max_tokens=400):
        return "{}"

    async def extract_fields(self, doc_text, fields_spec, lang="fr"):
        return [
            {"id": "sector", "value": "agri-food", "confidence": 0.95, "evidence": "Secteur agri-food"},
            {"id": "tam", "value": 500000, "confidence": 0.9, "evidence": "500000 TND"},
            {"id": "validation", "value": True, "confidence": 0.85, "evidence": "14 lettres d'intention signées"},
            {"id": "tam", "value": 1, "confidence": 0.3, "evidence": "dup"},          # dedupe
            {"id": "sector", "value": "not-a-sector", "confidence": 0.5, "evidence": "x"},  # would dedupe anyway
            {"id": "bogus", "value": 1, "confidence": 0.9, "evidence": "x"},          # unknown -> drop
            {"id": "human_dependency", "value": "trois", "confidence": 0.7, "evidence": "x"},  # not coercible -> drop
        ]


def _with_autofill_llm(provider):
    original = autofill.get_llm
    autofill.get_llm = lambda: provider
    return lambda: setattr(autofill, "get_llm", original)


def test_autofill_propose_validates_and_does_not_mutate():
    restore = _with_autofill_llm(_FakeExtract())
    try:
        p = ProjectProfile()
        proposals = asyncio.run(propose_autofill(p, _DOC))
        ids = [pr["question_id"] for pr in proposals]
        assert "sector" in ids and "tam" in ids and "validation" in ids
        assert "bogus" not in ids                      # unknown question dropped
        assert "human_dependency" not in ids           # non-coercible dropped
        assert ids.count("tam") == 1                   # deduped
        assert p.answered_questions == []              # propose must NOT mutate
        sector = next(pr for pr in proposals if pr["question_id"] == "sector")
        assert sector["verified"] is True and sector["recommended"] is True
    finally:
        restore()


def test_autofill_apply_writes_typed_fields():
    restore = _with_autofill_llm(_FakeExtract())
    try:
        p = ProjectProfile()
        proposals = asyncio.run(propose_autofill(p, _DOC))
        confirmed = [{"question_id": pr["question_id"], "value": pr["value"]}
                     for pr in proposals if pr["recommended"]]
        res = apply_autofill(p, confirmed)
        assert p.sector == Sector.AGRI_FOOD
        assert p.market.estimated_tam_tnd == 500000.0
        assert p.market.customer_validation_evidence is True
        assert set(res["applied"]) == {c["question_id"] for c in confirmed}
        # applied fields are now marked answered (won't be re-asked)
        assert all(qid in p.answered_questions for qid in res["applied"])
    finally:
        restore()


def test_autofill_falls_back_to_empty_when_llm_down():
    restore = _with_autofill_llm(StubProvider())
    try:
        assert asyncio.run(propose_autofill(ProjectProfile(), _DOC)) == []
    finally:
        restore()


def test_autofill_apply_skips_invalid_items():
    p = ProjectProfile()
    res = apply_autofill(p, [
        {"question_id": "sector", "value": "agri-food"},     # ok
        {"question_id": "bogus", "value": 1},                # unknown -> skipped
        {"question_id": "human_dependency", "value": "x"},   # not coercible -> skipped
    ])
    assert res["applied"] == ["sector"]
    assert set(res["skipped"]) == {"bogus", "human_dependency"}
    assert p.sector == Sector.AGRI_FOOD


def test_sync_profile_state_sector_transition():
    from app.intake.state_machine import sync_profile_state, IntakeStateMachine
    from app.schema import FootprintCategory

    # Start with agri-food
    p = ProjectProfile()
    sm = IntakeStateMachine(p)
    sm.apply_answer("sector", "agri-food")
    sm.apply_answer("agri_footprint", "Agri Waste")
    sm.apply_answer("agri_circular", True)

    assert p.green.footprint_category == FootprintCategory.AGRI_WASTE
    assert p.green.circular_recycling is True
    assert "agri_footprint" in p.answered_questions
    assert "agri_circular" in p.answered_questions

    # Transition to digital-saas
    p.sector = Sector.DIGITAL_SAAS
    sync_profile_state(p)

    # Footprint should be cleared (it is now invalid for digital-saas)
    assert p.green.footprint_category is None
    assert p.green.circular_recycling is None
    assert "agri_footprint" not in p.answered_questions
    assert "agri_circular" not in p.answered_questions


def test_sync_profile_state_stage_transition():
    from app.intake.state_machine import sync_profile_state, IntakeStateMachine

    # Start with advanced stage Fundraising (4)
    p = ProjectProfile()
    sm = IntakeStateMachine(p)
    sm.apply_answer("declared_stage", "4")
    sm.apply_answer("monthly_revenue", 12000.0)
    sm.apply_answer("burn_rate", 5000.0)
    sm.apply_answer("runway_months", 18)

    assert p.self_assessment.declared_stage == MaturityStage.FUNDRAISING
    assert p.monthly_revenue_tnd == 12000.0
    assert "monthly_revenue" in p.answered_questions

    # Lower stage to Ideation (1)
    p.self_assessment.declared_stage = MaturityStage.IDEATION
    sync_profile_state(p)

    # Financial details should be cleared
    assert p.monthly_revenue_tnd is None
    assert p.burn_rate_tnd is None
    assert p.runway_months is None
    assert "monthly_revenue" not in p.answered_questions
    assert "burn_rate" not in p.answered_questions
    assert "runway_months" not in p.answered_questions


def test_sync_profile_state_validation_transition():
    from app.intake.state_machine import sync_profile_state, IntakeStateMachine

    # Start with validation evidence
    p = ProjectProfile()
    sm = IntakeStateMachine(p)
    sm.apply_answer("validation", True)
    sm.apply_answer("user_count", 150)
    sm.apply_answer("growth_rate", 12.5)

    assert p.market.customer_validation_evidence is True
    assert p.user_count == 150
    assert "user_count" in p.answered_questions

    # Validation evidence becomes False
    p.market.customer_validation_evidence = False
    sync_profile_state(p)

    # Metrics should be cleared
    assert p.user_count is None
    assert p.growth_rate_pct is None
    assert "user_count" not in p.answered_questions
    assert "growth_rate" not in p.answered_questions

