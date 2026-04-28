"""
Schemas for per-agent contributions and fused trading signals.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from ..models import SignalType


@dataclass(frozen=True)
class AgentSignalContribution:
    """Single agent view before fusion."""

    source: Literal["news", "fred", "sentiment"]
    signal_type: Literal["BUY", "SELL", "HOLD"]
    confidence: float  # 0.0 .. 1.0
    reasoning: str


@dataclass
class FusedSignal:
    """Kronos fusion output mapped into the live trading loop."""

    signal_type: SignalType
    confidence: float  # 0.0 .. 1.0
    reasoning: str
    contributions: tuple[AgentSignalContribution, ...] = field(default_factory=tuple)
