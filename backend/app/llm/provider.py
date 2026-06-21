"""LLM provider abstraction.

Three responsibilities are delegated to an LLM in Firasa, each as a SECONDARY
layer over deterministic logic (never as the classification or scoring
authority):

  1. judge_value_proposition()  -> P_coh, the VP coherence index [0,100]
                                    (LLM-as-a-Judge, Eq. 4 input)
  2. justify()                  -> natural-language explanation of a score/gate
  3. generate_roadmap_prose()   -> extractive prose grounded in retrieved chunks

Provider selection via env var FIRASA_LLM_PROVIDER:
  - "ollama"      (default) local Ollama, model FIRASA_LLM_MODEL (qwen3:8b)
  - "huggingface" HF Inference API, model FIRASA_HF_MODEL, token FIRASA_HF_TOKEN
  - "openai"      OpenAI-compatible cloud API (Groq, OpenRouter, Gemini, OpenAI)
  - "gemini"      Google Gemini via generative-ai SDK
  - "stub"        deterministic, no network — always available

Every provider falls back to the deterministic StubProvider on any error, so the
pipeline runs end-to-end with no model installed (NFR: Reliability). The judge
and justifier therefore always return *something* auditable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import threading
from abc import ABC, abstractmethod
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


def _get_timeout() -> float:
    t = os.getenv("FIRASA_LLM_TIMEOUT")
    if t is not None:
        try:
            return float(t)
        except ValueError:
            pass
    return settings.llm_timeout

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 1.0  # seconds
MAX_DELAY = 10.0  # seconds
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


def _backoff(attempt: int) -> float:
    """Exponential backoff with jitter: delay = min(max, base * 2^attempt) + jitter."""
    delay = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
    jitter = random.uniform(0, delay * 0.5)
    return delay + jitter


async def _retry_sleep(attempt: int) -> None:
    """Sleep with exponential backoff."""
    await asyncio.sleep(_backoff(attempt))


# --------------------------------------------------------------------------- #
# Deterministic rubric used by the stub AND as the grounded fallback           #
# --------------------------------------------------------------------------- #
def _rubric_pcoh(narrative: Optional[str]) -> float:
    """Transparent 5-criterion rubric proxy for the LLM-as-a-Judge VP score.

    Criteria (Strategyzer VPC, mirrored from concept Sec 6.2): problem clarity,
    segment specificity, differentiation, evidence of customer pain, offer-
    segment alignment. Each worth 20 points. This is deliberately interpretable
    so a judge can audit the fallback path; the real LLM refines it.
    """
    if not narrative or not narrative.strip():
        return 0.0
    text = narrative.lower()
    words = re.findall(r"\w+", text)
    n = len(words)
    score = 0.0
    # problem clarity
    if any(k in text for k in ("problem", "problème", "pain", "besoin", "مشكلة")):
        score += 20
    # segment specificity
    if any(k in text for k in ("segment", "client", "customer", "user", "cible", "عميل")):
        score += 20
    # differentiation
    if any(k in text for k in ("unlike", "different", "unique", "contrairement", "avantage", "ميزة")):
        score += 20
    # evidence of customer pain / validation
    if any(k in text for k in ("survey", "interview", "validate", "validé", "enquête", "preuve")):
        score += 20
    # offer-segment alignment + sufficient depth
    if n >= 25 and any(k in text for k in ("solution", "offer", "offre", "produit", "service")):
        score += 20
    # length damping for very thin narratives
    if n < 10:
        score = min(score, 40)
    return float(min(score, 100))


class LLMProvider(ABC):
    name = "base"

    @abstractmethod
    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        ...

    async def _complete_with_retry(self, prompt: str, max_tokens: int = 400) -> str:
        """Call _complete with exponential-backoff retry on transient failures."""
        last_exc: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            try:
                return await self._complete(prompt, max_tokens)
            except httpx.HTTPStatusError as e:
                last_exc = e
                if e.response.status_code in RETRYABLE_STATUSES and attempt < MAX_RETRIES - 1:
                    logger.warning(
                        "LLM %s HTTP %s — retry %d/%d",
                        self.name, e.response.status_code, attempt + 1, MAX_RETRIES,
                    )
                    await _retry_sleep(attempt)
                else:
                    raise
            except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                last_exc = e
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        "LLM %s network error: %s — retry %d/%d",
                        self.name, e, attempt + 1, MAX_RETRIES,
                    )
                    await _retry_sleep(attempt)
                else:
                    raise
            except RuntimeError:
                # StubProvider or other deliberate failures — don't retry
                raise
        # Should not be reached, but satisfy type checker
        if last_exc:
            raise last_exc
        raise RuntimeError("_complete_with_retry: unreachable")

    # ---- High-level tasks (shared across providers) ---------------------- #
    async def judge_value_proposition(self, narrative: Optional[str]) -> tuple[float, str]:
        """Return (P_coh, rationale). Always deterministic-anchored."""
        rubric = _rubric_pcoh(narrative)
        if not narrative or not narrative.strip():
            return 0.0, "No value-proposition narrative provided."
        prompt = (
            "You are an LLM-as-a-Judge scoring a startup value proposition on five "
            "criteria, each 0-20: problem clarity, segment specificity, "
            "differentiation, evidence of customer pain, offer-segment alignment. "
            "Return ONLY a JSON object {\"score\": <0-100 int>, \"rationale\": <str>}.\n\n"
            f"Value proposition:\n\"\"\"{narrative}\"\"\""
        )
        try:
            raw = await self._complete_with_retry(prompt, max_tokens=300)
            raw = _strip_think(raw)  # remove qwen3-style reasoning blocks
            # Extract the FIRST complete JSON object (non-greedy) to avoid
            # capturing multiple objects when the LLM emits extra text.
            m = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", raw)
            if m:
                obj = json.loads(m.group(0))
                score = float(max(0, min(100, obj.get("score", rubric))))
                rationale = str(obj.get("rationale", "")) or "LLM judge rationale."
                return score, rationale
        except Exception:
            pass
        return rubric, (
            f"Deterministic rubric (5x20): scored {rubric:.0f}/100 on problem "
            "clarity, segment specificity, differentiation, pain evidence, alignment."
        )

    async def justify(self, context: str, lang: str = "fr") -> str:
        if lang == "ar":
            prompt = (
                "وضح في جملتين أو ثلاث جمل بسيطة لمقاول تونسي (باللغة العربية)، "
                "لماذا أنتج النظام هذه النتيجة. كن محددًا واذكر الأدلة. لا تخترع حقائق.\n\n" + context
            )
        else:
            prompt = (
                "Explain, in 2-3 plain sentences for a Tunisian entrepreneur (French), "
                "why the system produced this result. Be specific and reference the "
                "evidence. Do not invent facts.\n\n" + context
            )
        try:
            completed_str = await self._complete_with_retry(prompt, max_tokens=220)
            out = completed_str.strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        return context  # the structured context is itself a faithful explanation

    async def chat(self, question: str, context: str, lang: str = "fr") -> str:
        """Grounded Q&A: answer ONLY from the structured context provided."""
        if lang == "ar":
            prompt = (
                "أنت مساعد فراسة. أجب على سؤال المؤسس بالعربية "
                "(العربية التونسية أو العربية الفصحى المبسطة)، معتمداً فقط على السياق "
                "المنظم (التشخيص، المؤشرات، خارطة الطريق). لا تخترع أي برنامج.\n\n"
                f"السياق:\n{context}\n\nالسؤال: {question}\n\nالجواب:"
            )
        else:
            prompt = (
                "Tu es l'assistant Firasa. Réponds à la question du fondateur en "
                "français, en te basant UNIQUEMENT sur le contexte structuré "
                "(diagnostic, scores, feuille de route). N'invente aucun programme.\n\n"
                f"Contexte:\n{context}\n\nQuestion: {question}\n\nRéponse:"
            )
        try:
            completed_str = await self._complete_with_retry(prompt, max_tokens=300)
            out = completed_str.strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        # Deterministic grounded fallback: surface the context directly.
        if lang == "ar":
            return (
                "وفقًا لتشخيصك، إليك العناصر المهيكلة ذات الصلة — "
                f"{context}"
            )
        return (
            "D'après votre diagnostic, voici les éléments structurés pertinents — "
            f"{context}"
        )

    async def generate_roadmap_prose(self, gap: str, chunks: list[str], lang: str = "fr") -> str:
        joined = "\n---\n".join(chunks) if chunks else ""
        if lang == "ar":
            prompt = (
                "Using ONLY the retrieved Tunisian institutional sources below, write a "
                "short actionable next step (Arabic) for this diagnostic gap. Quote the "
                "institution. Do not invent programs.\n\n"
                f"Gap: {gap}\n\nSources:\n{joined}"
            )
        else:
            prompt = (
                "Using ONLY the retrieved Tunisian institutional sources below, write a "
                "short actionable next step (French) for this diagnostic gap. Quote the "
                "institution. Do not invent programs.\n\n"
                f"Gap: {gap}\n\nSources:\n{joined}"
            )
        try:
            completed_str = await self._complete_with_retry(prompt, max_tokens=260)
            out = completed_str.strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        if lang == "ar":
            return chunks[0] if chunks else "لا توجد مصادر متاحة."
        return chunks[0] if chunks else "Aucune source disponible."


def _strip_think(text: str) -> str:
    """qwen3 emits <think>...</think> reasoning; keep only the answer."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


