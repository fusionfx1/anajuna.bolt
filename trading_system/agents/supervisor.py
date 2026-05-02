"""
LangGraph supervisor for the agent team trading pipeline.

Graph: gather → memory → fuse → guard → decide

Enabled when USE_LANGGRAPH=1 (default 0).
Falls back to fuse_agent_signals([]) on any error.

State design:
- Only serializable types live in SupervisorState (no DataFrame, no StrategyConfig).
- df + config are passed via thread-local _CallContext so MemorySaver can
  checkpoint without encountering un-serializable objects.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Optional, TypedDict

import pandas as pd
from loguru import logger

from .crew_runner import run_agent_tools_parallel
from .embedding import embed_text, retrieve_similar
from .fusion import fuse_agent_signals
from .runtime import EvalContext, evaluate_with_deadline
from .schemas import AgentSignalContribution, FusedSignal
from .tech_agent import TechnicalSignalAgent

_USE_LANGGRAPH: bool = os.environ.get("USE_LANGGRAPH", "0").strip().lower() in (
    "1", "true", "yes"
)
_AGENT_BUDGET_MS: int = int(os.environ.get("AGENT_BUDGET_MS", "4000"))
_MEMORY_TOP_K: int = int(os.environ.get("MEMORY_TOP_K", "5"))


# ── thread-local context (non-serializable call data) ─────────────────────────

class _CallContext(threading.local):
    df: Optional[pd.DataFrame] = None
    config: Optional[Any] = None
    symbol: str = "EURUSD"

_call_ctx = _CallContext()


def _set_call_context(
    symbol: str,
    df: Optional[pd.DataFrame],
    config: Optional[Any],
) -> None:
    _call_ctx.symbol = symbol
    _call_ctx.df = df
    _call_ctx.config = config


# ── LangGraph state (serializable only) ───────────────────────────────────────

class SupervisorState(TypedDict, total=False):
    symbol: str
    contributions: list[dict]   # serialised AgentSignalContribution (asdict)
    memory_context: list[dict]
    fused_dict: Optional[dict]  # serialised FusedSignal fields
    circuit_blocked: bool
    final_decision_id: str
    final_signal_type: str
    final_confidence: float
    final_reasoning: str
    final_blockers: list[str]
    budget_start_s: float


# ── helpers ────────────────────────────────────────────────────────────────────

def _contrib_from_dict(d: dict) -> AgentSignalContribution:
    return AgentSignalContribution(
        source=d["source"],
        signal_type=d["signal_type"],
        confidence=float(d["confidence"]),
        reasoning=d["reasoning"],
        status=d.get("status", "success"),
        agent_id=d.get("agent_id", ""),
        latency_ms=int(d.get("latency_ms", 0)),
        next_actions=tuple(d.get("next_actions", ())),
        artifacts=tuple(tuple(p) for p in d.get("artifacts", ())),
        version=d.get("version", "1"),
    )


def _fused_to_state(fused: FusedSignal) -> dict:
    return {
        "final_decision_id": fused.decision_id,
        "final_signal_type": fused.signal_type.value if hasattr(fused.signal_type, "value") else str(fused.signal_type),
        "final_confidence": float(fused.confidence),
        "final_reasoning": fused.reasoning,
        "final_blockers": list(fused.blockers),
    }


# ── Node implementations ───────────────────────────────────────────────────────

def _node_gather(state: SupervisorState) -> SupervisorState:
    """Run all 4 agents in parallel (CrewAI tools + TechnicalSignalAgent)."""
    import dataclasses

    symbol = _call_ctx.symbol
    df = _call_ctx.df
    config = _call_ctx.config

    t0 = time.monotonic()
    try:
        base_contributions = run_agent_tools_parallel(symbol, df, config)
    except Exception as exc:
        logger.warning(f"[supervisor:gather] crew parallel failed: {exc}")
        base_contributions = []

    tech_ctx = EvalContext(
        symbol=symbol,
        source="technical",
        df=df,
        config=config,
        agent_id="technical-v1",
    )
    tech_contrib = evaluate_with_deadline(
        TechnicalSignalAgent(),
        tech_ctx,
        deadline_ms=int(_AGENT_BUDGET_MS * 0.4),
    )
    all_contributions = [*base_contributions, tech_contrib]
    elapsed = int((time.monotonic() - t0) * 1000)
    logger.debug(f"[supervisor:gather] {len(all_contributions)} contributions in {elapsed}ms")

    return {
        **state,
        "contributions": [dataclasses.asdict(c) for c in all_contributions],
    }


def _node_memory(state: SupervisorState) -> SupervisorState:
    """Retrieve top-k similar past decisions from pgvector (no-op when disabled)."""
    contribs_dicts = state.get("contributions", [])
    symbol = _call_ctx.symbol
    config = _call_ctx.config
    user_id = getattr(config, "user_id", None) if config else None

    snippets = " ".join(
        f"{d.get('source')}:{d.get('signal_type')}@{d.get('confidence', 0):.1f}"
        for d in contribs_dicts
    )
    query_text = f"{symbol} {snippets}"

    embedding = embed_text(query_text)
    memory_context: list[dict] = []
    if embedding:
        memory_context = retrieve_similar(
            embedding, symbol=symbol, user_id=user_id, top_k=_MEMORY_TOP_K
        )

    logger.debug(f"[supervisor:memory] retrieved {len(memory_context)} past decisions")
    return {**state, "memory_context": memory_context}


def _node_fuse(state: SupervisorState) -> SupervisorState:
    """Deserialise contributions, fuse, serialise result back into state."""
    contribs_dicts = state.get("contributions", [])
    contributions = [_contrib_from_dict(d) for d in contribs_dicts]
    fused = fuse_agent_signals(contributions)
    logger.debug(
        f"[supervisor:fuse] decision={fused.decision_id[:8]} "
        f"signal={fused.signal_type} conf={fused.confidence:.2f}"
    )
    return {**state, **_fused_to_state(fused), "fused_dict": _fused_to_state(fused)}


def _node_guard(state: SupervisorState) -> SupervisorState:
    """Budget + circuit-breaker guard. Overrides to HOLD when triggered."""
    from ..models import SignalType

    circuit_blocked = state.get("circuit_blocked", False)
    budget_start = state.get("budget_start_s", time.monotonic())
    elapsed_ms = (time.monotonic() - budget_start) * 1000

    signal_type = state.get("final_signal_type", "HOLD")
    blockers: list[str] = list(state.get("final_blockers", []))
    overridden = False

    if elapsed_ms > _AGENT_BUDGET_MS:
        logger.warning(
            f"[supervisor:guard] budget exceeded ({elapsed_ms:.0f}ms > {_AGENT_BUDGET_MS}ms) — HOLD"
        )
        blockers.append("budget_exceeded")
        overridden = True

    if circuit_blocked:
        blockers.append("CIRCUIT_BREAKER")
        logger.warning("[supervisor:guard] circuit breaker tripped — HOLD")
        overridden = True

    if overridden:
        signal_type = "HOLD"

    return {**state, "final_signal_type": signal_type, "final_blockers": blockers}


def _node_decide(state: SupervisorState) -> SupervisorState:
    """Terminal node: mark pipeline complete (no-op — final fields already in state)."""
    return state


# ── Graph construction ─────────────────────────────────────────────────────────

def _build_graph():
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.graph import END, StateGraph

    graph = StateGraph(SupervisorState)
    graph.add_node("gather", _node_gather)
    graph.add_node("memory", _node_memory)
    graph.add_node("fuse", _node_fuse)
    graph.add_node("guard", _node_guard)
    graph.add_node("decide", _node_decide)

    graph.set_entry_point("gather")
    graph.add_edge("gather", "memory")
    graph.add_edge("memory", "fuse")
    graph.add_edge("fuse", "guard")
    graph.add_edge("guard", "decide")
    graph.add_edge("decide", END)

    return graph.compile(checkpointer=MemorySaver())


_COMPILED_GRAPH = None
_GRAPH_LOCK = threading.Lock()


def _get_graph():
    global _COMPILED_GRAPH
    with _GRAPH_LOCK:
        if _COMPILED_GRAPH is None:
            _COMPILED_GRAPH = _build_graph()
    return _COMPILED_GRAPH


def _state_to_fused(state: SupervisorState) -> Optional[FusedSignal]:
    """Reconstruct a FusedSignal from the final graph state."""
    from ..models import SignalType
    import dataclasses

    signal_str = state.get("final_signal_type")
    if not signal_str:
        return None

    try:
        st = SignalType(signal_str)
    except ValueError:
        st = SignalType.HOLD

    contribs = tuple(
        _contrib_from_dict(d) for d in state.get("contributions", [])
    )

    return FusedSignal(
        signal_type=st,
        confidence=float(state.get("final_confidence", 0.0)),
        reasoning=state.get("final_reasoning", ""),
        contributions=contribs,
        decision_id=state.get("final_decision_id", ""),
        blockers=tuple(state.get("final_blockers", [])),
    )


# ── Public API ─────────────────────────────────────────────────────────────────

def run_supervisor(
    symbol: str,
    df: pd.DataFrame,
    config: Any,
    *,
    circuit_blocked: bool = False,
    thread_id: Optional[str] = None,
) -> FusedSignal:
    """
    Run the LangGraph pipeline and return a FusedSignal.

    Non-serializable data (df, config) is stored in thread-local context
    so LangGraph's MemorySaver can checkpoint the serializable state.

    Returns HOLD on any pipeline error.
    """
    if not _USE_LANGGRAPH:
        raise RuntimeError(
            "run_supervisor called but USE_LANGGRAPH is not enabled. "
            "Set USE_LANGGRAPH=1 or use KronosOrchestrator directly."
        )

    _set_call_context(symbol, df, config)

    initial_state: SupervisorState = {
        "symbol": symbol,
        "contributions": [],
        "memory_context": [],
        "fused_dict": None,
        "circuit_blocked": circuit_blocked,
        "final_decision_id": "",
        "final_signal_type": "",
        "final_confidence": 0.0,
        "final_reasoning": "",
        "final_blockers": [],
        "budget_start_s": time.monotonic(),
    }

    config_run = {"configurable": {"thread_id": thread_id or f"{symbol}-{time.time_ns()}"}}

    try:
        graph = _get_graph()
        final_state = graph.invoke(initial_state, config=config_run)
        result = _state_to_fused(final_state)
        if result:
            return result
    except Exception as exc:
        logger.error(f"[supervisor] LangGraph pipeline failed: {exc}")

    return fuse_agent_signals([])
