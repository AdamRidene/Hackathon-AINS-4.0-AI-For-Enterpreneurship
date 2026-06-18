"""Contextual project memory (persistence).

Simple JSON-file-backed store so the project profile persists across sessions
and the diagnosis refines over time as new information is added (Persistent
project context requirement). Swap for Postgres/Redis in production — the
interface is intentionally minimal.

Privacy: only typed, project-level tokens are stored; free-text narratives can
be redacted via redact() before export.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

from .schema import ProjectProfile

_STORE_DIR = Path(__file__).parent.parent / "_data"
_STORE_DIR.mkdir(exist_ok=True)
_lock = threading.Lock()
_cache: dict[str, ProjectProfile] = {}


def _path(pid: str) -> Path:
    return _STORE_DIR / f"{pid}.json"


def save(profile: ProjectProfile) -> None:
    with _lock:
        _cache[profile.project_id] = profile
        _path(profile.project_id).write_text(
            profile.model_dump_json(indent=2), encoding="utf-8")


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