class StubProvider(LLMProvider):
    name = "stub"

    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        # Force the deterministic fallback paths in the high-level methods.
        raise RuntimeError("stub: deterministic path")


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self) -> None:
        self.host = os.getenv("FIRASA_OLLAMA_HOST") or settings.ollama_host
        self.model = os.getenv("FIRASA_LLM_MODEL") or settings.llm_model

    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        body = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.2},
        }
        timeout = httpx.Timeout(_get_timeout())
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{self.host}/api/generate", json=body)
            resp.raise_for_status()
            return resp.json().get("response", "")


class HuggingFaceProvider(LLMProvider):
    name = "huggingface"

    def __init__(self) -> None:
        self.model = os.getenv("FIRASA_HF_MODEL") or settings.hf_model
        self.token = os.getenv("FIRASA_HF_TOKEN") or settings.hf_token
        self.url = f"https://api-inference.huggingface.co/models/{self.model}"

    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        body = {
            "inputs": prompt,
            "parameters": {"max_new_tokens": max_tokens, "temperature": 0.2,
                           "return_full_text": False},
        }
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        timeout = httpx.Timeout(_get_timeout())
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(self.url, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                return data[0].get("generated_text", "")
            return data.get("generated_text", "") if isinstance(data, dict) else ""


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self) -> None:
        self.api_key = os.getenv("FIRASA_OPENAI_API_KEY") or settings.openai_api_key
        self.api_base = (os.getenv("FIRASA_OPENAI_API_BASE") or settings.openai_api_base).rstrip("/")
        self.model = os.getenv("FIRASA_OPENAI_MODEL") or settings.openai_model

    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": 0.2
        }
        headers = {
            "Content-Type": "application/json"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        timeout = httpx.Timeout(_get_timeout())
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{self.api_base}/chat/completions", json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""


class GeminiProvider(LLMProvider):
    """Google Gemini via the native generative-ai SDK (free tier).

    Free tier: gemini-2.0-flash — 15 RPM, 1M tokens/day.
    Get an API key at https://aistudio.google.com/apikey

    Thread-safety: a module-level lock serialises calls to genai.configure()
    (which mutates global SDK state) and a per-instance flag avoids redundant
    re-configuration when the API key hasn't changed.
    """

    name = "gemini"
    _configure_lock = threading.Lock()
    _configured_key: Optional[str] = None

    def __init__(self) -> None:
        self.api_key = os.getenv("FIRASA_GEMINI_API_KEY") or settings.gemini_api_key
        self.model = os.getenv("FIRASA_GEMINI_MODEL") or settings.gemini_model
        self._genai = None
        try:
            import google.generativeai as _genai
            self._genai = _genai
        except ImportError:
            pass

    async def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        if self._genai is None:
            raise RuntimeError(
                "google-generativeai is not installed. "
                "Run: pip install google-generativeai"
            )

        # Only call configure() when the API key changes (the SDK
        # configure() mutates global state, so we serialise with a lock).
        with GeminiProvider._configure_lock:
            if GeminiProvider._configured_key != self.api_key:
                self._genai.configure(api_key=self.api_key)
                GeminiProvider._configured_key = self.api_key

        # The Gemini SDK is synchronous — run in a thread to avoid blocking
        # the async event loop.
        loop = asyncio.get_running_loop()

        def _generate():
            model = self._genai.GenerativeModel(self.model)
            response = model.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": 0.2,
                },
            )
            return response.text or ""

        return await loop.run_in_executor(None, _generate)


_PROVIDERS = {
    "ollama": OllamaProvider,
    "huggingface": HuggingFaceProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    "stub": StubProvider,
}
_cache: dict[str, LLMProvider] = {}


def get_llm() -> LLMProvider:
    # Read env at call time so tests can patch os.environ mid-run.
    key = os.getenv("FIRASA_LLM_PROVIDER") or settings.llm_provider
    if key not in _PROVIDERS:
        key = "stub"
    if key not in _cache:
        try:
            _cache[key] = _PROVIDERS[key]()
        except Exception:
            _cache[key] = StubProvider()
    return _cache[key]


def clear_llm_cache() -> None:
    """Clear the provider cache so tests can switch providers."""
    _cache.clear()
