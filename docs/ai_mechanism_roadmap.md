# AI Mechanism Roadmap

Prioritised improvements for the RAG pipeline, assistant, diagnostic, and scoring engine. Ordered by estimated impact-effort ratio.

## Spec Coverage Audit

| Spec Requirement | Priority | Status | Roadmap Item |
|---|---|---|---|
| Adaptive intake branches for 3+ profiles | Must | Implemented | — |
| Classification traceable to data points | Must | Implemented | — |
| Gap detection (3+ divergence cases) | Must | Implemented | — |
| End-to-end demo | Must | Implemented | — |
| Blocker identification ranked by stage | Should | Implemented | — |
| Handles ambiguity gracefully | Should | Partial | 5.3 |
| Persistent project context | Should | Implemented | — |
| Evaluation protocol (classification metric) | Should | Implemented | — |
| Five composite scores | Must | Implemented | — |
| Sub-scores with visible contributions | Must | Implemented | — |
| Criteria weights documented | Must | Implemented (SCORING_METHODOLOGY.md) | — |
| Natural-language justification | Must | Implemented | — |
| Anomaly detection (2+ cases flagged) | Should | Implemented | 4.3 |
| **Improvement guidance is specific** | **Should** | **Partial** | **2.4** |
| Score evolution tracked | Should | Implemented | — |
| Evaluation protocol (scoring consistency) | Should | Implemented | — |
| Knowledge base: 30+ real resources | Must | Implemented (42) | — |
| Retrieval traceable to source | Must | Implemented | — |
| Roadmap personalised | Must | Implemented | — |
| Cross-module coherence | Must | Implemented | — |
| Dashboard functional | Must | Implemented | — |
| Mon Parcours view exists | Should | Implemented | — |
| Assistant grounded | Should | Implemented | — |
| Evaluation protocol (RAG/roadmap metric) | Should | Implemented (Precision@5) | 1.3, 2.5 |
| KB is updatable | Could | Implemented | — |

## Phase 1 — Quick Wins (high impact, low effort)

### 1.1 Routing matrix fallback

Some gap categories map only to themselves (e.g. `missing_legal_form`). If no chunk has that exact tag, retrieval returns empty, and the roadmap produces a milestone with zero sources.

**Change:** Append `"general"` as a fallback entry in every gap category's routing list. The retriever degrades gracefully instead of returning nothing.

**File:** `backend/app/rag/retriever.py` — `ROUTING_MATRIX`

### 1.2 Embedding pre-computation

TF-IDF vectors are recomputed at first retrieval call. Dense embeddings load lazily at first use. This adds ~500ms latency to the first audit.

**Change:** Pre-compute TF-IDF vectors at `KnowledgeBase.__init__` and pre-load dense embeddings if available. Move the work to startup so the first audit is as fast as subsequent ones.

**File:** `backend/app/rag/knowledge_base.py`

### 1.3 RAG evaluation — add recall metrics

Current eval reports Precision@5 using institution-level relevance (coarse). Missing recall, MRR, NDCG.

**Change:** Add Recall@5, MRR (Mean Reciprocal Rank), and NDCG (Normalised Discounted Cumulative Gain) to `eval_rag()`. Use chunk-level relevance labels.

**File:** `backend/app/eval_protocol.py`

---

## Phase 2 — Core Retrieval Upgrades (medium effort, high impact)

### 2.1 Hybrid retrieval with Reciprocal Rank Fusion

Current: TF-IDF **or** dense embeddings (one or the other, never both). TF-IDF misses semantic matches; dense misses keyword-exact hits.

**Change:** Run both retrievers and merge results via RRF:

```python
def hybrid_retrieve(self, gap, query, k=5, alpha=0.5):
    tfidf_results = self._retrieve_tfidf(gap, query, k*2)
    dense_results = self._retrieve_dense(gap, query, k*2) if self.kb.has_embeddings() else []
    # RRF merge
    combined = {}
    for rank, chunk in enumerate(tfidf_results):
        combined[chunk.id] = combined.get(chunk.id, 0) + 1 / (60 + rank + 1)
    for rank, chunk in enumerate(dense_results):
        combined[chunk.id] = combined.get(chunk.id, 0) + 1 / (60 + rank + 1)
    ranked = sorted(combined, key=combined.get, reverse=True)[:k]
    return [all_chunks_by_id[cid] for cid in ranked]
```

