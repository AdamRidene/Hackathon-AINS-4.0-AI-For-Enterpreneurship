# Architecture

## One shared state, one orchestrator

The central design decision in Firasa is that the three mandated modules do not merely coexist — they operate on a single shared object and feed one another in a fixed order. That object is the `ProjectProfile` defined in `app/schema.py`, a Pydantic model in which every field is optional so that the pipeline is well-defined on a profile that has collected nothing as well as on one that is complete. Every module reads from and writes to this one profile; no module owns a private copy of the truth.

The single integration point is `run_audit(profile)` in `app/orchestrator.py`. It is deliberately the only place where the modules are chained, which makes the cross-module data flow auditable in one screen:

```
intake (Phase 1)
   |  writes typed tokens into ProjectProfile
   v
classify(profile)               -> DiagnosticResult        (rule-based authority)
judge_value_proposition(...)    -> P_coh + rationale        (LLM-as-a-Judge, secondary)
score_all(profile, pcoh)        -> CompositeScores          (P_coh feeds the commercial score)
detect_gap(profile, diagnostic) -> GapReport                (declared vs classified)
build_roadmap(profile, diagnostic, scores, gap)             (gaps + scores -> RAG retrieval)
explain.*                       -> natural-language traces
```

The arrows are the integration: the diagnostic result feeds the gap detector; the judge's P_coh feeds the scoring engine; the diagnostic blockers *and* the gated scores both feed the roadmap, which retrieves grounded sources for each. The result is a single `AuditResult` with a `to_dict()` that the REST layer returns verbatim.

## Why the classifier is rule-based and the LLM is secondary

The specification requires that every stage assignment link to specific collected data points. Only deterministic logic can guarantee that property, so the six-stage classifier in `app/diagnostic/classifier.py` is strictly rule-based: it evaluates six evidence gates against typed tokens and assigns the venture to the largest contiguous stage whose gates all pass. It emits a full per-gate evidence trace — what satisfied each gate, or precisely what is missing — so the interface can show exactly which tokens drove or blocked the classification.

The LLM is confined to three secondary responsibilities, each a layer *over* deterministic logic rather than the authority itself: judging value-proposition coherence (the P_coh index that feeds the commercial score), justifying scores and gaps in natural language, and answering founder questions grounded only in the structured audit. Each responsibility has a deterministic fallback — a transparent five-criterion rubric for P_coh, the structured context itself for justification and chat — so that with no model installed the system still produces something auditable, and reliability does not depend on a network call.

## The scoring gate model

A naive weighted sum lets a strong dimension hide a fatal weakness. Firasa applies a *gate*: a non-linear override evaluated after the linear base score. The base score is the explainable weighted combination of normalised criteria; the gate then enforces a hard constraint. The market gate caps the score at 30 when there is no customer-validation token, regardless of how large the addressable market is. The scalability gate multiplies the score by 0.5 when human dependency exceeds 7. Each `ScoreResult` records whether its gate triggered and why, alongside the contribution trace, so the override is as explainable as the base computation. The exact formulas, weights, and a documented discrepancy with the concept note's worked example are in `SCORING_METHODOLOGY.md`.

## Retrieval that cannot hallucinate an institution

The roadmap's credibility rests on never citing an irrelevant or invented program. `app/rag/retriever.py` enforces this structurally: a routing matrix maps each diagnostic gap category to the set of institutions permitted to answer it, and the retriever applies that metadata filter *before* computing similarity. Cosine ranking only ever chooses among already-eligible chunks, so a legal-form gap cannot surface a green-energy program. The knowledge base (`app/rag/data/kb.json`) holds 32 real resources, each tagged with gap categories, applicable stages, and an action horizon. Retrieval is TF-IDF cosine today and is isolated behind the `Retriever` and `KnowledgeBase` interfaces, so swapping in a vector store is a local change.

## The intake state machine

`app/intake/state_machine.py` is a deterministic graph, not a form. `next_question(profile)` returns the first applicable, unanswered question from an ordered bank, where applicability is a predicate over the current profile. This is what produces meaningfully different question sequences for different profiles: sector predicates gate the agri-food and digital paths, and a declared advanced stage injects evidence probes that demand the hard numeric tokens needed to confirm or refute the claim. Each answer is written to a typed field, so the downstream modules consume structured tokens rather than free text.

## REST surface

`app/main.py` exposes the pipeline over HTTP: project creation, the adaptive next-question / answer loop, the full audit, and the grounded assistant. Profiles persist through a small JSON-file store (`app/store.py`) keyed by project id, with a redaction helper for read responses. The frontend consumes exactly these endpoints through one typed client.

## Frontend

The React app mirrors the backend's priority ordering. The audit view leads with the perception–reality gap banner (the differentiator), then the evidence ladder of six gates, then the five expandable score traces, then the grounded roadmap, then the grounded assistant. Components are presentational and stateless beyond local UI state; all domain logic lives in the backend, which keeps the single source of truth on the s