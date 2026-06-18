"""Knowledge base loader + lightweight index.

Loads the curated corpus of real Tunisian ecosystem resources and builds a
per-chunk bag-of-words vector for similarity ranking. We keep the index
dependency-free (no external vector DB) so the prototype runs anywhere, while
exposing the same interface a production vector store would: filter by metadata
(routing matrix), then rank by similarity. Swap `_vectorise`/`similarity` for a
multilingual embedding model + ANN index without touching callers.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_KB_PATH = Path(__file__).parent / "data" / "kb.json"
_FR_STOP = {
    "de", "la", "le", "les", "des", "et", "un", "une", "du", "en", "à", "au",
    "aux", "pour", "par", "sur", "dans", "avec", "ou", "qui", "que", "se",
    "sa", "son", "ses", "the", "of", "and", "a", "l", "d",
}
# Arabic function words. Stripped so cosine ranking keys on content, not glue.
_AR_STOP = {
    "في", "من", "على", "إلى", "عن", "مع", "أو", "و", "أن", "التي", "الذي",
    "هذا", "هذه", "ذلك", "هو", "هي", "كان", "قد", "ما", "لا", "إن", "بين",
    "عبر", "نحو", "كل", "غير", "حسب",
}
_STOP = _FR_STOP | _AR_STOP

# \w under Python's Unicode-default regex already matches Arabic letters, so a
# single tokeniser handles both scripts. The len>2 guard is kept for Latin only;
# Arabic stems are dense, so 2-char Arabic tokens are retained.
_AR_RE = re.compile(r"[\u0600-\u06ff]")


def _tokenise(text: str) -> list[str]:
    out = []
    for t in re.findall(r"\w+", text.lower()):
        if t in _STOP:
            continue
        if _AR_RE.search(t):
            if len(t) >= 2:
                out.append(t)
        elif len(t) > 2:
            out.append(t)
    return out


@dataclass
class Chunk:
    id: str
    institution: str
    title: str
    url: str
    language: str
    gap_categories: list[str]
    stages: list[int]
    horizon: str
    content: str
    vector: Counter
    title_ar: str = ""
    content_ar: str = ""

    def cite(self) -> str:
        return f"[{self.institution}] {self.title} ({self.url})"

    def to_dict(self) -> dict:
        return {"id": self.id, "institution": self.institution, "title": self.title,
                "url": self.url, "language": self.language,
                "gap_categories": self.gap_categories, "stages": self.stages,
                "horizon": self.horizon, "content": self.content,
                "title_ar": self.title_ar, "content_ar": self.content_ar}


class KnowledgeBase:
    def __init__(self, path: Path = _KB_PATH):
        raw = json.loads(path.read_text(encoding="utf-8"))
        self.meta = raw.get("_meta", {})
        self.chunks: list[Chunk] = []
        # Document frequency for IDF weighting.
        df: Counter = Counter()
        docs: list[tuple[dict, list[str]]] = []
        for r in raw["resources"]:
            # Arabic title/content (when present) are folded into the same vector
            # so a query in either language ranks against one bilingual index.
            bilingual = " ".join([
                r["title"], r["content"], r["institution"],
                r.get("title_ar", ""), r.get("content_ar", ""),
            ])
            toks = _tokenise(bilingual)
            docs.append((r, toks))
            for t in set(toks):
     