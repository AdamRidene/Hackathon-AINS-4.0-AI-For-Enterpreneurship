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
  - "stub"        deterministic, no network — always available

Every provider falls back to the deterministic StubProvider on any error, so the
pipeline runs end-to-end with no model installed (NFR: Reliability). The judge
and justifier therefore always return *something* auditable.
"""
from __future__ import annotations

import json
import os
import re
from abc import ABC, abstractmethod
from typing import Optional

import urllib.error
import urllib.request


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
    def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        ...

    # ---- High-level tasks (shared across providers) ---------------------- #
    def judge_value_proposition(self, narrative: Optional[str]) -> tuple[float, str]:
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
            raw = self._complete(prompt, max_tokens=300)
            m = re.search(r"\{.*\}", raw, re.DOTALL)
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

    def justify(self, context: str) -> str:
        prompt = (
            "Explain, in 2-3 plain sentences for a Tunisian entrepreneur (French), "
            "why the system produced this result. Be specific and reference the "
            "evidence. Do not invent facts.\n\n" + context
        )
        try:
            out = self._complete(prompt, max_tokens=220).strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        return context  # the structured context is itself a faithful explanation

    def chat(self, question: str, context: str) -> str:
        """Grounded Q&A: answer ONLY from the structured context provided."""
        prompt = (
            "Tu es l'assistant Firasa. Réponds à la question du fondateur en "
            "français, en te basant UNIQUEMENT sur le contexte structuré "
            "(diagnostic, scores, feuille de route). N'invente aucun programme.\n\n"
            f"Contexte:\n{context}\n\nQuestion: {question}\n\nRéponse:"
        )
        try:
            out = self._complete(prompt, max_tokens=300).strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        # Deterministic grounded fallback: surface the context directly.
        return (
            "D'après votre diagnostic, voici les éléments structurés pertinents — "
            f"{context}"
        )

    def generate_roadmap_prose(self, gap: str, chunks: list[str]) -> str:
        joined = "\n---\n".join(chunks) if chunks else ""
        prompt = (
            "Using ONLY the retrieved Tunisian institutional sources below, write a "
            "short actionable next step (French) for this diagnostic gap. Quote the "
            "institution. Do not invent programs.\n\n"
            f"Gap: {gap}\n\nSources:\n{joined}"
        )
        try:
            out = self._complete(prompt, max_tokens=260).strip()
            if out:
                return _strip_think(out)
        except Exception:
            pass
        return chunks[0] if chunks else "Aucune source disponible."


def _strip_think(text: str) -> str:
    """qwen3 emits <think>...</think> reasoning; keep only the answer."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


class StubProvider(LLMProvider):
    name = "stub"

    def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        # Force the deterministic fallback paths in the high-level methods.
        raise RuntimeError("stub: deterministic path")


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self) -> None:
        self.host = os.getenv("FIRASA_OLLAMA_HOST", "http://localhost:11434")
        self.model = os.getenv("FIRASA_LLM_MODEL", "qwen3:8b")

    def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        body = json.dumps({
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.2},
        }).encode()
        req = urllib.request.Request(
            f"{self.host}/api/generate", data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=float(os.getenv("FIRASA_LLM_TIMEOUT", "30"))) as r:
            return json.loads(r.read().decode()).get("response", "")


class HuggingFaceProvider(LLMProvider):
    name = "huggingface"

    def __init__(self) -> None:
        self.model = os.getenv("FIRASA_HF_MODEL", "Qwen/Qwen2.5-7B-Instruct")
        self.token = os.getenv("FIRASA_HF_TOKEN", "")
        self.url = f"https://api-inference.huggingface.co/models/{self.model}"

    def _complete(self, prompt: str, max_tokens: int = 400) -> str:
        body = json.dumps({
            "inputs": prompt,
            "parameters": {"max_new_tokens": max_tokens, "temperature": 0.2,
                           "return_full_text": False},
        }).encode()
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.url, data=body, headers=headers)
        with urllib.request.urlopen(req, timeout=float(os.getenv("FIRASA_LLM_TIMEOUT", "30"))) as r:
            data = json.loads(r.read().decode())
            if isinstance(data, list) and data:
                return data[0].get("generated_text", "")
            return data.get("generated_text", "") if isinstance(data, dict) else ""


_PROVIDERS = {"ollama": OllamaProvider, "huggingface": HuggingFaceProvider, "stub": StubProvider}
_cache: dict[str, LLMProvider] = {}


def get_llm() -> LLMProvider:
    key = os.getenv("FIRASA_LLM_PROVIDER", "ollama").lower()
    if key not in _PROVIDERS:
        key = "stub"
    if key not in _cache:
        try:
            _cache[key] = _PROVIDERS[key]()
        except Exception:
            _cache[key] = StubProvider()
    return _cache[key]
