---
phase: "05"
plan: "01"
name: "CI Setup — Workflow, E2E Smoke, RLS Contract, Gitignore"
completed: "2026-05-01"
duration: "~15 min"
commit: "b561853"
tasks_completed: 4
tasks_total: 4
files_created: 3
files_modified: 2
requirements: [CI-01, CI-02, CI-03, CI-04, CI-05]
key-files:
  created:
    - .github/workflows/ci.yml
    - e2e/agent-feed.spec.ts
    - src/hooks/__tests__/rls-policy-contract.test.ts
  modified:
    - playwright.config.ts
    - .gitignore
decisions:
  - "D-01: GitHub Actions ubuntu-latest, Node 20 — standard for public repos"
  - "D-02: Playwright already installed, updated playwright.config.ts to port 4173 + webServer for CI"
  - "D-03: RLS policy test as static file assertion (v1) — live Supabase deferred to Phase 6"
  - "D-04: playwright-report/, test-results/, .playwright/ added to .gitignore"
  - "D-05: Build size reported via du/find piped to GITHUB_STEP_SUMMARY"
tech-stack:
  added: []
  patterns:
    - "GitHub Actions matrix: typecheck→lint→unit→build→e2e (e2e depends on build artifact)"
    - "Playwright webServer pattern: preview server serves dist/ for E2E in CI"
    - "Static SQL migration assertion pattern for RLS contract testing without live DB"
---

# Phase 05 Plan 01: CI Setup Summary

**One-liner:** GitHub Actions CI pipeline with 5 jobs, Playwright E2E smoke tests, and static RLS contract assertions covering all CI-01 through CI-05 requirements.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | `.github/workflows/ci.yml` — 5-job CI pipeline | ✅ Done | b561853 |
| 2 | `e2e/agent-feed.spec.ts` + `playwright.config.ts` update | ✅ Done | b561853 |
| 3 | `src/hooks/__tests__/rls-policy-contract.test.ts` | ✅ Done | b561853 |
| 4 | `.gitignore` CI artifact exclusions | ✅ Done | b561853 |

## What Was Built

### CI Workflow (`.github/workflows/ci.yml`)

5 jobs running on every push/PR to `main`:

| Job | Command | Blocks merge |
|-----|---------|-------------|
| `typecheck` | `npm run typecheck` | ✅ |
| `lint` | `npm run lint` | ✅ |
| `test` | `npm test -- --reporter=verbose` | ✅ |
| `build` | `npm run build` + bundle size to step summary | ✅ |
| `e2e` | `npx playwright test e2e/agent-feed.spec.ts` (downloads dist artifact) | ✅ |

### Playwright E2E Smoke Tests (`e2e/agent-feed.spec.ts`)

3 CI-safe structural tests using `page.goto('/')` against the preview server:
1. Page loads without crashing (no fatal JS errors)
2. Body renders visible content (not blank)
3. Login form visible when real Supabase URL provided (auto-skipped in CI with placeholder)

`playwright.config.ts` updated:
- `baseURL` changed from `http://localhost:5173` → `http://localhost:4173`
- `webServer` block added: `npm run preview` on port 4173, reuses existing in dev
- `forbidOnly: !!process.env.CI`, `retries: CI ? 2 : 1`

### RLS Policy Contract Test (`src/hooks/__tests__/rls-policy-contract.test.ts`)

6 static assertions against `supabase/migrations/20260501_agent_decisions_rls_contract.sql`:
- File exists
- USING clause: `auth.uid() = user_id OR user_id IS NULL`
- Policy name: `Authenticated users see own and shared agent decisions`
- DROP of old narrow policy
- `TO authenticated` role targeting
- `FOR SELECT` policy type

**Result: 6/6 tests PASS** ✅

### .gitignore Extensions

Added:
```
playwright-report/
test-results/
.playwright/
```

`graphify-out/cache/` was already present.

## Pre-existing Issues Observed (Out of Scope)

These existed before Phase 5 and are NOT caused by Phase 5 changes:

### TypeScript errors (typecheck gate will fail in CI until resolved)
~100+ pre-existing TS errors in:
- `src/components/backtest/BacktestEquityCurve.tsx` — `number` not assignable to `Time`
- `src/components/backtest/BacktestResults.tsx` — `LucideIcon` type mismatch
- `src/components/Backtesting.tsx` — implicit `any[]`, unknown property `provider`
- Multiple files — `React` imported but not used (TS6133)
- Many more in other backtest/AI components

**Impact:** The `typecheck` GitHub Actions job will fail until these are fixed.
**Resolution path:** These are tech debt from earlier phases. A separate "TypeScript strict cleanup" phase is recommended before CI gates are enforced.

### Pre-existing unit test failures (5 tests in `Backtesting.handleRun.test.ts`)
- Timestamp mismatch (expected `1713192330`, got `1704067200`)
- Mock call count assertions failing
- Provider fallback assertions failing

**Impact:** `npm test` exit code 1 in CI until these are fixed.
**Resolution path:** `Backtesting.handleRun.test.ts` tests are testing integration with provider mocks that changed in an earlier phase.

## Known Stubs

None — all Phase 5 deliverables are fully implemented.

## Deviations from Plan

### Auto-observed: Pre-existing TypeScript errors surface typecheck failures
- **Found during:** Task 1 (typecheck verification)
- **Issue:** ~100+ TS errors pre-dating Phase 5 in backtest/AI components
- **Action:** Documented, not fixed (out of scope per task instructions)
- **Rule:** Out-of-scope issue → logged, not fixed

### Auto-observed: Pre-existing unit test failures
- **Found during:** Wave 1 verification
- **Issue:** 5 tests in `Backtesting.handleRun.test.ts` failing before Phase 5
- **Action:** Documented, not fixed
- **Rule:** Out-of-scope issue → logged, not fixed

### Playwright config webServer update needed (not mentioned in plan)
- **Found during:** Task 2
- **Issue:** playwright.config.ts had no webServer block; CI E2E needs `npm run preview` to serve dist/
- **Action:** Added webServer block and changed baseURL to port 4173 (preview server)
- **Rule:** Rule 3 (blocking issue auto-fix) — E2E tests cannot run in CI without this

## Self-Check

- [x] `.github/workflows/ci.yml` present: `[ -f ".github/workflows/ci.yml" ]` → FOUND
- [x] `e2e/agent-feed.spec.ts` present: FOUND
- [x] `src/hooks/__tests__/rls-policy-contract.test.ts` present: FOUND
- [x] Commit b561853 present in git log: FOUND
- [x] RLS contract tests pass: 6/6 ✅
- [x] `.gitignore` contains `playwright-report/`: ✅

## Self-Check: PASSED
