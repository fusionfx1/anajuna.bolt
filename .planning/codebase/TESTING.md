# Testing Patterns

**Analysis Date:** 2026-05-01

## Test Framework

**Runner (frontend):**
- Vitest `^3.2.4` with Vite-powered config in `vitest.config.ts` (plugins: `@vitejs/plugin-react`, `define` for `process.env.NODE_ENV`).
- Test environment: `jsdom`; `globals: true`; setup: `tests/setup.ts`; excludes `e2e/**/*` and `node_modules/**/*`.

**Runner (Python):**
- `pytest` (pinned in `trading_system/requirements.txt` as `pytest>=7.4.0`).
- Tests live under `trading_system/tests/` (flat module files: `test_*.py`).

**Assertion library (frontend):**
- Vitest built-in `expect`; React Testing Library assertions on DOM (`@testing-library/react`).

**Assertion library (Python):**
- Plain `assert`; `pytest` fixtures and `monkeypatch`; `unittest.mock` (`patch`, `MagicMock`).

**Run commands:**
```bash
npm test                              # Vitest: all unit/component tests (vitest run)
npm run test                          # same as above per package.json
npm run lint                          # ESLint (not tests, but pre-merge check)
npm run typecheck                     # tsc --noEmit -p tsconfig.app.json
```

```bash
cd trading_system
pytest                                 # all Python tests
pytest tests/test_agent_framework.py   # single file
pytest -k "fuse"                       # keyword expression
pytest -v                              # verbose
```

**E2E (Playwright):**
- Config: `playwright.config.ts` — `testDir: ./e2e`, `baseURL: http://localhost:5173`, Chromium project, HTML reporter under `playwright-report/`.
- No `playwright` npm script in `package.json`; invoke via `npx`:
```bash
npx playwright test                    # run all e2e specs
npx playwright test e2e/anjuna-dashboard.spec.ts
npx playwright show-report             # after HTML report generation
```
- Start the Vite app before E2E: `npm run dev` (port `5173` must match `playwright.config.ts`).

## Test File Organization

**Frontend unit/component tests:**
- Location: top-level `tests/` tree (not co-located under `src/`).
- Examples: `tests/services/normalize.test.ts`, `tests/services/cache.test.ts`, `tests/components/Backtesting.handleRun.test.ts`.
- Imports pull implementation from `../../src/...`.

**Python tests:**
- Location: `trading_system/tests/` with `test_<area>.py` (`test_agent_framework.py`, `test_supervisor.py`, `test_agent_runtime.py`, etc.).
- Package-relative imports: `from ..agents.supervisor import ...`, `from ..models import ...`.

**E2E:**
- Location: `e2e/*.spec.ts` plus helpers `e2e/setup-test-user.ts`.
- Specs document flows (dashboard, login, data providers); some depend on Supabase env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` noted in comments inside `e2e/anjuna-dashboard.spec.ts`).

**Setup:**
- `tests/setup.ts` registers `fake-indexeddb/auto` for IndexedDB in Vitest.

## Test Structure

**Vitest / RTL pattern:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

describe('suite', () => {
  beforeEach(() => { /* ... */ })
  afterEach(() => { cleanup() })

  it('should ...', async () => {
    // arrange / act / assert
  })
})
```
- Real reference: `tests/components/Backtesting.handleRun.test.ts` uses `vi.hoisted` for mock registry, top-level `vi.mock(...)`, and `beforeEach` to reset mock implementations.

**Pytest pattern:**
- Mix of plain functions (`def test_fuse_buy_majority():`) and fixtures (`monkeypatch`, module-level helpers `_minimal_config()`, `_df()`).
- Unicode/ASCII section headers organize groups (`test_supervisor.py`, `test_agent_framework.py`).
- Isolation: `patch(...)` and `monkeypatch.setattr` for replacing orchestration and I/O.

**Patterns:**
- Prefer descriptive test names mirroring behavior (`test_node_guard_budget_exceeded_forces_hold`).
- Use small DataFrames and configs for agent tests to keep runs fast.

## Mocking

**Vitest:**
- `vi.mock` for modules (`tests/components/Backtesting.handleRun.test.ts` mocks `cache`, data fetchers, hooks, contexts).
- `vi.hoisted(() => ({ ... }))` when mocks must exist before `vi.mock` factory runs.
- `vi.fn()` for spies inside hoisted objects.

**Pytest / unittest.mock:**
- `@patch("trading_system.signal_providers.get_latest_signal")` for patching import paths.
- `MagicMock()` for orchestrator doubles; `monkeypatch.setattr(orchestrator_mod, "run_agent_tools_parallel", lambda ...)` for behavioral stubs.

**What to mock:**
- Network/API clients, cache, Supabase-backed hooks, and auth/data context in UI tests.
- Agent parallelism and external signal providers in Python unit tests.

**What not to mock:**
- Pure normalization and validation logic in `tests/services/normalize.test.ts` exercises real `src/services/normalize.ts` implementations.

## Fixtures and Factories

**Python:**
- Local helpers in each test module: `_minimal_config()`, `_config()`, `_df()` (`trading_system/tests/test_supervisor.py`, `test_agent_framework.py`).
- Stateful tests may save/restore module globals (e.g. `_AGENT_BUDGET_MS` in `test_supervisor.py`) with `try`/`finally`.

**TypeScript:**
- Inline literal objects for candle/OHLCV data in `normalize.test.ts`; typed with `RawOHLCV`, `NormalizedCandle` from `src/services/dataFetchers/types`.

## Coverage

**Frontend:**
- No `npm run test:coverage` script in `package.json`; Vitest supports coverage via `@vitest/coverage-v8` if added later. Currently not configured in-repo.

**Python:**
- No `pytest-cov` entry in `trading_system/requirements.txt`; coverage is optional add-on.

## Test Types

**Unit / component:**
- Vitest + jsdom for services and React components (`tests/services/**`, `tests/components/**`).
- Pytest for fusion, orchestrator, supervisor nodes, runtime, signal providers (`trading_system/tests/`).

**Integration:**
- `test_real_agents.py` implies heavier paths; run only when environment and API keys support it (inspect file before assuming CI-safe).

**E2E:**
- Playwright against local dev server; retries and timeouts set in `playwright.config.ts`.

## CI / Automation

**GitHub Actions:**
- No `.github/workflows/` directory present in the repository; CI for `npm test`, `pytest`, or Playwright is not defined in-tree. Add workflows if continuous verification is required.

## Common Patterns

**Async UI testing:**
```typescript
await waitFor(() => {
  expect(screen.getByText(/expected/i)).toBeInTheDocument()
})
```

**Async Python:**
- Use normal `assert` after `await` in async tests if introduced; current tests are primarily synchronous with mocked async boundaries.

**Error expectations:**
- Vitest: `expect(() => fn()).toThrow()` or `await expect(promise).rejects...` when needed.
- Pytest: `with pytest.raises(...)` where exception contracts are tested (add when introducing failure-path tests consistently).

---

*Testing analysis: 2026-05-01*
*Update when test patterns change*
