"""Tests for Supabase auth integration and config discovery."""
import os

import pytest
from fastapi.testclient import TestClient

# Force local auth mode + stub LLM for deterministic test runs.
os.environ["FIRASA_AUTH_MODE"] = "local"
os.environ["FIRASA_LLM_PROVIDER"] = "stub"
os.environ["FIRASA_DEBUG"] = "true"

from app.main import app  # noqa: E402

client = TestClient(app)


class TestAuthConfigEndpoint:
    """GET /api/auth/config returns the active auth mode."""

    def test_config_returns_local_in_dev(self):
        os.environ["FIRASA_AUTH_MODE"] = "local"
        resp = client.get("/api/auth/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["auth_mode"] == "local"
        assert data["supabase_url"] is None
        assert data["supabase_anon_key"] is None

    def test_config_returns_supabase_when_configured(self):
        from app.config import settings
        settings.auth_mode = "supabase"
        settings.supabase_url = "https://test.supabase.co"
        resp = client.get("/api/auth/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["auth_mode"] == "supabase"
        assert data["supabase_url"] == "https://test.supabase.co"
        # Reset
        settings.auth_mode = "local"
        settings.supabase_url = ""


class TestAuthModeGating:
    """In Supabase mode, local-auth endpoints return 404."""

    def test_register_blocked_in_supabase_mode(self):
        from app.config import settings
        settings.auth_mode = "supabase"
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com", "password": "test1234"
        })
        assert resp.status_code == 404
        assert "Supabase" in resp.json()["detail"]
        settings.auth_mode = "local"

    def test_login_blocked_in_supabase_mode(self):
        from app.config import settings
        settings.auth_mode = "supabase"
        resp = client.post("/api/auth/login", json={
            "email": "test@example.com", "password": "test1234"
        })
        assert resp.status_code == 404
        assert "Supabase" in resp.json()["detail"]
        settings.auth_mode = "local"

    def test_register_works_in_local_mode(self):
        os.environ["FIRASA_AUTH_MODE"] = "local"
        import secrets
        unique = secrets.token_hex(4)
        resp = client.post("/api/auth/register", json={
            "email": f"test-{unique}@example.com",
            "password": "testpass123",
            "name": "Test User",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == f"test-{unique}@example.com"

    def test_login_with_invalid_credentials(self):
        os.environ["FIRASA_AUTH_MODE"] = "local"
        resp = client.post("/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401


class TestEmailValidation:
    """AuthBody validates email format and password length."""

    def test_rejects_invalid_email(self):
        resp = client.post("/api/auth/register", json={
            "email": "not-an-email", "password": "test1234"
        })
        assert resp.status_code == 422

    def test_rejects_short_password(self):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com", "password": "12345"
        })
        assert resp.status_code == 422

    def test_accepts_valid_credentials(self):
        import secrets
        unique = secrets.token_hex(4)
        resp = client.post("/api/auth/register", json={
            "email": f"valid-{unique}@example.com",
            "password": "securepass123",
            "name": "Valid User",
        })
        assert resp.status_code == 200


class TestHealthEndpoint:
    """GET /api/health now includes auth_mode."""

    def test_health_includes_auth_mode(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "auth_mode" in data
        assert "llm_provider" in data
        assert "llm_model" in data
        assert "llm_provider_env" in data
        assert "llm_configured" in data
        assert "cohere_embedding_model" in data
