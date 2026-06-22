"""LangGraph adaptive-intake layer (Phase 1, agentic enhancement).

Wraps the deterministic `IntakeStateMachine` in a LangGraph `StateGraph` that
adds ONE capability the rule-based machine cannot express: reading a free-text
answer and injecting a *content-aware* follow-up probe (e.g. a vague value
proposition triggers "which customer segment specifically, with what evidence?").

Design constraints (mirrors the project's LLM-as-secondary-layer architecture):

  * The deterministic `next_question()` remains the authoritative backbone. The
    graph only *adds* optional probes around it — it never reorders or skips the
    rule-based branching.
  * The LLM is best-effort. `propose_probe` returns None on any failure
    (StubProvider, timeout, empty), and the graph then falls straight through to
    the deterministic next question. Intake works end-to-end with no model up.
  * One graph turn == one `POST /answer`. Persistence is the existing DB
    (the `ProjectProfile`), so no LangGraph checkpointer is used.

Graph:  START -> ingest -> (probe? generate_probe : finalize)
        generate_probe -> (emitted? END : finalize)
        finalize -> END
"""
from __future__ import annotations

import logging
import operator
from typing import Any, Optional

from typing_extensions import Annotated, TypedDict

from langgraph.graph import StateGraph, START, END

from ..llm import get_llm
from ..schema import ProjectProfile
from .state_machine import IntakeStateMachine, QUESTION_INDEX

_logger = logging.getLogger(__name__)

# Cap dynamic probes so adaptive intake stays bounded and demo-predictable.
MAX_PROBES = 3
_PROBE_PREFIX = "ai_probe::"


# --------------------------------------------------------------------------- #
# Probe bookkeeping helpers (operate on profile.dynamic_probes)               #
# --------------------------------------------------------------------------- #
def _pending_probe(profile: ProjectProfile) -> Optional[dict]:
    for e in profile.dynamic_probes:
        if e.get("answer") is None:
            return e
    return None


def _has_probe_for(profile: ProjectProfile, trigger_qid: str) -> bool:
    return any(e.get("trigger_qid") == trigger_qid for e in profile.dynamic_probes)


def _probe_to_question(entry: dict, lang: str) -> dict:
    """Serialize a probe to the same shape as Question.to_dict so the frontend
    renders it through the existing question component."""
    return {
        "id": entry["id"],
        "prompt_fr": entry.get("prompt_fr", ""),
        "prompt_ar": entry.get("prompt_ar", ""),
        "field_path": "dynamic_probes",
        "qtype": "text",
        "options": [],
        "help_fr": "Question de suivi générée par l'IA à partir de votre réponse.",
        "help_ar": "سؤال متابعة وَلّده الذكاء الاصطناعي بناءً على إجابتك.",
        "triggered_by": "ai_probe",
    }


# --------------------------------------------------------------------------- #
# Graph state                                                                 #
# --------------------------------------------------------------------------- #
class IntakeTurnState(TypedDict, total=False):
    profile: ProjectProfile          # shared profile (mutated in place, then returned)
    question_id: str                 # the answer just submitted
    value: Any
    lang: str
    llm_available: bool
    # working / output fields
    is_probe_answer: bool            # the submitted answer was itself a probe answer
    answered_text: Optional[str]     # free-text value worth probing (else None)
    question_prompt: str             # prompt of the just-answered question
    probe_emitted: bool
    next_question: Optional[dict]
    log: Annotated[list, operator.add]   # per-turn decision trace (eval hook)


# --------------------------------------------------------------------------- #
# Nodes                                                                       #
# --------------------------------------------------------------------------- #
def ingest(state: IntakeTurnState) -> dict:
    """Apply the submitted answer. Deterministic — no LLM."""
    profile = state["profile"]
    qid = state["question_id"]
    value = state["value"]

    if qid.startswith(_PROBE_PREFIX):
        # Probe answer: record it, mark the probe resolved. Not a typed field.
        for e in profile.dynamic_probes:
            if e["id"] == qid and e.get("answer") is None:
                e["answer"] = value
                break
        profile.touch()
        return {"profile": profile, "is_probe_answer": True,
                "answered_text": None, "question_prompt": "",
                "log": [f"probe_answer:{qid}"]}

    # Normal deterministic answer via the authoritative state machine.
    q = QUESTION_INDEX.get(qid)
    IntakeStateMachine(profile).apply_answer(qid, value)  # may raise -> caught by route
    answered_text = str(value) if (q is not None and q.qtype == "text") else None
    return {"profile": profile, "is_probe_answer": False,
            "answered_text": answered_text,
            "question_prompt": q.prompt_fr if q else "",
            "log": [f"answer:{qid}"]}


