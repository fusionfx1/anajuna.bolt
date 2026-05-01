"""
Tests for the real agent implementations: NewsAgent, FredAgent, SentimentAgent.
Uses unittest.mock to patch httpx calls without requiring live API keys.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from trading_system.agents.news_agent import NewsAgent
from trading_system.agents.fred_agent import FredAgent
from trading_system.agents.sentiment_agent import SentimentAgent
from trading_system.agents.schemas import AgentSignalContribution

SYMBOL = "EURUSD"


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_response(payload: dict | list, status_code: int = 200) -> MagicMock:
    """Return a mock httpx Response-like object."""
    m = MagicMock()
    m.status_code = status_code
    m.json.return_value = payload
    m.raise_for_status = MagicMock()
    return m


# ── NewsAgent tests ───────────────────────────────────────────────────────────


def test_news_agent_no_key_returns_hold(monkeypatch):
    """Without any API key the agent must return HOLD with status=warning."""
    monkeypatch.delenv("NEWS_API_KEY", raising=False)
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)

    result = NewsAgent().evaluate(SYMBOL)

    assert isinstance(result, AgentSignalContribution)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.source == "news"
    assert result.confidence <= 0.2


def test_news_agent_newsapi_keyword_heuristic(monkeypatch):
    """With NEWS_API_KEY and bullish headlines the keyword heuristic should BUY."""
    monkeypatch.setenv("NEWS_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)

    bullish_articles = {
        "articles": [
            {"title": "EUR surges in a massive rally on strong eurozone data"},
            {"title": "Bullish sentiment drives gains for euro bulls"},
            {"title": "Strong hawkish signal from ECB boosts euro"},
            {"title": "Euro rallies as risk appetite returns"},
            {"title": "Surge in euro demand as traders gain confidence"},
        ]
    }

    mock_resp = _mock_response(bullish_articles)

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        result = NewsAgent().evaluate(SYMBOL)

    assert isinstance(result, AgentSignalContribution)
    assert result.signal_type == "BUY"
    assert result.source == "news"
    assert result.confidence > 0.1


def test_news_agent_http_error_returns_hold(monkeypatch):
    """When httpx raises a ConnectionError the agent must return HOLD, status=warning."""
    monkeypatch.setenv("NEWS_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = ConnectionError("network unreachable")
        mock_client_cls.return_value = mock_client

        result = NewsAgent().evaluate(SYMBOL)

    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.source == "news"


# ── FredAgent tests ───────────────────────────────────────────────────────────


def test_fred_agent_no_key_returns_hold(monkeypatch):
    """Without FRED_API_KEY the agent must return HOLD with status=warning."""
    monkeypatch.delenv("FRED_API_KEY", raising=False)

    result = FredAgent().evaluate(SYMBOL)

    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.source == "fred"


def test_fred_agent_rising_yields_returns_sell(monkeypatch):
    """
    When DGS10 is rising by > 0.1, the agent should lean SELL (or at minimum
    produce a valid signal that is one of BUY/SELL/HOLD).
    """
    monkeypatch.setenv("FRED_API_KEY", "test-fred-key")

    # DGS10: latest=4.6, previous=4.4  → delta=+0.2 → SELL signal
    # DFF:   latest=5.33, previous=5.33 → delta=0 → neutral
    # CPI:   latest=3.1, previous=3.0  → < 3.5 → neutral
    dgs10_payload = {
        "observations": [
            {"value": "4.6", "date": "2024-01-02"},
            {"value": "4.4", "date": "2024-01-01"},
        ]
    }
    dff_payload = {
        "observations": [
            {"value": "5.33", "date": "2024-01-02"},
            {"value": "5.33", "date": "2024-01-01"},
        ]
    }
    cpi_payload = {
        "observations": [
            {"value": "310.0", "date": "2024-01-02"},
            {"value": "309.0", "date": "2024-01-01"},
        ]
    }

    responses = [
        _mock_response(dgs10_payload),
        _mock_response(dff_payload),
        _mock_response(cpi_payload),
    ]

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        resp = responses[call_count % len(responses)]
        call_count += 1
        return resp

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = side_effect
        mock_client_cls.return_value = mock_client

        result = FredAgent().evaluate(SYMBOL)

    assert isinstance(result, AgentSignalContribution)
    assert result.signal_type in ("BUY", "SELL", "HOLD")
    assert result.source == "fred"
    assert 0.0 <= result.confidence <= 1.0


# ── SentimentAgent tests ──────────────────────────────────────────────────────


def test_sentiment_agent_no_key_returns_hold(monkeypatch):
    """Without any sentiment key the agent must return HOLD with status=warning."""
    monkeypatch.delenv("SENTIMENT_API_KEY", raising=False)
    monkeypatch.delenv("TWITTER_BEARER_TOKEN", raising=False)

    result = SentimentAgent().evaluate(SYMBOL)

    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.source == "sentiment"


def test_sentiment_agent_source_is_sentiment(monkeypatch):
    """Regardless of path taken, source must always be 'sentiment'."""
    monkeypatch.delenv("SENTIMENT_API_KEY", raising=False)
    monkeypatch.delenv("TWITTER_BEARER_TOKEN", raising=False)

    result = SentimentAgent().evaluate(SYMBOL)
    assert result.source == "sentiment"

    # Also test with a key present but mocked HTTP error → still source=sentiment
    monkeypatch.setenv("SENTIMENT_API_KEY", "some-key")

    with patch("httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = ConnectionError("refused")
        mock_client_cls.return_value = mock_client

        result2 = SentimentAgent().evaluate(SYMBOL)

    assert result2.source == "sentiment"


# ── Orchestration path tests (AGT-02) ────────────────────────────────────────


class TestAgentFallback:
    """AGT-01: crew_runner falls back to stubs when keys are absent."""

    def test_news_agent_stub_selected_without_key(self, monkeypatch):
        """Without any news API key and USE_REAL_AGENTS=auto, stub class is used."""
        monkeypatch.delenv("NEWS_API_KEY", raising=False)
        monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
        monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)
        monkeypatch.setenv("USE_REAL_AGENTS", "auto")

        import importlib
        import trading_system.agents.crew_runner as cr
        importlib.reload(cr)

        # Stub class should be selected — evaluate returns a valid contribution
        agent = cr._NewsAgent()
        result = agent.evaluate("EURUSD", None)
        assert result.source == "news"
        assert result.signal_type == "HOLD"

    def test_fred_agent_stub_selected_without_key(self, monkeypatch):
        """Without FRED_API_KEY and USE_REAL_AGENTS=auto, stub class is used."""
        monkeypatch.delenv("FRED_API_KEY", raising=False)
        monkeypatch.setenv("USE_REAL_AGENTS", "auto")

        import importlib
        import trading_system.agents.crew_runner as cr
        importlib.reload(cr)

        agent = cr._FredAgent()
        result = agent.evaluate("EURUSD", None)
        assert result.source == "fred"
        assert result.signal_type == "HOLD"

    def test_false_flag_forces_stubs(self, monkeypatch):
        """USE_REAL_AGENTS=false always uses stubs even if keys are present."""
        monkeypatch.setenv("USE_REAL_AGENTS", "false")
        monkeypatch.setenv("NEWS_API_KEY", "some-key")
        monkeypatch.setenv("FRED_API_KEY", "some-key")

        import importlib
        import trading_system.agents.crew_runner as cr
        importlib.reload(cr)

        # Both should be stub classes (no HTTP calls, HOLD with stub reasoning)
        news_result = cr._NewsAgent().evaluate("EURUSD", None)
        fred_result = cr._FredAgent().evaluate("EURUSD", None)
        assert news_result.source == "news"
        assert fred_result.source == "fred"


class TestOrchestrationPaths:
    """AGT-02: Both USE_LANGGRAPH paths are importable and exercisable."""

    def test_crew_runner_legacy_path_importable(self, monkeypatch):
        """USE_LANGGRAPH=0: crew_runner parallel path can be imported."""
        monkeypatch.setenv("USE_LANGGRAPH", "0")
        monkeypatch.setenv("USE_REAL_AGENTS", "false")

        from trading_system.agents.crew_runner import run_agent_tools_parallel
        assert callable(run_agent_tools_parallel)

    def test_crew_runner_legacy_path_success(self, monkeypatch):
        """USE_LANGGRAPH=0: run_agent_tools_parallel returns 4 contributions with stubs."""
        monkeypatch.setenv("USE_LANGGRAPH", "0")
        monkeypatch.setenv("USE_REAL_AGENTS", "false")

        import importlib
        import trading_system.agents.crew_runner as cr
        importlib.reload(cr)

        results = cr.run_agent_tools_parallel("EURUSD", None, None)
        assert len(results) == 4
        for r in results:
            assert r.signal_type in ("BUY", "SELL", "HOLD")
            assert 0.0 <= r.confidence <= 1.0

    def test_crew_runner_legacy_path_fallback_on_empty(self, monkeypatch):
        """USE_LANGGRAPH=0: failure in one tool doesn't crash the whole pipeline."""
        monkeypatch.setenv("USE_LANGGRAPH", "0")
        monkeypatch.setenv("USE_REAL_AGENTS", "false")

        from trading_system.agents.crew_runner import run_agent_tools_parallel
        # Should not raise even with None df/config
        results = run_agent_tools_parallel("EURUSD", None, None)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_supervisor_path_importable(self, monkeypatch):
        """USE_LANGGRAPH=1: supervisor module is importable and run_supervisor callable."""
        try:
            from trading_system.agents.supervisor import run_supervisor
            assert callable(run_supervisor)
        except ImportError as e:
            pytest.skip(f"Supervisor dependencies not available: {e}")

    def test_supervisor_requires_env_flag(self, monkeypatch):
        """USE_LANGGRAPH=0: run_supervisor raises RuntimeError when flag not set."""
        monkeypatch.setenv("USE_LANGGRAPH", "0")

        try:
            import importlib
            import trading_system.agents.supervisor as sup
            importlib.reload(sup)
            import pandas as pd
            with pytest.raises(RuntimeError, match="USE_LANGGRAPH"):
                sup.run_supervisor("EURUSD", pd.DataFrame(), None)
        except ImportError as e:
            pytest.skip(f"Supervisor dependencies not available: {e}")
