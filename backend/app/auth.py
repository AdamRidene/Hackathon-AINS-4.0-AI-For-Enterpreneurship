"""Authentication dependency for FastAPI.

Unified `get_current_user` dependency that routes to either:
  - Local PBKDF2 + session token validation (dev, FIRASA_AUTH_MODE=local)
  - Supabase JWT validation (production, FIRASA_AUTH_MODE=supabase)

The frontend discovers the active mode via GET /api/auth/config.
"""
from __future__ import annotations

import base64
import os
import re
import time
from typing import Optional

from fastapi import Header, HTTPException
from jose import jwt, JWTError, jwk
from jose.exceptions import ExpiredSignatureError

from .config import settings
from . import store


# ── JWKS cache ─────────────────────────────────────────────────────────────────

_jwks_cache: dict = {"keys": [], "expires_at": 0.0}


def _fetch_jwks() -> list[dict]:
    """Fetch the JWKS (JSON Web Key Set) from Supabase's public endpoint.

    Supabase Cloud now defaults to ES256 (ECDSA) for signing JWTs instead of
    the older HS256 (HMAC).  The public keys are published at:
      https://<project>.supabase.co/auth/v1/.well-known/jwks.json
    """
    now = time.time()
    if _jwks_cache["keys"] and now < _jwks_cache["expires_at"]:
        return _jwks_cache["keys"]

    supabase_url = settings.supabase_url
    if not supabase_url:
        return []

    import httpx

    try:
        resp = httpx.get(
            f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json",
            timeout=5,
        )
        if resp.status_code == 200:
            keys = resp.json().get("keys", [])
            _jwks_cache["keys"] = keys
            _jwks_cache["expires_at"] = now + 3600  # cache 1 hour
            return keys
    except Exception as exc:
        print(f"DEBUG: Failed to fetch Supabase JWKS: {exc}")

    return _jwks_cache["keys"]  # return stale cache on error


# ── Supabase JWT validation ────────────────────────────────────────────────────


def _get_auth_mode() -> str:
    """Read auth mode from settings."""
    return settings.auth_mode


_HMAC_ALGS = ("HS256", "HS384", "HS512")


def _validate_supabase_jwt(token: str) -> dict:
    """Validate a Supabase-issued JWT and return the decoded payload.

    Tries multiple strategies in order:
      1. Symmetric HMAC with the raw JWT secret string (older Supabase projects).
      2. Symmetric HMAC with base64-decoded JWT secret bytes.
      3. Asymmetric verification via JWKS (Supabase Cloud ES256 default).
    """
    jwt_secret = settings.supabase_jwt_secret

    # ── Strategy 1 & 2: symmetric HMAC ──
    if jwt_secret:
        secrets_to_try = [jwt_secret]
        try:
            secrets_to_try.append(base64.b64decode(jwt_secret))
        except Exception:
            pass

        for key in secrets_to_try:
            for alg in _HMAC_ALGS:
                try:
                    payload = jwt.decode(
                        token,
                        key,
                        algorithms=[alg],
                        options={"verify_aud": False},
                    )
                    print(f"DEBUG: JWT validated with HMAC-{alg}")
                    return payload
                except (ExpiredSignatureError, JWTError):
                    continue

    # ── Strategy 3: asymmetric via JWKS (ES256 / RS256 / …) ──
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        alg = header.get("alg", "")
        print(f"DEBUG: JWT header alg={alg} kid={kid}")

        if kid and alg.startswith(("ES", "RS")):
            keys = _fetch_jwks()
            for key_data in keys:
                if key_data.get("kid") == kid:
                    constructed = jwk.construct(key_data)
                    payload = jwt.decode(
                        token,
                        constructed,
                        algorithms=[alg],
                        options={"verify_aud": False},
                    )
                    print(f"DEBUG: JWT validated with JWKS {alg}")
                    return payload
    except ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Please sign in again.")
    except JWTError as e:
        raise HTTPException(401, f"Invalid authentication token: {str(e)}")
    except Exception as exc:
        print(f"DEBUG: JWKS verification error: {exc}")

    # ── No method worked ──
    try:
        hdr = jwt.get_unverified_header(token)
        print(f"DEBUG: JWT validation exhausted. Header alg={hdr.get('alg')} kid={hdr.get('kid')}")
    except Exception:
        pass

    raise HTTPException(
        401,
        "Invalid authentication token. The JWT signing algorithm may have changed "
        "(Supabase Cloud recently switched to ES256). "
        "Ensure FIRASA_SUPABASE_JWT_SECRET is correct, or if using the new ES256 "
        "default the backend will auto-fetch public keys via JWKS.",
    )


