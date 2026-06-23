"""Firasa FastAPI application — REST surface over the orchestration layer."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, File as FastAPIFile, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from . import __version__, store
from .auth import get_current_user, extract_token
from .config import settings
from .schema import ProjectProfile
from .intake import IntakeStateMachine, run_intake_turn, propose_autofill, apply_autofill
from .orchestrator import run_audit, grounded_assistant_reply
from .rag.knowledge_base import get_kb, add_chunk, delete_chunk
from .llm import get_llm

_logger = logging.getLogger(__name__)

app = FastAPI(title="Firasa Orientation Engine", version=__version__)

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ORIGINS = (
    os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    .split(",")
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else _ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# --------------------------------------------------------------------------- #
# Request models                                                              #
# --------------------------------------------------------------------------- #
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


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

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v.strip()):
            raise ValueError("Invalid email format")
        return v.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


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
# Helpers                                                                     #
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


# --------------------------------------------------------------------------- #
# Health & metadata                                                           #
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health() -> dict:
    kb = get_kb()
    llm = get_llm()
    llm_env = os.getenv("FIRASA_LLM_PROVIDER") or settings.llm_provider
    llm_configured = True
    if llm.name == "openai":
        llm_configured = bool(settings.openai_api_key)
    elif llm.name == "groq":
        llm_configured = bool(settings.groq_api_key)
    elif llm.name == "huggingface":
        llm_configured = bool(settings.hf_token)
    elif llm.name == "deepseek":
        llm_configured = bool(settings.deepseek_api_key)
    elif llm.name == "gemini":
        llm_configured = bool(settings.gemini_api_key)
    model_names = {
        "ollama": settings.llm_model,
        "huggingface": settings.hf_model,
        "openai": settings.openai_model,
        "groq": settings.groq_model,
        "deepseek": settings.deepseek_model,
        "gemini": settings.gemini_model,
        "stub": "stub",
    }
    return {
        "status": "ok",
        "version": __version__,
        "auth_mode": settings.auth_mode,
        "llm_provider_env": llm_env,
        "llm_provider": llm.name,
        "llm_model": model_names.get(llm.name, "unknown"),
        "llm_configured": llm_configured,
        "kb_resources": len(kb),
        "kb_embedding_model": kb.meta.get("embedding_model"),
        "cohere_embedding_model": settings.cohere_embedding_model,
        "cohere_api_key_set": bool(settings.cohere_api_key or os.getenv("COHERE_API_KEY")),
        "cohere_embeddings_enabled": kb.meta.get("embedding_model", "").startswith("cohere/"),
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


@app.get("/api/kb/chunks")
def get_all_chunks(user: dict = Depends(get_current_user)) -> dict:
    """Get all chunks in the knowledge base (authenticated only)."""
    kb = get_kb()
    return {"chunks": [c.to_dict() for c in kb.chunks]}


@app.post("/api/kb/chunks")
def create_chunk(chunk_data: dict, user: dict = Depends(get_current_user)) -> dict:
    """Add a new chunk to the knowledge base (authenticated only)."""
    kb = add_chunk(chunk_data)
    return {"success": True, "count": len(kb)}


@app.delete("/api/kb/chunks/{chunk_id}")
def remove_chunk(chunk_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Delete a chunk from the knowledge base by ID (authenticated only). Returns 404 if chunk not found."""
    found, kb = delete_chunk(chunk_id)
    if not found:
        raise HTTPException(404, "Chunk not found")
    return {"success": True, "count": len(kb)}


# --------------------------------------------------------------------------- #
# Auth config discovery                                                       #
# --------------------------------------------------------------------------- #
@app.get("/api/auth/config")
def auth_config() -> dict:
    """Frontend uses this to discover the active auth mode at runtime."""
    return {
        "auth_mode": settings.auth_mode,
        "supabase_url": settings.supabase_url if settings.is_supabase_auth else None,
        "supabase_anon_key": settings.supabase_anon_key if settings.is_supabase_auth else None,
    }


