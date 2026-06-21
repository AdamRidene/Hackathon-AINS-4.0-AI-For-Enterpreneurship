"""Centralised application configuration.

Replaces scattered os.getenv() calls with a single importable settings object.
Uses Pydantic BaseSettings for validation and documentation.
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field, AliasChoices, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All Firasa configuration, sourced from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env.dev", "../.env.prod", "../.env.staging"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="FIRASA_",
    )

    # ── Auth ──────────────────────────────────────────────────────────────
    auth_mode: Literal["local", "supabase", "none"] = "local"
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_anon_key: str = ""

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = Field("", validation_alias=AliasChoices("FIRASA_DATABASE_URL", "DATABASE_URL"))
    database_enabled: bool = True  # Set FIRASA_SKIP_DB=true to run without DB
    skip_db: bool = False

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

    @model_validator(mode="after")
    def adjust_database_enabled(self) -> Settings:
        if self.skip_db:
            self.database_enabled = False
        return self


# Singleton — import this everywhere instead of os.getenv()
settings = Settings()

