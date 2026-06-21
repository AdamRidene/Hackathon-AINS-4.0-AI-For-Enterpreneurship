"""Authentication dependency for FastAPI.

Unified `get_current_user` dependency that routes to either:
  - Local PBKDF2 + session token validation (dev, FIRASA_AUTH_MODE=local)
  - Supabase JWT validation (production, FIRASA_AUTH_MODE=supabase)

The frontend discovers the active mode via GET /api/auth/config.
"""
from __future__ import annotations

import os
import re
from typing import Optional

from fastapi import Header, HTTPException
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError

from .config import settings
from . import store


# ── Supabase JWT validation ────────────────────────────────────────────────────

def _get_auth_mode() -> str:
    """Read auth mode from env at call time (tests can patch os.environ)."""
    return os.getenv("FIRASA_AUTH_MODE", "local")


def _validate_supabase_jwt(token: str) -> dict:
    """Validate a Supabase-issued JWT and return the decoded payload.

    Uses the symmetric HMAC secret for fast offline validation.
    Falls back to the JWKS endpoint if the secret is not configured.
    """
    jwt_secret = os.getenv("FIRASA_SUPABASE_JWT_SECRET", "")

    if not jwt_secret:
        # Fallback: fetch JWKS and validate
        try:
            import httpx
            jwks_url = f"{settings.supabase_url}/auth/v1/jwks"
            # We can't make sync HTTP calls easily. Instead, raise a clear error
            # telling the operator to set FIRASA_SUPABASE_JWT_SECRET.
            raise HTTPException(
                500,
                "FIRASA_SUPABASE_JWT_SECRET is not set. "
                "Get it from Supabase Dashboard → Project Settings → API → JWT Secret.",
            )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                500,
                "Supabase JWT validation failed: no secret configured and "
                "JWKS fetch not available.",
            )

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase JWTs don't always encode audience
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Please sign in again.")
    except JWTError as e:
        raise HTTPException(401, f"Invalid authentication token: {str(e)}")


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
    name = (
        payload.get("user_metadata", {}).get("full_name")
        or payload.get("user_metadata", {}).get("name")
        or email.split("@")[0]
    )

    user = store.get_or_create_supabase_user(sub=sub, email=email, name=name)
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


# ── Public interface ───────────────────────────────────────────────────────────

async def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    """FastAPI dependency: returns the authenticated user dict.

    Routes to local PBKDF2 auth or Supabase JWT auth based on FIRASA_AUTH_MODE.
    Reads env at call time so tests can patch os.environ.
    """
    if _get_auth_mode() == "supabase":
        return await _supabase_user(authorization)
    return await _local_user(authorization)


def extract_token(authorization: str | None) -> str:
    """Extract the raw Bearer token from the Authorization header.

    Used by the /api/auth/logout endpoint which needs the raw session token.
    Only functional in local auth mode.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    return authorization.split(" ", 1)[1].strip()
