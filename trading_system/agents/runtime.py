"""
Agent runtime: deadline-guarded evaluation with retry and fallback.

Central contract for all agent calls in the trading system:
- Hard deadline per call (AGENT_TIMEOUT_MS_PER_CALL env var, default 1500 ms)
- 1 retry with random jitter for retryable errors (network / JSON-malformed)
- Timeout → immediate HOLD, no retry
- Broker / CircuitBreaker errors → no retry (caller decides)
- Every return is a valid AgentSignalContribution with status, agent_id, latency_ms set
"""
from __future__ import annotations

import dataclasses
import json
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Optional, Protocol

import pandas as pd
from loguru import logger

from .schemas import AgentSignalContribution

if TYPE_CHECKING:
    from ..models import StrategyConfig

# ── tuneable defaults ──────────────────────────────────────────────────────────

DEFAULT_DEADLINE_MS: int = int(os.environ.get("AGENT_TIMEOUT_MS_PER_CALL", "1500"))
JITTER_MIN_MS: int = 100
JITTER_MAX_MS: int = 300

# ── retryable exception types (extended when httpx is available) ───────────────

_RETRYABLE: tuple[type[Exception], ...] = (
    json.JSONDecodeError,
    ConnectionError,
    OSError,
    ValueError,  # includes JSON parse errors from stdlib json
)

try:
    import httpx as _httpx

    _RETRYABLE = (
        *_RETRYABLE,
        _httpx.NetworkError,
        _httpx.TimeoutException,
        _httpx.RemoteProtocolError,
    )
except ImportError:
    pass


# ── context passed to every agent evaluation ──────────────────────────────────

@dataclass
class EvalContext:
    """Immutable evaluation context passed to every agent call."""

    symbol: str
    source: Literal["news", "fred", "sentiment", "technical"] = "news"
    df: Optional[pd.DataFrame] = None
    config: Optional["StrategyConfig"] = None
    agent_id: str = ""


# ── agent protocol ────────────────────────────────────────────────────────────

class AgentProtocol(Protocol):
    """Structural protocol expected by evaluate_with_deadline."""

    def evaluate(
        self,
        symbol: str,
        df: Optional[pd.DataFrame],
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution: ...


# ── helpers ───────────────────────────────────────────────────────────────────

def _fallback_hold(
    source: Literal["news", "fred", "sentiment", "technical"],
    agent_id: str,
    reason: str,
    *,
    latency_ms: int = 0,
) -> AgentSignalContribution:
    """Return a safe HOLD contribution when an agent cannot produce a result."""
    return AgentSignalContribution(
        source=source,
        signal_type="HOLD",
        confidence=0.0,
        reasoning=f"[runtime] fallback HOLD: {reason}",
        status="warning",
        agent_id=agent_id,
        latency_ms=latency_ms,
    )


def _call_agent(agent: AgentProtocol, ctx: EvalContext) -> AgentSignalContribution:
    """Synchronous agent call executed inside a thread pool worker."""
    return agent.evaluate(ctx.symbol, ctx.df, config=ctx.config)


def _try_once(
    agent: AgentProtocol,
    ctx: EvalContext,
    remaining_s: float,
    start_offset_ms: int = 0,
) -> tuple[AgentSignalContribution | None, Exception | None]:
    """
    Execute one agent call within remaining_s seconds.

    Returns:
        (result, None)   on success — result is enriched with agent_id / latency_ms
        (None, exception) on failure or timeout
    """
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_call_agent, agent, ctx)
        try:
            raw = future.result(timeout=max(0.05, remaining_s))
        except FuturesTimeoutError as exc:
            elapsed = int((time.monotonic() - t0) * 1000) + start_offset_ms
            return None, TimeoutError(f"deadline exceeded after {elapsed}ms")
        except Exception as exc:  # exception raised inside the agent
            return None, exc

    elapsed = int((time.monotonic() - t0) * 1000) + start_offset_ms

    if not isinstance(raw, AgentSignalContribution):
        return None, TypeError(f"agent returned {type(raw).__name__}, expected AgentSignalContribution")

    enriched = dataclasses.replace(
        raw,
        agent_id=ctx.agent_id or raw.agent_id,
        latency_ms=elapsed,
        status=raw.status if raw.status in ("success", "warning", "error") else "success",
    )
    return enriched, None


# ── public API ────────────────────────────────────────────────────────────────

def evaluate_with_deadline(
    agent: AgentProtocol,
    ctx: EvalContext,
    deadline_ms: int = DEFAULT_DEADLINE_MS,
) -> AgentSignalContribution:
    """
    Call agent.evaluate with a hard deadline and automatic retry for retryable errors.

    Policy:
    - Timeout                 → immediate HOLD (status=warning), no retry
    - Retryable error         → 1 retry after random jitter (100–300 ms)
    - Retry fails / non-retryable error → HOLD (status=warning)
    - Successful result enriched with agent_id and latency_ms from this call

    Args:
        agent:       Any object implementing AgentProtocol.evaluate()
        ctx:         EvalContext with symbol, source, df, config, agent_id
        deadline_ms: Hard wall-clock budget per single attempt (ms).
                     Defaults to AGENT_TIMEOUT_MS_PER_CALL env var (1500 ms).

    Returns:
        AgentSignalContribution — always valid, never raises.
    """
    deadline_s = deadline_ms / 1000.0
    agent_id = ctx.agent_id
    source = ctx.source
    t_global = time.monotonic()

    # ── first attempt ──────────────────────────────────────────────────────────
    result, exc = _try_once(agent, ctx, deadline_s)
    if result is not None:
        return result

    elapsed_ms = int((time.monotonic() - t_global) * 1000)

    if isinstance(exc, TimeoutError):
        logger.warning(f"[runtime] {agent_id}: {exc}")
        return _fallback_hold(source, agent_id, str(exc), latency_ms=elapsed_ms)

    # ── retry decision ─────────────────────────────────────────────────────────
    if isinstance(exc, _RETRYABLE):
        jitter_ms = random.randint(JITTER_MIN_MS, JITTER_MAX_MS)
        logger.warning(
            f"[runtime] {agent_id}: retryable {exc.__class__.__name__} — "
            f"retry in {jitter_ms}ms"
        )
        time.sleep(jitter_ms / 1000.0)

        remaining_ms = deadline_ms - elapsed_ms - jitter_ms
        if remaining_ms < 50:
            total = int((time.monotonic() - t_global) * 1000)
            logger.warning(f"[runtime] {agent_id}: no budget remaining for retry")
            return _fallback_hold(
                source, agent_id, "budget exhausted before retry", latency_ms=total
            )

        result2, exc2 = _try_once(
            agent, ctx, remaining_ms / 1000.0, start_offset_ms=elapsed_ms + jitter_ms
        )
        if result2 is not None:
            return result2

        total = int((time.monotonic() - t_global) * 1000)
        logger.error(f"[runtime] {agent_id}: retry failed: {exc2}")
        return _fallback_hold(
            source, agent_id, f"retry failed: {exc2}", latency_ms=total
        )

    # ── non-retryable error ────────────────────────────────────────────────────
    logger.error(f"[runtime] {agent_id}: non-retryable error: {exc}")
    return _fallback_hold(source, agent_id, f"error: {exc}", latency_ms=elapsed_ms)
