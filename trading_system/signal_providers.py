"""
Signal provider abstraction: rule-based engine vs agent+Crew fusion layer.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Optional

import pandas as pd

from .agents.orchestrator import KronosOrchestrator
from .models import Signal, SignalType
from .signal_engine import get_latest_signal

if TYPE_CHECKING:
    from .models import StrategyConfig


class SignalProvider(ABC):
    """Maps OHLCV + strategy config to an actionable Signal."""

    @abstractmethod
    def get_latest_signal(self, df: pd.DataFrame, config: "StrategyConfig") -> Signal:
        raise NotImplementedError


class RuleBasedSignalProvider(SignalProvider):
    """Existing RSI/MACD/etc. rule engine (wrapper around get_latest_signal)."""

    def get_latest_signal(self, df: pd.DataFrame, config: "StrategyConfig") -> Signal:
        return get_latest_signal(df, config)


class AgentSignalProvider(SignalProvider):
    """Agent fusion path (Kronos + CrewAI tools)."""

    def __init__(self, orchestrator: Optional[KronosOrchestrator] = None) -> None:
        self._orch = orchestrator or KronosOrchestrator()

    def get_latest_signal(self, df: pd.DataFrame, config: "StrategyConfig") -> Signal:
        fused = self._orch.run(df, config)
        if not isinstance(df.index, pd.DatetimeIndex):
            df = df.copy()
            df.index = pd.to_datetime(df.index)
        last_ts = df.index[-1]
        last_price = float(df.loc[last_ts, "close"])

        return Signal(
            timestamp=pd.Timestamp(last_ts).to_pydatetime(),
            signal_type=fused.signal_type,
            indicator_value=float(fused.confidence),
            price=last_price,
            reason=fused.reasoning,
        )


def signal_provider_from_env() -> SignalProvider:
    """Factory driven by SIGNAL_MODE: rules (default) | agent."""
    import os

    mode = os.environ.get("SIGNAL_MODE", "rules").strip().lower()
    if mode == "agent":
        return AgentSignalProvider()
    return RuleBasedSignalProvider()
