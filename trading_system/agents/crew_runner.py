"""
CrewAI wiring: each stub domain is exposed as a CrewAI tool and as a dedicated Agent.

Parallel execution uses ThreadPoolExecutor over tool.run(...) so stubs execute concurrently
without requiring OPENAI_API_KEY. Optional full Crew.kickoff() is available when keys exist.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Callable, Optional

import pandas as pd
from crewai import Agent, Crew, Process, Task
from crewai.tools import tool
from loguru import logger

from .schemas import AgentSignalContribution
from .stub_agents import FredAgent, NewsAgent, SentimentAgent

if TYPE_CHECKING:
    from ..models import StrategyConfig


def _contrib_to_json(c: AgentSignalContribution) -> str:
    return json.dumps(
        {
            "source": c.source,
            "signal_type": c.signal_type,
            "confidence": c.confidence,
            "reasoning": c.reasoning,
        },
        ensure_ascii=False,
    )


def make_signal_tools(
    df: Optional[pd.DataFrame],
    config: Optional["StrategyConfig"],
) -> tuple[Callable[..., str], Callable[..., str], Callable[..., str]]:
    """Build three CrewAI tools bound to the current dataframe / strategy config."""

    @tool("news_signal_tool")
    def news_signal_tool(symbol: str) -> str:
        """Return JSON news-channel stub signal (AgentSignalContribution fields)."""
        c = NewsAgent().evaluate(symbol, df, config=config)
        return _contrib_to_json(c)

    @tool("fred_signal_tool")
    def fred_signal_tool(symbol: str) -> str:
        """Return JSON FRED / macro stub signal (AgentSignalContribution fields)."""
        c = FredAgent().evaluate(symbol, df, config=config)
        return _contrib_to_json(c)

    @tool("sentiment_signal_tool")
    def sentiment_signal_tool(symbol: str) -> str:
        """Return JSON sentiment stub signal (AgentSignalContribution fields)."""
        c = SentimentAgent().evaluate(symbol, df, config=config)
        return _contrib_to_json(c)

    return news_signal_tool, fred_signal_tool, sentiment_signal_tool


def json_to_contribution(payload: str) -> AgentSignalContribution:
    d = json.loads(payload)
    return AgentSignalContribution(
        source=d["source"],
        signal_type=d["signal_type"],
        confidence=float(d["confidence"]),
        reasoning=d["reasoning"],
    )


def run_agent_tools_parallel(
    symbol: str,
    df: Optional[pd.DataFrame],
    config: Optional["StrategyConfig"],
) -> list[AgentSignalContribution]:
    """Execute the three CrewAI tools in parallel (same stub logic as stub_agents)."""

    news_tool, fred_tool, sent_tool = make_signal_tools(df, config)
    tools = (news_tool, fred_tool, sent_tool)

    def _invoke(t: Callable[..., str]) -> AgentSignalContribution:
        raw = t.run(symbol=symbol)
        return json_to_contribution(raw)

    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(_invoke, tools))


def build_trading_crew(
    symbol: str,
    df: Optional[pd.DataFrame],
    config: Optional["StrategyConfig"],
) -> Crew:
    """
    Construct a sequential Crew with News, FRED, and Sentiment agents (one task each).

    Used for integration/diagnostics; execution defaults to run_agent_tools_parallel.
    """
    news_tool, fred_tool, sent_tool = make_signal_tools(df, config)

    news_agent = Agent(
        role="News analyst",
        goal=f"Produce a JSON trading bias from macro headlines for {symbol}.",
        backstory="You summarize headline risk for FX.",
        tools=[news_tool],
        verbose=False,
    )
    fred_agent = Agent(
        role="Macro / FRED analyst",
        goal=f"Produce a JSON bias from macro series context for {symbol}.",
        backstory="You interpret macro prints versus expectations.",
        tools=[fred_tool],
        verbose=False,
    )
    sent_agent = Agent(
        role="Sentiment analyst",
        goal=f"Produce a JSON bias from sentiment/social signals for {symbol}.",
        backstory="You quantify positioning and social tone.",
        tools=[sent_tool],
        verbose=False,
    )

    task_news = Task(
        description=f"Call news_signal_tool with symbol={symbol} and return JSON only.",
        expected_output="JSON object string",
        agent=news_agent,
    )
    task_fred = Task(
        description=f"Call fred_signal_tool with symbol={symbol} and return JSON only.",
        expected_output="JSON object string",
        agent=fred_agent,
    )
    task_sent = Task(
        description=f"Call sentiment_signal_tool with symbol={symbol} and return JSON only.",
        expected_output="JSON object string",
        agent=sent_agent,
    )

    return Crew(
        agents=[news_agent, fred_agent, sent_agent],
        tasks=[task_news, task_fred, task_sent],
        process=Process.sequential,
        verbose=False,
    )


def kickoff_crew_if_enabled(
    symbol: str,
    df: Optional[pd.DataFrame],
    config: Optional["StrategyConfig"],
) -> Optional[str]:
    """
    Run Crew.kickoff() when OPENAI_API_KEY is set and USE_CREWAI_KICKOFF=1.

    Returns raw crew output string, or None when skipped / unsupported.
    """
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        logger.debug("Skipping Crew.kickoff — OPENAI_API_KEY not set")
        return None
    if os.environ.get("USE_CREWAI_KICKOFF", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        return None
    crew = build_trading_crew(symbol, df, config)
    result = crew.kickoff(inputs={"symbol": symbol})
    return str(result)
