"""Mock auth, plan limits, ownership, and hard-delete API behavior."""
import os
import sys
from uuid import uuid4

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


client = TestClient(app)


def _register(plan: str = "free") -> tuple[dict, dict]:
    email = f"user-{uuid4().hex}@firasa.test"
    res = client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "name": "Test User"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    if plan != "free":
        upgraded = client.patch("/api/me/plan", json={"plan": plan}, headers=headers)
        assert upgraded.status_code == 200, upgraded.text
        body["user"] = upgraded.json()["user"]
    return body, headers


def _create_project(headers: dict, name: str = "Demo") -> str:
    res = client.post("/api/projects", json={"name": name, "language": "fr"}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["project_id"]


def test_register_login_and_me():
    email = f"login-{uuid4().hex}@firasa.test"
    password = "secret123"
    registered = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": "Founder"},
    )
    assert registered.status_code == 200, registered.text
    token = registered.json()["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"]["email"] == email
    assert me.json()["user"]["plan"] == "free"

    logged_in = client.post("/api/auth/login", json={"email": email, "password": password})
    assert logged_in.status_code == 200, logged_in.text
    assert logged_in.json()["user"]["email"] == email


def test_owner_scope_blocks_other_users():
    _, owner_headers = _register()
    _, other_headers = _register()
    pid = _create_project(owner_headers, "Owned")

    assert client.get(f"/api/projects/{pid}", headers=owner_headers).status_code == 200
    assert client.get(f"/api/projects/{pid}", headers=other_headers).status_code == 404
    assert client.delete(f"/api/projects/{pid}", headers=other_headers).status_code == 404

    deleted = client.delete(f"/api/projects/{pid}", headers=owner_headers)
    assert deleted.status_code == 200, deleted.text


def test_plan_limits_are_backend_enforced():
    _, headers = _register()
    _create_project(headers, "Free project")
    blocked = client.post("/api/projects", json={"name": "Too many"}, headers=headers)
    assert blocked.status_code == 403

    upgraded = client.patch("/api/me/plan", json={"plan": "plus"}, headers=headers)
    assert upgraded.status_code == 200, upgraded.text
    _create_project(headers, "Plus project 2")
    _create_project(headers, "Plus project 3")
    blocked_plus = client.post("/api/projects", json={"name": "Plus project 4"}, headers=headers)
    assert blocked_plus.status_code == 403


def test_hard_delete_removes_profile_and_audit_access():
    _, headers = _register(plan="plus")
    pid = _create_project(headers, "Delete me")

    audited = client.post(f"/api/projects/{pid}/audit", headers=headers)
    assert audited.status_code == 200, audited.text
    assert client.get(f"/api/projects/{pid}/last-audit", headers=headers).status_code == 200

    deleted = client.delete(f"/api/projects/{pid}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert client.get(f"/api/projects/{pid}", headers=headers).status_code == 404
    assert client.get(f"/api/projects/{pid}/last-audit", headers=headers).status_code == 404
