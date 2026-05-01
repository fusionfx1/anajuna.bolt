# Phase 06 — Agent Layer Hardening: Context & Auto-Decisions

**Phase Goal:** Wire real `news_agent`, `fred_agent`, `sentiment_agent` modules into the orchestrator
behind a feature flag; add CI tests for both orchestration paths; document embedding index runbook;
fix pre-existing TypeScript/lint debt so CI is green.

---

## D-01 (AGT-01): Feature Flag Approach for Real Agents

**Decision:** Environment variable `USE_REAL_AGENTS` with three values:
- `auto` (default) — use real agent class when its required API key env var is present, otherwise fall back to stub class
- `true` — always try to import real agents (useful for integration tests against live APIs)
- `false` — always use stubs (CI/dev mode with no keys)

**Implementation pattern in `crew_runner.py`:**
- Try-except import pattern at module level
- `_NewsAgent`, `_FredAgent`, `_SentimentAgent` module-level aliases point to either real or stub class
- Key env vars: `NEWS_API_KEY`/`FINNHUB_API_KEY`/`ALPHA_VANTAGE_API_KEY` for news; `FRED_API_KEY` for fred; `OPENAI_API_KEY`/`SENTIMENT_API_KEY`/`TWITTER_BEARER_TOKEN` for sentiment
- `__init__.py` updated to reflect the same routing

**Rationale:** Allows zero-config operation in CI (no keys → stubs), and transparent upgrade to real
agents in production when API keys are provisioned — no code change required.

---

## D-02 (AGT-02): Test Coverage for Both Orchestration Paths

**Decision:** Pytest tests in `trading_system/tests/test_real_agents.py` (file already exists).

Tests added:
1. `TestAgentFallback` — verifies stub fallback when keys absent (feature flag = auto, no keys)
2. `TestOrchestrationPaths` — verifies:
   - `USE_LANGGRAPH=0` crew_runner parallel path can be imported and invoked with stubs
   - `USE_LANGGRAPH=1` supervisor path is importable and `run_supervisor` is callable
   - Supervisor returns a `FusedSignal` with correct structure (mocked graph)

**Approach:** `unittest.mock.patch.dict` for env vars; `monkeypatch` fixtures; no live API calls.

---

## D-03 (AGT-03): Embedding Index Runbook

**Decision:** Do NOT apply `agent_decisions_embedding_idx` yet.

**Threshold:** 10,000 rows with non-null embeddings (see OBSERVABILITY.md § Vector Index Runbook).

**Current state (2026-05-01):** Table is in development phase; row count << 10,000.

**Runbook location:** `OBSERVABILITY.md` § "Vector Index Runbook (OBS-03)"
The runbook already contains: threshold check SQL, migration SQL, EXPLAIN capture command,
and tuning table for `lists` parameter. No additions required.

---

## D-04: TypeScript / Lint Debt Cleanup

**Decision:** Fix pre-existing errors caught by Phase 5 CI gates.

Priority order:
1. **Remove unused `React` imports** — files using `"jsx": "react-jsx"` don't need bare `React` import;
   files that use `React.ComponentType<T>` or `React.ReactNode` get those as named type imports instead.
2. **`LucideIcon` type in `Layout.tsx` and `BacktestResults.tsx`** — change `NavItem.icon` / `MetricCard.icon`
   to use `LucideIcon` from lucide-react, which is the actual type of those icons.
3. **`lightweight-charts` Time type** — `number` is not assignable to `Time`; fix with `as UTCTimestamp` casts.
4. **Remaining structural errors** (`FetchOptions`, `DataProvider`, `FetchResult`, etc.) —
   fix where straightforward; add `// @ts-expect-error Phase-5-debt` with TODO comment otherwise.
5. **Python tests** — already 86/86 passing; no action needed.

**Goal:** `npm run typecheck` exits 0.
