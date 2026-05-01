"""
Agent framework: CrewAI-backed agents, fusion, and Kronos orchestration.

Phase 1 provides deterministic stubs (HOLD when optional API keys are absent),
parallel evaluation, and signal fusion. Full LLM Crew kickoff is optional.

Phase 1+ additions:
- runtime.py: evaluate_with_deadline (timeout / retry / fallback HOLD)
- schemas: status, agent_id, latency_ms, decision_id, blockers fields

Agent selection: USE_REAL_AGENTS env var (auto/true/false) controls whether
real or stub agents are used; see crew_runner.py for details.
"""
from __future__ import annotations

from .crew_runner import FredAgent, NewsAgent, SentimentAgent
from .embedding import embed_and_store, embed_text, retrieve_similar
from .fusion import fuse_agent_signals
from .orchestrator import KronosOrchestrator
from .persistence import save_decision
from .runtime import EvalContext, evaluate_with_deadline
from .schemas import AgentSignalContribution, FusedSignal
from .tech_agent import TechnicalSignalAgent

__all__ = [
    "AgentSignalContribution",
    "EvalContext",
    "FusedSignal",
    "fuse_agent_signals",
    "evaluate_with_deadline",
    "embed_text",
    "embed_and_store",
    "retrieve_similar",
    "save_decision",
    "KronosOrchestrator",
    "NewsAgent",
    "FredAgent",
    "SentimentAgent",
    "TechnicalSignalAgent",
]
