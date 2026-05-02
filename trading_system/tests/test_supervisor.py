"""
Tests for trading_system/agents/supervisor.py (LangGraph pipeline).

Covers: happy path, budget breach → HOLD, circuit breaker → HOLD,
node isolation (each node can be called standalone).
"""
from __future__ import annotations

import os
import time
from typing import Optional
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from ..agents.schemas import AgentSignalContribution, FusedSignal
from ..models import IndicatorConfig, IndicatorType, SignalCondition, SignalType, StrategyConfig


def _df() -> pd.DataFrame:
    return pd.DataFrame(
        {"open": [1.1, 1.12], "high": [1.15, 1.16], "low": [1.09, 1.1], "close": [1.12, 1.13]},
        index=pd.date_range("2024-01-01", periods=2, freq="h"),
    )


def _config() -> StrategyConfig:
    return StrategyConfig(
        name="test",
        description="t",
        indicator=IndicatorConfig(indicator_type=IndicatorType.RSI),
        signal_condition=SignalCondition(buy_threshold=30.0, sell_threshold=70.0),
        symbols=["EURUSD"],
    )


# ── node unit tests ───────────────────────────────────────────────────────────

def test_node_fuse_returns_fused_signal():
    import dataclasses
    from ..agents.supervisor import _node_fuse

    contribs = [
        AgentSignalContribution("news", "BUY", 0.9, "bullish"),
        AgentSignalContribution("technical", "BUY", 0.7, "RSI oversold"),
    ]
    state = {
        "symbol": "EURUSD",
        "contributions": [dataclasses.asdict(c) for c in contribs],
    }
    result = _node_fuse(state)
    assert result["final_signal_type"] == "BUY"
    assert float(result["final_confidence"]) > 0


def test_node_guard_budget_exceeded_forces_hold():
    from ..agents import supervisor as sup_mod
    from ..agents.supervisor import _node_guard

    past_start = time.monotonic() - 100  # 100s ago — far beyond any budget
    state = {
        "final_signal_type": "BUY",
        "final_confidence": 0.8,
        "final_reasoning": "strong buy",
        "final_blockers": [],
        "circuit_blocked": False,
        "budget_start_s": past_start,
    }
    orig_budget = sup_mod._AGENT_BUDGET_MS
    sup_mod._AGENT_BUDGET_MS = 100
    try:
        result = _node_guard(state)
    finally:
        sup_mod._AGENT_BUDGET_MS = orig_budget

    assert result["final_signal_type"] == "HOLD"
    assert "budget_exceeded" in result["final_blockers"]


def test_node_guard_circuit_breaker_forces_hold():
    from ..agents.supervisor import _node_guard

    state = {
        "final_signal_type": "SELL",
        "final_confidence": 0.9,
        "final_reasoning": "bearish",
        "final_blockers": [],
        "circuit_blocked": True,
        "budget_start_s": time.monotonic(),
    }
    result = _node_guard(state)
    assert result["final_signal_type"] == "HOLD"
    assert "CIRCUIT_BREAKER" in result["final_blockers"]


def test_node_decide_is_passthrough():
    from ..agents.supervisor import _node_decide

    state = {
        "final_signal_type": "HOLD",
        "final_confidence": 0.5,
    }
    result = _node_decide(state)
    assert result["final_signal_type"] == "HOLD"


# ── full pipeline via run_supervisor ─────────────────────────────────────────

def test_run_supervisor_requires_use_langgraph_env(monkeypatch):
    """run_supervisor raises when USE_LANGGRAPH is not enabled."""
    from ..agents import supervisor as sup_mod
    from ..agents.supervisor import run_supervisor

    monkeypatch.setattr(sup_mod, "_USE_LANGGRAPH", False)
    with pytest.raises(RuntimeError, match="USE_LANGGRAPH"):
        run_supervisor("EURUSD", _df(), _config())


def test_run_supervisor_happy_path(monkeypatch):
    """End-to-end pipeline returns a FusedSignal when USE_LANGGRAPH=1."""
    from ..agents import supervisor as sup_mod

    monkeypatch.setattr(sup_mod, "_USE_LANGGRAPH", True)
    # Patch expensive sub-calls
    monkeypatch.setattr(
        sup_mod,
        "run_agent_tools_parallel",
        lambda *a, **kw: [
            AgentSignalContribution("news", "BUY", 0.7, "stub"),
            AgentSignalContribution("fred", "HOLD", 0.3, "stub"),
            AgentSignalContribution("sentiment", "BUY", 0.6, "stub"),
        ],
    )
    monkeypatch.setattr(sup_mod, "embed_text", lambda *a, **kw: None)
    monkeypatch.setattr(sup_mod, "retrieve_similar", lambda *a, **kw: [])

    result = sup_mod.run_supervisor("EURUSD", _df(), _config())
    assert isinstance(result, FusedSignal)
    assert result.signal_type in (SignalType.BUY, SignalType.SELL, SignalType.HOLD)
    assert result.decision_id  # UUID was assigned


def test_run_supervisor_circuit_blocked_returns_hold(monkeypatch):
    from ..agents import supervisor as sup_mod

    monkeypatch.setattr(sup_mod, "_USE_LANGGRAPH", True)
    monkeypatch.setattr(
        sup_mod,
        "run_agent_tools_parallel",
        lambda *a, **kw: [AgentSignalContribution("news", "BUY", 0.9, "strong buy")],
    )
    monkeypatch.setattr(sup_mod, "embed_text", lambda *a, **kw: None)
    monkeypatch.setattr(sup_mod, "retrieve_similar", lambda *a, **kw: [])

    result = sup_mod.run_supervisor("EURUSD", _df(), _config(), circuit_blocked=True)
    assert result.signal_type == SignalType.HOLD
    assert "CIRCUIT_BREAKER" in result.blockers


def test_run_supervisor_fallback_on_pipeline_error(monkeypatch):
    """If the LangGraph pipeline explodes, returns a safe HOLD."""
    from ..agents import supervisor as sup_mod

    monkeypatch.setattr(sup_mod, "_USE_LANGGRAPH", True)
    monkeypatch.setattr(sup_mod, "_COMPILED_GRAPH", None)

    def _bad_build():
        raise RuntimeError("graph build error")

    monkeypatch.setattr(sup_mod, "_build_graph", _bad_build)

    result = sup_mod.run_supervisor("EURUSD", _df(), _config())
    assert isinstance(result, FusedSignal)
    assert result.signal_type == SignalType.HOLD
