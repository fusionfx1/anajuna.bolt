# Roadmap: Anjuna FX — Production Readiness v1

## Overview

Production Readiness v1 turns the existing Anjuna FX prototype into a system a single operator can run against real Supabase + real broker keys without footguns. The journey unifies secrets and the Settings flow first (so credentials live in one trustworthy place), then closes the empty-feed RLS bug, then locks down auth + env failsafe, then promotes observability + health from heuristics to real signals, then gates everything behind CI, and only then unblocks Agent Layer hardening so future feature work builds on a solid foundation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Settings & Secrets Unification** — Single trustworthy place for every credential, predictable Save flow, no localStorage secrets (completed 2026-05-01)
- [x] **Phase 2: RLS Hardening + Empty-Feed Fix** — Explicit `agent_decisions` policy contract + tests so the feed never silently drops rows (completed 2026-05-01)
- [x] **Phase 3: Auth Bypass + Env Failsafe** — Production-safe auth with no `localStorage` shortcut and fail-fast on missing Supabase env (completed 2026-05-01)
- [x] **Phase 4: Observability & Health** — Real agent health signals, non-silent persistence, documented vector index thresholds (completed 2026-05-01)
- [x] **Phase 5: CI/CD + Test Matrix** — Typecheck, lint, unit, E2E, and RLS policy tests gating every PR (completed 2026-05-01)
- [ ] **Phase 6: Agent Layer Hardening** — Real agents reach the orchestrator, both orchestration paths covered by tests, vector index applied

## Phase Details

### Phase 1: Settings & Secrets Unification
**Goal**: Every credential the operator can configure has one trustworthy storage backend, one obvious Save flow, and zero plaintext secrets in `localStorage` — so configuring the dashboard once is enough to trust where keys live.
**Depends on**: Nothing (first phase)
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04, SETT-05, SETT-06
**Success Criteria** (what must be TRUE):
  1. Operator can configure broker, data feed, and backtest provider keys from the Settings page and see one consistent confirmation per save
  2. No `VITE_*`-style or backtest API keys are written to `localStorage` after the migration
  3. The MT5 password input no longer pretends to work — it is removed or visibly marked "demo only / not implemented"
  4. Settings, DataFeedConfig, and DataProvidersSettings render in one consistent dark theme with masked credential inputs
  5. Settings UI clearly separates "browser keys" from "Python `trading_system/.env` keys" so operators are not silently misled
**Plans**: 4 plans across 3 waves

Plans:
- [x] 01-01-PLAN.md — SecretInput component extraction + data_provider_api_keys SQL migration (Wave 1)
- [x] 01-02-PLAN.md — Settings.tsx MT5 removal + group headers + per-section saves + DataProviders dark-theme rewrite (Wave 1, parallel)
- [x] 01-03-PLAN.md — DataProviderContext localStorage→Supabase migration + data-provider-proxy Edge Function (Wave 2)
- [x] 01-04-PLAN.md — fetchOHLCV Edge Function routing + build verification + supabase db push + smoke test (Wave 3)

### Phase 2: RLS Hardening + Empty-Feed Fix
**Goal**: The Agent Feed shows exactly the rows the chosen RLS contract intends — no accidental empty feed, no accidental data leak — and the contract is enforced by automated tests so regressions don't ship silently.
**Depends on**: Phase 1
**Requirements**: RLS-01, RLS-02, RLS-03, RLS-04, RLS-05
**Success Criteria** (what must be TRUE):
  1. A logged-in user with no own `agent_decisions` rows sees the documented set of rows (own + the chosen NULL-`user_id` policy outcome) — never an unintentionally empty feed
  2. Realtime inserts only stream rows that the SELECT policy would also return on a fresh fetch
  3. Automated test fails when `agent_decisions` SELECT policy diverges from the documented contract
  4. `seed-agent-decisions.mjs` requires service role and refuses to run with anon key, with a clear error message
**Plans**: 2 plans across 2 waves

Plans:
- [x] 02-01-PLAN.md — RLS SELECT policy formalization + hook cleanup + seed guard (Wave 1)
- [x] 02-02-PLAN.md — Vitest RLS contract test for empty-feed behavior (Wave 2)

