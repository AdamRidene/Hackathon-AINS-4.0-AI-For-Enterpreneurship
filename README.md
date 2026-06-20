# Firasa — فِراسة

**An algorithmic audit engine for entrepreneurial maturity, built for the Tunisian ecosystem.**

Firasa replaces the passive advisory chatbot with an *auditor*. Instead of answering questions from general knowledge, it collects structured evidence, confronts a founder's self-assessment against that evidence, scores five business dimensions with transparent gated formulas, and produces a roadmap in which every recommendation is traceable to a real Tunisian institution. The guiding principle throughout is transparency and structural logic over conversational flair.

## The three modules, and how they interact

Firasa's distinguishing property is not that it has three modules but that they share one state and feed one another. The single integration point is `app/orchestrator.py`, which threads one `ProjectProfile` through the whole pipeline.

The **Adaptive Diagnostic Engine** runs a state-driven intake (not a static form): the next question is a pure function of the current profile, so the sequence branches by sector and by declared stage. A founder who selects *agri-food* is asked footprint and circularity probes and never sees the digital-platform path; a founder who claims *Fundraising* has mandatory evidence probes injected that demand hard numeric tokens. The collected tokens drive a deterministic six-stage classifier (Ideation → Market Validation → Structuration → Fundraising → Launch Planning → Growth), where a venture sits at stage *k* if and only if every evidence gate 1..k is satisfied. The engine then surfaces the **perception–reality gap** between the declared stage and the classified stage as a first-class output, applying an automatic reallocation when overestimation is severe.

The **Explainable GWLC Scoring** module computes five composite scores — Market, Commercial, Innovation, Scalability, Green — as a Gated Weighted Linear Combination. A *gate* is a non-linear override applied after the linear base score, enforcing that a weak score on a fundamental dimension cannot be masked by strong scores elsewhere (a huge TAM with no customer validation is capped at 30; strong scalability fundamentals with a human-dependency above 7 are halved). Every score carries a full per-criterion contribution trace, so the interface can answer "why was this score given?" down to the individual term.

The **RAG-Grounded Roadmap** turns diagnostic gaps and penalised scores into an ordered action plan. Each unmet gate or gated score *triggers* a metadata-filtered retrieval over a knowledge base of 32 real Tunisian resources (APII, BFPME, BTS, Startup Act, Smart Capital, INNORPI, ANETI, UNDP, and more). Retrieval applies a hard routing-matrix filter *before* similarity ranking, so a recommendation can never cite an institution outside the relevant domain. Every milestone is a four-tuple of order, rationale, horizon, and source.

A secondary LLM layer sits over all of this — as a judge of value-proposition coherence (the P_coh index), as a natural-language justifier of scores and gaps, and as a grounded assistant that answers only from the structured audit. The LLM is never the classification or scoring authority; if no model is reachable, every LLM call falls back to a deterministic, auditable rubric and the pipeline still runs end to end.

