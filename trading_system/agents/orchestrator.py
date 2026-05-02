"""
Kronos-like orchestrator: parallel CrewAI tools + fusion.

Routing:
- USE_LANGGRAPH=1  → delegate to supervisor.run_supervisor() (LangGraph pipeline)
- USE_LANGGRAPH=0  → legacy parallel path: crew_runner + TechnicalSignalAgent + fusion

Both paths use runtime.evaluate_with_deadline for every agent call.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pandas as pd
from loguru import logger

from .crew_runner import run_agent_tools_parallel
from .fusion import fuse_agent_signals
from .runtime import EvalContext, evaluate_with_deadline
from .schemas import FusedSignal
from .tech_agent import TechnicalSignalAgent

if TYPE_CHECKING:
    from ..models import StrategyConfig

_USE_LANGGRAPH: bool = os.environ.get("USE_LANGGRAPH", "0").strip().lower() in (
    "1", "true", "yes"
)


class KronosOrchestrator:
    """Runs agent layer (parallel tool evaluations) and fuses into a single signal.

    When USE_LANGGRAPH=1, delegates to the LangGraph supervisor pipeline
    (gather → memory → fuse → guard → decide). Otherwise uses the direct
    parallel path.
    """

    def run(self, df: pd.DataFrame, config: "StrategyConfig") -> FusedSignal:
        symbol = config.symbols[0] if config.symbols else "EURUSD"

        if _USE_LANGGRAPH:
            logger.debug(f"[orchestrator] routing to LangGraph supervisor for {symbol}")
            try:
                from .supervisor import run_supervisor
                return run_supervisor(symbol, df, config)
            except Exception as exc:
                logger.warning(
                    f"[orchestrator] LangGraph supervisor failed, falling back: {exc}"
                )

        # ── legacy parallel path ───────────────────────────────────────────────
        contributions = run_agent_tools_parallel(symbol, df, config)

        tech_ctx = EvalContext(
            symbol=symbol,
            source="technical",
            df=df,
            config=config,
            agent_id="technical-v1",
        )
        tech_contribution = evaluate_with_deadline(TechnicalSignalAgent(), tech_ctx)
        all_contributions = list(contributions) + [tech_contribution]

        return fuse_agent_signals(all_contributions)
