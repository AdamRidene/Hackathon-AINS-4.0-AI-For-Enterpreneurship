"""Centralised application configuration.

Replaces scattered os.getenv() calls with a single importable settings object.
Uses Pydantic BaseSettings for validation and documentation.
"""
from __future__ import annotations

import os
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All Firasa configuration, sourced from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Auth ──────────────────────────────────────────────────────────────
    auth_mode: Literal["local", "supabase"] = "local"
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_anon_key: str = ""

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = ""
    database_sslmode: str = "require"  # "require" for Neon, "disable" for local Postgres

    # ── LLM provider ──────────────────────────────────────────────────────
    llm_provider: Literal["ollama", "huggingface", "openai", "gemini", "stub"] = "ollama"

    # Ollama
    ollama_host: str = "http://localhost:11434"
    llm_model: str = "qwen3:8b"

    # Hugging Face
    hf_model: str = "Qwen/Qwen2.5-7B-Instruct"
    hf_token: str = ""

    # OpenAI-compatible
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # ── Common ────────────────────────────────────────────────────────────
    llm_timeout: float = 30.0
    debug: bool = False

    @property
    def is_supabase_auth(self) -> bool:
        return self.auth_mode == "supabase"


# Singleton — import this everywhere instead of os.getenv()
settings = Settings(
    auth_mode=os.getenv("FIRASA_AUTH_MODE", "local"),
    supabase_url=os.getenv("FIRASA_SUPABASE_URL", ""),
    supabase_jwt_secret=os.getenv("FIRASA_SUPABASE_JWT_SECRET", ""),
    supabase_anon_key=os.getenv("FIRASA_SUPABASE_ANON_KEY", ""),
    database_url=os.getenv("DATABASE_URL", ""),
    database_sslmode=os.getenv("DATABASE_SSLMODE", "require"),
    llm_provider=os.getenv("FIRASA_LLM_PROVIDER", "ollama"),
    ollama_host=os.getenv("FIRASA_OLLAMA_HOST", "http://localhost:11434"),
    llm_model=os.getenv("FIRASA_LLM_MODEL", "qwen3:8b"),
    hf_model=os.getenv("FIRASA_HF_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    hf_token=os.getenv("FIRASA_HF_TOKEN", ""),
    openai_api_key=os.getenv("FIRASA_OPENAI_API_KEY", ""),
    openai_api_base=os.getenv("FIRASA_OPENAI_API_BASE", "https://api.openai.com/v1"),
    openai_model=os.getenv("FIRASA_OPENAI_MODEL", "gpt-4o-mini"),
    gemini_api_key=os.getenv("FIRASA_GEMINI_API_KEY", ""),
    gemini_model=os.getenv("FIRASA_GEMINI_MODEL", "gemini-2.0-flash"),
    llm_timeout=float(os.getenv("FIRASA_LLM_TIMEOUT", "30")),
    debug=os.getenv("FIRASA_DEBUG", "false").lower() == "true",
)
