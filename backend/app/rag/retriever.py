"""Routing-matrix-constrained hybrid retriever.

Implements the concept's primary anti-hallucination defence (Table 3): each
diagnostic-gap category is HARD-routed to a specific institutional corpus, and
retrieval is filtered to that corpus BEFORE similarity ranking. A
"missing legal form" query can therefore never return a BFPME financing chunk.

Ranking uses Reciprocal Rank Fusion (RRF) over two independent retrievers:
TF-IDF sparse cosine and dense semantic embeddings (when available). This
ensures keyword-exact and semantic matches both contribute to the final ranking.

Pipeline: gap category -> allowed gap_categories filter -> RRF(TF-IDF, dense) -> top-k.
"""
from __future__ import annotations

from dataclasses import dataclass

from .knowledge_base import Chunk, KnowledgeBase, get_kb

# Diagnostic-gap -> allowed corpus categories (Table 3 routing matrix).
ROUTING_MATRIX: dict[str, list[str]] = {
    "missing_legal_form": ["missing_legal_form"],
    "tech_hype": ["tech_hype"],
    "premature_fundraising": ["premature_fundraising"],
    "missing_market_validation": ["missing_market_validation"],
    "scalability": ["tech_hype", "premature_fundraising"],
    "green": ["green"],
    "general": ["general", "missing_market_validation", "missing_legal_form"],
}

# Map classifier gate domains -> gap categories used for routing.
DOMAIN_TO_GAP = {
    "market": "missing_market_validation",
    "legal": "missing_legal_form",
    "financial": "premature_fundraising",
    "technical": "tech_hype",
    "organisational": "premature_fundraising",
}


@dataclass
class RoutedResult:
    gap_category: str
    query: str
    chunks: list[Chunk]
    scores: list[float]

    def to_dict(self) -> dict:
        return {
            "gap_category": self.gap_category,
            "query": self.query,
            "results": [
                {**c.to_dict(), "similarity": round(s, 3), "citation": c.cite()}
                for c, s in zip(self.chunks, self.scores)
            ],
        }


class Retriever:
    def __init__(self, kb: KnowledgeBase | None = None):
        self.kb = kb or get_kb()

    def _filter_candidates(self, gap_category: str) -> list[Chunk]:
        """Apply routing-matrix metadata filter. Falls back to general on empty."""
        allowed = set(ROUTING_MATRIX.get(gap_category, ["general"]))
        candidates = [c for c in self.kb.chunks if allowed & set(c.gap_categories)]
        if not candidates:
            candidates = [c for c in self.kb.chunks if "general" in c.gap_categories]
        return candidates

    def _score_tfidf(self, candidates: list[Chunk], query: str, k: int
                     ) -> list[tuple[Chunk, float]]:
        qvec = self.kb.query_vector(query)
        scored = sorted(
            ((c, self.kb.cosine(qvec, c.vector)) for c in candidates),
            key=lambda x: x[1], reverse=True,
        )[:k]
        return scored

    def _score_dense(self, candidates: list[Chunk], query: str, k: int
                     ) -> list[tuple[Chunk, float]]:
        q_emb = self.kb.query_embedding(query)
        if q_emb is None:
            return []
        candidate_embs = [self.kb._embeddings[self.kb.chunks.index(c)] for c in candidates]
        scored = sorted(
            ((c, self.kb.cosine_dense(q_emb, c_emb))
             for c, c_emb in zip(candidates, candidate_embs)),
            key=lambda x: x[1], reverse=True,
        )[:k]
        return scored

    @staticmethod
    def _rrf_merge(tfidf: list[tuple[Chunk, float]],
                   dense: list[tuple[Chunk, float]],
                   k: int, constant: int = 60) -> list[tuple[Chunk, float]]:
        """Reciprocal Rank Fusion over two ranked lists."""
        scores: dict[str, float] = {}
        chunks_by_id: dict[str, Chunk] = {}
        for rank, (chunk, _) in enumerate(tfidf):
            scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (constant + rank + 1)
            chunks_by_id[chunk.id] = chunk
        for rank, (chunk, _) in enumerate(dense):
            scores[chunk.id] = scores.get(chunk.id, 0) + 1 / (constant + rank + 1)
            chunks_by_id[chunk.id] = chunk
        ranked_ids = sorted(scores, key=scores.get, reverse=True)[:k]
        return [(chunks_by_id[cid], scores[cid]) for cid in ranked_ids]

    def retrieve(self, gap_category: str, query: str, k: int = 5) -> RoutedResult:
        candidates = self._filter_candidates(gap_category)
        tfidf = self._score_tfidf(candidates, query, k * 2)
        dense = self._score_dense(candidates, query, k * 2) if self.kb.has_embeddings() else []
        if dense:
            scored = self._rrf_merge(tfidf, dense, k)
        else:
            scored = tfidf[:k]

        return RoutedResult(
            gap_category=gap_category, query=query,
            chunks=[c for c, _ in scored], scores=[s for _, s in scored],
        )
