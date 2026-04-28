"""
Kronos-like orchestrator: parallel CrewAI tools + fusion.

Runs three CrewAI tool stubs concurrently (via ThreadPoolExecutor in crew_runner),
then fuses contributions into a FusedSignal. Full sequential Crew.kickoff() with LLM
is optional — see crew_runner.kickoff_crew_if_enabled.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd

from .crew_runner import run_agent_tools_parallel
from .fusion import fuse_agent_signals
from .schemas import FusedSignal

if TYPE_CHECKING:
    from ..models import StrategyConfig


class KronosOrchestrator:
    """Runs agent layer (parallel tool evaluations) and fuses into a single signal."""

    def run(self, df: pd.DataFrame, config: "StrategyConfig") -> FusedSignal:
        symbol = config.symbols[0] if config.symbols else "EURUSD"

        contributions = run_agent_tools_parallel(symbol, df, config)
        return fuse_agent_signals(contributions)
