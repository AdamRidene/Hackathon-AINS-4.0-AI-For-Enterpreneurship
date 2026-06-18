"""Firasa FastAPI application — REST surface over the orchestration layer."""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__, store
from .schema import ProjectProfile
from .intake import IntakeStateMachine
from .orchestrator import run_audit, grounded_assistant_reply
from .rag.knowledge_base import get_kb
from .llm import get_llm

app = FastAPI(title="Firasa Orientation Engine", version=__version__)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request models                                                              #
# --------------------------------------------------------------------------- #
class CreateProjectBody(BaseModel):
    name: Optional[str] = None
    language: str = "fr"


class AnswerBody(BaseModel):
    question_id: str
    value: Any


class AssistantBody(BaseModel):
    question: str


# --------------------------------------------------------------------------- #
# Health & metadata                                                           #
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health() -> dict:
    kb = get_kb()
    return {
        "status": "ok",
        "version": __version__,
        "llm_provider": get_llm().name,
        "llm_model": os.getenv("FIRASA_LLM_MODEL", "qwen3:8b"),
        "kb_resources": len(kb),
    }


@app.get("/api/kb")
def kb_overview() -> dict:
    kb = get_kb()
    by_institution: dict[str, int] = {}
    by_horizon: dict[str, int] = {}
    for c in kb.chunks:
        by_institution[c.institution] = by_institution.get(c.institution, 0) + 1
        by_horizon[c.horizon] = by_horizon.get(c.horizon, 0) + 1
    return {"count": len(kb), "by_institution": by_institution,
            "by_horizon": by_horizon, "meta": kb.meta}


# --------------------------------------------------------------------------- #
# Adaptive intake                                                            #
# --------------------------------------------------------------------------- #
def _require(pid: str) -> ProjectProfile:
    p = store.load(pid)
    if p is None:
        raise HTTPException(404, f"Project {pid} not found")
    return p


@app.post("/api/projects")
def create_project(body: CreateProjectBody) -> dict:
    profile = ProjectProfile(name=body.name, language=body.language)
    store.save(profile)
    sm = IntakeStateMachine(profile)
    q = sm.next_question()
    return {"project_id": profile.project_id,
            "next_question": q.to_dict() if q else None,
            "progress": sm.progress()}


@app.get("/api/projects/{pid}/next-question")
def next_question(pid: str) -> dict:
    sm = IntakeStateMachine(_require(pid))
    q = sm.next_question()
    return {"next_question": q.to_dict() if q else None, "progress": sm.progress()}


@app.post("/api/projects/{pid}/answer")
def answer(pid: str, body: AnswerBody) -> dict:
    profile = _require(pid)
    sm = IntakeStateMachine(profile)
    try:
        sm.apply_answer(body.question_id, body.value)
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e))
    store.save(profile)
    q = sm.next_question()
    return {"accepted": True, "next_question": q.to_dict() if q else None,
            "progress": sm.progress(), "intake_complete": profile.intake_complete}


@app.get("/api/projects/{pid}")
def get_project(pid: str) -> dict:
    return store.redact(_require(pid))


# --------------------------------------------------------------------------- #
# Audit (full pipeline) & assistant                                          #
# --------------------------------------------------------------------------- #
@app.post("/api/projects/{pid}/audit")
def audit(pid: str) -> dict:
    profile = _require(pid)
    result = run_audit(profile)
    # Persist the new score vector so the NEXT audit can show evolution deltas.
    # run_audit already read the previous vector for this run's deltas.
    profile.last_score_vector = list(result.scores.vector())
    store.save(profile)
    return result.to_dict()


@app.post("/api/projects/{pid}/assistant")
def assistant(pid: str, body: AssistantBody) -> dict:
    profile = _require(pid)
    return grounded_assistant_reply(profile, body.question)


# Convenience: audit an ad-hoc profile without the intake flow (for demos/tests).
@app.post("/api/audit")
def audit_adhoc(profile: ProjectProfile) -> dict:
    store.save(profile)
    return run_audit(profile).to_dict()
