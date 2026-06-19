"""Contextual project memory (persistence).

Two-layer storage:
  • JSON files  (_data/<pid>.json)   — ProjectProfile, unchanged from v1.
  • SQLite DB   (_data/firasa.db)    — Audit results table for instant history
                                       retrieval without re-running the LLM pipeline.

Swap the SQLite layer for Postgres in production — the interface is minimal.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from .schema import ProjectProfile

_STORE_DIR = Path(__file__).parent.parent / "_data"
_STORE_DIR.mkdir(exist_ok=True)

_lock  = threading.Lock()
_cache: dict[str, ProjectProfile] = {}

# ── SQLite setup ─────────────────────────────────────────────────────────────

_DB_PATH = _STORE_DIR / "firasa.db"


def _db() -> sqlite3.Connection:
    """Return a thread-local SQLite connection (check_same_thread=False is safe
    here because every write is wrapped in _lock)."""
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audits (
                pid        TEXT PRIMARY KEY,
                name       TEXT,
                sector     TEXT,
                stage      INTEGER,
                vector     TEXT,          -- JSON array [M,C,I,S,G]
                audit_json TEXT NOT NULL,
                audited_at TEXT NOT NULL
            )
        """)
        conn.commit()


_init_db()

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


def redact(profile: ProjectProfile) -> dict:
    d = profile.model_dump(mode="json")
    if d.get("commercial", {}).get("value_proposition_narrative"):
        d["commercial"]["value_proposition_narrative"] = "[redacted]"
    return d


# ── SQLite store (AuditResult snapshots) ─────────────────────────────────────

def save_audit(
    pid: str,
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
                INSERT INTO audits (pid, name, sector, stage, vector, audit_json, audited_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pid) DO UPDATE SET
                    name       = excluded.name,
                    sector     = excluded.sector,
                    stage      = excluded.stage,
                    vector     = excluded.vector,
                    audit_json = excluded.audit_json,
                    audited_at = excluded.audited_at
                """,
                (
                    pid,
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


def list_audits() -> list[dict]:
    """Return summary rows for all audits, newest first."""
    with _db() as conn:
        rows = conn.execute(
            """
            SELECT pid, name, sector, stage, vector, audited_at
            FROM   audits
            ORDER  BY audited_at DESC
            """
        ).fetchall()
    result = []
    for r in rows:
        result.append({
            "project_id": r["pid"],
            "name":       r["name"],
            "sector":     r["sector"],
            "stage":      r["stage"],
            "vector":     json.loads(r["vector"]) if r["vector"] else None,
            "audited_at": r["audited_at"],
        })
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
