"""
Stub agents: News, FRED (macro), Sentiment.

Without optional API keys they log once per evaluation and return HOLD with neutral confidence.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Optional

import pandas as pd
from loguru import logger

from .schemas import AgentSignalContribution

if TYPE_CHECKING:
    from ..models import StrategyConfig


_NEWS_KEY_ENV = ("NEWS_API_KEY", "FINNHUB_API_KEY", "ALPHA_VANTAGE_API_KEY")
_FRED_KEY_ENV = ("FRED_API_KEY",)
_SENTIMENT_KEY_ENV = ("SENTIMENT_API_KEY", "TWITTER_BEARER_TOKEN")


def _has_any_env(names: tuple[str, ...]) -> bool:
    return any(os.environ.get(k, "").strip() for k in names)


class NewsAgent:
    """Headlines / macro news bias (stub)."""

    def evaluate(
        self,
        symbol: str,
        df: Optional[pd.DataFrame],
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del config  # reserved for Phase 2+
        if not _has_any_env(_NEWS_KEY_ENV):
            logger.info(
                "[NewsAgent] No NEWS/FINNHUB/ALPHA_VANTAGE API key — stub HOLD"
            )
            return AgentSignalContribution(
                source="news",
                signal_type="HOLD",
                confidence=0.2,
                reasoning="Stub: no news API keys configured.",
            )
        # Phase 2: wire HTTP client; keep deterministic HOLD for now.
        logger.debug(f"[NewsAgent] keys present; stub HOLD for {symbol}")
        return AgentSignalContribution(
            source="news",
            signal_type="HOLD",
            confidence=0.35,
            reasoning="Stub: news pipeline not implemented (Phase 1).",
        )


class FredAgent:
    """FRED / macro series bias (stub)."""

    def evaluate(
        self,
        symbol: str,
        df: Optional[pd.DataFrame],
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del df, config
        if not _has_any_env(_FRED_KEY_ENV):
            logger.info("[FredAgent] No FRED_API_KEY — stub HOLD")
            return AgentSignalContribution(
                source="fred",
                signal_type="HOLD",
                confidence=0.2,
                reasoning="Stub: FRED API key not configured.",
            )
        logger.debug(f"[FredAgent] key present; stub HOLD for {symbol}")
        return AgentSignalContribution(
            source="fred",
            signal_type="HOLD",
            confidence=0.35,
            reasoning="Stub: FRED pipeline not implemented (Phase 1).",
        )


class SentimentAgent:
    """Sentiment / social stub."""

    def evaluate(
        self,
        symbol: str,
        df: Optional[pd.DataFrame],
        *,
        config: Optional["StrategyConfig"] = None,
    ) -> AgentSignalContribution:
        del df, config
        if not _has_any_env(_SENTIMENT_KEY_ENV):
            logger.info(
                "[SentimentAgent] No sentiment/twitter API key — stub HOLD"
            )
            return AgentSignalContribution(
                source="sentiment",
                signal_type="HOLD",
                confidence=0.2,
                reasoning="Stub: sentiment API keys not configured.",
            )
        logger.debug(f"[SentimentAgent] keys present; stub HOLD for {symbol}")
        return AgentSignalContribution(
            source="sentiment",
            signal_type="HOLD",
            confidence=0.35,
            reasoning="Stub: sentiment pipeline not implemented (Phase 1).",
        )


def evaluate_all_stubs_parallel(
    symbol: str,
    df: Optional[pd.DataFrame],
    *,
    config: Optional["StrategyConfig"] = None,
) -> list[AgentSignalContribution]:
    """Run the three stub agents in parallel (thread pool)."""

    agents: tuple[NewsAgent, FredAgent, SentimentAgent] = (
        NewsAgent(),
        FredAgent(),
        SentimentAgent(),
    )

    def _run(agent: NewsAgent | FredAgent | SentimentAgent) -> AgentSignalContribution:
        return agent.evaluate(symbol, df, config=config)

    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(_run, agents))


def contributions_to_json(contributions: list[AgentSignalContribution]) -> str:
    payload = [
        {
            "source": c.source,
            "signal_type": c.signal_type,
            "confidence": c.confidence,
            "reasoning": c.reasoning,
        }
        for c in contributions
    ]
    return json.dumps(payload, ensure_ascii=False)
