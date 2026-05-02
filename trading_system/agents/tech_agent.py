"""TechnicalSignalAgent: wraps the rule-based signal engine as an agent contribution."""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import pandas as pd
from loguru import logger

from .schemas import AgentSignalContribution
from ..signal_engine import get_latest_signal
from ..models import SignalType

if TYPE_CHECKING:
    from ..models import StrategyConfig

_AGENT_ID = "technical-v1"
_MAX_REASONING_LEN = 240


class TechnicalSignalAgent:
    """Wraps the rule-based signal engine as a structured AgentSignalContribution."""

    def evaluate(
        self,
        symbol: str,
        df: Optional[pd.DataFrame],
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        if df is None or (hasattr(df, "empty") and df.empty):
            logger.info(f"[TechnicalSignalAgent] {symbol}: no candle data — stub HOLD")
            return AgentSignalContribution(
                source="technical",
                signal_type="HOLD",
                confidence=0.0,
                reasoning="No candle data",
                status="warning",
                agent_id=_AGENT_ID,
            )

        if config is None:
            logger.warning(f"[TechnicalSignalAgent] {symbol}: no config — stub HOLD")
            return AgentSignalContribution(
                source="technical",
                signal_type="HOLD",
                confidence=0.0,
                reasoning="No strategy config provided",
                status="warning",
                agent_id=_AGENT_ID,
            )

        try:
            signal = get_latest_signal(df, config)
        except Exception as exc:
            logger.warning(f"[TechnicalSignalAgent] {symbol}: signal engine error: {exc}")
            return AgentSignalContribution(
                source="technical",
                signal_type="HOLD",
                confidence=0.0,
                reasoning=str(exc)[:_MAX_REASONING_LEN],
                status="warning",
                agent_id=_AGENT_ID,
            )

        signal_type_str: str
        if signal.signal_type == SignalType.BUY:
            signal_type_str = "BUY"
        elif signal.signal_type == SignalType.SELL:
            signal_type_str = "SELL"
        else:
            signal_type_str = "HOLD"

        try:
            confidence = min(1.0, max(0.0, abs(signal.indicator_value)))
        except (TypeError, ValueError):
            confidence = 0.5

        reasoning = (signal.reason or "")[:_MAX_REASONING_LEN]

        logger.debug(
            f"[TechnicalSignalAgent] {symbol}: {signal_type_str} "
            f"conf={confidence:.3f} reason={reasoning!r}"
        )

        return AgentSignalContribution(
            source="technical",
            signal_type=signal_type_str,
            confidence=confidence,
            reasoning=reasoning,
            status="success",
            agent_id=_AGENT_ID,
        )
