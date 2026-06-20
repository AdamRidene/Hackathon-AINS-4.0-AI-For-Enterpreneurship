"""Evaluation protocol coverage."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from app.eval_protocol import eval_diagnostic, eval_rag, eval_scoring_consistency  # noqa: E402


def test_eval_protocol_matches_concept_sizes():
    diagnostic = eval_diagnostic()
    rag = eval_rag()
    scoring = eval_scoring_consistency()

    assert diagnostic["n"] == 60
    assert len(diagnostic["rows"]) == 60
    assert diagnostic["MASE_threshold"] == 0.5

    assert rag["queries"] == 30
    assert len(rag["rows"]) == 30
    assert rag["threshold"] == 0.7
    assert rag["passes"] is True

    assert scoring["passes"] is True
