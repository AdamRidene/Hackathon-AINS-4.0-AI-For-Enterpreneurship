"""Unit tests for the LLM providers, including the new OpenAIProvider and fallbacks."""
import asyncio
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.llm import get_llm
from app.llm.provider import get_llm as get_llm_fresh, StubProvider, OpenAIProvider, OllamaProvider, HuggingFaceProvider, _cache

def run_async(coro):
    return asyncio.run(coro)

class TestLLMProviders(unittest.TestCase):
    def setUp(self):
        # Clear provider cache before each test
        _cache.clear()

    def test_default_provider_falls_back_to_stub_if_error(self):
        # When provider is not found or fails, it should fallback to stub
        with patch.dict(os.environ, {"FIRASA_LLM_PROVIDER": "non_existent"}):
            llm = get_llm_fresh()
            assert isinstance(llm, StubProvider) or llm.name == "stub"

    def test_stub_provider_coherence_rubric(self):
        llm = StubProvider()
        # Test empty narrative
        score, rationale = run_async(llm.judge_value_proposition(""))
        assert score == 0.0
        assert "No value-proposition" in rationale

        # Test text triggering deterministic rules with ASCII words to avoid encoding issues
        text = "problem client unique survey solution. This is a longer text that contains more than twenty-five words to satisfy the rubric and score maximum points."
        score, rationale = run_async(llm.judge_value_proposition(text))
        assert score == 100.0
        assert "Deterministic rubric" in rationale

    @patch("httpx.AsyncClient.post")
    def test_openai_provider_success(self, mock_post):
        # Mock response from OpenAI API
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": '{"score": 85, "rationale": "Excellent Value Prop Narrative"}'
                    }
                }
            ]
        }
        mock_resp.raise_for_status = MagicMock()

        async def mock_async_post(*args, **kwargs):
            return mock_resp
        mock_post.side_effect = mock_async_post

        with patch.dict(os.environ, {
            "FIRASA_LLM_PROVIDER": "openai",
            "FIRASA_OPENAI_API_KEY": "test-key",
            "FIRASA_OPENAI_MODEL": "gpt-4o-mini"
        }):
            llm = get_llm_fresh()
            assert isinstance(llm, OpenAIProvider)
            score, rationale = run_async(llm.judge_value_proposition("My startup value proposition..."))
            assert score == 85.0
            assert rationale == "Excellent Value Prop Narrative"

    @patch("httpx.AsyncClient.post")
    def test_openai_provider_failure_falls_back_to_rubric(self, mock_post):
        # Mock failure from OpenAI API
        async def mock_async_post_error(*args, **kwargs):
            raise Exception("API Error")
        mock_post.side_effect = mock_async_post_error

        with patch.dict(os.environ, {
            "FIRASA_LLM_PROVIDER": "openai",
            "FIRASA_OPENAI_API_KEY": "test-key"
        }):
            llm = get_llm_fresh()
            assert isinstance(llm, OpenAIProvider)
            # The failure should cause it to fall back to the deterministic rubric score
            text = "problem client unique survey solution. This is a longer text that contains more than twenty-five words to satisfy the rubric and score maximum points."
            score, rationale = run_async(llm.judge_value_proposition(text))
            assert score == 100.0
            assert "Deterministic rubric" in rationale
