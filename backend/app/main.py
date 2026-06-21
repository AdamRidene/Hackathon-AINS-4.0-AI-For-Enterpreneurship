"""Firasa FastAPI application — REST surface over the orchestration layer."""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
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


class AuthBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    birth_date: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None


class PlanBody(BaseModel):
    plan: str


class ProfileUpdateBody(BaseModel):
    name: str
    bio: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    photo: Optional[str] = None
    birth_date: Optional[str] = None
    location: Optional[str] = None


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
def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "plan": user["plan"],
        "bio": user.get("bio"),
        "phone": user.get("phone"),
        "role": user.get("role"),
        "company": user.get("company"),
        "photo": user.get("photo"),
        "birth_date": user.get("birth_date"),
        "location": user.get("location"),
    }


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    return authorization.split(" ", 1)[1].strip()


def _current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_token(authorization)
    user = store.get_user_by_token(token)
    if user is None:
        raise HTTPException(401, "Invalid or expired session")
    return user


def _current_token(authorization: str | None = Header(default=None)) -> str:
    return _extract_token(authorization)


def _require(pid: str) -> ProjectProfile:
    p = store.load(pid)
    if p is None:
        raise HTTPException(404, "Projet introuvable")
    return p


def _require_owned(pid: str, user: dict) -> ProjectProfile:
    profile = _require(pid)
    if profile.owner_user_id != user["id"]:
        raise HTTPException(404, "Projet introuvable")
    return profile


@app.post("/api/auth/register")
def register(body: AuthBody) -> dict:
    try:
        user = store.create_user(
            body.email,
            body.password,
            body.name,
            birth_date=body.birth_date,
            location=body.location,
            phone=body.phone,
            role=body.role,
            company=body.company,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    token = store.create_session(user["id"])
    return {"token": token, "user": _public_user(user)}


@app.post("/api/auth/login")
def login(body: AuthBody) -> dict:
    user = store.authenticate_user(body.email, body.password)
    if user is None:
        raise HTTPException(401, "Invalid email or password")
    token = store.create_session(user["id"])
    return {"token": token, "user": _public_user(user)}


@app.post("/api/auth/logout")
def logout(token: str = Depends(_current_token)) -> dict:
    store.delete_session(token)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Depends(_current_user)) -> dict:
    return {"user": _public_user(user)}


@app.patch("/api/me/plan")
def update_plan(body: PlanBody, user: dict = Depends(_current_user)) -> dict:
    try:
        updated = store.update_user_plan(user["id"], body.plan)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if updated is None:
            raise HTTPException(404, "User not found")
    return {"user": _public_user(updated)}


@app.patch("/api/me/profile")
def update_profile(body: ProfileUpdateBody, user: dict = Depends(_current_user)) -> dict:
    updated = store.update_user_profile(
        user_id=user["id"],
        name=body.name,
        bio=body.bio,
        phone=body.phone,
        role=body.role,
        company=body.company,
        photo=body.photo,
        birth_date=body.birth_date,
        location=body.location,
    )
    if updated is None:
        raise HTTPException(404, "User not found")
    return {"user": _public_user(updated)}


@app.post("/api/projects")
async def create_project(body: CreateProjectBody, user: dict = Depends(_current_user)) -> dict:
    limit = store.PLAN_LIMITS[user["plan"]]
    if store.count_projects_for_owner(user["id"]) >= limit:
        raise HTTPException(
            403,
            f"Project limit reached for plan {user['plan']} ({limit} projects).",
        )
    profile = ProjectProfile(
        name=body.name,
        language=body.language,
        owner_user_id=user["id"],
        answered_questions=["name"] if body.name else [],
    )
    store.save(profile)
    
    # Establish initial audit baseline
    await _run_owned_audit(profile.project_id, user)
    
    sm = IntakeStateMachine(profile)
    q = sm.next_question()
    return {"project_id": profile.project_id,
            "next_question": q.to_dict() if q else None,
            "progress": sm.progress()}


@app.get("/api/projects/{pid}/next-question")
def next_question(pid: str, user: dict = Depends(_current_user)) -> dict:
    sm = IntakeStateMachine(_require_owned(pid, user))
    q = sm.next_question()
    return {"next_question": q.to_dict() if q else None, "progress": sm.progress()}


