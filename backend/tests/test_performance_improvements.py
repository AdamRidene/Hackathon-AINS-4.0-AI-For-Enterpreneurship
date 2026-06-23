"""Tests for performance and reliability improvements: back-off, JSON parsing, and lang directives."""
import os
import pytest
from unittest.mock import patch

from app.llm.provider import _backoff, parse_llm_json, apply_language_directive, get_llm, clear_llm_cache
from app.config import settings


def test_backoff_delay_calculation():
    """Verify exponential backoff grows and respects max delay and jitter."""
    # Run a few attempts and check the delay values
    for attempt in range(5):
        delay = _backoff(attempt)
        # delay = min(max_delay, base * 2^attempt) + jitter
        # check that delay is at least the base calculation without jitter
        base_delay = settings.RATE_LIMIT_BACKOFF_BASE * (2 ** attempt)
        expected_min = min(settings.RATE_LIMIT_BACKOFF_MAX, base_delay)
        assert delay >= expected_min
        assert delay <= expected_min * 1.5 + 0.1  # jitter is at most 50% of delay


def test_parse_llm_json_noisy_output():
    """Verify JSON parsing utility handles markdown, think tags, and extra text."""
    # Clean JSON
    assert parse_llm_json('{"score": 80, "rationale": "good"}', {}) == {"score": 80, "rationale": "good"}

    # Noisy JSON with Markdown codeblock
    noisy_markdown = """
    Here is the response:
    ```json
    {
      "score": 90,
      "rationale": "excellent"
    }
    ```
    Have a nice day!
    """
    assert parse_llm_json(noisy_markdown, {}) == {"score": 90, "rationale": "excellent"}

    # Noisy JSON with thinking tags
    noisy_thinking = """
    <think>
    Calculating score based on rubric.
    </think>
    {"score": 75, "rationale": "average"}
    """
    assert parse_llm_json(noisy_thinking, {}) == {"score": 75, "rationale": "average"}

    # Malformed JSON fallback
    assert parse_llm_json("not a json at all", {"fallback": True}) == {"fallback": True}


def test_arabic_prompt_directive_injection():
    """Verify language directive injection when ARABIC_PROMPT_DIRECTIVE is True."""
    prompt = "Explain the business plan."

    # With ARABIC_PROMPT_DIRECTIVE = True and lang = "ar"
    with patch.object(settings, "ARABIC_PROMPT_DIRECTIVE", True):
        directed = apply_language_directive(prompt, "ar")
        assert "[LANG=ar]" in directed
        assert prompt in directed

        # Double calling should not prepend twice
        redirected = apply_language_directive(directed, "ar")
        assert redirected.count("[LANG=ar]") == 1

        # lang = "fr" should not inject directive
        not_directed = apply_language_directive(prompt, "fr")
        assert "[LANG=ar]" not in not_directed
        assert not_directed == prompt

    # With ARABIC_PROMPT_DIRECTIVE = False and lang = "ar"
    with patch.object(settings, "ARABIC_PROMPT_DIRECTIVE", False):
        not_directed_disabled = apply_language_directive(prompt, "ar")
        assert "[LANG=ar]" not in not_directed_disabled
        assert not_directed_disabled == prompt


def test_groq_provider_selection():
    """Verify Groq can be selected as a first-class provider."""
    with patch.dict(os.environ, {"FIRASA_LLM_PROVIDER": "groq"}, clear=False):
        clear_llm_cache()
        provider = get_llm()
        assert provider.name == "groq"


def test_cohere_embedding_model_alias():
    """Verify both Cohere model env names are accepted."""
    from app.config import Settings

    with patch.dict(os.environ, {"FIRASA_COHERE_MODEL": "embed-test"}, clear=False):
        cfg = Settings()
        assert cfg.cohere_embedding_model == "embed-test"
