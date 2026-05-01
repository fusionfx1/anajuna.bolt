"""
Agent decision persistence: append-only writes to agent_decisions table.

Design contract:
- save_decision() raises on persistence failure (logged at ERROR level before raising).
  Callers that want fire-and-forget behaviour should wrap in try/except or run in a
  background thread (see signal_providers.py).
- Runs synchronously; callers should fire it in a background thread to avoid
  blocking the live trading loop (see signal_providers.py).
- user_id is optional: paper trading sessions have no authenticated user.
"""
from __future__ import annotations

import dataclasses
import json
import os
from typing import TYPE_CHECKING, Optional

from loguru import logger

if TYPE_CHECKING:
    from .runtime import EvalContext
    from .schemas import AgentSignalContribution, FusedSignal


def _get_client():
    """Return a supabase client using service-role key when available, anon key otherwise."""
    try:
        from supabase import create_client
    except ImportError:
        raise ImportError("supabase package not installed")

    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    # Prefer service-role key for server-side inserts (bypasses RLS)
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_ANON_KEY", "")
    )

    if not url or not key:
        raise EnvironmentError(
            "Supabase credentials not configured "
            "(SUPABASE_URL / VITE_SUPABASE_URL + key)"
        )
    return create_client(url, key)


def _serialize_contribution(c: "AgentSignalContribution") -> dict:
    d = dataclasses.asdict(c)
    # tuple fields are not JSON-serialisable directly — convert to list
    d["next_actions"] = list(c.next_actions)
    d["artifacts"] = [list(pair) for pair in c.artifacts]
    return d


def save_decision(
    fused: "FusedSignal",
    ctx: "EvalContext",
    *,
    user_id: Optional[str] = None,
    signal_mode: str = "agent",
) -> Optional[str]:
    """
    Persist a FusedSignal to the agent_decisions table.

    Parameters
    ----------
    fused:       FusedSignal produced by fuse_agent_signals().
    ctx:         EvalContext used for this decision (carries symbol).
    user_id:     Supabase user UUID. None for paper/unauthenticated sessions.
    signal_mode: "rules" | "agent" — recorded for analytics.

    Returns
    -------
    str | None
        decision_id on success, None on any failure.
    """
    if not fused.decision_id:
        logger.warning("[persistence] save_decision called with empty decision_id — skipping")
        return None

    try:
        client = _get_client()
    except (ImportError, EnvironmentError) as exc:
        logger.debug(f"[persistence] Supabase unavailable: {exc}")
        return None

    try:
        contributions_json = [
            _serialize_contribution(c) for c in fused.contributions
        ]

        row: dict = {
            "decision_id": fused.decision_id,
            "symbol": ctx.symbol,
            "signal_type": fused.signal_type.value
            if hasattr(fused.signal_type, "value")
            else str(fused.signal_type),
            "confidence": round(float(fused.confidence), 4),
            "reasoning": fused.reasoning[:2000],  # guard against oversized text
            "blockers": list(fused.blockers),
            "contributions": contributions_json,
            "signal_mode": signal_mode,
        }

        if user_id:
            row["user_id"] = user_id

        client.table("agent_decisions").insert(row).execute()
        logger.debug(
            f"[persistence] saved decision {fused.decision_id} "
            f"({fused.signal_type}) for {ctx.symbol}"
        )
        return fused.decision_id

    except Exception as exc:
        logger.error(
            f"[persistence] save_decision failed for decision_id={fused.decision_id}: {exc}"
        )
        raise


def save_decision_embedding(
    decision_id: str,
    embedding: list[float],
) -> bool:
    """
    Update the embedding column for an existing agent_decisions row.

    Called after save_decision() once the embedding vector is ready.
    Returns True on success, False on any failure.
    """
    if not decision_id or not embedding:
        return False

    try:
        client = _get_client()
        client.table("agent_decisions").update(
            {"embedding": embedding}
        ).eq("decision_id", decision_id).execute()
        return True
    except Exception as exc:
        logger.warning(f"[persistence] save_decision_embedding failed: {exc}")
        return False