# --------------------------------------------------------------------------- #
# Auth endpoints (local mode only)                                            #
# --------------------------------------------------------------------------- #
@app.post("/api/auth/register")
def register(body: AuthBody) -> dict:
    if settings.auth_mode == "none":
        # In bypass mode, return the mock dev user immediately
        from .auth import _MOCK_USER
        return {"token": "dev-token", "user": dict(_MOCK_USER)}
    if settings.is_supabase_auth:
        raise HTTPException(404, "Registration is managed by Supabase Auth in production mode.")
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
    if settings.auth_mode == "none":
        from .auth import _MOCK_USER
        return {"token": "dev-token", "user": dict(_MOCK_USER)}
    if settings.is_supabase_auth:
        raise HTTPException(404, "Login is managed by Supabase Auth in production mode.")
    user = store.authenticate_user(body.email, body.password)
    if user is None:
        raise HTTPException(401, "Invalid email or password")
    token = store.create_session(user["id"])
    return {"token": token, "user": _public_user(user)}


@app.post("/api/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    user: dict = Depends(get_current_user),
) -> dict:
    if settings.is_supabase_auth:
        # In Supabase mode, logout happens client-side (clear JWT).
        return {"ok": True}
    try:
        token = extract_token(authorization)
        store.delete_session(token)
    except HTTPException:
        pass
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return {"user": _public_user(user)}


# --------------------------------------------------------------------------- #
# Profile & plan management                                                   #
# --------------------------------------------------------------------------- #
@app.patch("/api/me/plan")
def update_plan(body: PlanBody, user: dict = Depends(get_current_user)) -> dict:
    try:
        updated = store.update_user_plan(user["id"], body.plan)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if updated is None:
            raise HTTPException(404, "User not found")
    return {"user": _public_user(updated)}


@app.patch("/api/me/profile")
def update_profile(body: ProfileUpdateBody, user: dict = Depends(get_current_user)) -> dict:
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


# --------------------------------------------------------------------------- #
# Projects — CRUD + adaptive intake                                           #
# --------------------------------------------------------------------------- #
@app.post("/api/projects")
async def create_project(body: CreateProjectBody, user: dict = Depends(get_current_user)) -> dict:
    # ponytail: plan gating disabled for demo — re-enable when payments are wired
    # limit = store.PLAN_LIMITS[user["plan"]]
    # if store.count_projects_for_owner(user["id"]) >= limit:
    #     raise HTTPException(403, f"Project limit reached for plan {user['plan']} ({limit} projects).")
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
def next_question(pid: str, user: dict = Depends(get_current_user)) -> dict:
    sm = IntakeStateMachine(_require_owned(pid, user))
    q = sm.next_question()
    return {"next_question": q.to_dict() if q else None, "progress": sm.progress()}


@app.get("/api/projects/{pid}/questions")
def get_project_questions(pid: str, user: dict = Depends(get_current_user)) -> list[dict]:
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
async def answer(pid: str, body: AnswerBody, user: dict = Depends(get_current_user)) -> dict:
    profile = _require_owned(pid, user)
    # Run one adaptive-intake turn through the LangGraph layer: applies the
    # answer (deterministic), then may inject a content-aware AI follow-up probe
    # before serving the deterministic next question. LLM failure falls back to
    # the pure state machine — intake never depends on the model.
    try:
        turn = await run_intake_turn(profile, body.question_id, body.value)
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e))
    profile = turn["profile"]
    store.save(profile)

    # Only auto-run the full audit pipeline when intake is complete
    # (last question answered, no pending probe). Intermediate answers just
    # update the profile.
    follow_up = None
    if profile.intake_complete:
        audit_dict = await _run_owned_audit(pid, user)
        follow_up = audit_dict.get("follow_up_suggested")

    response_dict = {
        "accepted": True, "next_question": turn["next_question"],
        "progress": IntakeStateMachine(profile).progress(),
        "intake_complete": profile.intake_complete,
        # Per-turn LangGraph node trace, for the frontend "agent decision
        # timeline" (explainability). e.g. ["answer:name","probe_emitted:..."].
        "trace": turn["trace"],
    }
    if follow_up:
        response_dict["follow_up_suggested"] = follow_up
    return response_dict


# --------------------------------------------------------------------------- #
# Document-driven auto-fill (review-and-confirm instead of a long form)        #
# --------------------------------------------------------------------------- #
class AutofillItem(BaseModel):
    question_id: str
    value: Any


class AutofillApplyBody(BaseModel):
    confirmed: list[AutofillItem]


