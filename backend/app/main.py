"""Firasa FastAPI application — REST surface over the orchestration layer."""
from __future__ import annotations

import asyncio
import time
import random
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import httpx
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
from .utils import mask_pii, install_pii_log_filter

_logger = logging.getLogger(__name__)
install_pii_log_filter()  # redact PII from all log output

app = FastAPI(title="Firasa Orientation Engine", version=__version__)

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ORIGINS = (
    os.getenv("CORS_ORIGINS", "http://localhost:5174,http://localhost:3000")
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


class DeleteUnverifiedBody(BaseModel):
    email: str


class ConfirmEmailBody(BaseModel):
    email: str
    token: str


class ResendVerificationBody(BaseModel):
    email: str


class ForgotPasswordBody(BaseModel):
    email: str


class VerifyForgotOtpBody(BaseModel):
    email: str
    code: str


class ResetPasswordCustomBody(BaseModel):
    email: str
    code: str
    password: str


class PlanBody(BaseModel):
    plan: str


class ProfileUpdateBody(BaseModel):
    name: str
    email: Optional[str] = None
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
    lang: Optional[str] = None

    @field_validator("lang")
    @classmethod
    def validate_lang(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().lower()
            if v not in ("fr", "ar"):
                raise ValueError(f"lang must be 'fr' or 'ar', got {v}")
            return v
        return v


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
async def register(body: AuthBody) -> dict:
    if settings.auth_mode == "none":
        from .auth import _MOCK_USER
        return {"token": "dev-token", "user": dict(_MOCK_USER)}

    if settings.is_supabase_auth:
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        supabase_url = settings.supabase_url
        if not service_role_key or not supabase_url:
            raise HTTPException(500, "SUPABASE_SERVICE_ROLE_KEY is not set on the server.")

        clean_email = body.email.strip().lower()
        display_name = (body.name or "").strip() or clean_email.split("@")[0]

        # Create user via admin API — Supabase does NOT send any confirmation email this way
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                headers={
                    "apikey": service_role_key,
                    "Authorization": f"Bearer {service_role_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "email": clean_email,
                    "password": body.password,
                    "email_confirm": False,
                    "user_metadata": {"full_name": display_name},
                },
            )

        if res.status_code in (400, 422):
            err = res.json() if res.content else {}
            msg = err.get("msg") or err.get("message") or ""
            if "already" in msg.lower() or "exists" in msg.lower() or res.status_code == 422:
                raise HTTPException(409, "Un compte existe déjà avec cet e-mail. / حساب بهذا البريد موجود بالفعل.")
            raise HTTPException(400, msg or "Données invalides.")
        if res.status_code not in (200, 201):
            detail = res.text
            try:
                detail = res.json().get("msg") or res.text
            except Exception:
                pass
            raise HTTPException(500, f"Échec de la création du compte: {detail}")

        user_data = res.json()
        user_id = user_data.get("id")

        # Generate 24-hour verification token and send our own SMTP email
        token = uuid4().hex
        VERIFICATION_STORE[clean_email + "_verify"] = {
            "token": token,
            "expires_at": time.time() + 86400,
            "user_id": user_id,
        }

        app_url = os.getenv("FIRASA_APP_URL", "http://localhost:5174")
        verify_link = f"{app_url}/verify?token={token}&email={clean_email}"
        try:
            send_verification_email_via_smtp(clean_email, display_name, verify_link)
        except Exception as exc:
            _logger.warning("Failed to send verification email to %s: %s", clean_email, exc)

        return {
            "user": {
                "id": user_id,
                "email": clean_email,
                "name": display_name,
                "plan": "free",
                "pendingEmailConfirmation": True,
            }
        }

    # Local auth mode
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


# --------------------------------------------------------------------------- #
# Token stores & SMTP helpers                                                 #
# --------------------------------------------------------------------------- #
OTP_STORE: dict[str, dict] = {}
VERIFICATION_STORE: dict[str, dict] = {}  # keyed by email+"_verify"


def send_verification_email_via_smtp(email: str, name: str, verify_link: str) -> None:
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port_str = os.getenv("SMTP_PORT", "587")
    try:
        smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = 587

    if not smtp_user or not smtp_password:
        print(f"\n[DEV MODE] Verification link for {email}:\n{verify_link}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Vérifiez votre compte Firasa / تأكيد حساب فراسة"
    msg["From"] = f"Firasa <{smtp_user}>"
    msg["To"] = email

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #2d3748;">
      <div dir="rtl" style="text-align: right; margin-bottom: 24px; border-bottom: 1px solid #edf2f7; padding-bottom: 24px;">
        <h2 style="color: #1e3a8a; margin-top: 0; font-size: 22px;">تأكيد حساب فراسة</h2>
        <p style="color: #4a5568; font-size: 15px; margin: 8px 0 16px 0;">مرحباً {name}، انقر على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{verify_link}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #3B82F6, #2563EB); color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 700;">
            تأكيد حسابي
          </a>
        </div>
        <p style="color: #718096; font-size: 13px; margin: 12px 0 0 0;">إذا لم تقم بإنشاء هذا الحساب، انقر على الزر واختر "لم أكن أنا" لحذف الحساب.</p>
        <p style="color: #a0aec0; font-size: 12px; margin: 6px 0 0 0;">ينتهي هذا الرابط خلال 24 ساعة.</p>
      </div>
      <div style="text-align: left; padding-top: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0; font-size: 20px;">Confirmez votre compte Firasa</h2>
        <p style="color: #4a5568; font-size: 15px; margin: 8px 0 16px 0;">Bonjour {name}, cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et activer votre compte.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{verify_link}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #3B82F6, #2563EB); color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 700;">
            Vérifier mon compte
          </a>
        </div>
        <p style="color: #718096; font-size: 13px; margin: 12px 0 0 0;">Si vous n'avez pas créé ce compte, cliquez sur le bouton et choisissez « Ce n'était pas moi » pour supprimer le compte.</p>
        <p style="color: #a0aec0; font-size: 12px; margin: 6px 0 0 0;">Ce lien expire dans 24 heures.</p>
      </div>
    </div>
    """
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, email, msg.as_string())


def send_reset_otp_via_smtp(email: str, code: str) -> None:
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port_str = os.getenv("SMTP_PORT", "587")
    try:
        smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = 587

    # If SMTP credentials are not set, output OTP to console for local testing
    if not smtp_user or not smtp_password:
        print(f"\n[DEV MODE] Reset OTP generated for {email}: {code}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Votre code de réinitialisation Firasa / رمز إعادة تعيين كلمة المرور فراسة"
    msg["From"] = f"Firasa <{smtp_user}>"
    msg["To"] = email

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #2d3748;">
      <div dir="rtl" style="text-align: right; margin-bottom: 24px; border-bottom: 1px solid #edf2f7; padding-bottom: 24px;">
        <h2 style="color: #1e3a8a; margin-top: 0; font-size: 22px;">إعادة تعيين كلمة المرور - فراسة</h2>
        <p style="color: #4a5568; font-size: 15px; margin: 8px 0 16px 0;">لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. إليك رمز التأكيد الخاص بك:</p>
        <div style="text-align: center; margin: 16px 0;">
          <span style="font-size: 34px; font-weight: bold; color: #3B82F6; letter-spacing: 6px; padding: 12px 24px; background-color: #f7fafc; border: 1px dashed #3B82F6; border-radius: 8px; display: inline-block; direction: ltr;">
            {code}
          </span>
        </div>
        <p style="color: #718096; font-size: 13px; margin: 8px 0 0 0;">تنتهي صلاحية هذا الرمز خلال دقيقتين.</p>
      </div>
      <div style="text-align: left; padding-top: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0; font-size: 20px;">Réinitialisation de mot de passe - Firasa</h2>
        <p style="color: #4a5568; font-size: 15px; margin: 8px 0 16px 0;">Nous avons reçu une demande de réinitialisation de votre mot de passe. Voici votre code de confirmation :</p>
        <div style="text-align: center; margin: 16px 0;">
          <span style="font-size: 34px; font-weight: bold; color: #3B82F6; letter-spacing: 6px; padding: 12px 24px; background-color: #f7fafc; border: 1px dashed #3B82F6; border-radius: 8px; display: inline-block;">
            {code}
          </span>
        </div>
        <p style="color: #718096; font-size: 13px; margin: 8px 0 0 0;">Ce code expire dans 2 minutes.</p>
      </div>
    </div>
    """
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    # Connect and send via SMTP
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, email, msg.as_string())


async def _user_id_from_supabase_by_email(email: str) -> Optional[str]:
    supabase_url = settings.supabase_url
    if not supabase_url:
        return None
    clean = email.strip().lower()
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = settings.supabase_anon_key
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Try admin API first — searches auth.users (requires service role key)
            if service_role_key:
                res = await client.get(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                    params={"filter": clean, "per_page": 20},
                    headers={
                        "apikey": service_role_key,
                        "Authorization": f"Bearer {service_role_key}",
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    users = data.get("users", [])
                    for u in users:
                        if u.get("email", "").lower() == clean:
                            return u.get("id")
            # Fallback: query profiles table (works if email column exists there)
            auth_key = service_role_key or anon_key
            if auth_key:
                res = await client.get(
                    f"{supabase_url.rstrip('/')}/rest/v1/profiles",
                    params={"email": f"eq.{clean}", "select": "id"},
                    headers={
                        "apikey": auth_key,
                        "Authorization": f"Bearer {auth_key}",
                    },
                )
                if res.status_code == 200 and res.json():
                    return res.json()[0].get("id")
    except Exception as exc:
        print(f"Error querying Supabase user by email: {exc}")
    return None


@app.post("/api/auth/forgot-password")
async def forgot_password_endpoint(body: ForgotPasswordBody) -> dict:
    clean_email = body.email.strip().lower()

    # 1. Check if user exists in SQLite or Supabase
    user_exists = False
    sqlite_user = store.get_user_by_email(clean_email)
    if sqlite_user:
        user_exists = True

    supabase_url = settings.supabase_url
    if supabase_url and not user_exists:
        sb_user_id = await _user_id_from_supabase_by_email(clean_email)
        if sb_user_id:
            user_exists = True

    if settings.auth_mode == "none":
        user_exists = True

    # In Supabase mode, always proceed to avoid user enumeration and because
    # the admin API lookup may fail transiently; the reset step will catch non-existent users.
    if settings.is_supabase_auth:
        user_exists = True

    if not user_exists:
        raise HTTPException(404, "User not found / Utilisateur introuvable")

    # 2. Generate 6-digit verification code
    code = f"{random.randint(100000, 999999)}"
    OTP_STORE[clean_email + "_reset"] = {
        "code": code,
        "expires_at": time.time() + 120,
    }

    # 3. Send email using SMTP
    try:
        send_reset_otp_via_smtp(clean_email, code)
    except Exception as exc:
        raise HTTPException(500, f"Failed to send reset email: {str(exc)}")

    return {"ok": True}


@app.post("/api/auth/verify-forgot-otp")
def verify_forgot_otp_endpoint(body: VerifyForgotOtpBody) -> dict:
    clean_email = body.email.strip().lower()
    record = OTP_STORE.get(clean_email + "_reset")
    if not record:
        raise HTTPException(400, "No reset code generated / Pas de code de réinitialisation généré")
    if time.time() > record["expires_at"]:
        raise HTTPException(400, "Code expired / Code expiré")
    if record["code"] != body.code:
        raise HTTPException(400, "Invalid code / Code invalide")

    return {"ok": True}


@app.post("/api/auth/reset-password")
async def reset_password_endpoint(body: ResetPasswordCustomBody) -> dict:
    clean_email = body.email.strip().lower()
    record = OTP_STORE.get(clean_email + "_reset")
    
    # 1. Verify code
    if not record:
        raise HTTPException(400, "No reset code generated / Pas de code de réinitialisation généré")
    if time.time() > record["expires_at"]:
        raise HTTPException(400, "Code expired / Code expiré")
    if record["code"] != body.code:
        raise HTTPException(400, "Invalid code / Code invalide")

    # 2. Update password in local SQLite if user exists there
    sqlite_user = store.get_user_by_email(clean_email)
    if sqlite_user:
        store.update_user_password(clean_email, body.password)

    # 3. Update password in Supabase if active
    supabase_url = settings.supabase_url
    if supabase_url and settings.is_supabase_auth:
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not service_role_key:
            raise HTTPException(
                500,
                "Supabase service role key is missing on the server. "
                "Please add SUPABASE_SERVICE_ROLE_KEY to your backend .env file."
            )
        
        sb_user_id = await _user_id_from_supabase_by_email(clean_email)
        if not sb_user_id:
            raise HTTPException(404, "User profile not found in Supabase")

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.put(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{sb_user_id}",
                    headers={
                        "apikey": service_role_key,
                        "Authorization": f"Bearer {service_role_key}",
                        "Content-Type": "application/json",
                    },
                    json={"password": body.password},
                )
                if res.status_code != 200:
                    detail = res.text
                    try:
                        detail = res.json().get("msg") or res.text
                    except Exception:
                        pass
                    raise HTTPException(500, f"Failed to update password in Supabase: {detail}")
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Supabase service is unavailable") from exc

    # Clean up OTP after reset
    OTP_STORE.pop(clean_email + "_reset", None)
    return {"ok": True}


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


@app.delete("/api/auth/delete-unverified")
async def delete_unverified_account(body: DeleteUnverifiedBody) -> dict:
    """Delete an unverified account when the user clicks 'That wasn't me'."""
    if not settings.is_supabase_auth:
        raise HTTPException(404, "Not available in local auth mode")

    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_url = settings.supabase_url
    if not service_role_key or not supabase_url:
        raise HTTPException(500, "Supabase service role key not configured")

    clean_email = body.email.strip().lower()
    if not clean_email:
        raise HTTPException(400, "Email is required")

    sb_user_id = await _user_id_from_supabase_by_email(clean_email)
    if not sb_user_id:
        # User doesn't exist — treat as success (idempotent)
        return {"ok": True}

    async with httpx.AsyncClient(timeout=10) as client:
        # Fetch user to confirm they are still unverified
        res = await client.get(
            f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{sb_user_id}",
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
        )
        if res.status_code != 200:
            raise HTTPException(500, "Failed to fetch user details from Supabase")

        user_data = res.json()
        if user_data.get("email_confirmed_at"):
            raise HTTPException(409, "Cannot delete a verified account")

        # Delete the unverified user
        del_res = await client.delete(
            f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{sb_user_id}",
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
        )
        if del_res.status_code not in (200, 204):
            raise HTTPException(500, "Failed to delete user from Supabase")

    VERIFICATION_STORE.pop(clean_email + "_verify", None)
    return {"ok": True}


@app.post("/api/auth/confirm-email")
async def confirm_email(body: ConfirmEmailBody) -> dict:
    """Confirm a user's email using our custom verification token."""
    if not settings.is_supabase_auth:
        raise HTTPException(404, "Not available in local auth mode")

    clean_email = body.email.strip().lower()
    record = VERIFICATION_STORE.get(clean_email + "_verify")

    if not record:
        raise HTTPException(400, "Lien invalide ou expiré. Demandez un nouveau lien. / رابط غير صالح أو منتهي الصلاحية.")
    if time.time() > record["expires_at"]:
        VERIFICATION_STORE.pop(clean_email + "_verify", None)
        raise HTTPException(400, "Lien expiré. Demandez un nouveau lien. / انتهت صلاحية الرابط.")
    if record["token"] != body.token:
        raise HTTPException(400, "Lien invalide. / رابط غير صالح.")

    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_url = settings.supabase_url
    if not service_role_key or not supabase_url:
        raise HTTPException(500, "Supabase service role key not configured")

    user_id = record.get("user_id") or await _user_id_from_supabase_by_email(clean_email)
    if not user_id:
        raise HTTPException(404, "Utilisateur introuvable. / المستخدم غير موجود.")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.put(
            f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            },
            json={"email_confirm": True},
        )
        if res.status_code != 200:
            raise HTTPException(500, "Échec de la confirmation de l'e-mail.")

    VERIFICATION_STORE.pop(clean_email + "_verify", None)
    return {"ok": True}


@app.post("/api/auth/resend-verification")
async def resend_verification(body: ResendVerificationBody) -> dict:
    """Resend the custom verification email."""
    if not settings.is_supabase_auth:
        raise HTTPException(404, "Not available in local auth mode")

    clean_email = body.email.strip().lower()
    record = VERIFICATION_STORE.get(clean_email + "_verify")
    if not record:
        raise HTTPException(400, "No pending verification for this email.")

    user_id = record.get("user_id")
    display_name = clean_email.split("@")[0]

    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_url = settings.supabase_url
    if service_role_key and supabase_url and user_id:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
                    headers={"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"},
                )
                if res.status_code == 200:
                    display_name = res.json().get("user_metadata", {}).get("full_name", display_name)
        except Exception:
            pass

    new_token = uuid4().hex
    VERIFICATION_STORE[clean_email + "_verify"] = {
        "token": new_token,
        "expires_at": time.time() + 86400,
        "user_id": user_id,
    }

    app_url = os.getenv("FIRASA_APP_URL", "http://localhost:5174")
    verify_link = f"{app_url}/verify?token={new_token}&email={clean_email}"
    try:
        send_verification_email_via_smtp(clean_email, display_name, verify_link)
    except Exception as exc:
        raise HTTPException(500, f"Failed to send verification email: {str(exc)}")

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
        email=body.email,
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


@app.get("/api/projects/{pid}/provisional-diagnosis")
def provisional_diagnosis(pid: str, user: dict = Depends(get_current_user)) -> dict:
    """Lightweight in-progress diagnosis used during intake before full audit."""
    profile = _require_owned(pid, user)
    from .diagnostic import classify

    diagnostic = classify(profile)
    return {
        "project_id": pid,
        "intake_complete": profile.intake_complete,
        "answered_questions": len(profile.answered_questions),
        "diagnostic": diagnostic.to_dict(),
    }


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


FLAT_TO_DOTTED_PATH = {
    # Self-assessment
    "declared_stage": "self_assessment.declared_stage",
    "declared_revenue": "self_assessment.declared_revenue",
    "declared_legal_form": "self_assessment.declared_legal_form",
    # Market
    "estimated_tam_tnd": "market.estimated_tam_tnd",
    "competitor_headcount": "market.competitor_headcount",
    "customer_validation_evidence": "market.customer_validation_evidence",
    # Commercial
    "value_proposition_narrative": "commercial.value_proposition_narrative",
    "mvp_stage": "commercial.mvp_stage",
    "pricing_framework": "commercial.pricing_framework",
    "pricing_coherence": "commercial.pricing_coherence",
    # Innovation
    "geo_novelty": "innovation.geo_novelty",
    "tech_stack": "innovation.tech_stack",
    "ip_status": "innovation.ip_status",
    # Scalability
    "human_dependency": "scalability.human_dependency",
    "equipment_cost": "scalability.equipment_cost",
    "monthly_overhead": "scalability.monthly_overhead",
    "cross_border_zones": "scalability.cross_border_zones",
    # Green
    "footprint_category": "green.footprint_category",
    "circular_recycling": "green.circular_recycling",
    "sdg_targets": "green.sdg_targets",
}


class ProfilePatchBody(BaseModel):
    """Partial update — every field is optional."""
    name: Optional[str] = None
    sector: Optional[str] = None
    language: Optional[str] = None

    # Self-assessment
    declared_stage: Optional[int] = None
    declared_revenue: Optional[bool] = None
    declared_legal_form: Optional[str] = None

    # Market
    estimated_tam_tnd: Optional[float] = Field(None, ge=0.0)
    competitor_headcount: Optional[int] = Field(None, ge=0)
    customer_validation_evidence: Optional[bool] = None

    # Commercial
    value_proposition_narrative: Optional[str] = None
    mvp_stage: Optional[str] = None
    pricing_framework: Optional[str] = None
    pricing_coherence: Optional[float] = None

    # Innovation
    geo_novelty: Optional[str] = None
    tech_stack: Optional[list[str]] = None
    ip_status: Optional[str] = None

    # Scalability
    human_dependency: Optional[int] = Field(None, ge=1, le=10)
    equipment_cost: Optional[float] = Field(None, ge=0.0)
    monthly_overhead: Optional[float] = Field(None, ge=0.0)
    cross_border_zones: Optional[list[str]] = None

    # Green
    footprint_category: Optional[str] = None
    circular_recycling: Optional[bool] = None
    sdg_targets: Optional[list[int]] = None

    # Flat top-level fields
    legal_form: Optional[str] = None
    has_problem_statement: Optional[bool] = None
    user_segment_identified: Optional[bool] = None
    months_unit_economics: Optional[int] = Field(None, ge=0)
    has_revenue_model: Optional[bool] = None
    repeatable_sales: Optional[bool] = None

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
async def patch_project(pid: str, body: ProfilePatchBody, user: dict = Depends(get_current_user)) -> dict:
    """Update project profile fields directly (no state machine)."""
    profile = _require_owned(pid, user)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    from .intake.state_machine import find_question_for_field, coerce_field_value, sync_profile_state, _set_path

    # Apply updates to the Pydantic model
    for field, value in updates.items():
        dotted_path = FLAT_TO_DOTTED_PATH.get(field)
        if dotted_path:
            q = find_question_for_field(field)
            coerced_value = coerce_field_value(q, value) if q else value
            _set_path(profile, dotted_path, coerced_value)
        else:
            q = find_question_for_field(field)
            coerced_value = coerce_field_value(q, value) if q else value
            if hasattr(profile, field):
                setattr(profile, field, coerced_value)

    profile.updated_at = datetime.now(timezone.utc)
    
    # Run synchronization to update answered_questions and clean stale dependencies
    sync_profile_state(profile)
    
    store.save(profile)

    # Immediately re-run audit pipeline to persist history and update scores
    await _run_owned_audit(pid, user)

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
    return await grounded_assistant_reply(profile, body.question, lang=body.lang)


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
        
        # Run synchronization to update answered_questions and clean stale dependencies
        from .intake.state_machine import sync_profile_state
        sync_profile_state(profile)
        
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


_eval_jobs: dict = {}        # job_id → {status, progress, result, error}
_eval_cache: dict = {}       # keys: "result", "cached_at" (epoch float)
_EVAL_CACHE_TTL = 1800       # 30 min — deterministic eval doesn't change between runs

async def _run_eval_job(job_id: str) -> None:
    from .eval_protocol import eval_assistant_tool_trace, eval_diagnostic, eval_rag, eval_scoring_consistency
    import time
    try:
        loop = asyncio.get_running_loop()
        _eval_jobs[job_id]["result"] = {}

        diag = await loop.run_in_executor(None, eval_diagnostic)
        _eval_jobs[job_id]["result"]["diagnostic"] = diag
        _eval_jobs[job_id]["progress"] = 1

        rag = await loop.run_in_executor(None, eval_rag)
        _eval_jobs[job_id]["result"]["rag_retrieval"] = rag
        _eval_jobs[job_id]["progress"] = 2

        scoring = await loop.run_in_executor(None, eval_scoring_consistency)
        _eval_jobs[job_id]["result"]["scoring_consistency"] = scoring
        _eval_jobs[job_id]["progress"] = 3

        assistant = await loop.run_in_executor(None, eval_assistant_tool_trace)
        _eval_jobs[job_id]["result"]["assistant_tool_trace"] = assistant
        _eval_jobs[job_id]["progress"] = 4
        _eval_jobs[job_id]["status"] = "done"

        # Populate cache so next eval/start returns instantly
        _eval_cache["result"] = _eval_jobs[job_id]["result"]
        _eval_cache["cached_at"] = time.time()
    except Exception as exc:
        _eval_jobs[job_id]["status"] = "failed"
        _eval_jobs[job_id]["error"] = str(exc)


@app.post("/api/eval/start")
async def eval_start(user: dict = Depends(get_current_user)) -> dict:
    import time
    # Return cached result instantly if fresh (< 30 min)
    if _eval_cache.get("cached_at") and (time.time() - _eval_cache["cached_at"]) < _EVAL_CACHE_TTL:
        job_id = "cached"
        _eval_jobs[job_id] = {
            "status": "done", "progress": 4,
            "result": _eval_cache["result"], "error": None,
        }
        return {"job_id": job_id, "cached": True}

    job_id = uuid4().hex[:8]
    _eval_jobs[job_id] = {"status": "running", "progress": 0, "result": {}, "error": None}
    asyncio.create_task(_run_eval_job(job_id))
    return {"job_id": job_id, "cached": False}


@app.get("/api/eval/status/{job_id}")
def eval_status(job_id: str, user: dict = Depends(get_current_user)) -> dict:
    job = _eval_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    return job


@app.get("/api/eval")
def get_evaluation_report(user: dict = Depends(get_current_user)) -> dict:
    """Legacy sync endpoint — kept for backwards compat."""
    from .eval_protocol import eval_assistant_tool_trace, eval_diagnostic, eval_rag, eval_scoring_consistency
    return {
        "diagnostic": eval_diagnostic(),
        "rag_retrieval": eval_rag(),
        "scoring_consistency": eval_scoring_consistency(),
        "assistant_tool_trace": eval_assistant_tool_trace(),
    }


# --------------------------------------------------------------------------- #
# Document upload (supporting evidence for projects)                          #
# --------------------------------------------------------------------------- #
_DOCS_DIR = Path(__file__).parent.parent / "_data" / "documents"
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024   # 5 MB
_ALLOWED_EXTENSIONS = {".pdf", ".md", ".markdown", ".txt", ".text"}


@app.post("/api/projects/{pid}/documents")
@limiter.limit("5/minute")
async def upload_document(
    pid: str,
    request: Request,
    file: UploadFile = FastAPIFile(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Upload a supporting document (PDF, MD, TXT) for a project."""
    _require_owned(pid, user)

    # Validate file type
    lower_name = (file.filename or "").lower()
    if not any(lower_name.endswith(ext) for ext in _ALLOWED_EXTENSIONS):
        raise HTTPException(415, "Unsupported file type. Allowed: PDF, MD, TXT.")

    # Enforce file size limit before reading the body
    content_length = request.headers.get("Content-Length")
    if content_length and int(content_length) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large. Maximum size is 5 MB.")

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

    # Mask PII in extracted text before storing at rest
    if extracted:
        extracted = mask_pii(extracted)

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


# --------------------------------------------------------------------------- #
# News Cards Endpoint (NewsAPI with 1-hour memory cache & robust fallback)   #
# --------------------------------------------------------------------------- #
_NEWS_CACHE: dict[str, dict[str, Any]] = {
    "fr": {"data": None, "expiry": 0.0},
    "ar": {"data": None, "expiry": 0.0},
}

_FALLBACK_NEWS = {
    "fr": [
        {
            "id": 1,
            "title": "Startup Act Tunisie : Guide complet et éligibilité",
            "desc": "Tout savoir sur les démarches d'octroi du label Startup, les avantages fiscaux et l'accompagnement Smart Capital.",
            "category": "Tunisie",
            "image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
            "url": "https://startup.smartcapital.tn/"
        },
        {
            "id": 2,
            "title": "L'Agence de Promotion de l'Industrie et de l'Innovation (APII)",
            "desc": "Explorez les services d'assistance, d'enregistrement et de soutien aux projets industriels et d'innovation en Tunisie.",
            "category": "Innovation",
            "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.apii.gov.tn/"
        },
        {
            "id": 3,
            "title": "ANETI : Programmes d'incitation à l'emploi et entrepreneuriat",
            "desc": "Découvrez les mécanismes de soutien à l'auto-emploi, le SIVP et les fonds d'aide aux jeunes promoteurs tunisiens.",
            "category": "Entrepreneur",
            "image": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.aneti.tn/"
        },
        {
            "id": 4,
            "title": "FIPA Tunisia : Attirer les investissements technologiques",
            "desc": "Le portail officiel pour s'informer sur les opportunités de partenariat international et l'implantation en Tunisie.",
            "category": "Conseils",
            "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.investintunisia.tn/"
        },
        {
            "id": 5,
            "title": "CEPEX : Booster les exportations des jeunes entreprises",
            "desc": "Comment positionner votre produit tunisien à l'échelle internationale grâce au centre de promotion des exportations.",
            "category": "Financement",
            "image": "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.cepex.nat.tn/"
        },
        {
            "id": 6,
            "title": "Flat6Labs Tunis : Accélération et financement d'amorçage",
            "desc": "Postulez au programme d'accélération leader en Tunisie pour obtenir un ticket d'investissement et du mentorat.",
            "category": "MENA",
            "image": "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=600&q=80",
            "url": "https://flat6labs.com/program/tunis-seed-program/"
        }
    ],
    "ar": [
        {
            "id": 1,
            "title": "بوابة المؤسسات الناشئة بتونس (Smart Capital)",
            "desc": "كل ما تحتاجه لمعرفة شروط الحصول على علامة 'مؤسسة ناشئة' والامتيازات الجبائية والمالية المرافقة.",
            "category": "تونس",
            "image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
            "url": "https://startup.smartcapital.tn/"
        },
        {
            "id": 2,
            "title": "وكالة النهوض بالصناعة والتجديد (APII)",
            "desc": "الخدمات الإدارية، إيداع التصاريح، ومرافقة المشاريع المبتكرة في مختلف القطاعات الصناعية بتونس.",
            "category": "ابتكار",
            "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.apii.gov.tn/"
        },
        {
            "id": 3,
            "title": "الوكالة الوطنية للتشغيل والعمل المستقل (ANETI)",
            "desc": "آليات التشغيل الذكي، برامج دعم الباعثين الشبان، وخطوات تمويل المشاريع الصغرى.",
            "category": "ريادة أعمال",
            "image": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.aneti.tn/"
        },
        {
            "id": 4,
            "title": "وكالة النهوض بالاستثمار الخارجي (FIPA Tunisia)",
            "desc": "دليلك الكامل لاستكشاف فرص الشراكة العالمية والتعريف بتونس كوجهة استثمارية تكنولوجية واعدة.",
            "category": "نصائح",
            "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.investintunisia.tn/"
        },
        {
            "id": 5,
            "title": "مركز النهوض بالصادرات (CEPEX)",
            "desc": "برامج الدعم الفني والمالي لمساعدة المؤسسات التونسية الحديثة على ولوج الأسواق العالمية وتصدير خدماتها.",
            "category": "تمويل",
            "image": "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=600&q=80",
            "url": "https://www.cepex.nat.tn/"
        },
        {
            "id": 6,
            "title": "برنامج تسريع نمو الشركات الناشئة Flat6Labs بتونس",
            "desc": "التقديم لبرنامج التمويل الأولي والتدريب والإحاطة الشاملة للشركات الواعدة بتونس.",
            "category": "الشرق الأوسط وشمال إافريقيا",
            "image": "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=600&q=80",
            "url": "https://flat6labs.com/program/tunis-seed-program/"
        }
    ]
}


@app.get("/api/news")
async def get_news(lang: str = "fr") -> list[dict]:
    """Get active startup and innovation news, caching the results to respect API quotas."""
    lang = "ar" if lang == "ar" else "fr"
    now = time.time()

    # 1. Return from cache if fresh
    cache = _NEWS_CACHE[lang]
    if cache["data"] is not None and now < cache["expiry"]:
        return cache["data"]

    # 2. Try fetching from NewsAPI
    newsapi_key = settings.newsapi_key
    fallback_list = _FALLBACK_NEWS[lang]

    if not newsapi_key:
        _NEWS_CACHE[lang] = {"data": fallback_list, "expiry": now + 600}
        return fallback_list

    # Setup queries
    q_query = (
        "ريادة الأعمال OR \"شركة ناشئة\" OR ابتكار"
        if lang == "ar"
        else "entrepreneurship OR startup OR \"innovation technologique\""
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": q_query,
                    "language": lang,
                    "sortBy": "publishedAt",
                    "pageSize": 24,
                    "apiKey": newsapi_key,
                }
            )
            if res.status_code == 200:
                data = res.json()
                articles = data.get("articles", [])
                formatted = []
                idx = 1
                for art in articles:
                    title = art.get("title")
                    desc = art.get("description")
                    url = art.get("url")
                    image = art.get("urlToImage")

                    # Skip empty items or articles with missing crucial fields
                    if not title or not url or "[Removed]" in title:
                        continue

                    title_lower = title.lower()
                    desc_lower = (desc or "").lower()

                    # Assign category based on simple keyword analysis
                    if "tunis" in title_lower or "tunis" in desc_lower or "تونس" in title_lower or "تونس" in desc_lower or "tunisienne" in title_lower or "tunisien" in title_lower or "تونسي" in title_lower:
                        cat = "Tunisie" if lang == "fr" else "تونس"
                    elif "mena" in title_lower or "mena" in desc_lower or "middle east" in title_lower or "middle east" in desc_lower or "الشرق الأوسط" in title_lower or "الشرق الأوسط" in desc_lower or "شمال إفريقيا" in title_lower or "شمال إفريقيا" in desc_lower:
                        cat = "MENA" if lang == "fr" else "الشرق الأوسط وشمال إفريقيا"
                    elif "entrepreneur" in title_lower or "entrepreneur" in desc_lower or "ريادة" in title_lower or "ريادة" in desc_lower or "رواد" in title_lower or "رواد" in desc_lower or "مبادر" in title_lower or "مبادر" in desc_lower:
                        cat = "Entrepreneur" if lang == "fr" else "ريادة أعمال"
                    elif "ia" in title_lower or "artificial" in title_lower or "intelligence" in title_lower or "ذكاء" in title_lower:
                        cat = "IA / Innovation" if lang == "fr" else "ذكاء اصطناعي"
                    elif "outil" in title_lower or "tool" in title_lower or "techno" in title_lower or "أداة" in title_lower:
                        cat = "Outils" if lang == "fr" else "أدوات"
                    elif "levée" in title_lower or "invest" in title_lower or "financement" in title_lower or "تمويل" in title_lower:
                        cat = "Financement" if lang == "fr" else "تمويل"
                    else:
                        cat = "Écosystème" if lang == "fr" else "منظومة"

                    fallback_imgs = [
                        "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
                        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
                        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
                    ]
                    if not image:
                        image = fallback_imgs[idx % len(fallback_imgs)]

                    formatted.append({
                        "id": idx,
                        "title": title,
                        "desc": desc or (title[:80] + "..."),
                        "category": cat,
                        "image": image,
                        "url": url
                    })
                    idx += 1

                if formatted:
                    _NEWS_CACHE[lang] = {"data": formatted, "expiry": now + 3600}
                    return formatted

    except Exception as exc:
        _logger.warning("Error fetching live news from NewsAPI: %s", exc)

    # Cache the fallback if API failed
    _NEWS_CACHE[lang] = {"data": fallback_list, "expiry": now + 600}
    return fallback_list

