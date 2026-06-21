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
        json={
            "email": email,
            "password": "secret123",
            "name": "Test User",
            "birth_date": "1994-03-12",
            "location": "Tunis, Tunisia",
            "phone": "+216 99 888 777",
            "role": "Founder",
        },
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


def test_profile_update():
    _, headers = _register()

    profile_data = {
        "name": "Updated Name",
        "bio": "Expert startuper",
        "phone": "+216 99 888 777",
        "role": "Chief Executive Officer",
        "company": "DeepTech Tunisia",
        "photo": "🚀",
        "birth_date": "1993-05-01",
        "location": "Sfax, Tunisia",
    }

    res = client.patch("/api/me/profile", json=profile_data, headers=headers)
    assert res.status_code == 200, res.text
    user = res.json()["user"]
    assert user["name"] == "Updated Name"
    assert user["bio"] == "Expert startuper"
    assert user["phone"] == "+216 99 888 777"
    assert user["role"] == "Chief Executive Officer"
    assert user["company"] == "DeepTech Tunisia"
    assert user["photo"] == "🚀"
    assert user["birth_date"] == "1993-05-01"
    assert user["location"] == "Sfax, Tunisia"

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    user_me = me.json()["user"]
    assert user_me["name"] == "Updated Name"
    assert user_me["bio"] == "Expert startuper"
    assert user_me["phone"] == "+216 99 888 777"
    assert user_me["role"] == "Chief Executive Officer"
    assert user_me["company"] == "DeepTech Tunisia"
    assert user_me["photo"] == "🚀"
    assert user_me["birth_date"] == "1993-05-01"
    assert user_me["location"] == "Sfax, Tunisia"


def test_project_patch_validation():
    _, headers = _register()
    pid = _create_project(headers, "Validation Test Project")

    # Positive case: valid update
    patch_res = client.patch(f"/api/projects/{pid}", json={
        "team_size": 5,
        "monthly_revenue_tnd": 1500.50,
        "growth_rate_pct": -10.5
    }, headers=headers)
    assert patch_res.status_code == 200, patch_res.text
    assert patch_res.json()["team_size"] == 5
    assert patch_res.json()["monthly_revenue_tnd"] == 1500.50
    assert patch_res.json()["growth_rate_pct"] == -10.5

    # Negative case: invalid team_size
    bad_res = client.patch(f"/api/projects/{pid}", json={
        "team_size": -5
    }, headers=headers)
    assert bad_res.status_code == 422

    # Negative case: invalid revenue
    bad_res2 = client.patch(f"/api/projects/{pid}", json={
        "monthly_revenue_tnd": -100.0
    }, headers=headers)
    assert bad_res2.status_code == 422

    # Negative case: invalid growth rate (below -100%)
    bad_res3 = client.patch(f"/api/projects/{pid}", json={
        "growth_rate_pct": -150.0
    }, headers=headers)
    assert bad_res3.status_code == 422