**File:** `backend/app/rag/retriever.py` — new method on `Retriever`

### 2.2 Query reformulation before retrieval

Current: Raw gap labels and truncated KB content used as queries (e.g. `"missing_market_validation: ..."`). The retriever's input is noisy and underspecified.

**Change:** Lightweight LLM call to reformulate the trigger context into a natural-language search query. This runs before retrieval and improves match quality:

```
Input:  gap="missing_market_validation", rationale="Aucune preuve de validation client"
Output: "programmes d'accompagnement pour la validation client et les études de marché en Tunisie"
```

**File:** `backend/app/rag/roadmap.py` — before `retriever.retrieve()` calls

### 2.4 Per-score improvement guidance

**Spec ref:** Feature 2 — "Highest-leverage gap per score identified with a concrete suggested action" (Should)

Current: The roadmap triggers on low scores but does not isolate the *single highest-leverage criterion* per dimension or generate a concrete remedial action for it. The entrepreneur sees "Market score is low" but not "Your market score would improve most by providing customer validation evidence — here is a template survey".

**Change:** Add a `highest_leverage_gap(dimension)` function that:
1. Identifies the criterion within a dimension whose weight x (max - raw) product is largest
2. Generates a human-readable action sentence using the criterion's improvement template (e.g. `customer_validation_evidence → "Conduct 15+ structured customer interviews and document findings"`)
3. Returns this as a new field `improvement_actions` per dimension in the audit result

**File:** `backend/app/scoring/` (new function) + `backend/app/orchestrator.py` (include in audit output)

### 2.5 Roadmap coherence evaluation metric

**Spec ref:** Feature 3 — "Retrieval relevance or roadmap coherence metric reported on a test set" (Should)

Current: Only RAG Precision@5 is measured. There is no metric for whether the assembled roadmap is coherent (logical ordering, non-contradictory milestones, correct time horizons).

**Change:** Add a `eval_roadmap_coherence()` function that checks, for each generated roadmap:
- All milestones have at least one source with a valid URL
- Milestone order is strictly increasing
- No duplicate milestone titles within the same project
- Horizon tags match the estimated timeline (immediate: <=2 weeks, short-term: 2-8 weeks, medium-term: 8+ weeks)
- At least one milestone references each triggered gap category
Report pass/fail per check across a test set of seed scenarios.

**File:** `backend/app/eval_protocol.py`

### 2.6 Cross-lingual retrieval

Current: French queries search French chunks, Arabic queries search Arabic chunks. A Tunisian entrepreneur using Arabic terms misses relevant French resources.

**Change:** Use Cohere `embed-multilingual-v3.0` (already available) for cross-lingual dense retrieval. An Arabic query retrieves relevant French resources and vice versa.

**File:** `backend/app/rag/retriever.py` + `knowledge_base.py`

---

## Phase 3 — Assistant Intelligence (medium effort, medium impact)

### 3.1 Handling ambiguity and uncertainty surfacing

**Spec ref:** Feature 1 — "Incomplete profiles are handled gracefully; uncertainty is surfaced rather than hidden" (Should)

Current: The system shows a confidence score and allows partial intake audits, but does not explicitly flag *which dimensions* are unreliable due to missing data, or suggest what specific answers would reduce uncertainty most.

**Change:** Add an `uncertainty_report` field to the audit result:
- Per dimension: list of missing inputs that materially affect score reliability
- Per gate: list of unanswered evidence questions that would change classification
- A ranked "quickest confidence gain" suggestion (which single question to answer next to maximise classification confidence increase per input)
Surface this in the UI as a visual indicator next to each low-confidence score.

**File:** `backend/app/diagnostic/classifier.py` (uncertainty per gate) + `backend/app/scoring/` (missing inputs per dimension) + `backend/app/orchestrator.py` (assemble report)

### 3.3 Embedding-based intent classification for tool planning

Current: Keyword matching (`"market" → get_scores`, `"apii" → retrieve_kb`). Brittle — "what support exists for market research?" misses all keywords and falls back to a default tool set.

