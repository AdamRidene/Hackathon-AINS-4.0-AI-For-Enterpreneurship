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
| Handles ambiguity gracefully | Should | Implemented | 3.1 |
| Persistent project context | Should | Implemented | — |
| Evaluation protocol (classification metric) | Should | Implemented | — |
| Five composite scores | Must | Implemented | — |
| Sub-scores with visible contributions | Must | Implemented | — |
| Criteria weights documented | Must | Implemented (SCORING_METHODOLOGY.md) | — |
| Natural-language justification | Must | Implemented | — |
| Anomaly detection (2+ cases flagged) | Should | Implemented | 4.3 |
| Improvement guidance is specific | Should | Implemented | 2.4 |
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
| Evaluation: standalone test set | Should | Implemented (test_set.json) | 5.5 |
| Evaluation: persistent reports | Should | Implemented (_data/eval_report.json) | 5.6 |
| Evaluation: intake branching | Should | Implemented (42 combos tested) | 5.7 |
| Assistant: dead code removal | Should | Implemented | 5.3 |
| Assistant: inline source citations | Should | Implemented | 5.4 |

## Phase 1 — Quick Wins (high impact, low effort)

### 1.1 Routing matrix fallback ✅

`retriever.py:ROUTING_MATRIX` includes `"general"` fallback + `_filter_candidates()` retries on empty.

### 1.2 Embedding pre-computation ✅

TF-IDF vectors computed eagerly at `KnowledgeBase.__init__`; dense embeddings pre-loaded via `_ensure_embeddings()`.

### 1.3 RAG evaluation — add recall metrics ✅

`eval_rag()` in `eval_protocol.py` reports Recall@5, MRR, NDCG@5 alongside Precision@5.

---

## Phase 2 — Core Retrieval Upgrades (medium effort, high impact)

### 2.1 Hybrid retrieval with Reciprocal Rank Fusion ✅

`retriever.py._rrf_merge()` runs both TF-IDF and dense retrievers, fusing via RRF with constant k=60.

### 2.2 Query reformulation before retrieval ✅

`roadmap.py` calls `llm.reformulate_search_query()` before each `retriever.retrieve()` call, with raw label fallback on failure.

### 2.4 Per-score improvement guidance ✅

Every `ScoreResult` in `gwlc.py` carries `improvement_guidance_fr`/`improvement_guidance_ar` populated per dimension from missing inputs and gate states.

### 2.5 Roadmap coherence evaluation metric ✅

`eval_roadmap_coherence()` in `eval_protocol.py` checks source validity, milestone ordering, duplicate titles, and horizon consistency across 4 seed scenarios.

### 2.6 Cross-lingual retrieval ✅

Cohere `embed-multilingual-v3.0` (with bilingual FR+AR chunk text) enables Arabic queries to retrieve French resources and vice versa.

---

## Phase 3 — Assistant Intelligence (medium effort, medium impact) ✅

### 3.1 Handling ambiguity and uncertainty surfacing ✅

`AuditResult.uncertainty_report` built in `orchestrator.py:run_audit()`:
- Per dimension: missing inputs from each `ScoreResult.missing_inputs`
- Per gate: unanswered evidence questions from `DiagnosticResult.gates`
- Ranked "quickest confidence gain" (gates first, then dimension missing inputs)

### 3.3 Embedding-based intent classification for tool planning ✅

`orchestrator.py._classify_intent()` uses Cohere embeddings + k-NN (TF-IDF fallback) to map user questions to 7 intents with synthetic Q/A training pairs. Replaces brittle keyword matching in `_plan_assistant_tools`.

### 3.4 Persistent conversation memory ✅

`store.py` has `conversation_memory` table with `save_conversation_turn()` / `get_conversation_history()` — 24h TTL, max 6 turns, backed by SQLite/Postgres/in-memory. `orchestrator.py` uses store instead of the old in-memory `_conversation_memory` dict.

