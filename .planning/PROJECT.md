# Anjuna FX — Production Readiness v1

## What This Is

Anjuna FX (also surfaced as "Fusion FX" in the sidebar brand) is a forex/CFD trading dashboard built as a Vite + React SPA on top of Supabase, paired with a Python `trading_system/` that produces signals through both a rule-based engine and a multi-agent CrewAI/LangGraph pipeline. **Production Readiness v1** is the milestone that turns this working but mock-leaning prototype into something a single operator can run against a live Supabase project and a real broker without hidden footguns.

## Core Value

**An operator can configure broker/data/agent credentials once, trust where every secret lives, and see real agent decisions reach the dashboard without empty-feed or silent-failure surprises.**

If everything else fails, that single trust loop — *"my keys are safe, the feed is real, the audit trail is durable"* — must work.

## Requirements

### Validated

<!-- Inferred from existing code via .planning/codebase/ARCHITECTURE.md, STACK.md, INTEGRATIONS.md -->

- ✓ Vite + React SPA shell with auth gate, navigation, dashboard, charts, paper trading, backtesting, and Settings — `src/App.tsx`, `src/components/Layout.tsx` — existing
- ✓ Supabase Auth + Postgres + RLS schema for strategies/positions/trades/paper trading/AI keys/agent decisions — `supabase/migrations/*.sql` — existing
- ✓ Multi-agent signal layer (CrewAI + optional LangGraph supervisor) with deadline-guarded runtime, fusion, and Supabase persistence — `trading_system/agents/*.py` — existing
- ✓ Agent Feed page with Realtime subscription on `agent_decisions` — `src/components/AgentFeed.tsx`, `src/hooks/useAgentDecisions.ts` — existing
- ✓ Data Feed + Broker config UI (Polygon / Alpaca / OANDA / simulation) persisted to `data_feed_configs` — `src/components/DataFeedConfig.tsx` — existing
- ✓ Backtest data-provider settings (EODHD / Tiingo / synthetic) with cache controls — `src/pages/Settings/DataProviders.tsx`, `src/context/DataProviderContext.tsx` — existing

### Active

<!-- Production Readiness v1 scope. These are hypotheses until shipped and validated. -->

- [x] Single, predictable Settings save flow with secrets never living in `localStorage` or mocked fields — *Validated in Phase 1: Settings & Secrets Unification (2026-05-01)*
- [ ] Empty-feed and NULL `user_id` row visibility on `agent_decisions` resolved with explicit RLS contract + tests
- [ ] No silent dev-mode auth bypass in production builds; fail-fast on missing Supabase env
- [ ] Real (not heuristic) agent health surfaced in `AgentFeed` and alerted on persistence drops
- [ ] CI pipeline runs typecheck + lint + vitest + Playwright + RLS policy tests on every PR
- [ ] Real agent modules (`news_agent`, `fred_agent`, `sentiment_agent`) reach `crew_runner` end-to-end (no stub bypass)

### Out of Scope

- New broker integrations beyond Alpaca / OANDA / simulation — focus is hardening, not breadth
- Mobile app or native shells — web-first remains the v1 surface
- Real-money MT5 connectivity — current MT5 fields are mock-only and will be removed or clearly labeled, not implemented
- Greenfield rewrites of the agent layer (Agent Layer v2) — deferred until foundation is solid (queued as Phase 6)
- Multi-tenant team / org features — single-operator focus until production loop is trusted

## Context

**Where we are:**
- Codebase has been mapped (`.planning/codebase/{ARCHITECTURE,STACK,STRUCTURE,INTEGRATIONS,CONCERNS,CONVENTIONS,TESTING}.md`, audited 2026-05-01).
- Agent layer Phase 1+2 shipped: schemas, runtime guards, fusion, persistence, embeddings, supervisor, and tests live under `trading_system/agents/`.
- Agent Feed UI shipped end-to-end: `src/types/agentDecision.ts`, `src/hooks/useAgentDecisions.ts`, `src/components/AgentFeed.tsx`, sidebar entry, Realtime publication on `agent_decisions`.
- Recent code review surfaced that **Settings spreads keys across three storage backends** (Supabase `user_settings`, Supabase `data_feed_configs`, browser `localStorage`) plus the Python subsystem's `.env`, with a "Save Settings" button that only covers one of them.

**Why now:**
- The original question driving this milestone is *"ระบบขาดอะไรบ้าง ถึงจะเสถียรและใช้งานได้จริง"* (what does the system lack to be stable and usable in production?). Audit + review answered with a concrete backlog; this milestone executes against it.
- `.planning/codebase/CONCERNS.md` already enumerates Tech Debt, Known Bugs, Security, Fragile Areas, and Test Coverage Gaps — those become the requirement seeds.

**Known issues to address (verbatim from CONCERNS audit):**
- Empty Agent Feed for authenticated sessions when `user_id IS NULL` (RLS mismatch).
- `devMode=true` in `localStorage` bypasses login with no env gate.
- `src/lib/supabase.ts` falls back to placeholder URL/key with only a console warning.
- `save_decision` swallows exceptions — silent persistence failures.
- `crew_runner.py` still imports stubs while real `*_agent.py` files exist.

## Constraints

- **Tech stack**: React 18 + Vite 5 + TypeScript + Tailwind for the SPA; Python 3 + pandas + CrewAI + LangGraph for the trading system; Supabase (Postgres + RLS + Auth + Realtime + Edge Functions) as the only backend. No new languages or platforms in v1.
- **Single operator**: Designed for one user running their own Supabase project and broker keys; multi-tenant features and team auth are out of scope.
- **Secrets posture**: `VITE_*` keys are public by definition; `SUPABASE_SERVICE_ROLE_KEY` and broker live tokens must never reach the browser bundle. No secrets in `localStorage`.
- **Local stack**: Windows + PowerShell development environment; commands and scripts must work without bash-only constructs (e.g. `&&` chaining is unreliable).
- **Browser dev quirks**: Vite dev mode has interacted badly with crypto-wallet extensions (SES lockdown). Production preview (`npm run preview`) is the recommended verification surface.
- **Existing migrations are append-only**: Schema changes ship as new SQL files in `supabase/migrations/`; no rewriting historical migrations.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Skip research phase in `/gsd-new-project` | Codebase audit (`.planning/codebase/*`) plus session review already cover stack, integrations, and concerns | — Pending |
| Scope = "Production Readiness v1" instead of feature work | Original user question + CONCERNS audit both point to stability/security gaps as the binding constraint | — Pending |
| Phase 1 = Settings & Secrets Unification | Pain point surfaced in this session and gates everything downstream (RLS, observability, CI) | — Pending |
| Defer Agent Layer v2 to Phase 6 | Building on a fragile foundation (placeholder Supabase, silent persistence, no CI) compounds risk | — Pending |
| Coarse granularity, sequential phases | Single operator, sequential dependencies (secrets → RLS → auth → observability → CI → agents v2) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-01 after initialization*