async def generate_probe(state: IntakeTurnState) -> dict:
    """LLM node: ask for a content-aware follow-up. None => no probe."""
    profile = state["profile"]
    lang = state.get("lang", "fr")
    trigger = state["question_id"]

    probe_text = await get_llm().propose_probe(
        state.get("question_prompt", ""), str(state.get("answered_text") or ""), lang
    )
    if probe_text:
        pid = f"{_PROBE_PREFIX}{trigger}::{len(profile.dynamic_probes) + 1}"
        entry: dict = {"id": pid, "trigger_qid": trigger, "answer": None,
                       "prompt_fr": "", "prompt_ar": ""}
        entry["prompt_ar" if lang == "ar" else "prompt_fr"] = probe_text
        profile.dynamic_probes.append(entry)
        profile.intake_complete = False
        return {"profile": profile, "probe_emitted": True,
                "next_question": _probe_to_question(entry, lang),
                "log": [f"probe_emitted:{pid}"]}
    return {"probe_emitted": False, "log": ["probe_declined"]}


def finalize(state: IntakeTurnState) -> dict:
    """Serve the deterministic next question (or a still-pending probe)."""
    profile = state["profile"]
    pend = _pending_probe(profile)
    if pend is not None:
        profile.intake_complete = False
        return {"profile": profile,
                "next_question": _probe_to_question(pend, state.get("lang", "fr")),
                "log": ["serve_pending_probe"]}

    q = IntakeStateMachine(profile).next_question()
    profile.intake_complete = q is None
    return {"profile": profile,
            "next_question": q.to_dict() if q else None,
            "log": ["deterministic_next" if q else "intake_complete"]}


# --------------------------------------------------------------------------- #
# Routers                                                                      #
# --------------------------------------------------------------------------- #
def route_after_ingest(state: IntakeTurnState) -> str:
    if state.get("is_probe_answer"):
        return "finalize"                       # never probe a probe answer
    text = state.get("answered_text")
    if not text or not str(text).strip():
        return "finalize"                       # only text answers are probeable
    if not state.get("llm_available"):
        return "finalize"                       # LLM down -> deterministic backbone
    profile = state["profile"]
    if len(profile.dynamic_probes) >= MAX_PROBES:
        return "finalize"                       # global cap
    if _has_probe_for(profile, state["question_id"]):
        return "finalize"                       # one probe per trigger
    return "generate_probe"


def route_after_probe(state: IntakeTurnState) -> str:
    return END if state.get("probe_emitted") else "finalize"


# --------------------------------------------------------------------------- #
# Compiled graph (built once at import; profile passed per invocation)        #
# --------------------------------------------------------------------------- #
INTAKE_GRAPH = (
    StateGraph(IntakeTurnState)
    .add_node("ingest", ingest)
    .add_node("generate_probe", generate_probe)
    .add_node("finalize", finalize)
    .add_edge(START, "ingest")
    .add_conditional_edges("ingest", route_after_ingest, ["generate_probe", "finalize"])
    .add_conditional_edges("generate_probe", route_after_probe, ["finalize", END])
    .add_edge("finalize", END)
    .compile()
)


async def run_intake_turn(
    profile: ProjectProfile, question_id: str, value: Any
) -> dict:
    """Run one adaptive-intake turn. Returns the (mutated) profile, the next
    question to serve (deterministic question or AI probe), completion flag, and
    a decision trace for evaluation logging.

    The caller persists the profile and triggers the audit when complete.
    """
    llm = get_llm()
    state: IntakeTurnState = {
        "profile": profile,
        "question_id": question_id,
        "value": value,
        "lang": profile.language or "fr",
        "llm_available": llm.name != "stub",
        "is_probe_answer": False,
        "answered_text": None,
        "question_prompt": "",
        "probe_emitted": False,
        "next_question": None,
        "log": [],
    }
    result = await INTAKE_GRAPH.ainvoke(state)
    trace = result.get("log", [])
    _logger.info("intake_turn pid=%s qid=%s trace=%s",
                 profile.project_id, question_id, trace)
    return {
        "profile": result["profile"],
        "next_question": result.get("next_question"),
        "intake_complete": result["profile"].intake_complete,
        "trace": trace,
    }
