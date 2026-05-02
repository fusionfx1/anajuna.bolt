"""
Real FredAgent: fetches macro series from FRED (St. Louis Fed API) and
derives a USD-bias signal from recent yield, rate, and inflation moves.
"""
from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING, Optional

import httpx
from loguru import logger

from .schemas import AgentSignalContribution

if TYPE_CHECKING:
    import pandas as pd
    from ..models import StrategyConfig

_AGENT_ID = "fred-v1"
_FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Series to fetch: (series_id, human_label)
_SERIES = [
    ("DGS10", "10Y Treasury yield"),
    ("DFF", "Fed Funds Rate"),
    ("CPIAUCSL", "CPI"),
]


def _fetch_series(series_id: str, api_key: str) -> tuple[float, float] | None:
    """
    Return (latest_value, previous_value) for a FRED series.
    Returns None if fetch fails or not enough observations.
    """
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                _FRED_BASE,
                params={
                    "series_id": series_id,
                    "api_key": api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": 2,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        observations = data.get("observations", [])
        valid = [
            float(o["value"])
            for o in observations
            if o.get("value") not in (".", None, "")
        ]
        if len(valid) < 2:
            return None
        return valid[0], valid[1]
    except Exception as exc:
        logger.debug(f"[{_AGENT_ID}] skipping {series_id}: {exc}")
        return None


def _series_signal(
    series_id: str, latest: float, previous: float
) -> tuple[str, str] | None:
    """
    Return (signal, description) based on series movement, or None if neutral.
    Signal is expressed as USD-bias: SELL = USD bearish, BUY = USD bullish.
    """
    delta = latest - previous
    if series_id == "DGS10":
        if delta > 0.1:
            return "SELL", f"DGS10 +{delta:.3f} (risk-off → USD up → BUY USD pairs → SELL EUR)"
        if delta < -0.1:
            return "BUY", f"DGS10 {delta:.3f} (risk-on → USD down → SELL USD pairs → BUY EUR)"
        return None
    if series_id == "DFF":
        if delta > 0:
            return "SELL", f"DFF +{delta:.3f} (hawkish Fed → USD up → SELL)"
        if delta < 0:
            return "BUY", f"DFF {delta:.3f} (dovish Fed → USD down → BUY)"
        return None
    if series_id == "CPIAUCSL":
        if latest > 3.5:
            return "SELL", f"CPI={latest:.2f} > 3.5 (inflationary → hawkish → SELL)"
        return None
    return None


class FredAgent:
    """FRED macro series agent — real implementation."""

    def evaluate(
        self,
        symbol: str,
        df: Optional["pd.DataFrame"] = None,
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del df, config

        api_key = os.environ.get("FRED_API_KEY", "").strip()
        if not api_key:
            return AgentSignalContribution(
                source="fred",
                signal_type="HOLD",
                confidence=0.1,
                reasoning="No FRED_API_KEY configured",
                status="warning",
                agent_id=_AGENT_ID,
            )

        t0 = time.monotonic()
        votes: list[str] = []
        descriptions: list[str] = []

        for series_id, label in _SERIES:
            pair = _fetch_series(series_id, api_key)
            if pair is None:
                logger.debug(f"[{_AGENT_ID}] {series_id} skipped (unavailable)")
                continue
            latest, previous = pair
            result = _series_signal(series_id, latest, previous)
            if result is not None:
                sig, desc = result
                votes.append(sig)
                descriptions.append(desc)
                logger.debug(f"[{_AGENT_ID}] {label}: {desc}")
            else:
                descriptions.append(f"{label}: neutral (Δ={latest - previous:.3f})")

        latency = int((time.monotonic() - t0) * 1000)

        if not votes:
            reason = "All FRED series neutral or unavailable"
            if not descriptions:
                status: str = "warning"
            else:
                status = "success"
            return AgentSignalContribution(
                source="fred",
                signal_type="HOLD",
                confidence=0.1,
                reasoning=reason[:240],
                status=status,  # type: ignore[arg-type]
                agent_id=_AGENT_ID,
                latency_ms=latency,
            )

        buy_count = votes.count("BUY")
        sell_count = votes.count("SELL")
        total = len(votes)

        if buy_count > sell_count:
            signal_type = "BUY"
            confidence = buy_count / max(len(_SERIES), 1)
        elif sell_count > buy_count:
            signal_type = "SELL"
            confidence = sell_count / max(len(_SERIES), 1)
        else:
            signal_type = "HOLD"
            confidence = 0.1

        confidence = max(0.1, min(1.0, confidence))
        reason = "; ".join(descriptions)[:240]

        logger.debug(
            f"[{_AGENT_ID}] {symbol}: {signal_type} conf={confidence:.2f} — {reason}"
        )

        return AgentSignalContribution(
            source="fred",
            signal_type=signal_type,  # type: ignore[arg-type]
            confidence=confidence,
            reasoning=reason,
            status="success",
            agent_id=_AGENT_ID,
            latency_ms=latency,
        )
