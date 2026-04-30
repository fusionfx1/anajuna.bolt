# Codebase Structure

**Analysis Date:** 2026-05-01

## Directory Layout

```
anajuna.bolt-main/
├── src/                    # Vite + React SPA (dashboard, charts, hooks, services)
├── trading_system/         # Python: signals, agents, backtest, generator, Supabase persistence
├── supabase/
│   └── migrations/         # Postgres schema, RLS, RPC (incl. agent_decisions, trading tables)
├── scripts/                # Repo tooling (e.g. graphify_ast_update.py)
├── infra/                  # Ancillary server/docs (e.g. multilogin-server)
├── graphify-out/           # Generated graph/report artifacts (see GRAPH_REPORT.md)
├── package.json            # Node scripts: dev, build, test, graphify:ast
├── vite.config.ts          # React plugin, manualChunks for vendor/data/backtest splits
└── requirements-graphify.txt
```

## Directory Purposes

**src/:**
- Purpose: Entire client application — UI, hooks, workers, Supabase-facing services.
- Contains: `*.tsx` components, `*.ts` hooks/services/types, Tailwind entry `index.css` (via `main.tsx`).
- Key files: `src/main.tsx`, `src/App.tsx`, `src/lib/supabase.ts`, `src/services/tradingService.ts`, `src/components/AgentFeed.tsx`, `src/hooks/useAgentDecisions.ts`, `src/workers/backtestWorker.ts`.
- Subdirectories: `components/` (feature folders + `ui/`, `auth/`, `backtest/`, `chart/`), `hooks/`, `services/` (including `dataFetchers/`), `context/`, `pages/` (e.g. settings sub-pages), `types/`, `lib/`.

**trading_system/:**
- Purpose: Offline and runtime trading logic — parsing prompts, running backtests, producing signals, multi-agent fusion, Supabase writes.
- Contains: Python modules, pytest tests under `trading_system/tests/`.
- Key files: `generator.py`, `models.py`, `signal_providers.py`, `signal_engine.py`, `supabase_client.py`, `agents/orchestrator.py`, `agents/supervisor.py`, `agents/crew_runner.py`, `agents/fusion.py`, `agents/persistence.py`, `agents/runtime.py`, `agents/schemas.py`, domain agents (`fred_agent.py`, `news_agent.py`, `sentiment_agent.py`, `tech_agent.py`, stubs).
- Subdirectories: `agents/` (orchestration + persistence + embeddings).

**supabase/migrations/:**
- Purpose: Versioned DDL for production schema aligned with `trading_system/supabase_client.py` and React types.
- Contains: `*.sql` migrations — forex/paper/backtest/AI/agent_decisions (`20260430120000_create_agent_decisions.sql`).
- Key files: Initial forex schema, paper trading, backtest tables, AI engine tables, `agent_decisions` + `managed_orders.decision_id` FK + Realtime publication.

**scripts/:**
- Purpose: Maintenance automation (AST graph updates).
- Contains: `graphify_ast_update.py`.

**.planning/codebase/:**
- Purpose: GSD-oriented codebase reference docs (this file, ARCHITECTURE.md, etc.).
- Contains: Markdown references for planners/executors.

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React DOM root mount.
- `src/App.tsx`: Providers, auth gate, `NavPage` switch rendering feature screens.
- `trading_system/generator.py`: Python top-level `generate_trading_system` orchestration.

**Configuration:**
- `vite.config.ts`: Vite/React build and chunk splitting.
- `package.json`: Scripts and frontend dependency versions.
- `trading_system/requirements.txt`: Python dependencies for trading subsystem.
- `.env.local` / environment: **Present at developer discretion** — holds `VITE_SUPABASE_*` and broker keys; never commit secrets.

**Core Logic:**
- `src/services/tradingService.ts`: Supabase CRUD for strategies, positions, trades, metrics.
- `src/services/backtestEngine.ts`, `src/services/backtestService.ts`: Client-side backtest orchestration.
- `trading_system/signal_providers.py`: Rule vs agent signal selection and persistence side-effects.
- `trading_system/agents/orchestrator.py` & `supervisor.py`: Agent team execution paths.

**Testing:**
- `trading_system/tests/*.py`: pytest suites (`test_agent_framework.py`, `test_supervisor.py`, …).
- Root: Vitest via `npm test` (`vitest` in `package.json`).

**Documentation:**
- `trading_system/README.md`: Python subsystem orientation.
- `graphify-out/GRAPH_REPORT.md`: High-level graph/community summary.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g. `AgentFeed.tsx`, `Dashboard.tsx`).
- Hooks: `useThing.ts` in `src/hooks/` (e.g. `useAgentDecisions.ts`).
- Services/utilities: `camelCase.ts` in `src/services/` or `src/lib/`.
- Python modules: `snake_case.py` throughout `trading_system/`.
- Tests: `test_*.py` under `trading_system/tests/`.

**Directories:**
- `src/components/<feature>/` for grouped UI (e.g. `backtest/`, `chart/`).
- `trading_system/agents/` for all agent/orchestration modules.

**Special Patterns:**
- Types centralized under `src/types/` (`agentDecision.ts`, `trading.ts`).
- Supabase migrations: timestamp-prefixed SQL files in `supabase/migrations/`.

## Where to Add New Code

**New Feature (UI):**
- Primary code: `src/components/<FeatureName>.tsx` or `src/components/<feature>/`.
- Hooks: `src/hooks/use<Feature>.ts` if shared state/data.
- Types: `src/types/<domain>.ts`.
- Tests: Co-located `*.test.tsx` or Vitest convention already in project — follow existing adjacent tests if present.

**New Feature (Python trading / agents):**
- Primary code: `trading_system/` module or `trading_system/agents/<agent>.py`.
- Wire into orchestration: extend `crew_runner.py` tools or supervisor graph in `supervisor.py`; update `fusion.py` / `schemas.py` if contribution shape changes.
- Tests: `trading_system/tests/test_<area>.py`.

**New Database Table / Policy:**
- Migration: add `supabase/migrations/<timestamp>_description.sql`.
- Python: extend `trading_system/supabase_client.py` or `persistence.py` as needed.
- Frontend: add typed accessors in `src/services/tradingService.ts` or a dedicated service module.

**New External Integration (browser):**
- Prefer `src/services/` with a thin wrapper; use `axios` or `fetch` consistently with existing fetchers (`src/services/dataFetchers/`).

**Utilities:**
- Shared frontend helpers: `src/lib/constants.ts` or small modules under `src/services/`.
- Shared Python helpers: new module under `trading_system/` root if not agent-specific.

## Special Directories

**graphify-out/:**
- Purpose: Knowledge-graph outputs from graphify tooling.
- Generated: Yes (by `npm run graphify:ast` / full pipeline).
- Committed: Partial — report may be tracked; heavy artifacts often local-only per project rules.

**trading_system/__pycache__/:**
- Purpose: Bytecode cache.
- Generated: Yes.
- Committed: No (typically gitignored).

---

*Structure analysis: 2026-05-01*
