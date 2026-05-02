"""
Fuse multiple AgentSignalContribution values into a single FusedSignal.

v2 changes:
- Contributions with status="error" are excluded from scoring (logged + added to blockers)
- Every FusedSignal carries a decision_id (UUID4) for traceability
- blockers tuple surfaces agent failures / CB trips to callers
"""
from __future__ import annotations

import uuid

from loguru import logger

from ..models import SignalType
from .schemas import AgentSignalContribution, FusedSignal


def fuse_agent_signals(contributions: list[AgentSignalContribution]) -> FusedSignal:
    """
    Score BUY / SELL / HOLD by weighted confidence and pick the strongest side.

    Agents with status="error" are excluded from scoring but preserved in
    FusedSignal.contributions for audit trails. Tie-breaking prefers HOLD
    when scores are close.
    """
    decision_id = str(uuid.uuid4())
    blockers: list[str] = []

    if not contributions:
        return FusedSignal(
            signal_type=SignalType.HOLD,
            confidence=0.0,
            reasoning="Fusion: no agent contributions.",
            contributions=(),
            decision_id=decision_id,
            blockers=("no_contributions",),
        )

    # Partition into valid vs errored
    valid = [c for c in contributions if c.status != "error"]
    for c in contributions:
        if c.status == "error":
            blocker_key = f"{c.source}_error"
            blockers.append(blocker_key)
            logger.warning(
                f"[fusion] skipping error contribution from {c.source} "
                f"({c.agent_id}): {c.reasoning}"
            )

    if not valid:
        return FusedSignal(
            signal_type=SignalType.HOLD,
            confidence=0.0,
            reasoning="Fusion: all agent contributions errored.",
            contributions=tuple(contributions),
            decision_id=decision_id,
            blockers=(*blockers, "all_agents_errored"),
        )

    scores = {"BUY": 0.0, "SELL": 0.0, "HOLD": 0.0}
    lines: list[str] = []
    for c in valid:
        scores[c.signal_type] += float(c.confidence)
        lines.append(f"{c.source}: {c.signal_type}@{c.confidence:.2f} — {c.reasoning}")

    buy = scores["BUY"]
    sell = scores["SELL"]
    hold = scores["HOLD"]
    best_side = max(scores, key=scores.get)
    top = scores[best_side]
    second = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0.0

    # Conflicting BUY + SELL within threshold → flat
    if buy > 0 and sell > 0 and abs(buy - sell) < 0.15:
        agg_conf = min(1.0, hold + 0.5 * (buy + sell) / max(len(valid), 1))
        reasoning = "Fusion: conflicting BUY/SELL bias — HOLD. | " + " | ".join(lines)
        return FusedSignal(
            signal_type=SignalType.HOLD,
            confidence=agg_conf,
            reasoning=reasoning,
            contributions=tuple(contributions),
            decision_id=decision_id,
            blockers=(*blockers, "conflicting_signals"),
        )

    if best_side == "HOLD" or top - second < 0.05:
        st = SignalType.HOLD
        conf = min(1.0, top / max(len(valid), 1))
    elif best_side == "BUY":
        st = SignalType.BUY
        conf = min(1.0, buy)
    else:
        st = SignalType.SELL
        conf = min(1.0, sell)

    reasoning = "Fusion: " + " | ".join(lines)
    return FusedSignal(
        signal_type=st,
        confidence=conf,
        reasoning=reasoning,
        contributions=tuple(contributions),
        decision_id=decision_id,
        blockers=tuple(blockers),
    )
