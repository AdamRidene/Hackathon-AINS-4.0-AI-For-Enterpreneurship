"""Document-driven auto-fill (intake friction killer).

Maps an uploaded pitch deck / business plan into typed ProjectProfile answers so
the founder *reviews and confirms* instead of answering ~38 questions. Two steps:

  1. propose_autofill(profile, doc_text)  -> list of validated proposals
       (LLM extraction, NEVER mutates the profile)
  2. apply_autofill(profile, confirmed)   -> applies the user-confirmed subset
       through the deterministic state machine (typed coercion, marks answered)

Discipline (mirrors the project's LLM-as-secondary-layer architecture):
  * The LLM only *proposes*; nothing is written without user confirmation.
  * Every proposal must coerce to its typed field, or it is dropped.
  * Anti-hallucination: each proposal carries the source quote ("evidence") and a
    `verified` flag (quote actually present in the document); only verified,
    high-confidence proposals are pre-checked for the user.
  * LLM down / empty -> propose returns [] -> the normal questionnaire is used.
    Auto-fill never blocks intake.
"""
from __future__ import annotations

import logging
from typing import Any

from ..llm import get_llm
from ..schema import ProjectProfile
from .state_machine import (
    QUESTIONS, QUESTION_INDEX, IntakeStateMachine, coerce_value,
)

_logger = logging.getLogger(__name__)

# Proposals at/above this are pre-checked (recommended) in the review UI.
_RECOMMEND_CONFIDENCE = 0.6


def build_fields_spec(profile: ProjectProfile) -> list[dict]:
    """Catalogue of not-yet-answered questions to extract against. Deliberately
    ignores branching `applies()` — the document may contain a sector-gated fact
    before the gating answer exists; applying a field never depends on the gate."""
    return [
        {"id": q.id, "prompt": q.prompt_fr, "qtype": q.qtype, "options": q.options}
        for q in QUESTIONS
        if q.id not in profile.answered_questions
    ]


async def propose_autofill(profile: ProjectProfile, doc_text: str) -> list[dict]:
    """Extract + validate field proposals from document text. Never mutates."""
    spec = build_fields_spec(profile)
    if not spec or not doc_text or not doc_text.strip():
        return []

    raw = await get_llm().extract_fields(doc_text, spec, profile.language or "fr")
    low = doc_text.lower()
    proposals: list[dict] = []
    seen: set[str] = set()

    for item in raw:
        qid = item.get("id")
        if qid in seen or qid in profile.answered_questions or qid not in QUESTION_INDEX:
            continue
        value = item.get("value")
        try:
            coerce_value(qid, value)          # validate typing; drop if it fails
        except Exception:
            continue

        q = QUESTION_INDEX[qid]
        evidence = str(item.get("evidence") or "").strip()
        verified = bool(evidence) and evidence.lower()[:48] in low
        try:
            conf = max(0.0, min(1.0, float(item.get("confidence", 0.5))))
        except (TypeError, ValueError):
            conf = 0.5

        seen.add(qid)
        proposals.append({
            "question_id": qid,
            "field_path": q.field_path,
            "prompt_fr": q.prompt_fr,
            "prompt_ar": q.prompt_ar,
            "qtype": q.qtype,
            "options": q.options,
            "value": value,
            "confidence": round(conf, 2),
            "verified": verified,
            "evidence": evidence[:200],
            "recommended": verified and conf >= _RECOMMEND_CONFIDENCE,
        })

    # Recommended first, then by confidence — best candidates at the top.
    proposals.sort(key=lambda p: (not p["recommended"], -p["confidence"]))
    _logger.info("autofill pid=%s proposed=%d", profile.project_id, len(proposals))
    return proposals


def apply_autofill(profile: ProjectProfile, confirmed: list[dict]) -> dict:
    """Apply the user-confirmed proposals via the deterministic state machine.

    `confirmed` is a list of {question_id, value}. Invalid items are skipped, not
    fatal. Returns applied ids + the next deterministic question + progress."""
    sm = IntakeStateMachine(profile)
    applied: list[str] = []
    skipped: list[str] = []
    for item in confirmed:
        qid = item.get("question_id")
        try:
            sm.apply_answer(qid, item.get("value"))
            applied.append(qid)
        except Exception:
            skipped.append(qid)

    nq = sm.next_question()
    _logger.info("autofill apply pid=%s applied=%d skipped=%d",
                 profile.project_id, len(applied), len(skipped))
    return {
        "applied": applied,
        "skipped": skipped,
        "next_question": nq.to_dict() if nq else None,
        "progress": sm.progress(),
        "intake_complete": profile.intake_complete,
    }