**Change:** Replace keyword planner with a lightweight embedding + k-NN classifier (or a tiny LLM call) that maps the user's question to one of 7 intents (greeting, classifier, scores, gap, kb, roadmap, documents). Train on synthetic Q/A pairs.

**File:** `backend/app/orchestrator.py` — `_plan_assistant_tools`

### 3.4 Persistent conversation memory

Current: `_conversation_memory` is an in-memory dict. Lost on server restart or process scaling. Each new request starts with an empty context.

**Change:** Store conversation turns in the project's persistence store alongside audit snapshots. Use a TTL expiry (e.g. 24h). The assistant context window becomes durable across sessions.

**File:** `backend/app/orchestrator.py` + `backend/app/store.py`

---

## Phase 4 — Feedback & Anomaly Robustness (medium effort, medium impact)

### 4.1 Expand anomaly detection rules

Current: 8 deterministic rules + 3 compound rules. Some edge cases are not caught:
- A founder claiming both "pre-seed funding raised" and "no legal structure" (fundraising stage without structuration)
- Seasonal/recurring revenue claimed as MRR without justification
- "Multiple competitors" listed but no differentiation strategy
- High innovation score from self-report only (no IP, no pilots, no technical detail)

**Change:** Add 4 new deterministic anomaly rules covering the above cases. Each gets a clean `Anomaly` object with source, confidence, and dimension notes. Update the test set to cover the new rules.

**File:** `backend/app/diagnostic/gap.py` — `detect_anomalies()`

### 4.2 Recommendation click tracking

Current: No feedback loop. The system does not know whether a recommended resource was useful or even seen by the user.

**Change:** Log front-end click-through on resource links and milestone check-offs. Store aggregate stats per gap category. Use this data to:
- Rank resources by usefulness within each gap category
- Surface underperforming resources for KB curation

**Files:** `frontend/` (analytics events) + `backend/` (aggregation endpoint)

### 4.2 Milestone outcome tracking

Current: Milestone completion triggers a re-audit but does not track whether the recommendation was effective.

**Change:** When a milestone is completed, record which resources were associated with it. After N completions, surface a "resolution rate" per resource/gap pair. Low-resolution resources can be replaced or improved.

**File:** `backend/app/orchestrator.py` — milestone completion handler

---

## Phase 5 — Maintenance & Quality (ongoing)

### 5.1 KB URL health checks

Current: No automated check. Resource URLs can go stale (404, redirect, domain expiry) without notice.

**Change:** Add a `kb_health_check` script that pings all resource URLs weekly and reports failures.

**File:** `backend/scripts/kb_health.py` (new)

### 5.2 KB chunking strategy

Current: Each KB entry is a single chunk of variable length. Long entries cause noisy retrieval (irrelevant passages match).

**Change:** Split long KB entries into smaller, semantically coherent chunks (500-800 chars). Index each chunk independently with its own `id`, `content`, and `content_ar`.

**File:** `backend/app/rag/knowledge_base.py` + `kb.json`

---

## Effort Summary

| Item | Effort | Impact | Phase | Spec Req |
|------|--------|--------|-------|----------|
| Routing matrix fallback | 15 min | Medium | 1 | — |
| Embedding pre-computation | 30 min | Medium | 1 | — |
| RAG eval — recall metrics | 1 hr | Low | 1 | F3: Eval protocol |
| RRF hybrid retrieval | 2 hr | High | 2 | — |
| Query reformulation | 2 hr | High | 2 | — |
| Per-score improvement guidance | 3 hr | High | 2 | **F2: Improvement guidance** |
| Roadmap coherence metric | 2 hr | Medium | 2 | **F3: Eval protocol** |
| Cross-lingual retrieval | 1 hr | Medium | 2 | — |
| Handling ambiguity & uncertainty | 3 hr | High | 3 | **F1: Handles ambiguity** |
| Intent classification | 4 hr | Medium | 3 | — |
| Persistent conversation memory | 3 hr | Medium | 3 | — |
| Expand anomaly detection | 2 hr | Medium | 4 | **F2: Anomaly detection** |
| Click tracking | 4 hr | Medium | 4 | — |
| Milestone outcome tracking | 2 hr | Low | 4 | — |
| KB URL health checks | 1 hr | Low | 5 | — |
| KB chunking | 3 hr | Medium | 5 | — |
