"""
Agent framework: CrewAI-backed stubs, fusion, and Kronos orchestration.

Phase 1 provides deterministic stubs (HOLD when optional API keys are absent),
parallel evaluation, and signal fusion. Full LLM Crew kickoff is optional.
"""
from __future__ import annotations

from .fusion import fuse_agent_signals
from .orchestrator import KronosOrchestrator
from .schemas import AgentSignalContribution, FusedSignal
from .stub_agents import FredAgent, NewsAgent, SentimentAgent

__all__ = [
    "AgentSignalContribution",
    "FusedSignal",
    "fuse_agent_signals",
    "KronosOrchestrator",
    "NewsAgent",
    "FredAgent",
    "SentimentAgent",
]