### Phase 3: Auth Bypass + Env Failsafe
**Goal**: Production builds cannot accidentally bypass login or silently talk to a placeholder Supabase host; secrets configuration is explicitly documented per context.
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Setting `localStorage.devMode=true` in a production build (`npm run build` + `npm run preview`) does not bypass `LoginScreen`
  2. Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` in a production build surfaces a hard error before any data fetch — no placeholder fallback
  3. `SECURITY.md` (or expanded README section) is committed and lists per-context env permissions explicitly
  4. `git ls-files | grep -E '\.env'` returns nothing across `/` and `trading_system/`
**Plans**: 2 plans across 2 waves

Plans:
- [x] 03-01-PLAN.md — Supabase env fail-fast + devMode DEV guard + gitignore hardening (Wave 1)
- [x] 03-02-PLAN.md — SECURITY.md creation + full phase verification (Wave 2)

### Phase 4: Observability & Health
**Goal**: Operators can tell at a glance whether the agent stack is alive, what failed, and how stale the feed is — without trusting heuristics that look operational but aren't.
**Depends on**: Phase 3
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04
**Success Criteria** (what must be TRUE):
  1. Agent health badges in `AgentFeed` reflect real `contributions[].status` / `error` data, or are explicitly labeled as estimates
  2. A failed `save_decision` produces a visible log/metric signal — operators are no longer blind to silent persistence drops
  3. The vector-index decision (`agent_decisions_embedding_idx`) has a documented threshold and `EXPLAIN` capture for `match_agent_decisions`
  4. `AgentFeed` shows a "stale data" indicator when no Realtime push has been received within the documented threshold
**Plans**: 2 plans completed

Plans:
- [x] 04-01-PLAN.md — `useAgentDecisions` isStale + stale banner + AgentHealthCard (est.) label + persistence ERROR + raise
- [x] 04-02-PLAN.md — OBSERVABILITY.md: IVFFlat threshold, migration SQL, EXPLAIN capture

### Phase 5: CI/CD + Test Matrix
**Goal**: Every PR runs typecheck, lint, unit tests, an Agent Feed E2E happy path, and an RLS policy fixture; merges are blocked when any gate fails. Local artifacts no longer leak into git.
**Depends on**: Phase 4
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05
**Success Criteria** (what must be TRUE):
  1. A PR with a deliberate type error / lint error / failing unit test cannot merge
  2. A PR that breaks the login → Agent Feed E2E flow is blocked by CI
  3. A PR that regresses `agent_decisions` RLS policy is blocked by CI
  4. `git status` is clean after a full local typecheck/test/E2E run
  5. CI builds the production bundle and reports chunk-size regressions
**Plans**: TBD (estimated 2-3 plans)

Plans:
- [x] 05-01: TBD — set during `/gsd-plan-phase 5`

### Phase 6: Agent Layer Hardening
**Goal**: The real `news_agent`, `fred_agent`, `sentiment_agent` modules are wired into the orchestrator (no stub bypass), both orchestration paths are CI-tested, and `pgvector` is indexed when the row threshold is crossed — unblocking any future Agent Layer v2 work on a solid foundation.
**Depends on**: Phase 5
**Requirements**: AGT-01, AGT-02, AGT-03
**Success Criteria** (what must be TRUE):
  1. With required keys present, `crew_runner.py` invokes the real agent modules; without keys, it falls back to stubs gracefully
  2. CI exercises both `USE_LANGGRAPH=0` and `USE_LANGGRAPH=1` orchestration paths with at least one success and one failure scenario each
  3. `agent_decisions_embedding_idx` is created and verified with `EXPLAIN` once the documented row threshold is crossed (or, if threshold is not crossed during the milestone, the runbook to apply it is checked in)
**Plans**: TBD (estimated 2 plans)

Plans:
- [ ] 06-01: TBD — set during `/gsd-plan-phase 6`

## Progress

**Execution Order:**
Sequential — each phase depends on the previous one (1 → 2 → 3 → 4 → 5 → 6). Decimal phases (e.g. 2.1) inserted only for urgent fixes.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Settings & Secrets Unification | 4/4 | Complete    | 2026-05-01 |
| 2. RLS Hardening + Empty-Feed Fix | 2/2   | Complete    | 2026-05-01 |
| 3. Auth Bypass + Env Failsafe | 2/2   | Complete    | 2026-05-01 |
| 4. Observability & Health | 2/2 | Complete    | 2026-05-01 |
| 5. CI/CD + Test Matrix | 2/2 | Complete   | 2026-05-01 |
| 6. Agent Layer Hardening | 0/TBD | Not started | - |

---
*Roadmap created: 2026-05-01*
*Last updated: 2026-05-01 after Phase 4 verification — Phase 4 complete*
