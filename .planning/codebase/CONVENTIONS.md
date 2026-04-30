# Coding Conventions

**Analysis Date:** 2026-05-01

## Naming Patterns

**Files:**
- React components: PascalCase in `src/components/` (e.g. `Backtesting.tsx`, `AgentFeed.tsx`).
- Hooks: `use` prefix, camelCase (e.g. `src/hooks/useAgentDecisions.ts`).
- Services and lib: camelCase filenames (e.g. `src/services/normalize.ts`, `src/lib/supabase.ts`).
- Types: co-located or under `src/types/` (e.g. `src/types/agentDecision.ts`).
- Python package: snake_case modules under `trading_system/` (e.g. `trading_system/agents/orchestrator.py`).

**Functions:**
- TypeScript/React: `camelCase` for functions and hook bodies; event handlers follow `handleX` where used.
- Python: `snake_case` for functions and methods; private helpers may use a leading underscore inside modules (e.g. `trading_system/agents/supervisor.py` internal nodes).

**Variables:**
- `camelCase` in TS/TSX; `snake_case` in Python.
- React state: `useState` pairs like `loading`, `setLoading`, `error`, `setError` (see `src/hooks/useAgentDecisions.ts`).

**Types:**
- TypeScript: `PascalCase` for interfaces and types (e.g. `UseAgentDecisionsResult`, `AgentDecision` in `src/types/agentDecision.ts`).
- Use `import type { ... }` when importing only types (e.g. `useAgentDecisions.ts`).
- Python: dataclasses and Pydantic-style models in `trading_system/models.py`; `from __future__ import annotations` and uppercase `SignalType`-style enums are common in agent code.

## Code Style

**Formatting:**
- No project-level Prettier config detected; rely on ESLint + TypeScript and team consistency.
- Mixed semicolon usage: production TS often uses semicolons (`src/main.tsx`, `src/hooks/useAgentDecisions.ts`); some tests omit them (`tests/services/normalize.test.ts`). Prefer semicolons in new `src/` code to match `main.tsx` and strict tooling.

**Linting:**
- ESLint flat config: `eslint.config.js` — `@eslint/js` recommended, `typescript-eslint` recommended for `**/*.{ts,tsx}`, browser globals via `globals`, `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` (warn on `only-export-components` with `allowConstantExport: true`).
- Run: `npm run lint`.

**TypeScript:**
- App TS config: `tsconfig.app.json` — `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `jsx: react-jsx`.
- Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`).

**Python (trading_system):**
- No `ruff.toml`, `pyproject.toml`, or `.flake8` detected; style is conventional PEP 8 with type hints and section comments in tests.
- Dependencies and minimum versions: `trading_system/requirements.txt` (includes `loguru`, `pytest`, `crewai`, etc.).

## Import Organization

**Order:**
1. External packages (`react`, `vitest`, `pandas`, `pytest`, etc.).
2. Parent/sibling package imports for Python (`from ..agents.orchestrator import ...`).
3. Relative imports for frontend (`../lib/supabase`, `../../src/services/...` in tests).

**Path aliases:**
- No `@/` alias in `src/`; use relative paths from each file.

**Grouping:**
- Separate standard library / third-party / local with blank lines in Python tests (`trading_system/tests/test_agent_framework.py`).

## Error Handling

**TypeScript / React:**
- Async boundaries: `try/catch` in effects and async functions; surface user-facing messages via state (e.g. `setError` in `src/hooks/useAgentDecisions.ts`).
- Supabase: check `error` from client responses and `throw` to enter `catch`, then normalize to `Error` message string for UI.
- Use cancellation flags in `useEffect` cleanups to avoid state updates after unmount on the same hook pattern.

**Python (agents):**
- Operational fallbacks: `trading_system/agents/orchestrator.py` wraps LangGraph path in `try/except`, logs with `loguru` `logger.warning`, and falls back to the legacy parallel path.
- Prefer explicit logging at decision points (`logger.debug`, `logger.warning`) for orchestration and integration code.

## Logging

**Framework:**
- Python: `loguru` (`from loguru import logger` in `trading_system/agents/orchestrator.py` and related modules).

**Patterns:**
- Structured messages with bracketed contexts (e.g. `[orchestrator] routing...`).
- Frontend: avoid `console` in production bundles where possible — `vite.config.ts` uses Terser `drop_console: true` for production builds.

## Comments

**When to comment:**
- Module docstrings in Python for behavior and routing (`orchestrator.py`, `test_supervisor.py`).
- Inline comments for non-obvious product/security choices (e.g. RLS and `user_id` in `useAgentDecisions.ts`).
- Section dividers in tests (`# ── fusion: existing tests ──` style in `trading_system/tests/`).

**JSDoc/TSDoc:**
- Exported interfaces document shape (`UseAgentDecisionsOptions` in `useAgentDecisions.ts`); no requirement for exhaustive JSDoc on every function.

## Function Design

**Size:**
- Orchestrators coordinate; keep heavy logic in dedicated modules (`fusion`, `crew_runner`, `supervisor`).

**Parameters:**
- React hooks accept optional options objects (`UseAgentDecisionsOptions`).
- Python tests use small factories (`_minimal_config()`, `_df()`, `_config()`) to reduce duplication.

**Return values:**
- Hooks return explicit result objects (`UseAgentDecisionsResult`).
- Python agent entrypoints return typed models (`FusedSignal`, etc.).

## Module Design

**Exports:**
- Named exports for hooks and utilities; default export for root `App` (`src/main.tsx` imports `App from './App.tsx'`).

**Barrel files:**
- No aggressive re-export barrels required; import from concrete paths.

**React patterns:**
- Functional components with hooks; context consumers (`useAuth`, `useDataProvider`) injected in components and mocked in tests.

---

*Convention analysis: 2026-05-01*
*Update when patterns change*