@app.get("/api/projects/{pid}/questions")
def get_project_questions(pid: str, user: dict = Depends(_current_user)) -> list[dict]:
    profile = _require_owned(pid, user)
    res = []
    from .intake.state_machine import QUESTIONS
    for q in QUESTIONS:
        if q.applies(profile):
            # Read value from profile
            parts = q.field_path.split(".")
            val: Any = profile
            for p in parts:
                if val is not None:
                    val = getattr(val, p, None)
            
            # Serialize enum if needed
            if val is not None and hasattr(val, "value"):
                val = val.value
            
            res.append({
                "id": q.id,
                "prompt_fr": q.prompt_fr,
                "prompt_ar": q.prompt_ar,
                "qtype": q.qtype,
                "options": q.options,
                "help_fr": q.help_fr,
                "help_ar": q.help_ar,
                "value": val,
                "answered": q.id in profile.answered_questions,
            })
    return res


@app.post("/api/projects/{pid}/answer")
async def answer(pid: str, body: AnswerBody, user: dict = Depends(_current_user)) -> dict:
    profile = _require_owned(pid, user)
    sm = IntakeStateMachine(profile)
    try:
        sm.apply_answer(body.question_id, body.value)
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e))
    store.save(profile)
    
    # Recalculate audit automatically on every answer submission
    await _run_owned_audit(pid, user)
    
    q = sm.next_question()
    return {"accepted": True, "next_question": q.to_dict() if q else None,
            "progress": sm.progress(), "intake_complete": profile.intake_complete}


@app.get("/api/projects/{pid}")
def get_project(pid: str, user: dict = Depends(_current_user)) -> dict:
    return store.redact(_require_owned(pid, user))


# --------------------------------------------------------------------------- #
# Audit (full pipeline) & assistant                                          #
# --------------------------------------------------------------------------- #
async def _run_owned_audit(pid: str, user: dict) -> dict:
    profile = _require_owned(pid, user)
    result  = await run_audit(profile)
    result_dict = result.to_dict()

    # Persist the new score vector for next-run delta comparisons if intake is complete.
    if profile.intake_complete:
        profile.last_score_vector = list(result.scores.vector())
        store.save(profile)

    # Persist the full audit snapshot so history can retrieve it instantly.
    stage = result.gap.classified_stage if result.gap else None
    store.save_audit(
        pid        = pid,
        owner_user_id = user["id"],
        name       = profile.name,
        sector     = profile.sector.value if profile.sector else None,
        stage      = int(stage) if stage else None,
        vector     = profile.last_score_vector,
        audit_dict = result_dict,
    )
    return result_dict


@app.post("/api/projects/{pid}/audit")
async def audit(pid: str, user: dict = Depends(_current_user)) -> dict:
    return await _run_owned_audit(pid, user)


@app.post("/api/v1/projects/{pid}/diagnose")
async def diagnose(pid: str, user: dict = Depends(_current_user)) -> dict:
    """Compatibility endpoint for the final diagnostic handoff payload."""
    return await _run_owned_audit(pid, user)


@app.post("/api/projects/{pid}/assistant")
async def assistant(pid: str, body: AssistantBody, user: dict = Depends(_current_user)) -> dict:
    profile = _require_owned(pid, user)
    return await grounded_assistant_reply(profile, body.question)


# ── History / management ──────────────────────────────────────────────────── #

@app.get("/api/projects")
def list_projects(user: dict = Depends(_current_user)) -> list[dict]:
    """Return current user's saved audit summaries (newest first)."""
    return store.list_audits(user["id"])


@app.get("/api/projects/{pid}/last-audit")
def last_audit(pid: str, user: dict = Depends(_current_user)) -> dict:
    """Return the last persisted audit result without re-running the pipeline."""
    _require_owned(pid, user)          # 404 if profile missing or not owned
    result = store.get_audit(pid)
    if result is None:
        raise HTTPException(404, "No audit result saved yet for this project.")
    return result


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, user: dict = Depends(_current_user)) -> dict:
    _require_owned(pid, user)
    if not store.delete_project(pid):
        raise HTTPException(404, "Projet introuvable")
    return {"deleted": pid}


# Convenience: audit an ad-hoc profile without the intake flow (for demos/tests).
@app.post("/api/audit")
async def audit_adhoc(profile: ProjectProfile) -> dict:
    if os.getenv("FIRASA_DEBUG", "false").lower() != "true":
        raise HTTPException(403, "Ad-hoc debugging audit endpoint is disabled")
    store.save(profile)
    result = await run_audit(profile)
    return result.to_dict()


@app.get("/api/eval")
def get_evaluation_report(user: dict = Depends(_current_user)) -> dict:
    """Run the evaluation protocol suite and return diagnostic, RAG, and scoring consistency scores."""
    from .eval_protocol import eval_diagnostic, eval_rag, eval_scoring_consistency
    return {
        "diagnostic": eval_diagnostic(),
        "rag_retrieval": eval_rag(),
        "scoring_consistency": eval_scoring_consistency(),
    }
