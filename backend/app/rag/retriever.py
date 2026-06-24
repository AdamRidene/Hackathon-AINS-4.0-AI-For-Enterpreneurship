"""Routing-matrix-constrained retriever.

Implements the concept's primary anti-hallucination defence (Table 3): each
diagnostic-gap category is HARD-routed to a specific institutional corpus, and
retrieval is filtered to that corpus BEFORE similarity ranking. A
"missing legal form" query can therefore never return a BFPME financing chunk.

Pipeline: gap category -> allowed gap_categories filter -> cosine rank -> top-k.
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

    def retrieve(self, gap_category: str, query: str, k: int = 5) -> RoutedResult:
        allowed = set(ROUTING_MATRIX.get(gap_category, ["general"]))
        # Hard metadata filter FIRST (routing matrix), then similarity rank.
        candidates = [c for c in self.kb.chunks if allowed & set(c.gap_categories)]
        if not candidates:
            # Graceful degradation: fall back to general-only chunks when no
            # gap-specific chunks exist. This preserves the routing constraint
            # (never retrieves from a different gap category).
            candidates = [c for c in self.kb.chunks if "general" in c.gap_categories]

        # Use semantic embeddings if available, otherwise TF-IDF.
        # Fall back to TF-IDF if query embedding returns None (Cohere rate-limit).
        q_emb = self.kb.query_embedding(query) if self.kb.has_embeddings() else None
        if q_emb is not None:
            candidate_embs = [self.kb._embeddings[self.kb.chunks.index(c)] for c in candidates]
            scored = sorted(
                ((c, self.kb.cosine_dense(q_emb, c_emb))
                 for c, c_emb in zip(candidates, candidate_embs)),
                key=lambda x: x[1], reverse=True,
            )[:k]
        else:
            qvec = self.kb.query_vector(query)
            scored = sorted(
                ((c, self.kb.cosine(qvec, c.vector)) for c in candidates),
                key=lambda x: x[1], reverse=True,
            )[:k]

        return RoutedResult(
            gap_category=gap_category, query=query,
            chunks=[c for c, _ in scored], scores=[s for _, s in scored],
        )
