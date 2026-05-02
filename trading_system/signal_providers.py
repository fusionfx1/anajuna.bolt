"""
Signal provider abstraction: rule-based engine vs agent+Crew fusion layer.

v2 changes:
- AgentSignalProvider sets Signal.decision_id from FusedSignal.decision_id
- Fire-and-forget persistence after each agent decision (background thread)
- Optional embedding + vector store after persistence
"""
from __future__ import annotations

import os
import threading
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Optional

import pandas as pd
from loguru import logger

from .agents.orchestrator import KronosOrchestrator
from .agents.runtime import EvalContext
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


def _fire_and_forget_persist(
    fused,
    ctx: EvalContext,
    user_id: Optional[str],
) -> None:
    """Background thread: persist decision then optionally embed."""
    try:
        from .agents.persistence import save_decision
        save_decision(fused, ctx, user_id=user_id, signal_mode="agent")
    except Exception as exc:
        logger.debug(f"[signal_providers] persistence background task failed: {exc}")

    try:
        from .agents.embedding import embed_and_store
        embed_and_store(
            fused.decision_id,
            f"{ctx.symbol} {fused.signal_type} confidence={fused.confidence:.2f} {fused.reasoning[:200]}",
        )
    except Exception as exc:
        logger.debug(f"[signal_providers] embedding background task failed: {exc}")


class AgentSignalProvider(SignalProvider):
    """Agent fusion path (Kronos + CrewAI tools).

    Parameters
    ----------
    orchestrator:
        KronosOrchestrator instance. Defaults to a fresh instance.
    user_id:
        Supabase user UUID for decision persistence. None = paper / anon.
    """

    def __init__(
        self,
        orchestrator: Optional[KronosOrchestrator] = None,
        user_id: Optional[str] = None,
    ) -> None:
        self._orch = orchestrator or KronosOrchestrator()
        self._user_id = user_id

    def get_latest_signal(self, df: pd.DataFrame, config: "StrategyConfig") -> Signal:
        symbol = config.symbols[0] if config.symbols else "EURUSD"
        fused = self._orch.run(df, config)

        if not isinstance(df.index, pd.DatetimeIndex):
            df = df.copy()
            df.index = pd.to_datetime(df.index)
        last_ts = df.index[-1]
        last_price = float(df.loc[last_ts, "close"])

        # Persist decision in background — never blocks trading loop
        if fused.decision_id:
            ctx = EvalContext(symbol=symbol, df=None, config=config)
            thread = threading.Thread(
                target=_fire_and_forget_persist,
                args=(fused, ctx, self._user_id),
                daemon=True,
            )
            thread.start()

        return Signal(
            timestamp=pd.Timestamp(last_ts).to_pydatetime(),
            signal_type=fused.signal_type,
            indicator_value=float(fused.confidence),
            price=last_price,
            reason=fused.reasoning,
            decision_id=fused.decision_id,
        )


def signal_provider_from_env(user_id: Optional[str] = None) -> SignalProvider:
    """Factory driven by SIGNAL_MODE: rules (default) | agent."""
    mode = os.environ.get("SIGNAL_MODE", "rules").strip().lower()
    if mode == "agent":
        return AgentSignalProvider(user_id=user_id)
    return RuleBasedSignalProvider()
