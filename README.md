# Firasa — فِراسة

**An algorithmic audit engine for entrepreneurial maturity, built for the Tunisian ecosystem.**

Firasa replaces the passive advisory chatbot with an *auditor*. Instead of answering questions from general knowledge, it collects structured evidence, confronts a founder's self-assessment against that evidence, scores five business dimensions with transparent gated formulas, and produces a roadmap in which every recommendation is traceable to a real Tunisian institution. The guiding principle throughout is transparency and structural logic over conversational flair.

## The three modules, and how they interact

Firasa's distinguishing property is not that it has three modules but that they share one state and feed one another. The single integration point is `app/orchestrator.py`, which threads one `ProjectProfile` through the whole pipeline.

The **Adaptive Diagnostic Engine** runs a state-driven intake (not a static form): the next question is a pure function of the current profile, so the sequence branches by sector and by declared stage. Every sector follows the same core diagnostic path, with additive probes for sectors that need them; for example, *agri-food* gets footprint and circularity questions, while *digital-saas* gets a platform-footprint path. A founder who claims *Fundraising* has mandatory evidence probes injected that demand hard numeric tokens. The collected tokens drive a deterministic six-stage classifier (Ideation → Market Validation → Structuration → Fundraising → Launch Planning → Growth), where a venture sits at stage *k* if and only if every evidence gate 1..k is satisfied. The engine then surfaces the **perception–reality gap** between the declared stage and the classified stage as a first-class output, applying an automatic reallocation when overestimation is severe.

The **Explainable GWLC Scoring** module computes five composite scores — Market, Commercial, Innovation, Scalability, Green — as a Gated Weighted Linear Combination. A *gate* is a non-linear override applied after the linear base score, enforcing that a weak score on a fundamental dimension cannot be masked by strong scores elsewhere (a huge TAM with no customer validation is capped at 30; strong scalability fundamentals with a human-dependency above 7 are halved). Every score carries a full per-criterion contribution trace, so the interface can answer "why was this score given?" down to the individual term.

The **RAG-Grounded Roadmap** turns diagnostic gaps and penalised scores into an ordered action plan. Each unmet gate or gated score *triggers* a metadata-filtered retrieval over a knowledge base of 32 real Tunisian resources (APII, BFPME, BTS, Startup Act, Smart Capital, INNORPI, ANETI, UNDP, and more). Retrieval applies a hard routing-matrix filter *before* similarity ranking, so a recommendation can never cite an institution outside the relevant domain. Every milestone is a four-tuple of order, rationale, horizon, and source.

A secondary LLM layer sits over all of this — as a judge of value-proposition coherence (the P_coh index), as a natural-language justifier of scores and gaps, and as a grounded assistant that answers only from the structured audit. The LLM is never the classification or scoring authority; if no model is reachable, every LLM call falls back to a deterministic, auditable rubric and the pipeline still runs end to end.

## Tech stack

The backend is Python with FastAPI and Pydantic v2 models. Retrieval uses dependency-free TF-IDF cosine similarity, swappable for a vector database behind the `Retriever` interface. The LLM provider is abstracted behind a single class with three implementations selected by the `FIRASA_LLM_PROVIDER` environment variable: a local Ollama provider (default, `qwen3:8b`), a Hugging Face Inference API provider (feature toggle), and a deterministic stub used in tests and as the universal fallback. The frontend is React (Vite), French-first, organised as a small set of presentational components over a thin typed API client.

## Running it

Backend, from `backend/`:

```
pip install -r requirements.txt
uvicorn app.main:app --reload          # serves http://localhost:8000
```

By default the backend expects a local Ollama instance. To run with no model installed, set `FIRASA_LLM_PROVIDER=stub`. To use Hugging Face instead, set `FIRASA_LLM_PROVIDER=huggingface` and provide `FIRASA_HF_TOKEN`. See `.env.example` for all variables.

Frontend, from `frontend/`:

```
npm install
npm run dev                            # serves http://localhost:5173, proxies /api -> :8000
```

Open the frontend, name a project, walk the adaptive intake, and read the audit. A "Audit now" action is also available mid-intake to demonstrate that the engine is robust to partial data.

## Tests and evaluation

From `backend/`, with `FIRASA_LLM_PROVIDER=stub` for determinism:

```
python -m pytest tests/ -q             # 16 tests: scoring, intake branching, full pipeline
python -m app.eval_protocol            # diagnostic, RAG, and scoring-consistency metrics
```

The evaluation protocol (`app/eval_protocol.py`) reports, on small labelled sets, the diagnostic engine's Top-1/Top-2 accuracy and MASE (mean absolute stage error, threshold ≤ 0.5), RAG Precision@5 (threshold ≥ 0.7), and gate-behaviour consistency on adversarial cases. The diagnostic ground truth is constructed *by the gate logic itself* — six profiles built to satisfy exactly gates 1..k — so the labels are defensible rather than hand-guessed. Current results: diagnostic Top-1 = 1.00 and MASE = 0.00 across nine cases, RAG mean Precision@5 = 0.96, and all adversarial gate checks pass.

## Project layout

```
firasa/
  backend/
    app/
      schema.py            shared ProjectProfile — single source of truth
      intake/              adaptive state machine
      diagnostic/          rule-based classifier + perception-reality gap
      scoring/             GWLC engine, weights, gates
      rag/                 knowledge base, routed retriever, roadmap factory, kb.json
      llm/                 provider abstraction (Ollama / HF / stub)
      orchestrator.py      the single cross-module integration point
      explain.py           explainability traces
      main.py              FastAPI REST surface
      eval_protocol.py     evaluation metrics
      seed_scenarios.py    three labelled demo ventures
    tests/                 pytest suite
  frontend/                React (Vite) UI
  ARCHITECTURE.md          design and data flow
  SCORING_METHODOLOGY.md   formulas, weights, gates, and the documented S_M discrepancy
```

See `ARCHITECTURE.md` for the design rationale and `SCORING_METHODOLOGY.md` for the exact formulas and weight justification.
