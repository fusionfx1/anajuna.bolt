"""
Phase 1 agent framework: fusion, providers, Crew wiring (mocked / no LLM).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from ..agents import orchestrator as orchestrator_mod
from ..agents.crew_runner import build_trading_crew
from ..agents.fusion import fuse_agent_signals
from ..agents.orchestrator import KronosOrchestrator
from ..agents.schemas import AgentSignalContribution, FusedSignal
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
    assert len(crew.agents) == 3
