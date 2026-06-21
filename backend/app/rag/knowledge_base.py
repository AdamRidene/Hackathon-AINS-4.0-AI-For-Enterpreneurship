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
import threading
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

        # ── Optional embedding-based retrieval (lazy-loaded on first query) ──
        self._embeddings = None   # list[ndarray] parallel to self.chunks
        self._embedder = None
        self._embeddings_loaded = False  # tri-state: False=unattempted, None=failed
        self._embeddings_lock = threading.Lock()

    def _ensure_embeddings(self) -> None:
        """Lazy-load sentence-transformers on first query (avoids ~90MB download at startup)."""
        if self._embeddings_loaded:
            return  # already succeeded
        with self._embeddings_lock:
            if self._embeddings_loaded:
                return
            self._try_load_embeddings()
            if self._embeddings is not None:
                self._embeddings_loaded = True

    def _try_load_embeddings(self) -> None:
        """Load sentence-transformers if available and pre-compute embeddings."""
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            return  # TF-IDF fallback path

        try:
            model = SentenceTransformer("all-MiniLM-L6-v2")
            texts = [c.content for c in self.chunks]
            self._embeddings = model.encode(texts, show_progress_bar=False)
            self._embedder = model
            self.meta["embedding_model"] = "all-MiniLM-L6-v2"
            self.meta["embedding_dim"] = int(self._embeddings[0].shape[0])
        except Exception:
            # Silently fall back to TF-IDF on any embedding error
            self._embeddings = None
            self._embedder = None

    def has_embeddings(self) -> bool:
        self._ensure_embeddings()
        return self._embeddings is not None and self._embedder is not None

    def __len__(self) -> int:
        return len(self.chunks)

    def query_vector(self, text: str) -> Counter:
        vec = Counter()
        for t, f in Counter(_tokenise(text)).items():
            vec[t] = f * self._idf.get(t, 1.0)
        return vec

    def query_embedding(self, text: str):
        """Return a dense embedding vector for semantic search.
        Requires sentence-transformers. Returns None if unavailable.
        """
        self._ensure_embeddings()
        if not self._embeddings or self._embedder is None:
            return None
        import numpy as np
        emb = self._embedder.encode([text], show_progress_bar=False)[0]
        return emb

    @staticmethod
    def cosine(a: Counter, b: Counter) -> float:
        if not a or not b:
            return 0.0
        common = set(a) & set(b)
        dot = sum(a[t] * b[t] for t in common)
        na = math.sqrt(sum(v * v for v in a.values()))
        nb = math.sqrt(sum(v * v for v in b.values()))
        return dot / (na * nb) if na and nb else 0.0

    @staticmethod
    def cosine_dense(a, b) -> float:
        """Cosine similarity between two dense numpy arrays."""
        import numpy as np
        dot = np.dot(a, b)
        na = np.linalg.norm(a)
        nb = np.linalg.norm(b)
        return float(dot / (na * nb)) if na and nb else 0.0


@lru_cache(maxsize=1)
def get_kb() -> KnowledgeBase:
    return KnowledgeBase()
