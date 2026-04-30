# Architecture

**Analysis Date:** 2026-05-01

## Pattern Overview

**Overall:** Full-stack **single-page React client** plus a **Python trading/analysis subsystem**, integrated primarily through **Supabase** (PostgreSQL, Auth, Row Level Security, Realtime). There is **no first-party Node HTTP API** in the Vite app; the browser talks **directly** to Supabase and external market/broker APIs where configured.

**Key Characteristics:**
- **Decoupled runtimes:** The UI (`src/`) and `trading_system/` execute in different processes; they converge on shared tables and env-aligned URLs/keys.
- **BaaS data plane:** CRUD and subscriptions use `@supabase/supabase-js` from `src/lib/supabase.ts`; Python uses `supabase-py` in `trading_system/supabase_client.py` and `trading_system/agents/persistence.py`.
- **Agent decisions as events:** Fused multi-agent outputs persist to `agent_decisions`; the UI listens via Realtime in `src/hooks/useAgentDecisions.ts` (see migration `supabase/migrations/20260430120000_create_agent_decisions.sql`).
- **Optional LangGraph path:** `USE_LANGGRAPH=1` routes orchestration through `trading_system/agents/supervisor.py`; otherwise `trading_system/agents/orchestrator.py` uses parallel CrewAI tools plus `TechnicalSignalAgent`, then fusion.

## Layers

**Presentation (React SPA):**
- Purpose: Auth-gated dashboard, charts, backtesting UI, agent feed, settings.
- Location: `src/components/`, `src/pages/`, `src/hooks/`
- Contains: Presentational components, feature hooks, worker-backed backtest UI (`src/workers/backtestWorker.ts`).
- Depends on: `src/lib/supabase.ts`, `src/services/*`, React contexts (`src/context/AuthContext.tsx`, `src/context/DataProviderContext.tsx`).
- Used by: `src/App.tsx` (shell + in-memory page switch).

**Client services & types:**
- Purpose: Normalize fetch/query logic for Supabase and domain helpers (indicators, OHLCV, brokers).
- Location: `src/services/` (`tradingService.ts`, `dataFetchers/*`, `backtestEngine.ts`, …), `src/types/`
- Depends on: Supabase client, axios/external fetchers as implemented per provider.
- Used by: Hooks (`src/hooks/useSupabaseData.ts`, `useMarketData.ts`, …) and components.

**Identity & session:**
- Purpose: Supabase Auth session lifecycle for the SPA.
- Location: `src/context/AuthContext.tsx`
- Depends on: `supabase.auth` from `src/lib/supabase.ts`.
- Used by: Any hook/component requiring `user.id` for RLS-scoped queries (e.g. `useStrategies` in `src/hooks/useSupabaseData.ts`).

**Trading system (Python):**
- Purpose: Prompt-driven strategy generation, backtests, live/paper signal production, broker adapters.
- Location: `trading_system/` — entry orchestration `trading_system/generator.py`, models `trading_system/models.py`, signals `trading_system/signal_providers.py`, engine `trading_system/signal_engine.py`.
- Contains: **Signal providers** (`RuleBasedSignalProvider`, `AgentSignalProvider`), **orchestration** (`trading_system/agents/orchestrator.py`, optional `supervisor.py`), **CrewAI tooling** (`crew_runner.py`, domain agents under `trading_system/agents/*.py`), **fusion** (`fusion.py`), **schemas** (`schemas.py`), **runtime guards** (`runtime.py`).
- Depends on: pandas, optional CrewAI/LangGraph per env, Supabase when persistence enabled, broker env (e.g. OANDA in `generator.py`).
- Used by: CLI/scripts invoking `generate_trading_system` and downstream loops (not bundled into Vite).

**Persistence & schema (Supabase / Postgres):**
- Purpose: Authoritative storage for strategies, trades, paper trading, AI provider metadata, agent audit ledger, etc.
- Location: `supabase/migrations/*.sql` define tables, RLS, RPC such as `match_agent_decisions`.
- Depends on: Supabase platform (Auth, Realtime publication on `agent_decisions`).
- Used by: React (`tradingService.ts`, `useAgentDecisions.ts`) and Python (`supabase_client.py`, `persistence.py`).

## Data Flow

**Dashboard data (authenticated user):**

1. User signs in via `AuthContext` (`signIn` → Supabase Auth).
2. Hooks such as `useStrategies` call `fetchStrategies` in `src/services/tradingService.ts` with `user.id`.
3. Queries hit Supabase `.from('strategies')` (and related tables per migration schema).
4. UI renders lists/detail; mutations (`updateStrategyStatus`, `createStrategy`) write back through the same service layer.

**Agent decision feed (Python → DB → React):**

