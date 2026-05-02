"""
Schemas for per-agent contributions and fused trading signals.

v2: adds status, agent_id, latency_ms, next_actions, artifacts, version to
AgentSignalContribution; adds decision_id and blockers to FusedSignal.
All new fields have defaults so existing positional callers are unaffected.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from ..models import SignalType


@dataclass(frozen=True)
class AgentSignalContribution:
    """Single agent view before fusion.

    Required positional fields (unchanged for backwards compat):
        source, signal_type, confidence, reasoning

    New keyword-only optional fields (all have defaults):
        status, agent_id, latency_ms, next_actions, artifacts, version
    """

    # ── required (no defaults) ────────────────────────────────────────────────
    source: Literal["news", "fred", "sentiment", "technical"]
    signal_type: Literal["BUY", "SELL", "HOLD"]
    confidence: float  # 0.0 .. 1.0
    reasoning: str

    # ── optional (harness metadata) ───────────────────────────────────────────
    status: Literal["success", "warning", "error"] = "success"
    agent_id: str = ""
    latency_ms: int = 0
    next_actions: tuple[str, ...] = ()
    artifacts: tuple[tuple[str, str], ...] = ()
    version: str = "1"


@dataclass
class FusedSignal:
    """Kronos fusion output mapped into the live trading loop."""

    signal_type: SignalType
    confidence: float  # 0.0 .. 1.0
    reasoning: str
    contributions: tuple[AgentSignalContribution, ...] = field(default_factory=tuple)
    decision_id: str = ""
    blockers: tuple[str, ...] = ()
