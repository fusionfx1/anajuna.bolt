"""
Tests for trading_system/agents/runtime.py

Covers: deadline enforcement, retry on retryable errors, fallback HOLD,
status/agent_id/latency enrichment.
"""
from __future__ import annotations

import time
from typing import Optional

import pandas as pd
import pytest

from ..agents.runtime import EvalContext, evaluate_with_deadline, _fallback_hold
from ..agents.schemas import AgentSignalContribution


# ── test agents ───────────────────────────────────────────────────────────────

class BuyAgent:
    def evaluate(self, symbol, df, *, config=None):
        return AgentSignalContribution("news", "BUY", 0.8, "bullish")


class SellAgentWithLatency:
    def evaluate(self, symbol, df, *, config=None):
        time.sleep(0.05)  # 50ms — well within any reasonable deadline
        return AgentSignalContribution("fred", "SELL", 0.7, "bearish")


class SlowAgent:
    def evaluate(self, symbol, df, *, config=None):
        time.sleep(10)
        return AgentSignalContribution("news", "BUY", 0.9, "won't arrive")


class ErrorAgent:
    def evaluate(self, symbol, df, *, config=None):
        raise RuntimeError("unexpected failure")


class ConnectionErrorAgent:
    _count = 0

    def evaluate(self, symbol, df, *, config=None):
        type(self)._count += 1
        if type(self)._count == 1:
            raise ConnectionError("transient network error")
        return AgentSignalContribution("news", "BUY", 0.6, "recovered")


class BadReturnAgent:
    def evaluate(self, symbol, df, *, config=None):
        return {"signal": "BUY"}  # wrong type


class MultiRetryFail:
    def evaluate(self, symbol, df, *, config=None):
        raise ConnectionError("always fails")


# ── happy path ────────────────────────────────────────────────────────────────

def test_success_enriches_agent_id():
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="my-news")
    result = evaluate_with_deadline(BuyAgent(), ctx, deadline_ms=2000)
    assert result.signal_type == "BUY"
    assert result.status == "success"
    assert result.agent_id == "my-news"


def test_success_records_latency():
    ctx = EvalContext(symbol="EURUSD", source="fred")
    result = evaluate_with_deadline(SellAgentWithLatency(), ctx, deadline_ms=2000)
    assert result.signal_type == "SELL"
    assert result.latency_ms >= 0


def test_success_preserves_source():
    ctx = EvalContext(symbol="EURUSD", source="technical")
    result = evaluate_with_deadline(
        type("T", (), {"evaluate": lambda s, sym, df, **kw: AgentSignalContribution("technical", "HOLD", 0.3, "x")})(),
        ctx,
        deadline_ms=1000,
    )
    assert result.source == "technical"


# ── timeout ───────────────────────────────────────────────────────────────────

def test_timeout_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="slow")
    result = evaluate_with_deadline(SlowAgent(), ctx, deadline_ms=150)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"
    assert result.agent_id == "slow"


def test_timeout_reasoning_mentions_fallback():
    ctx = EvalContext(symbol="EURUSD", source="sentiment")
    result = evaluate_with_deadline(SlowAgent(), ctx, deadline_ms=150)
    assert "fallback" in result.reasoning.lower() or "deadline" in result.reasoning.lower()


# ── error handling ────────────────────────────────────────────────────────────

def test_non_retryable_error_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="fred", agent_id="err-agent")
    result = evaluate_with_deadline(ErrorAgent(), ctx, deadline_ms=2000)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"


def test_bad_return_type_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="news")
    result = evaluate_with_deadline(BadReturnAgent(), ctx, deadline_ms=2000)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"


# ── retry behaviour ───────────────────────────────────────────────────────────

def test_retries_once_on_connection_error():
    ConnectionErrorAgent._count = 0
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="conn-agent")
    result = evaluate_with_deadline(ConnectionErrorAgent(), ctx, deadline_ms=3000)
    assert result.signal_type == "BUY"
    assert ConnectionErrorAgent._count == 2


def test_all_retries_exhausted_returns_hold():
    ctx = EvalContext(symbol="EURUSD", source="news", agent_id="always-fail")
    result = evaluate_with_deadline(MultiRetryFail(), ctx, deadline_ms=3000)
    assert result.signal_type == "HOLD"
    assert result.status == "warning"


# ── fallback_hold helper ──────────────────────────────────────────────────────

def test_fallback_hold_has_correct_fields():
    result = _fallback_hold("fred", "agent-x", "test reason", latency_ms=500)
    assert result.source == "fred"
    assert result.signal_type == "HOLD"
    assert result.confidence == 0.0
    assert result.status == "warning"
    assert result.agent_id == "agent-x"
    assert result.latency_ms == 500
    assert "test reason" in result.reasoning


# ── context defaults ──────────────────────────────────────────────────────────

def test_eval_context_defaults():
    ctx = EvalContext(symbol="GBPUSD")
    assert ctx.source == "news"
    assert ctx.df is None
    assert ctx.config is None
    assert ctx.agent_id == ""
