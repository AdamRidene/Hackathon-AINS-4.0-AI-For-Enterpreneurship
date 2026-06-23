"""Simple in-memory cache for duplicate answer detection with TTL.
Uses a dictionary mapping a hashable key to (answer, timestamp).
TTL is configurable via settings.DUPLICATE_ANSWER_TTL.
"""
import time
from typing import Any, Tuple

from .config import settings

# internal cache
_cache: dict[Any, Tuple[str, float]] = {}

def _now() -> float:
    return time.time()

def make_key(question: str, project_id: str, lang: str) -> Any:
    """Create a cache key from question, project id and language."""
    return (question.strip(), project_id, lang)

def should_serve_cached(key: Any) -> bool:
    """Return True if a cached answer exists and is still within TTL."""
    entry = _cache.get(key)
    if not entry:
        return False
    _, ts = entry
    return (_now() - ts) < settings.DUPLICATE_ANSWER_TTL

def get_cached(key: Any) -> str:
    """Retrieve cached answer; caller should ensure should_serve_cached is True."""
    answer, _ = _cache[key]
    return answer

def store_response(key: Any, answer: str) -> None:
    """Store answer with current timestamp."""
    _cache[key] = (answer, _now())

def clear_cache() -> None:
    """Clear all cached entries (useful for tests)."""
    _cache.clear()