1. `AgentSignalProvider.get_latest_signal()` in `trading_system/signal_providers.py` invokes `KronosOrchestrator.run()` → fused `FusedSignal` with `decision_id`.
2. A **daemon thread** calls `_fire_and_forget_persist` → `save_decision()` in `trading_system/agents/persistence.py` inserts into `agent_decisions` (prefers service role key when set; else anon-compatible path per env).
3. Optional `embed_and_store` in `trading_system/agents/embedding.py` augments rows for vector RPC (`match_agent_decisions` in migration).
4. `useAgentDecisions` loads recent rows and subscribes to `postgres_changes` INSERT on `agent_decisions`; `src/components/AgentFeed.tsx` renders the stream.

**Strategy generation / backtest (Python-centric):**

1. `generate_trading_system` in `trading_system/generator.py` parses prompt (`prompt_parser.py`), builds `TradingSystem`, runs `run_backtest`, optionally persists via `SupabaseClient` when `user_id` is supplied (`_persist_results`).

**Orchestration branch selection:**

- Default: `KronosOrchestrator` parallel tool path + `TechnicalSignalAgent` + `fuse_agent_signals` (`orchestrator.py`).
- LangGraph: `run_supervisor()` pipeline gather → memory → fuse → guard → decide (`supervisor.py`), with non-serializable `df`/`StrategyConfig` held in thread-local `_CallContext`.

**State Management:**
- **React:** Local `useState` for navigation (`App.tsx`), context for auth and data-provider selections; feature hooks hold fetched entities.
- **Server:** Postgres via Supabase; agent ledger append-only; Realtime pushes new inserts to subscribers.

## Key Abstractions

**SignalProvider:**
- Purpose: Map OHLCV `DataFrame` + `StrategyConfig` → actionable `Signal`.
- Examples: `RuleBasedSignalProvider`, `AgentSignalProvider` in `trading_system/signal_providers.py`.
- Pattern: Strategy-style polymorphism; env-selected factory `signal_provider_from_env`.

**KronosOrchestrator / Supervisor:**
- Purpose: Run multi-source agent contributions and produce one `FusedSignal`.
- Examples: `trading_system/agents/orchestrator.py`, `trading_system/agents/supervisor.py`.
- Pattern: Facade over parallel/async agent evaluation with deadlines (`evaluate_with_deadline` in `runtime.py`).

**AgentSignalContribution / FusedSignal:**
- Purpose: Structured per-agent outputs and merged decision with audit metadata.
- Examples: `trading_system/agents/schemas.py`; serialized into `agent_decisions.contributions` JSONB.

**SupabaseClient (Python):**
- Purpose: Retry-wrapped persistence mapping Python models to dashboard tables.
- Examples: `trading_system/supabase_client.py` (strategies, trades, equity, risk events).

**save_decision:**
- Purpose: Append-only insert of fused decisions; never raises (logged swallow).
- Examples: `trading_system/agents/persistence.py`.

## Entry Points

**Browser SPA:**
- Location: `src/main.tsx` → `src/App.tsx`
- Triggers: User loads Vite-built bundle (`npm run dev` / production static host).
- Responsibilities: Mount React tree, wrap `AuthProvider` + `DataProviderProvider`, route-like switching via `NavPage` state.

**Python trading orchestrator:**
- Location: `trading_system/generator.py` (`generate_trading_system` and helpers)
- Triggers: External invocation (script/CLI/automation), not Vite.
- Responsibilities: End-to-end generation, backtest, optional Supabase persistence.

**Agent layer invocation:**
- Location: `AgentSignalProvider` → `KronosOrchestrator.run()` (`signal_providers.py`, `orchestrator.py`)
- Triggers: Signal computation inside Python runtime when agent provider is selected.

## Error Handling

**Strategy:** Fail-fast on Supabase query errors in TypeScript services (`throw error` after `.from()` calls in `tradingService.ts`). Auth timeouts wrapped in `AuthContext.signIn`. Python agent persistence deliberately non-fatal (`save_decision` catches all exceptions).

**Patterns:**
- React hooks set local `error` string state for UI messaging (`useAgentDecisions.ts`, `useSupabaseData.ts`).
- Orchestrator falls back from LangGraph supervisor to legacy parallel path on supervisor failure (`orchestrator.py`).

## Cross-Cutting Concerns

**Logging:**
- Python: `loguru` throughout `trading_system/` (e.g. `generator.py`, `signal_providers.py`).
- Frontend: `console` warnings for missing Supabase env in `src/lib/supabase.ts`.

**Validation:**
- Strategy/config validation lives in Python models and parsers; UI forms validate per component patterns.

**Authentication:**
- Supabase Auth JWT session for browser; RLS policies on tables (see migrations). Service-role inserts for agent rows without `user_id` (`persistence.py` / migration policies).

---

*Architecture analysis: 2026-05-01*