@app.post("/api/projects/{pid}/autofill")
async def autofill_propose(pid: str, user: dict = Depends(get_current_user)) -> dict:
    """Propose intake answers extracted from the project's uploaded documents.
    Does NOT mutate the profile — the user reviews and confirms first."""
    profile = _require_owned(pid, user)
    docs = store.get_documents_text(pid)
    if not docs:
        raise HTTPException(400, "Aucun document exploitable. Importez d'abord un document "
                                 "(PDF, MD ou TXT) dans la section « Documents justificatifs ».")
    doc_text = "\n\n".join(f"# {d['filename']}\n{d['text']}" for d in docs)
    proposals = await propose_autofill(profile, doc_text)
    return {"proposals": proposals, "doc_count": len(docs)}


@app.post("/api/projects/{pid}/autofill/apply")
async def autofill_apply(pid: str, body: AutofillApplyBody,
                         user: dict = Depends(get_current_user)) -> dict:
    """Apply the user-confirmed auto-fill proposals, then resume intake."""
    profile = _require_owned(pid, user)
    result = apply_autofill(profile, [i.model_dump() for i in body.confirmed])
    store.save(profile)
    if profile.intake_complete:
        audit_dict = await _run_owned_audit(pid, user)
        result["follow_up_suggested"] = audit_dict.get("follow_up_suggested")
    return {"accepted": True, **result}


class ProfilePatchBody(BaseModel):
    """Partial update — every field is optional."""
    name: Optional[str] = None
    sector: Optional[str] = None
    language: Optional[str] = None
    team_size: Optional[int] = Field(None, ge=0)
    monthly_revenue_tnd: Optional[float] = Field(None, ge=0.0)
    burn_rate_tnd: Optional[float] = Field(None, ge=0.0)
    runway_months: Optional[int] = Field(None, ge=0)
    user_count: Optional[int] = Field(None, ge=0)
    growth_rate_pct: Optional[float] = Field(None, ge=-100.0)
    cac_tnd: Optional[float] = Field(None, ge=0.0)
    ltv_tnd: Optional[float] = Field(None, ge=0.0)
    competitor_names: Optional[list[str]] = None
    differentiation_narrative: Optional[str] = None
    incorporation_date: Optional[str] = None
    fiscal_regime: Optional[str] = None
    key_hires: Optional[list[str]] = None
    validation_evidence_narrative: Optional[str] = None


@app.get("/api/projects/{pid}")
def get_project(pid: str, user: dict = Depends(get_current_user)) -> dict:
    return store.redact(_require_owned(pid, user), is_owner=True)


@app.patch("/api/projects/{pid}")
def patch_project(pid: str, body: ProfilePatchBody, user: dict = Depends(get_current_user)) -> dict:
    """Update project profile fields directly (no state machine)."""
    profile = _require_owned(pid, user)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    # Apply updates to the Pydantic model
    for field, value in updates.items():
        if hasattr(profile, field):
            setattr(profile, field, value)
    profile.updated_at = datetime.now(timezone.utc)
    store.save(profile)
    return store.redact(profile, is_owner=True)


# --------------------------------------------------------------------------- #
# Audit (full pipeline) & assistant                                           #
# --------------------------------------------------------------------------- #
async def _run_owned_audit(pid: str, user: dict) -> dict:
    profile = _require_owned(pid, user)
    result  = await run_audit(profile)
    result_dict = result.to_dict()

    # ── Bug fix: honour gap.override_applied — automatically reallocate ────
    # the declared stage when overestimation is severe (magnitude >= 2).
    if result.gap.override_applied:
        from .schema import MaturityStage
        corrected_stage = MaturityStage(result.diagnostic.classified_stage)
        profile.self_assessment.declared_stage = corrected_stage
        store.save(profile)
        # Update the gap report in the already-serialised result so the
        # frontend renders the corrected state immediately.
        result_dict["perception_reality_gap"]["override_applied"] = True
        result_dict["perception_reality_gap"]["corrected_stage"] = result.diagnostic.classified_stage

    # Persist the profile (score vector updated by run_audit) and audit snapshot.
    store.save(profile)

    # Persist the full audit snapshot so history can retrieve it instantly.
    stage = result.gap.classified_stage
    store.save_audit(
        pid        = pid,
        owner_user_id = user["id"],
        name       = profile.name,
        sector     = profile.sector.value if profile.sector else None,
        stage      = int(stage) if stage else None,
        vector     = profile.last_score_vector,
        audit_dict = result_dict,
    )
    store.append_audit_history(
        pid=pid,
        owner_user_id=user["id"],
        stage=int(stage) if stage else None,
        vector=profile.last_score_vector,
        audit_dict=result_dict,
    )
    return result_dict


