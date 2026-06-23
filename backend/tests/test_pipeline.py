"""End-to-end pipeline + perception-reality gap on the seed scenarios."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")  # deterministic in CI

from app.orchestrator import run_audit  # noqa: E402
from app.seed_scenarios import (  # noqa: E402
    agritech_overclaimer, greentech_prelabel, saas_validated, services_underclaimer,
)


def run_async(coro):
    return asyncio.run(coro)


def test_overclaimer_severe_gap_and_override():
    r = run_async(run_audit(agritech_overclaimer()))
    assert r.gap.kind == "overestimation"
    assert r.gap.severity == "severe"
    assert r.gap.override_applied is True
    # declared Growth(6) but no validation/legal/revenue -> classified Ideation(1)
    assert r.diagnostic.classified_stage == 1
    # market gate caps (no validation), scalability gate penalises (Dman=8)
    assert r.scores.market.gate_triggered is True
    assert r.scores.scalability.gate_triggered is True


def test_validated_saas_is_aligned_or_mild():
    r = run_async(run_audit(saas_validated()))
    assert r.diagnostic.classified_stage >= 3   # legal form + validation present
    assert r.scores.market.gate_triggered is False
    assert r.scores.scalability.gate_triggered is False  # Dman=3


def test_underclaimer_detected():
    r = run_async(run_audit(services_underclaimer()))
    assert r.gap.kind == "underestimation"
    assert r.diagnostic.classified_stage > 1


def test_greentech_prelabel_is_aligned_at_launch_planning():
    r = run_async(run_audit(greentech_prelabel()))
    assert r.diagnostic.classified_stage == 5
    assert r.gap.kind == "aligned"
    assert r.scores.market.gate_triggered is False
    assert r.scores.scalability.gate_triggered is False
    assert r.scores.green.missing_inputs == []


def test_roadmap_is_grounded_and_ordered():
    r = run_async(run_audit(agritech_overclaimer()))
    assert len(r.roadmap) >= 1
    for m in r.roadmap:
        assert m.sources, "every milestone must cite a real resource"
        for s in m.sources:
            assert s["url"].startswith("http")
        assert m.timeline_start
        assert m.timeline_end
        assert m.timeline_weeks >= 1
    orders = [m.order for m in r.roadmap]
    assert orders == sorted(orders)


def test_pipeline_handles_empty_profile():
    from app.schema import ProjectProfile
    r = run_async(run_audit(ProjectProfile()))  # nothing collected
    assert r.diagnostic.classified_stage == 1
    assert r.to_dict()["intake_complete"] is False


def test_diagnose_endpoint_returns_full_handoff_payload():
    from fastapi.testclient import TestClient
    from uuid import uuid4
    from app.main import app

    client = TestClient(app)
    email = f"diagnose-{uuid4().hex}@firasa.test"
    registered = client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "name": "Founder"},
    )
    assert registered.status_code == 200, registered.text
    headers = {"Authorization": f"Bearer {registered.json()['token']}"}

    created = client.post("/api/projects", json={"name": "API handoff", "language": "fr"}, headers=headers)
    assert created.status_code == 200, created.text
    pid = created.json()["project_id"]

    diagnosed = client.post(f"/api/v1/projects/{pid}/diagnose", headers=headers)
    assert diagnosed.status_code == 200, diagnosed.text
    payload = diagnosed.json()
    assert payload["project_id"] == pid
    assert "diagnostic" in payload
    assert "perception_reality_gap" in payload
    assert "scores" in payload
    assert "roadmap" in payload


def test_provisional_diagnosis_endpoint_returns_in_progress_classification():
    from fastapi.testclient import TestClient
    from uuid import uuid4
    from app.main import app

    client = TestClient(app)
    email = f"provisional-{uuid4().hex}@firasa.test"
    registered = client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "name": "Founder"},
    )
    assert registered.status_code == 200, registered.text
    headers = {"Authorization": f"Bearer {registered.json()['token']}"}

    created = client.post("/api/projects", json={"name": "Progressive audit", "language": "fr"}, headers=headers)
    assert created.status_code == 200, created.text
    pid = created.json()["project_id"]

    answered = client.post(
        f"/api/projects/{pid}/answer",
        json={"question_id": "sector", "value": "services"},
        headers=headers,
    )
    assert answered.status_code == 200, answered.text

    provisional = client.get(f"/api/projects/{pid}/provisional-diagnosis", headers=headers)
    assert provisional.status_code == 200, provisional.text
    payload = provisional.json()
    assert payload["project_id"] == pid
    assert payload["intake_complete"] is False
    assert payload["answered_questions"] >= 2
    assert payload["diagnostic"]["classified_stage"] >= 1
    assert "confidence" in payload["diagnostic"]
