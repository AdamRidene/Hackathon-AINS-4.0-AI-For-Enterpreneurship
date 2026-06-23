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
        # Single source of truth: the repo-root .env (gitignored). When running
        # from backend/, "../.env" resolves to it; from the repo root, ".env" does.
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="FIRASA_",
    )

    # Auth
    auth_mode: Literal["local", "supabase", "none"] = "local"
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_anon_key: str = ""

    # Database
    database_url: str = Field("", validation_alias=AliasChoices("FIRASA_DATABASE_URL", "DATABASE_URL"))
    database_enabled: bool = True  # Set FIRASA_SKIP_DB=true to run without DB
    skip_db: bool = False

    # LLM provider selection
    llm_provider: Literal["ollama", "huggingface", "openai", "groq", "deepseek", "gemini", "stub"] = "stub"

    # Ollama (local)
    ollama_host: str = "http://localhost:11434"
    llm_model: str = "qwen3:8b"

    # Hugging Face Inference API
    hf_model: str = "Qwen/Qwen2.5-7B-Instruct"
    hf_token: str = ""

    # OpenAI-compatible (OpenAI, Groq, OpenRouter, Together AI...)
    openai_api_key: str = Field("", validation_alias=AliasChoices("FIRASA_OPENAI_API_KEY", "OPENAI_API_KEY"))
    openai_api_base: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # Groq (OpenAI-compatible endpoint at api.groq.com)
    groq_api_key: str = Field("", validation_alias=AliasChoices("FIRASA_GROQ_API_KEY", "GROQ_API_KEY"))
    groq_api_base: str = Field(
        "https://api.groq.com/openai/v1",
        validation_alias=AliasChoices("FIRASA_GROQ_API_BASE", "GROQ_API_BASE"),
    )
    groq_model: str = Field(
        "llama-3.1-70b-versatile",
        validation_alias=AliasChoices("FIRASA_GROQ_MODEL", "GROQ_MODEL"),
    )

    # DeepSeek (OpenAI-compatible endpoint at api.deepseek.com)
    deepseek_api_key: str = Field("", validation_alias=AliasChoices("FIRASA_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"))
    deepseek_model: str = Field("deepseek-chat", validation_alias=AliasChoices("FIRASA_DEEPSEEK_MODEL", "DEEPSEEK_MODEL"))

    # Cohere embeddings (optional — enables semantic retrieval when the SDK is installed)
    cohere_api_key: str = Field("", validation_alias=AliasChoices("FIRASA_COHERE_API_KEY", "COHERE_API_KEY"))
    cohere_embedding_model: str = Field(
        "embed-multilingual-v3.0",
        validation_alias=AliasChoices(
            "FIRASA_COHERE_EMBEDDING_MODEL",
            "FIRASA_COHERE_MODEL",
            "COHERE_EMBEDDING_MODEL",
            "COHERE_MODEL",
        ),
    )

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Common
    llm_timeout: float = 30.0
    debug: bool = False
    RATE_LIMIT_BACKOFF_BASE: float = 1.0
    RATE_LIMIT_BACKOFF_MAX: float = 10.0
    DUPLICATE_ANSWER_TTL: float = 300.0
    ARABIC_PROMPT_DIRECTIVE: bool = False

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