---

## Phase 4 — Feedback & Anomaly Robustness (medium effort, medium impact) ✅

### 4.1 Expand anomaly detection rules ✅

**Change:** 4 new deterministic rules added to `gap.py`:
- `prefunding_no_structure` (A9, high) — declared stage ≥ 4 + no legal form
- `high_revenue_low_validation` (A10, medium) — monthly revenue ≥ 1000 TND + no customer validation (replaces seasonal/revenue-MRR rule, as the schema lacks `revenue_model_type` / `business_seasonal`)
- `multi_competitors_no_differentiation` (A11, medium) — competitors ≥ 2 + no differentiation narrative
- `high_innovation_self_report_only` (A12, high) — innovation score ≥ 65 with no IP, no pilot, no tech detail

**Rule list:** 12 rules (8 original + 4 new).

**File:** `backend/app/diagnostic/gap.py` — `detect_anomalies()`

### 4.2a Recommendation click tracking ✅

**Change:** `store.py` gets `resource_clicks` table + `log_resource_click()` / `get_click_stats()`. Backend endpoint `POST /api/project/{pid}/click` and `GET /api/click-stats` added to `main.py`. Frontend analytics events TBD.

**Files:** `backend/app/store.py` (storage), `backend/app/main.py` (endpoints)

### 4.2b Milestone outcome tracking ✅

**Change:** `store.py` gets `milestone_outcomes` table + `record_milestone_completion()` / `get_resolution_rates()` / `get_milestone_outcomes()`. Milestone-complete handler in `main.py` records the outcome and associated resource URLs. `GET /api/resolution-rates` surfaces "resolution rate" per resource.

**Files:** `backend/app/store.py` (storage), `backend/app/main.py` (endpoints + handler update)

---

## Phase 5 — Maintenance & Quality (ongoing) ✅

### 5.1 KB URL health checks ✅

Current: No automated check. Resource URLs can go stale (404, redirect, domain expiry) without notice.

**Change:** Add a `kb_health_check` script that pings all resource URLs weekly and reports failures.

**File:** `backend/scripts/kb_health.py` (new)

### 5.2 KB chunking strategy ✅

Current: Each KB entry is a single chunk of variable length. Long entries cause noisy retrieval (irrelevant passages match).

**Change:** `_chunk_text()` added to `knowledge_base.py` — splits content at sentence boundaries targeting 500-800 chars per chunk. `chunk_kb_entries()` migration function rewrites `kb.json` with split entries (id format `{base}-chunk-{n}`). On current data all entries are under 500 chars, so no splitting occurs yet — ready for when longer entries are added.

**File:** `backend/app/rag/knowledge_base.py` (functions + migration)

### 5.3 Assistant dead code removal ✅

Removed ~90 lines of unreachable legacy code in `grounded_assistant_reply()` (lines 725–815) — a duplicate fallback path that was never reached after the tools-based path was introduced.

**File:** `backend/app/orchestrator.py`

### 5.4 Inline source citations in assistant replies ✅

Numbered source index (`[N] Institution: url`) appended to LLM grounding context with instruction to cite `[N]` in replies. Makes assistant output traceable to specific KB resources.

**File:** `backend/app/orchestrator.py` — `grounded_assistant_reply()`

### 5.5 Standalone labelled test set ✅

12 held-out validation profiles + human consensus ratings extracted from inline Python code to `backend/app/rag/data/test_set.json`. Independently verifiable, version-controllable. `eval_protocol.py` loads from JSON at import time via `_load_test_set()`.

**File:** `backend/app/rag/data/test_set.json` (new), `backend/app/eval_protocol.py`

### 5.6 Persistent evaluation reports ✅

`main()` now saves full results dict to `backend/_data/eval_report.json` (gitignored). Enables tracking metrics across runs.

**File:** `backend/app/eval_protocol.py` — `_save_report()`

### 5.7 Intake branching evaluation ✅

