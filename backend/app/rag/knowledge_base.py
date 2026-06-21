"""Knowledge base loader + lightweight index.

Loads the curated corpus of real Tunisian ecosystem resources and builds a
per-chunk bag-of-words vector for similarity ranking. We keep the index
dependency-free (no external vector DB) so the prototype runs anywhere, while
exposing the same interface a production vector store would: filter by metadata
(routing matrix), then rank by similarity. Swap `_vectorise`/`similarity` for a
multilingual embedding model + ANN index without touching callers.

When COHERE_API_KEY is set in the environment, CohereKnowledgeBase is returned
by get_kb() and uses embed-multilingual-v3.0 for semantic retrieval with on-disk
caching. Falls back to TF-IDF KnowledgeBase transparently on any failure.
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any
from functools import lru_cache
from pathlib import Path

_KB_PATH = Path(__file__).parent / "data" / "kb.json"
_EMBED_CACHE = Path(__file__).parent.parent.parent / "_data" / "kb_embeddings.npy"
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
_AR_RE = re.compile(r"[؀-ۿ]")


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
    vector: Any  # Counter (TF-IDF) or list[float] (Cohere)
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
                df[t] += 1
        n = len(docs)
        self._idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}
        for r, toks in docs:
            vec = Counter()
            tf = Counter(toks)
            for t, f in tf.items():
                vec[t] = f * self._idf.get(t, 1.0)
            self.chunks.append(Chunk(
                id=r["id"], institution=r["institution"], title=r["title"],
                url=r["url"], language=r["language"],
                gap_categories=r["gap_categories"], stages=r["stages"],
                horizon=r["horizon"], content=r["content"], vector=vec,
                title_ar=r.get("title_ar", ""), content_ar=r.get("content_ar", "")))

    def __len__(self) -> int:
        return len(self.chunks)

    def query_vector(self, text: str) -> Counter:
        vec = Counter()
        for t, f in Counter(_tokenise(text)).items():
            vec[t] = f * self._idf.get(t, 1.0)
        return vec

    def get_chunk_vector(self, i: int) -> Counter:
        """Return the vector for chunk at index i (TF-IDF Counter)."""
        return self.chunks[i].vector

    @staticmethod
    def cosine(a: Counter, b: Counter) -> float:
        if not a or not b:
            return 0.0
        common = set(a) & set(b)
        dot = sum(a[t] * b[t] for t in common)
        na = math.sqrt(sum(v * v for v in a.values()))
        nb = math.sqrt(sum(v * v for v in b.values()))
        return dot / (na * nb) if na and nb else 0.0


class CohereKnowledgeBase(KnowledgeBase):
    """KnowledgeBase backed by Cohere embed-multilingual-v3.0 embeddings.

    Embeddings are cached on disk at _EMBED_CACHE so the Cohere API is only
    called once (or when kb.json changes). Falls back to TF-IDF via the parent
    class at construction time if the API call fails.
    """

    def __init__(self, path: Path = _KB_PATH):
        # Build chunks and TF-IDF vectors via parent (still used as metadata).
        super().__init__(path)

        import cohere  # noqa: PLC0415 — lazy import keeps startup fast when unused
        import numpy as np  # noqa: PLC0415

        api_key = os.environ["COHERE_API_KEY"]
        self._co = cohere.Client(api_key)

        # Check cache validity: cache exists AND kb.json hasn't changed since it.
        kb_mtime = path.stat().st_mtime
        cache_valid = (
            _EMBED_CACHE.exists()
            and _EMBED_CACHE.stat().st_mtime >= kb_mtime
        )

        if cache_valid:
            self._embeddings: list[list[float]] = np.load(
                str(_EMBED_CACHE), allow_pickle=False
            ).tolist()
        else:
            texts = [c.content + " " + c.title for c in self.chunks]
            response = self._co.embed(
                texts=texts,
                model="embed-multilingual-v3.0",
                input_type="search_document",
            )
            self._embeddings = response.embeddings  # list[list[float]]
            # Persist to disk for future runs.
            _EMBED_CACHE.parent.mkdir(parents=True, exist_ok=True)
            np.save(str(_EMBED_CACHE), np.array(self._embeddings, dtype="float32"))

        # Replace TF-IDF Counter vectors with Cohere float embeddings so that
        # Retriever.retrieve can access c.vector directly on any Chunk.
        for i, chunk in enumerate(self.chunks):
            chunk.vector = self._embeddings[i]

    # ------------------------------------------------------------------
    # Public interface — overrides parent methods
    # ------------------------------------------------------------------

    def query_vector(self, text: str) -> list[float]:  # type: ignore[override]
        """Embed a query string using Cohere search_query input type."""
        response = self._co.embed(
            texts=[text],
            model="embed-multilingual-v3.0",
            input_type="search_query",
        )
        return response.embeddings[0]

    def get_chunk_vector(self, i: int) -> list[float]:  # type: ignore[override]
        """Return the Cohere embedding for chunk at index i."""
        return self._embeddings[i]

    @staticmethod
    def cosine(a: list[float], b: list[float]) -> float:  # type: ignore[override]
        """Cosine similarity between two float embedding vectors."""
        import numpy as np  # noqa: PLC0415

        a_arr = np.array(a, dtype="float32")
        b_arr = np.array(b, dtype="float32")
        norm_a = np.linalg.norm(a_arr)
        norm_b = np.linalg.norm(b_arr)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


@lru_cache(maxsize=1)
def get_kb() -> KnowledgeBase:
    if os.getenv("COHERE_API_KEY"):
        try:
            return CohereKnowledgeBase()
        except Exception:
            pass  # fall back to TF-IDF if Cohere fails
    return KnowledgeBase()
