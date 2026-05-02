"""
Phase 1 agent framework: fusion, providers, Crew wiring (mocked / no LLM).
Phase 1+ additions: status/latency/decision_id schema fields, runtime guard.
"""
from __future__ import annotations

import dataclasses
import time
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from ..agents import orchestrator as orchestrator_mod
from ..agents.crew_runner import build_trading_crew
from ..agents.fusion import fuse_agent_signals
from ..agents.orchestrator import KronosOrchestrator
from ..agents.runtime import EvalContext, evaluate_with_deadline
from ..agents.schemas import AgentSignalContribution, FusedSignal
from ..agents.tech_agent import TechnicalSignalAgent
from ..models import (
    IndicatorConfig,
    IndicatorType,
    Signal,
    SignalCondition,
    SignalType,
    StrategyConfig,
)
from ..signal_providers import AgentSignalProvider, RuleBasedSignalProvider, signal_provider_from_env


def _minimal_config() -> StrategyConfig:
    return StrategyConfig(
        name="test",
        description="t",
        indicator=IndicatorConfig(indicator_type=IndicatorType.RSI),
        signal_condition=SignalCondition(buy_threshold=30.0, sell_threshold=70.0),
        symbols=["EURUSD"],
    )


# ── fusion: existing tests ────────────────────────────────────────────────────

def test_fuse_all_hold_stubs():
    contribs = [
        AgentSignalContribution("news", "HOLD", 0.2, "n"),
        AgentSignalContribution("fred", "HOLD", 0.2, "f"),
        AgentSignalContribution("sentiment", "HOLD", 0.2, "s"),
    ]
    fused = fuse_agent_signals(contribs)
    assert fused.signal_type == SignalType.HOLD
    assert fused.confidence >= 0


def test_fuse_buy_majority():
    contribs = [
        AgentSignalContribution("news", "BUY", 0.9, "risk-on"),
        AgentSignalContribution("fred", "HOLD", 0.2, "neutral"),
        AgentSignalContribution("sentiment", "BUY", 0.5, "bullish"),
    ]
    fused = fuse_agent_signals(contribs)
    assert fused.signal_type == SignalType.BUY


def test_kronos_orchestrator_mocked_parallel(monkeypatch):
    cfg = _minimal_config()
    df = pd.DataFrame({"close": [1.0, 1.1]}, index=pd.date_range("2024-01-01", periods=2, freq="h"))

    fake_contribs = [
        AgentSignalContribution("news", "HOLD", 0.2, "stub"),
        AgentSignalContribution("fred", "HOLD", 0.2, "stub"),
        AgentSignalContribution("sentiment", "HOLD", 0.2, "stub"),
    ]

    monkeypatch.setattr(orchestrator_mod, "run_agent_tools_parallel", lambda sym, d, c: fake_contribs)

    fused = KronosOrchestrator().run(df, cfg)
    assert isinstance(fused, FusedSignal)
    assert fused.signal_type == SignalType.HOLD


@patch("trading_system.signal_providers.get_latest_signal")
def test_rule_based_provider(mock_signal):
    mock_signal.return_value = Signal(
        timestamp=pd.Timestamp("2024-01-01").to_pydatetime(),
        signal_type=SignalType.BUY,
        indicator_value=40.0,
        price=1.2,
        reason="RSI",
    )
    cfg = _minimal_config()
    df = pd.DataFrame({"close": [1.2]}, index=[pd.Timestamp("2024-01-01")])
    sig = RuleBasedSignalProvider().get_latest_signal(df, cfg)
    assert sig.signal_type == SignalType.BUY
    mock_signal.assert_called_once()


def test_agent_signal_provider_mock_orchestrator():
    orch = MagicMock()
    orch.run.return_value = FusedSignal(
        signal_type=SignalType.SELL,
        confidence=0.75,
        reasoning="test fusion",
        contributions=(),
    )
    cfg = _minimal_config()
    df = pd.DataFrame({"close": [1.0, 1.05]}, index=pd.date_range("2024-01-01", periods=2, freq="h"))
    prov = AgentSignalProvider(orchestrator=orch)
    sig = prov.get_latest_signal(df, cfg)
    assert sig.signal_type == SignalType.SELL
    assert sig.indicator_value == pytest.approx(0.75)
    orch.run.assert_called_once()


def test_signal_provider_from_env(monkeypatch):
    monkeypatch.delenv("SIGNAL_MODE", raising=False)
    assert isinstance(signal_provider_from_env(), RuleBasedSignalProvider)
    monkeypatch.setenv("SIGNAL_MODE", "agent")
    assert isinstance(signal_provider_from_env(), AgentSignalProvider)


def test_build_trading_crew_structure():
    cfg = _minimal_config()
    df = pd.DataFrame({"close": [1.0]}, index=[pd.Timestamp("2024-01-01")])
    crew = build_trading_crew("EURUSD", df, cfg)
    assert crew is not None
    assert len(crew.agents) == 4


