"""Compatibility package that exposes the backend application modules.

This keeps `import app...` working when the test runner starts from the repo
root instead of `backend/`.
"""
from __future__ import annotations

from pathlib import Path

_backend_app = Path(__file__).resolve().parent.parent / "backend" / "app"
if _backend_app.is_dir():
    __path__.append(str(_backend_app))  # type: ignore[name-defined]
