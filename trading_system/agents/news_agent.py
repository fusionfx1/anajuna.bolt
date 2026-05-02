"""
Real NewsAgent: fetches headlines from NewsAPI / Finnhub / Alpha Vantage,
then classifies sentiment via keyword heuristic or OpenAI gpt-4o-mini.
"""
from __future__ import annotations

import json
import os
import time
from typing import TYPE_CHECKING, Optional

import httpx
from loguru import logger

from .schemas import AgentSignalContribution

if TYPE_CHECKING:
    import pandas as pd
    from ..models import StrategyConfig

# ── constants ─────────────────────────────────────────────────────────────────

_AGENT_ID = "news-v1"
_POSITIVE = ["rally", "bullish", "surge", "gain", "strong", "hawkish"]
_NEGATIVE = ["crash", "fall", "bearish", "weak", "dovish", "recession"]


def _keyword_sentiment(texts: list[str]) -> tuple[str, float, str]:
    """Return (signal_type, confidence, reasoning) from keyword counting."""
    combined = " ".join(texts).lower()
    pos = sum(combined.count(w) for w in _POSITIVE)
    neg = sum(combined.count(w) for w in _NEGATIVE)
    total = pos + neg
    if total == 0:
        return "HOLD", 0.1, "No sentiment keywords found in headlines"
    confidence = min(0.8, max(0.1, abs(pos - neg) / total))
    if pos > neg:
        reason = f"Bullish keywords: {pos} vs bearish: {neg}"
        return "BUY", confidence, reason
    if neg > pos:
        reason = f"Bearish keywords: {neg} vs bullish: {pos}"
        return "SELL", confidence, reason
    return "HOLD", 0.1, f"Equal sentiment signals (pos={pos} neg={neg})"


def _openai_sentiment(
    titles: list[str], api_key: str
) -> tuple[str, float, str] | None:
    """Call OpenAI gpt-4o-mini for headline sentiment. Returns None on failure."""
    try:
        import openai  # optional dependency

        client = openai.OpenAI(api_key=api_key)
        headlines = "\n".join(f"- {t}" for t in titles[:10])
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        'You analyze forex headlines. Return JSON: '
                        '{"signal": "BUY"|"SELL"|"HOLD", "confidence": 0.0-1.0, '
                        '"reason": "<= 100 chars"}'
                    ),
                },
                {"role": "user", "content": headlines},
            ],
            max_tokens=80,
            temperature=0,
        )
        raw = response.choices[0].message.content or ""
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        signal = str(data.get("signal", "HOLD")).upper()
        if signal not in ("BUY", "SELL", "HOLD"):
            signal = "HOLD"
        conf = float(data.get("confidence", 0.5))
        conf = max(0.0, min(1.0, conf))
        reason = str(data.get("reason", "OpenAI sentiment"))[:100]
        return signal, conf, reason  # type: ignore[return-value]
    except Exception as exc:
        logger.debug(f"[{_AGENT_ID}] OpenAI fallback: {exc}")
        return None


# ── provider functions ─────────────────────────────────────────────────────────


def _fetch_newsapi(symbol: str, api_key: str) -> list[str]:
    """Return list of article titles from NewsAPI."""
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(
            "https://newsapi.org/v2/everything",
            params={"q": symbol, "language": "en", "pageSize": 5, "apiKey": api_key},
        )
        resp.raise_for_status()
        data = resp.json()
    return [a.get("title", "") for a in data.get("articles", []) if a.get("title")]


def _fetch_finnhub(api_key: str) -> list[str]:
    """Return list of headline strings from Finnhub forex news."""
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(
            "https://finnhub.io/api/v1/news",
            params={"category": "forex", "token": api_key},
        )
        resp.raise_for_status()
        data = resp.json()
    return [item.get("headline", "") for item in data if item.get("headline")][:10]


def _fetch_alpha_vantage(symbol: str, api_key: str) -> list[str]:
    """Return headlines from Alpha Vantage NEWS_SENTIMENT endpoint."""
    ticker = f"FOREX:{symbol[:3]}"
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "NEWS_SENTIMENT",
                "tickers": ticker,
                "apikey": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    feed = data.get("feed", [])
    return [item.get("title", "") for item in feed if item.get("title")][:10]


# ── agent ─────────────────────────────────────────────────────────────────────


class NewsAgent:
    """Headlines / macro news bias — real implementation."""

    def evaluate(
        self,
        symbol: str,
        df: Optional["pd.DataFrame"] = None,
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del df, config

        news_key = os.environ.get("NEWS_API_KEY", "").strip()
        finnhub_key = os.environ.get("FINNHUB_API_KEY", "").strip()
        av_key = os.environ.get("ALPHA_VANTAGE_API_KEY", "").strip()
        openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

        if not any([news_key, finnhub_key, av_key]):
            return AgentSignalContribution(
                source="news",
                signal_type="HOLD",
                confidence=0.1,
                reasoning="No news API key configured",
                status="warning",
                agent_id=_AGENT_ID,
            )

        t0 = time.monotonic()
        titles: list[str] = []
        provider = "none"

        try:
            if news_key:
                titles = _fetch_newsapi(symbol, news_key)
                provider = "newsapi"
            elif finnhub_key:
                titles = _fetch_finnhub(finnhub_key)
                provider = "finnhub"
            elif av_key:
                titles = _fetch_alpha_vantage(symbol, av_key)
                provider = "alphavantage"
        except Exception as exc:
            latency = int((time.monotonic() - t0) * 1000)
            reason = str(exc)[:200]
            logger.warning(f"[{_AGENT_ID}] HTTP error from {provider}: {exc}")
            return AgentSignalContribution(
                source="news",
                signal_type="HOLD",
                confidence=0.1,
                reasoning=reason,
                status="warning",
                agent_id=_AGENT_ID,
                latency_ms=latency,
            )

        latency = int((time.monotonic() - t0) * 1000)

        if not titles:
            return AgentSignalContribution(
                source="news",
                signal_type="HOLD",
                confidence=0.1,
                reasoning=f"No headlines returned by {provider}",
                status="warning",
                agent_id=_AGENT_ID,
                latency_ms=latency,
            )

        # Sentiment classification
        signal_type: str
        confidence: float
        reasoning: str

        if openai_key:
            result = _openai_sentiment(titles, openai_key)
            if result is not None:
                signal_type, confidence, reasoning = result
            else:
                signal_type, confidence, reasoning = _keyword_sentiment(titles)
        else:
            signal_type, confidence, reasoning = _keyword_sentiment(titles)

        full_reason = f"[{provider}] {reasoning}"[:240]
        logger.debug(
            f"[{_AGENT_ID}] {symbol}: {signal_type} conf={confidence:.2f} — {full_reason}"
        )

        return AgentSignalContribution(
            source="news",
            signal_type=signal_type,  # type: ignore[arg-type]
            confidence=confidence,
            reasoning=full_reason,
            status="success",
            agent_id=_AGENT_ID,
            latency_ms=latency,
        )
