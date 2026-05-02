"""
Real SentimentAgent: fetches social/market sentiment from Twitter (X) API
or Finnhub news-sentiment endpoint, then derives a directional bias.
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

_AGENT_ID = "sentiment-v1"
_POSITIVE = ["rally", "bullish", "surge", "gain", "strong", "hawkish", "up", "rise"]
_NEGATIVE = ["crash", "fall", "bearish", "weak", "dovish", "recession", "down", "drop"]


def _keyword_sentiment_social(texts: list[str]) -> tuple[str, float, str]:
    """Keyword-based heuristic for social data; confidence clamped to 0.1..0.7."""
    combined = " ".join(texts).lower()
    pos = sum(combined.count(w) for w in _POSITIVE)
    neg = sum(combined.count(w) for w in _NEGATIVE)
    total = pos + neg
    if total == 0:
        return "HOLD", 0.1, "No sentiment keywords in tweets"
    confidence = min(0.7, max(0.1, abs(pos - neg) / total))
    if pos > neg:
        return "BUY", confidence, f"Tweets: bullish {pos} vs bearish {neg}"
    if neg > pos:
        return "SELL", confidence, f"Tweets: bearish {neg} vs bullish {pos}"
    return "HOLD", 0.1, f"Equal tweet signals (pos={pos} neg={neg})"


def _fetch_twitter(symbol: str, bearer_token: str) -> list[str]:
    """Fetch recent tweet texts for forex+symbol from Twitter v2 API."""
    query = f"forex {symbol}"
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(
            "https://api.twitter.com/2/tweets/search/recent",
            params={"query": query, "max_results": 10},
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
    return [item.get("text", "") for item in data.get("data", []) if item.get("text")]


def _fetch_finnhub_sentiment(
    symbol: str, api_key: str
) -> tuple[str, float, str] | None:
    """
    Fetch Finnhub news-sentiment and return (signal, confidence, reason).
    Returns None on parse failure.
    """
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(
            "https://finnhub.io/api/v1/news-sentiment",
            params={"symbol": symbol, "token": api_key},
        )
        resp.raise_for_status()
        data = resp.json()

    sentiment = data.get("sentiment", {})
    bullish = float(sentiment.get("bullishPercent", 0.0))
    bearish = float(sentiment.get("bearishPercent", 0.0))

    if bullish > 0.6:
        conf = min(0.9, bullish)
        return "BUY", conf, f"Finnhub: bullishPercent={bullish:.2f}"
    if bearish > 0.6:
        conf = min(0.9, bearish)
        return "SELL", conf, f"Finnhub: bearishPercent={bearish:.2f}"
    return "HOLD", 0.2, f"Finnhub: neutral (bull={bullish:.2f} bear={bearish:.2f})"


class SentimentAgent:
    """Market / social sentiment agent — real implementation."""

    def evaluate(
        self,
        symbol: str,
        df: Optional["pd.DataFrame"] = None,
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del df, config

        sentiment_key = os.environ.get("SENTIMENT_API_KEY", "").strip()
        twitter_token = os.environ.get("TWITTER_BEARER_TOKEN", "").strip()

        if not any([sentiment_key, twitter_token]):
            return AgentSignalContribution(
                source="sentiment",
                signal_type="HOLD",
                confidence=0.1,
                reasoning="No sentiment API key configured",
                status="warning",
                agent_id=_AGENT_ID,
            )

        t0 = time.monotonic()

        # ── Twitter path ───────────────────────────────────────────────────────
        if twitter_token:
            try:
                texts = _fetch_twitter(symbol, twitter_token)
                latency = int((time.monotonic() - t0) * 1000)
                if not texts:
                    return AgentSignalContribution(
                        source="sentiment",
                        signal_type="HOLD",
                        confidence=0.1,
                        reasoning="No tweets found for query",
                        status="warning",
                        agent_id=_AGENT_ID,
                        latency_ms=latency,
                    )
                signal_type, confidence, reason = _keyword_sentiment_social(texts)
                full_reason = f"[twitter] {reason}"[:240]
                logger.debug(
                    f"[{_AGENT_ID}] {symbol} twitter: {signal_type} "
                    f"conf={confidence:.2f} — {full_reason}"
                )
                return AgentSignalContribution(
                    source="sentiment",
                    signal_type=signal_type,  # type: ignore[arg-type]
                    confidence=confidence,
                    reasoning=full_reason,
                    status="success",
                    agent_id=_AGENT_ID,
                    latency_ms=latency,
                )
            except Exception as exc:
                latency = int((time.monotonic() - t0) * 1000)
                reason = str(exc)[:200]
                logger.warning(f"[{_AGENT_ID}] Twitter error: {exc}")
                return AgentSignalContribution(
                    source="sentiment",
                    signal_type="HOLD",
                    confidence=0.1,
                    reasoning=reason,
                    status="warning",
                    agent_id=_AGENT_ID,
                    latency_ms=latency,
                )

        # ── Finnhub sentiment path (SENTIMENT_API_KEY) ─────────────────────────
        try:
            result = _fetch_finnhub_sentiment(symbol, sentiment_key)
            latency = int((time.monotonic() - t0) * 1000)
            if result is None:
                return AgentSignalContribution(
                    source="sentiment",
                    signal_type="HOLD",
                    confidence=0.1,
                    reasoning="Finnhub sentiment parse failed",
                    status="warning",
                    agent_id=_AGENT_ID,
                    latency_ms=latency,
                )
            signal_type, confidence, reason = result
            full_reason = f"[finnhub-sentiment] {reason}"[:240]
            logger.debug(
                f"[{_AGENT_ID}] {symbol} finnhub: {signal_type} "
                f"conf={confidence:.2f} — {full_reason}"
            )
            return AgentSignalContribution(
                source="sentiment",
                signal_type=signal_type,  # type: ignore[arg-type]
                confidence=confidence,
                reasoning=full_reason,
                status="success",
                agent_id=_AGENT_ID,
                latency_ms=latency,
            )
        except Exception as exc:
            latency = int((time.monotonic() - t0) * 1000)
            reason = str(exc)[:200]
            logger.warning(f"[{_AGENT_ID}] Finnhub sentiment error: {exc}")
            return AgentSignalContribution(
                source="sentiment",
                signal_type="HOLD",
                confidence=0.1,
                reasoning=reason,
                status="warning",
                agent_id=_AGENT_ID,
                latency_ms=latency,
            )