def _get_or_create_supabase_user(payload: dict) -> dict:
    """Ensure a local user row exists for this Supabase identity.

    The Supabase user UUID is stored in the `users.id` column so that
    foreign keys (projects.owner_user_id, audits.owner_user_id) work
    without schema changes.
    """
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, "Invalid token: missing 'sub' claim")

    email = payload.get("email", "")
    metadata = payload.get("user_metadata", {}) or {}
    name = (
        metadata.get("full_name")
        or metadata.get("name")
        or email.split("@")[0]
    )
    photo = (
        metadata.get("avatar_url")
        or metadata.get("picture")
        or payload.get("picture")
        or None
    )

    user = store.get_or_create_supabase_user(
        sub=sub, email=email, name=name, photo=photo,
    )
    return user


async def _supabase_user(authorization: str | None) -> dict:
    """Extract and validate a Supabase JWT, returning the local user dict."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    token = authorization.split(" ", 1)[1].strip()
    payload = _validate_supabase_jwt(token)
    return _get_or_create_supabase_user(payload)


# ── Local session-token validation ─────────────────────────────────────────────

async def _local_user(authorization: str | None) -> dict:
    """Validate a Firasa session token (custom PBKDF2 auth, dev mode)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    token = authorization.split(" ", 1)[1].strip()
    user = store.get_user_by_token(token)
    if user is None:
        raise HTTPException(401, "Invalid or expired session")
    return user


# ── No-auth bypass (local testing only) ─────────────────────────────────────────

_MOCK_USER = {
    "id": "dev-user-001",
    "email": "dev@firasa.local",
    "name": "Dev Entrepreneur",
    "plan": "pro",
    "created_at": "2025-01-01T00:00:00+00:00",
    "bio": None,
    "phone": None,
    "role": None,
    "company": None,
    "photo": None,
    "birth_date": None,
    "location": None,
}


async def _none_user(_authorization: str | None) -> dict:
    """Bypass auth entirely — return a mock developer user."""
    # Ensure the mock user exists in the DB (idempotent)
    import secrets

    try:
        user = store.get_user_by_id(_MOCK_USER["id"])
        if user is None:
            user = store.create_user(
                email=_MOCK_USER["email"],
                password=secrets.token_urlsafe(16),
                name=_MOCK_USER["name"],
                user_id=_MOCK_USER["id"],
            )
        return user
    except Exception:
        return dict(_MOCK_USER)


# ── Public interface ───────────────────────────────────────────────────────────

async def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    """FastAPI dependency: returns the authenticated user dict.

    Routes based on FIRASA_AUTH_MODE:
      - "local"     → PBKDF2 + session tokens
      - "supabase"  → Supabase JWT validation
      - "none"      → bypass, returns a mock dev user (testing only)
    """
    mode = _get_auth_mode()
    if mode == "supabase":
        return await _supabase_user(authorization)
    if mode == "none":
        return await _none_user(authorization)
    return await _local_user(authorization)


def extract_token(authorization: str | None) -> str:
    """Extract the raw Bearer token from the Authorization header.

    Used by the /api/auth/logout endpoint which needs the raw session token.
    Only functional in local auth mode.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    return authorization.split(" ", 1)[1].strip()