`eval_intake_branching()` tests all 42 sector × stage combinations — verifies every combination produces a valid sequence, sector probes are injected for agri-food/digital-saas, and evidence probes appear for advanced-stage claims. Confirms 12 distinct sequences (target: ≥ 3).

**File:** `backend/app/eval_protocol.py`

---

---

## Phase 6 — Polish & Robustness (next)

### 6.1 Hallucination evaluation for assistant replies

Current: Assistant tool-selection accuracy is tested (5 cases) but *response quality* is never evaluated. No metric for hallucination rate, grounding correctness, or user satisfaction.

**Change:** Build an eval set of 20+ Q/A pairs with expected source citations. Run the assistant, measure what fraction of claims are actually grounded in the provided context.

**File:** `backend/app/eval_protocol.py` — new `eval_assistant_response_quality()`

### 6.2 Streaming assistant replies

Current: `grounded_assistant_reply()` waits for the full LLM response before returning. Adds 2-5s latency.

**Change:** Return a streaming response (SSE or async generator) so the user sees tokens as they arrive.

**File:** `backend/app/orchestrator.py`, `backend/app/main.py`

### 6.3 Blocker impact ranking

Current: Blockers are ranked purely by gate stage order (earliest unmet gate first). No severity or business-impact heuristic.

**Change:** Add a secondary sort key to `_rank_blockers()` — e.g. a missing legal form blocks all funding applications (high impact), while an incomplete competitor analysis is lower impact.

**File:** `backend/app/diagnostic/classifier.py` — `_rank_blockers()`

### 6.4 Cross-module traceability tests

Current: No test explicitly proves that *a specific profile attribute* causes *a specific resource* to be retrieved. Coherence is verified implicitly by pipeline tests.

**Change:** Add 5+ targeted assertions: "if profile has gap X, KB resource Y appears in milestones".

**File:** `backend/tests/test_pipeline.py` — new test functions

---

## Effort Summary

| Item | Effort | Impact | Phase | Status |
|------|--------|--------|-------|--------|
| Routing matrix fallback | 15 min | Medium | 1 | ✅ |
| Embedding pre-computation | 30 min | Medium | 1 | ✅ |
| RAG eval — recall metrics | 1 hr | Low | 1 | ✅ |
| RRF hybrid retrieval | 2 hr | High | 2 | ✅ |
| Query reformulation | 2 hr | High | 2 | ✅ |
| Per-score improvement guidance | 3 hr | High | 2 | ✅ |
| Roadmap coherence metric | 2 hr | Medium | 2 | ✅ |
| Cross-lingual retrieval | 1 hr | Medium | 2 | ✅ |
| Handling ambiguity & uncertainty | 3 hr | High | 3 | ✅ |
| Intent classification | 4 hr | Medium | 3 | ✅ |
| Persistent conversation memory | 3 hr | Medium | 3 | ✅ |
| Expand anomaly detection | 2 hr | Medium | 4 | ✅ |
| Click tracking | 4 hr | Medium | 4 | ✅ |
| Milestone outcome tracking | 2 hr | Low | 4 | ✅ |
| KB URL health checks | 1 hr | Low | 5 | ✅ |
| KB chunking | 3 hr | Medium | 5 | ✅ |
| Dead code removal | 30 min | Low | 5 | ✅ |
| Inline citations | 1 hr | Medium | 5 | ✅ |
| Standalone test set | 1 hr | Medium | 5 | ✅ |
| Eval report persistence | 30 min | Low | 5 | ✅ |
| Intake branching eval | 1 hr | Medium | 5 | ✅ |
| Hallucination eval | 3 hr | Medium | 6 | 🔲 |
| Streaming assistant | 4 hr | High | 6 | 🔲 |
| Blocker impact ranking | 1 hr | Medium | 6 | 🔲 |
| Cross-module trace tests | 2 hr | Medium | 6 | 🔲 |