@patch("trading_system.agents.tech_agent.get_latest_signal")
def test_tech_agent_buy_signal(mock_signal):
    mock_signal.return_value = Signal(
        timestamp=pd.Timestamp("2024-01-01").to_pydatetime(),
        signal_type=SignalType.BUY,
        indicator_value=0.75,
        price=1.2,
        reason="RSI = 25.0000",
    )
    cfg = _minimal_config()
    df = pd.DataFrame({"close": [1.2]}, index=[pd.Timestamp("2024-01-01")])
    agent = TechnicalSignalAgent()
    result = agent.evaluate("EURUSD", df, config=cfg)
    assert result.source == "technical"
    assert result.signal_type == "BUY"
    assert result.status == "success"
    assert result.agent_id == "technical-v1"


def test_tech_agent_empty_df_returns_hold():
    cfg = _minimal_config()
    agent = TechnicalSignalAgent()
    result = agent.evaluate("EURUSD", None, config=cfg)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.confidence == 0.0


# ── schema v2: new fields ─────────────────────────────────────────────────────

def test_agent_signal_contribution_defaults():
    c = AgentSignalContribution("news", "BUY", 0.8, "test")
    assert c.status == "success"
    assert c.agent_id == ""
    assert c.latency_ms == 0
    assert c.next_actions == ()
    assert c.artifacts == ()
    assert c.version == "1"


def test_agent_signal_contribution_technical_source():
    c = AgentSignalContribution("technical", "SELL", 0.6, "RSI overbought")
    assert c.source == "technical"


def test_fused_signal_has_decision_id():
    contribs = [AgentSignalContribution("news", "BUY", 0.8, "bullish")]
    fused = fuse_agent_signals(contribs)
    assert fused.decision_id
    assert len(fused.decision_id) == 36  # UUID4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx


def test_fuse_decision_ids_are_unique():
    contribs = [AgentSignalContribution("fred", "HOLD", 0.3, "neutral")]
    fused1 = fuse_agent_signals(contribs)
    fused2 = fuse_agent_signals(contribs)
    assert fused1.decision_id != fused2.decision_id


def test_fuse_skips_error_contributions():
    contribs = [
        AgentSignalContribution("news", "BUY", 0.9, "bullish", status="error"),
        AgentSignalContribution("fred", "BUY", 0.8, "risk-on"),
    ]
    fused = fuse_agent_signals(contribs)
    assert fused.signal_type == SignalType.BUY
    assert "news_error" in fused.blockers
    assert len(fused.contributions) == 2  # full audit trail preserved


def test_fuse_all_error_returns_hold():
    contribs = [
        AgentSignalContribution("news", "BUY", 0.9, "bullish", status="error"),
        AgentSignalContribution("fred", "SELL", 0.8, "bearish", status="error"),
    ]
    fused = fuse_agent_signals(contribs)
    assert fused.signal_type == SignalType.HOLD
    assert "all_agents_errored" in fused.blockers


def test_fuse_empty_contributions():
    fused = fuse_agent_signals([])
    assert fused.signal_type == SignalType.HOLD
    assert "no_contributions" in fused.blockers
    assert fused.decision_id  # still gets a UUID


# ── runtime: evaluate_with_deadline ──────────────────────────────────────────

class _GoodAgent:
    """Always returns a valid BUY contribution."""
    def evaluate(self, symbol, df, *, config=None):
        return AgentSignalContribution("news", "BUY", 0.75, "good agent")


class _SlowAgent:
    """Sleeps longer than any reasonable deadline."""
    def evaluate(self, symbol, df, *, config=None):
        time.sleep(10)
        return AgentSignalContribution("news", "BUY", 0.75, "too slow")


class _ErrorAgent:
    """Raises a non-retryable error."""
    def evaluate(self, symbol, df, *, config=None):
        raise RuntimeError("hard error")


class _NetworkAgent:
    """Raises a retryable error on first call, succeeds on second."""
    _calls = 0

    def evaluate(self, symbol, df, *, config=None):
        self._calls += 1
        if self._calls == 1:
            raise ConnectionError("network blip")
        return AgentSignalContribution("news", "BUY", 0.6, "recovered")


def test_runtime_good_agent_enriched():
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="test-news")
    result = evaluate_with_deadline(_GoodAgent(), ctx, deadline_ms=2000)
    assert result.signal_type == "BUY"
    assert result.status == "success"
    assert result.agent_id == "test-news"
    assert result.latency_ms >= 0


def test_runtime_timeout_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="slow-agent")
    result = evaluate_with_deadline(_SlowAgent(), ctx, deadline_ms=100)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert "deadline" in result.reasoning.lower() or "fallback" in result.reasoning.lower()


def test_runtime_non_retryable_error_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="fred", agent_id="error-agent")
    result = evaluate_with_deadline(_ErrorAgent(), ctx, deadline_ms=2000)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"


def test_runtime_retry_on_network_error():
    agent = _NetworkAgent()
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="network-agent")
    result = evaluate_with_deadline(agent, ctx, deadline_ms=3000)
    assert result.signal_type == "BUY"
    assert agent._calls == 2  # retried once
