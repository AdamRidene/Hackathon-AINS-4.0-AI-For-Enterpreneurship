"""Contextual project memory (persistence).

Two-layer storage:
  • JSON files  (_data/<pid>.json)   — ProjectProfile, unchanged from v1.
  • SQLite DB   (_data/firasa.db)    — Audit results table for instant history
                                       retrieval without re-running the LLM pipeline.

Swap the SQLite layer for Postgres in production — the interface is minimal.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .schema import ProjectProfile

_STORE_DIR = Path(__file__).parent.parent / "_data"
_STORE_DIR.mkdir(exist_ok=True)

_lock  = threading.Lock()
_cache: dict[str, ProjectProfile] = {}

# ── SQLite setup ─────────────────────────────────────────────────────────────

_DB_PATH = _STORE_DIR / "firasa.db"
PLAN_LIMITS = {"free": 1, "plus": 3, "pro": 5}


def _db() -> sqlite3.Connection:
    """Return a thread-local SQLite connection (check_same_thread=False is safe
    here because every write is wrapped in _lock)."""
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                name          TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                plan          TEXT NOT NULL DEFAULT 'free',
                created_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audits (
                pid        TEXT PRIMARY KEY,
                owner_user_id TEXT,
                name       TEXT,
                sector     TEXT,
                stage      INTEGER,
                vector     TEXT,          -- JSON array [M,C,I,S,G]
                audit_json TEXT NOT NULL,
                audited_at TEXT NOT NULL
            )
        """)
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(audits)").fetchall()
        }
        if "owner_user_id" not in columns:
            conn.execute("ALTER TABLE audits ADD COLUMN owner_user_id TEXT")
        conn.commit()


_init_db()


# Auth/session store
def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    candidate = _hash_password(password, salt).split("$", 2)[2]
    return hmac.compare_digest(candidate, expected)


def _user_from_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "plan": row["plan"],
        "created_at": row["created_at"],
    }


def create_user(email: str, password: str, name: str | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": uuid4().hex,
        "email": _normalise_email(email),
        "name": (name or email.split("@")[0]).strip(),
        "plan": "free",
        "created_at": now,
    }
    with _lock:
        with _db() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO users (id, email, name, password_hash, plan, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        user["email"],
                        user["name"],
                        _hash_password(password),
                        user["plan"],
                        user["created_at"],
                    ),
                )
                conn.commit()
            except sqlite3.IntegrityError as exc:
                raise ValueError("Email already registered") from exc
    return user


def authenticate_user(email: str, password: str) -> dict | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (_normalise_email(email),)
        ).fetchone()
    if row is None or not _verify_password(password, row["password_hash"]):
        return None
    return _user_from_row(row)


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with _db() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                (token, user_id, now),
            )
            conn.commit()
    return token


def get_user_by_token(token: str) -> dict | None:
    with _db() as conn:
        row = conn.execute(
            """
            SELECT users.*
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    return _user_from_row(row)


def delete_session(token: str) -> None:
    with _lock:
        with _db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()


def update_user_plan(user_id: str, plan: str) -> dict | None:
    if plan not in PLAN_LIMITS:
        raise ValueError("Unknown plan")
    with _lock:
        with _db() as conn:
            conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row)

# ── JSON-file store (ProjectProfile) ─────────────────────────────────────────

def _path(pid: str) -> Path:
    return _STORE_DIR / f"{pid}.json"


def save(profile: ProjectProfile) -> None:
    with _lock:
        _cache[profile.project_id] = profile
        _path(profile.project_id).write_text(
            profile.model_dump_json(indent=2), encoding="utf-8"
        )


def load(pid: str) -> ProjectProfile | None:
    if pid in _cache:
        return _cache[pid]
    p = _path(pid)
    if not p.exists():
        return None
    profile = ProjectProfile.model_validate_json(p.read_text(encoding="utf-8"))
    _cache[pid] = profile
    return profile


def list_ids() -> list[str]:
    return [p.stem for p in _STORE_DIR.glob("*.json")]


def count_projects_for_owner(owner_user_id: str) -> int:
    return sum(
        1 for pid in list_ids()
        if (profile := load(pid)) and profile.owner_user_id == owner_user_id
    )


def redact(profile: ProjectProfile) -> dict:
    d = profile.model_dump(mode="json")
    if d.get("commercial", {}).get("value_proposition_narrative"):
        d["commercial"]["value_proposition_narrative"] = "[redacted]"
    return d


# ── SQLite store (AuditResult snapshots) ─────────────────────────────────────

def save_audit(
    pid: str,
    owner_user_id: str | None,
    name: str | None,
    sector: str | None,
    stage: int | None,
    vector: list[float] | None,
    audit_dict: dict,
) -> None:
    """Upsert the latest audit result for a project."""
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with _db() as conn:
            conn.execute(
                """
                INSERT INTO audits (pid, owner_user_id, name, sector, stage, vector, audit_json, audited_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pid) DO UPDATE SET
                    owner_user_id = excluded.owner_user_id,
                    name       = excluded.name,
                    sector     = excluded.sector,
                    stage      = excluded.stage,
                    vector     = excluded.vector,
                    audit_json = excluded.audit_json,
                    audited_at = excluded.audited_at
                """,
                (
                    pid,
                    owner_user_id,
                    name,
                    sector,
                    stage,
                    json.dumps(vector) if vector else None,
                    json.dumps(audit_dict),
                    now,
                ),
            )
            conn.commit()


def get_audit(pid: str) -> dict | None:
    """Return the last saved audit result dict, or None if not yet audited."""
    with _db() as conn:
        row = conn.execute(
            "SELECT audit_json FROM audits WHERE pid = ?", (pid,)
        ).fetchone()
    return json.loads(row["audit_json"]) if row else None


def list_audits(owner_user_id: str | None = None) -> list[dict]:
    """Return project summaries, including projects not audited yet."""
    with _db() as conn:
        where = "WHERE owner_user_id = ?" if owner_user_id else ""
        params = (owner_user_id,) if owner_user_id else ()
        rows = conn.execute(
            f"""
            SELECT pid, name, sector, stage, vector, audited_at
            FROM   audits
            {where}
            ORDER  BY audited_at DESC
            """,
            params,
        ).fetchall()
    result = []
    seen = set()
    for r in rows:
        seen.add(r["pid"])
        result.append({
            "project_id": r["pid"],
            "name":       r["name"],
            "sector":     r["sector"],
            "stage":      r["stage"],
            "vector":     json.loads(r["vector"]) if r["vector"] else None,
            "audited_at": r["audited_at"],
        })
    for pid in list_ids():
        if pid in seen:
            continue
        profile = load(pid)
        if profile is None:
            continue
        if owner_user_id and profile.owner_user_id != owner_user_id:
            continue
        result.append({
            "project_id": profile.project_id,
            "name": profile.name,
            "sector": profile.sector.value if profile.sector else None,
            "stage": None,
            "vector": None,
            "audited_at": profile.created_at.isoformat(),
        })
    result.sort(key=lambda row: row.get("audited_at") or "", reverse=True)
    return result


def delete_project(pid: str) -> bool:
    """Delete project profile (JSON) and audit snapshot (SQLite). Returns True if found."""
    found = False
    with _lock:
        p = _path(pid)
        if p.exists():
            p.unlink()
            found = True
        _cache.pop(pid, None)
        with _db() as conn:
            conn.execute("DELETE FROM audits WHERE pid = ?", (pid,))
            conn.commit()
    return found
