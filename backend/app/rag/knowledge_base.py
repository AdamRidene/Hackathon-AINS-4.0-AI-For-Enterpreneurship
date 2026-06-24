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
import os
import re
import sys
import threading
import uuid
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from ..config import settings

_EMBED_CACHE = Path(__file__).parent.parent.parent / "_data" / "kb_embeddings_cohere.npy"

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

        # ── Optional embedding-based retrieval (pre-loaded eagerly at init) ──
        self._embeddings = None   # list[ndarray] parallel to self.chunks
        self._embedder = None
        self._embeddings_loaded = False  # tri-state: False=unattempted, None=failed
        self._embeddings_lock = threading.Lock()
        # Pre-load embeddings eagerly so the first query is not penalised by
        # lazy-load latency (~500ms on Cohere / sentence-transformers).
        self._ensure_embeddings()

    def _ensure_embeddings(self) -> None:
        """Pre-load embeddings at init time (or skip gracefully if unavailable)."""
        if self._embeddings_loaded:
            return  # already succeeded
        with self._embeddings_lock:
            if self._embeddings_loaded:
                return
            self._try_load_embeddings()
            if self._embeddings is not None:
                self._embeddings_loaded = True

    def _try_load_embeddings(self) -> None:
        """Load embeddings. Priority: Cohere API > sentence-transformers > TF-IDF."""
        cohere_key = settings.cohere_api_key or os.getenv("COHERE_API_KEY", "")
        if cohere_key:
            self._try_load_cohere(cohere_key)
            if self._embeddings is not None:
                return
        # Fallback: sentence-transformers (local, no API key needed)
        self._try_load_sentence_transformers()

    def _try_load_cohere(self, api_key: str) -> None:
        """Embed all chunks with Cohere embed-multilingual-v3.0 (cached to disk)."""
        try:
            import cohere
            import numpy as np
        except ImportError:
            return

        try:
            kb_mtime = _KB_PATH.stat().st_mtime
            cache_valid = (
                _EMBED_CACHE.exists()
                and _EMBED_CACHE.stat().st_mtime >= kb_mtime
            )
            if cache_valid:
                arr = np.load(str(_EMBED_CACHE), allow_pickle=False)
            else:
                co = cohere.Client(api_key)
                texts = [c.content + " " + c.title for c in self.chunks]
                resp = co.embed(
                    texts=texts,
                    model="embed-multilingual-v3.0",
                    input_type="search_document",
                )
                arr = np.array(resp.embeddings, dtype="float32")
                _EMBED_CACHE.parent.mkdir(parents=True, exist_ok=True)
                np.save(str(_EMBED_CACHE), arr)

            self._embeddings = arr
            self._embedder = ("cohere", api_key)
            self.meta["embedding_model"] = "cohere/embed-multilingual-v3.0"
            self.meta["embedding_dim"] = int(arr.shape[1])
        except Exception:
            self._embeddings = None
            self._embedder = None

    def _try_load_sentence_transformers(self) -> None:
        """Load sentence-transformers if available and pre-compute embeddings."""
        try:
            import logging
            logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)
            logging.getLogger("transformers").setLevel(logging.ERROR)
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
        """Return a dense embedding vector for semantic search."""
        self._ensure_embeddings()
        if self._embeddings is None or self._embedder is None:
            return None
        import numpy as np
        # Cohere embedder is stored as ("cohere", api_key) tuple
        if isinstance(self._embedder, tuple) and self._embedder[0] == "cohere":
            try:
                import cohere
                api_key = self._embedder[1] or settings.cohere_api_key
                co = cohere.Client(api_key)
                resp = co.embed(
                    texts=[text],
                    model="embed-multilingual-v3.0",
                    input_type="search_query",
                )
                return np.array(resp.embeddings[0], dtype="float32")
            except Exception:
                return None
        # sentence-transformers
        return self._embedder.encode([text], show_progress_bar=False)[0]

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
        """Cosine similarity between two dense numpy arrays. Returns 0 if either is None."""
        if a is None or b is None:
            return 0.0
        import numpy as np
        dot = np.dot(a, b)
        na = np.linalg.norm(a)
        nb = np.linalg.norm(b)
        return float(dot / (na * nb)) if na and nb else 0.0


def _lock_file(file_path: Path, exclusive: bool = True):
    """Cross-platform file locking using fcntl (Unix) or msvcrt (Windows)."""
    if sys.platform == "win32":
        import msvcrt
        mode = os.O_RDWR | os.O_CREAT
        lock_file = os.open(str(file_path), mode)
        try:
            if exclusive:
                msvcrt.locking(lock_file, msvcrt.LK_LOCK, 1)
            else:
                msvcrt.locking(lock_file, msvcrt.LK_NBLCK, 1)
            return lock_file
        except Exception:
            os.close(lock_file)
            raise
    else:
        import fcntl
        lock_file = open(str(file_path), "r+" if os.path.exists(str(file_path)) else "w+")
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
            return lock_file
        except Exception:
            lock_file.close()
            raise


def _unlock_file(lock_file):
    """Cross-platform file unlocking."""
    if sys.platform == "win32":
        import msvcrt
        msvcrt.locking(lock_file, msvcrt.LK_UNLCK, 1)
        os.close(lock_file)
    else:
        import fcntl
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


def save_kb(kb: KnowledgeBase, path: Path = _KB_PATH) -> None:
    """Save the KnowledgeBase back to disk as JSON (with file locking)."""
    raw = {
        "_meta": kb.meta,
        "resources": [chunk.to_dict() for chunk in kb.chunks]
    }
    lock_file = _lock_file(path)
    try:
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        _unlock_file(lock_file)
    # Invalidate the cache so next get_kb() call loads fresh
    get_kb.cache_clear()


def add_chunk(chunk_data: dict, path: Path = _KB_PATH) -> KnowledgeBase:
    """Add a new chunk to the knowledge base and save (with file locking and UUIDs)."""
    lock_file = _lock_file(path)
    try:
        # Load current KB
        raw = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"_meta": {}, "resources": []}
        # Generate a unique ID if not provided (using UUID)
        if "id" not in chunk_data or not chunk_data["id"]:
            chunk_data["id"] = f"custom-{uuid.uuid4().hex[:12]}"
        # Add the chunk
        raw["resources"].append(chunk_data)
        # Save back
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        _unlock_file(lock_file)
    # Invalidate cache and return fresh KB
    get_kb.cache_clear()
    return get_kb()


def delete_chunk(chunk_id: str, path: Path = _KB_PATH) -> tuple[bool, KnowledgeBase]:
    """Delete a chunk from the knowledge base and save (with file locking). Returns (success: bool, kb)."""
    lock_file = _lock_file(path)
    found = False
    try:
        # Load current KB
        raw = json.loads(path.read_text(encoding="utf-8"))
        # Check if chunk exists
        found = any(r["id"] == chunk_id for r in raw["resources"])
        # Filter out the chunk
        raw["resources"] = [r for r in raw["resources"] if r["id"] != chunk_id]
        # Save back
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        _unlock_file(lock_file)
    # Invalidate cache and return fresh KB
    get_kb.cache_clear()
    return found, get_kb()


@lru_cache(maxsize=1)
def get_kb() -> KnowledgeBase:
    return KnowledgeBase()