@app.post("/api/projects/{pid}/audit")
@limiter.limit("10/minute")
async def audit(request: Request, pid: str, user: dict = Depends(get_current_user)) -> dict:
    return await _run_owned_audit(pid, user)


@app.post("/api/v1/projects/{pid}/diagnose")
@limiter.limit("10/minute")
async def diagnose(request: Request, pid: str, user: dict = Depends(get_current_user)) -> dict:
    """Compatibility endpoint for the final diagnostic handoff payload."""
    return await _run_owned_audit(pid, user)


@app.post("/api/projects/{pid}/assistant")
@limiter.limit("20/minute")
async def assistant(request: Request, pid: str, body: AssistantBody, user: dict = Depends(get_current_user)) -> dict:
    profile = _require_owned(pid, user)
    return await grounded_assistant_reply(profile, body.question)


@app.get("/api/projects/{pid}/audit-history")
def audit_history(pid: str, user: dict = Depends(get_current_user)) -> list[dict]:
    _require_owned(pid, user)
    return store.get_audit_history(pid)


# ── History / management ──────────────────────────────────────────────────── #

@app.get("/api/projects")
def list_projects(user: dict = Depends(get_current_user)) -> list[dict]:
    """Return current user's saved audit summaries (newest first)."""
    return store.list_audits(user["id"])


@app.get("/api/projects/{pid}/last-audit")
def last_audit(pid: str, user: dict = Depends(get_current_user)) -> dict:
    """Return the last persisted audit result without re-running the pipeline."""
    _require_owned(pid, user)          # 404 if profile missing or not owned
    result = store.get_audit(pid)
    if result is None:
        raise HTTPException(404, "No audit result saved yet for this project.")
    return result


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, user: dict = Depends(get_current_user)) -> dict:
    _require_owned(pid, user)
    if not store.delete_project(pid):
        raise HTTPException(404, "Projet introuvable")
    return {"deleted": pid}


# --------------------------------------------------------------------------- #
# Milestone completion — triggers re-score when profile mutation applies      #
# --------------------------------------------------------------------------- #
TRIGGER_MUTATIONS: dict[str, dict] = {
    "missing_market_validation": {"market.customer_validation_evidence": True},
    "missing_legal_form": {"legal_form": "SUARL"},
    "premature_fundraising": {},
    "tech_hype": {},
    "green": {},
    "scalability": {},
    "missing_commercial_offer": {},
}


class MilestoneCompleteBody(BaseModel):
    trigger: str


