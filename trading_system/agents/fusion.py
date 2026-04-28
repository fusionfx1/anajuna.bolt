"""
Fuse multiple AgentSignalContribution values into a single FusedSignal.
"""
from __future__ import annotations

from ..models import SignalType
from .schemas import AgentSignalContribution, FusedSignal


def fuse_agent_signals(contributions: list[AgentSignalContribution]) -> FusedSignal:
    """
    Score BUY / SELL / HOLD by weighted confidence and pick the strongest side.

    Tie-breaking prefers HOLD when scores are close.
    """
    if not contributions:
        return FusedSignal(
            signal_type=SignalType.HOLD,
            confidence=0.0,
            reasoning="Fusion: no agent contributions.",
            contributions=tuple(),
        )

    scores = {"BUY": 0.0, "SELL": 0.0, "HOLD": 0.0}
    lines: list[str] = []
    for c in contributions:
        scores[c.signal_type] += float(c.confidence)
        lines.append(f"{c.source}: {c.signal_type}@{c.confidence:.2f} — {c.reasoning}")

    buy = scores["BUY"]
    sell = scores["SELL"]
    hold = scores["HOLD"]
    best_side = max(scores, key=scores.get)
    top = scores[best_side]
    second = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0.0

    # If BUY and SELL both fire with similar weight, stay flat.
    if buy > 0 and sell > 0 and abs(buy - sell) < 0.15:
        agg_conf = min(1.0, hold + 0.5 * (buy + sell) / max(len(contributions), 1))
        reasoning = "Fusion: conflicting BUY/SELL bias — HOLD. | " + " | ".join(lines)
        return FusedSignal(
            signal_type=SignalType.HOLD,
            confidence=agg_conf,
            reasoning=reasoning,
            contributions=tuple(contributions),
        )

    if best_side == "HOLD" or top - second < 0.05:
        st = SignalType.HOLD
        conf = min(1.0, top / max(len(contributions), 1))
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
    )