@app.post("/api/project/{pid}/milestone/{mid}/complete")
async def milestone_complete(
    pid: str, mid: str, body: MilestoneCompleteBody,
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark a milestone done; apply profile mutations and re-score if applicable."""
    profile = _require_owned(pid, user)
    mutations = TRIGGER_MUTATIONS.get(body.trigger, {})

    if mutations:
        from .schema import LegalForm
        for path, value in mutations.items():
            parts = path.split(".")
            obj = profile
            for part in parts[:-1]:
                obj = getattr(obj, part)
            field_name = parts[-1]
            # Coerce string values to LegalForm enum when needed
            if isinstance(value, str):
                try:
                    value = LegalForm(value)
                except (ValueError, TypeError):
                    pass
            setattr(obj, field_name, value)
        profile.updated_at = datetime.now(timezone.utc)
        store.save(profile)

        result = await run_audit(profile)
        result_dict = result.to_dict()
        stage = result.gap.classified_stage
        store.save_audit(
            pid=pid, owner_user_id=user["id"],
            name=profile.name,
            sector=profile.sector.value if profile.sector else None,
            stage=int(stage) if stage else None,
            vector=profile.last_score_vector,
            audit_dict=result_dict,
        )
        store.append_audit_history(
            pid=pid, owner_user_id=user["id"],
            stage=int(stage) if stage else None,
            vector=profile.last_score_vector,
            audit_dict=result_dict,
        )
        new_scores = profile.last_score_vector
        return {"applied": True, "new_scores": new_scores}

    _logger.info("Milestone %s completed for project %s (no mutation for trigger=%s)", mid, pid, body.trigger)
    return {"applied": False, "new_scores": None}


# Convenience: audit an ad-hoc profile without the intake flow (for demos/tests).
@app.post("/api/audit")
async def audit_adhoc(profile: ProjectProfile) -> dict:
    if not settings.debug:
        raise HTTPException(403, "Ad-hoc debugging audit endpoint is disabled")
    store.save(profile)
    result = await run_audit(profile)
    return result.to_dict()


@app.get("/api/eval")
def get_evaluation_report(user: dict = Depends(get_current_user)) -> dict:
    """Run the evaluation protocol suite and return diagnostic, RAG, and scoring consistency scores."""
    from .eval_protocol import eval_diagnostic, eval_rag, eval_scoring_consistency
    return {
        "diagnostic": eval_diagnostic(),
        "rag_retrieval": eval_rag(),
        "scoring_consistency": eval_scoring_consistency(),
    }


# --------------------------------------------------------------------------- #
# Document upload (supporting evidence for projects)                          #
# --------------------------------------------------------------------------- #
_DOCS_DIR = Path(__file__).parent.parent / "_data" / "documents"
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@app.post("/api/projects/{pid}/documents")
async def upload_document(
    pid: str,
    request: Request,
    file: UploadFile = FastAPIFile(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Upload a supporting document (PDF, image, etc.) for a project."""
    _require_owned(pid, user)

    # Enforce file size limit before reading the body
    content_length = request.headers.get("Content-Length")
    if content_length and int(content_length) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large. Maximum size is 10 MB.")

    _DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Sanitize filename and save
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or "document")
    doc_id = uuid4().hex[:12]
    storage_name = f"{pid}_{doc_id}_{safe_name}"
    file_path = _DOCS_DIR / storage_name

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(500, f"Failed to save document: {str(e)}")

    # Extract text. PDFs via pdfplumber; Markdown/plain-text read directly.
    extracted = None
    lower = safe_name.lower()
    if lower.endswith(".pdf"):
        try:
            import pdfplumber  # noqa: F811
        except ImportError:
            pass  # pdfplumber not installed — skip extraction
        else:
            try:
                loop = asyncio.get_running_loop()

                def _extract():
                    with pdfplumber.open(file_path) as pdf:
                        pages = [p.extract_text() or "" for p in pdf.pages]
                        return "\n".join(pages)[:5000]  # cap at 5K chars

                extracted = await loop.run_in_executor(None, _extract)
            except Exception as exc:
                _logger.warning("PDF extraction failed for %s: %s", safe_name, exc)
                extracted = None
    elif lower.endswith((".md", ".markdown", ".txt", ".text")):
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                extracted = fh.read()[:5000]  # cap at 5K chars
        except Exception as exc:
            _logger.warning("Text extraction failed for %s: %s", safe_name, exc)
            extracted = None

    # Store document record
    store.save_document(
        doc_id=doc_id,
        project_id=pid,
        owner_user_id=user["id"],
        filename=safe_name,
        storage_path=str(file_path),
        extracted_text=extracted,
    )

    # Delete ephemeral file after extraction to support container/server redeploys
    try:
        file_path.unlink(missing_ok=True)
    except Exception:
        pass

    return {
        "id": doc_id,
        "filename": safe_name,
        "extracted_preview": extracted[:200] if extracted else None,
        "uploaded": True,
    }


@app.get("/api/projects/{pid}/documents")
def list_documents(pid: str, user: dict = Depends(get_current_user)) -> list[dict]:
    """List all uploaded documents for a project."""
    _require_owned(pid, user)
    return store.list_documents(pid)


@app.delete("/api/projects/{pid}/documents/{doc_id}")
def delete_document(
    pid: str,
    doc_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Delete a specific document from a project."""
    _require_owned(pid, user)
    doc = store.get_document(doc_id)
    if doc is None or doc["project_id"] != pid:
        raise HTTPException(404, "Document introuvable")

    # Remove file from disk
    try:
        Path(doc["storage_path"]).unlink(missing_ok=True)
    except Exception:
        pass

    store.delete_document(doc_id)
    return {"deleted": doc_id}
