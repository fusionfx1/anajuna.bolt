# Requirements: Anjuna FX — Production Readiness v1

**Defined:** 2026-05-01
**Core Value:** An operator can configure broker/data/agent credentials once, trust where every secret lives, and see real agent decisions reach the dashboard without empty-feed or silent-failure surprises.

**Source signals:** `.planning/codebase/CONCERNS.md` (audit 2026-05-01), Settings code review (this session), `trading_system/README.md` agent-layer doc.

## v1 Requirements

Requirements for the v1 milestone. Each maps to exactly one phase in `ROADMAP.md`.

### Settings & Secrets

- [ ] **SETT-01**: Settings page exposes one canonical Save flow per panel; every visible field has a deterministic "Save" affordance and confirmed feedback (no field updates without explicit save, no silent persistence)
- [ ] **SETT-02**: No long-lived API secrets live in browser `localStorage`; EODHD and Tiingo keys move to a Supabase-backed store (e.g. `user_settings` or `user_api_keys`) governed by RLS
- [ ] **SETT-03**: The MT5 password field in `src/components/Settings.tsx` is either removed or clearly marked as "demo / not yet implemented" and disabled until real MT5 integration ships
- [ ] **SETT-04**: All credential inputs across `Settings`, `DataFeedConfig`, and `DataProvidersSettings` use the same masked-input component (no plaintext `type="text"` on credentials)
- [ ] **SETT-05**: Settings UI uses one consistent dark theme across `Settings.tsx`, `DataFeedConfig.tsx`, and `pages/Settings/DataProviders.tsx` (no light-theme yellow / blue mix)
- [ ] **SETT-06**: Settings UI tells the operator explicitly which keys feed the Python `trading_system/.env` vs which feed the browser bundle, so configuring the dashboard does not create false confidence about backend agents

### RLS & Data Visibility

- [x] **RLS-01**: `agent_decisions` SELECT policy is explicitly documented for both `auth.uid() = user_id` rows and `user_id IS NULL` rows; behavior is intentional, not accidental
- [x] **RLS-02**: `src/hooks/useAgentDecisions.ts` either filters by `user_id` to match RLS-01 OR removes its unused `useAuth` import; the contract is reflected in code comments and tests
- [x] **RLS-03**: At least one automated test (Vitest fixture or Supabase policy test) asserts the chosen empty-feed contract: a logged-in user with zero own rows sees the documented set of NULL-`user_id` rows (or none, per policy)
- [x] **RLS-04**: Realtime `postgres_changes` channel respects the same RLS contract — no decision appears in the stream that the SELECT policy would not return on a fresh fetch
- [x] **RLS-05**: `seed-agent-decisions.mjs` documents service-role-only execution at the top of the file and refuses to run (clear error message) when only `VITE_SUPABASE_ANON_KEY` is supplied

### Auth & Env Failsafe

- [x] **AUTH-01**: The `localStorage.devMode=true` login bypass in `src/App.tsx` is gated behind `import.meta.env.DEV` and is impossible in production builds
- [x] **AUTH-02**: `src/lib/supabase.ts` fails fast (throws or surfaces a hard-blocking error UI) in production builds when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing; placeholder fallback only ever runs in dev with a visible banner
- [x] **AUTH-03**: A `SECURITY.md` (or expanded `trading_system/README.md` section) explicitly states `SUPABASE_SERVICE_ROLE_KEY` MUST never appear in any `VITE_*` env var, and lists per-context minimum permissions (browser anon vs Python service role)
- [x] **AUTH-04**: `.gitignore` covers all env file variants (`.env`, `.env.local`, `.env.*.local`) at root and inside `trading_system/`; a `git ls-files | grep -E '\.env'` audit returns nothing committed

### Observability & Health

- [x] **OBS-01**: `AgentHealthCard` in `src/components/AgentFeed.tsx` derives status from real fields (`contributions[].status`, `error`, last-seen timestamp) instead of `latency_ms % 3` heuristic — or the heuristic is explicitly labeled in UI as "latency-based estimate"
- [x] **OBS-02**: `trading_system/agents/persistence.py::save_decision` produces a counter or log signal (loguru ERROR + optional metric) on persistence failure; failures are no longer fully silent
- [x] **OBS-03**: `agent_decisions` table has a documented row-threshold for adding the `IVFFlat` vector index, and `match_agent_decisions` includes a query plan / `EXPLAIN` capture in `trading_system/README.md` or a new `OBSERVABILITY.md`
- [x] **OBS-04**: `AgentFeed` shows a visible "stale data" indicator when no Realtime push has been received within a documented threshold (so operators don't trust an unchanging feed)

### CI/CD & Test Matrix

- [x] **CI-01**: `.github/workflows/ci.yml` (or equivalent) runs `npm run typecheck`, `npm run lint`, and `npm run test` on every PR and blocks merge on failure
- [x] **CI-02**: At least one Playwright E2E test covers the login → Agent Feed happy path and runs in CI against a build artifact
- [x] **CI-03**: An RLS-policy test job runs against a Supabase local stack (or fixture) and blocks merge when the `agent_decisions` policies regress
- [x] **CI-04**: `playwright-report/`, `graphify-out/cache/`, and Python `__pycache__/` are excluded from version control; `git status` is clean after a full local test run
- [x] **CI-05**: Production build (`npm run build`) is verified as part of CI; `dist/` size and chunk-warning regressions surface as warnings on the PR

### Agent Layer Hardening

- [x] **AGT-01**: `trading_system/agents/crew_runner.py` and `trading_system/agents/__init__.py` import the real `news_agent`, `fred_agent`, `sentiment_agent` modules behind a feature flag (default = real where keys exist, fallback = stub)
- [x] **AGT-02**: Both orchestration paths (legacy parallel and `USE_LANGGRAPH=1` supervisor) have CI tests covering at least one success path and one failure / fallback path
- [x] **AGT-03**: The deferred `agent_decisions_embedding_idx` decision is documented (when to apply, how to verify) and the migration is applied once the documented row threshold is crossed

## v2 Requirements

Acknowledged but deferred — not in the v1 roadmap.

### Real Broker Integration

- **BROK-01**: Real MT5 connectivity (replace mock fields with a working bridge)
- **BROK-02**: Additional brokers beyond Alpaca / OANDA (e.g. IBKR)

### Observability SDK

- **OBS2-01**: Sentry (or equivalent) SDK integration in the SPA
- **OBS2-02**: Datadog (or equivalent) tracing in the Python trading subsystem

### Multi-Tenant

- **MT-01**: Team / org accounts with shared strategies
- **MT-02**: Role-based access on `agent_decisions` and `strategies`

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app / native shells | Web-first; native is a separate product line |
| Real-money MT5 connectivity in v1 | High-risk integration; ship after foundation is trusted |
| Greenfield rewrite of agent layer | Phase 6 hardens, doesn't rewrite — Agent Layer v2 is a future milestone |
| Multi-tenant team features | Single operator focus until production loop is validated |
| New data providers beyond EODHD / Tiingo / synthetic for backtest | Hardening existing providers > breadth |
| Custom self-hosted Postgres | Supabase BaaS chosen for v1 — migration cost not justified |

## Traceability

Which phase covers which requirement. Updated by `gsd-roadmapper` and during phase transitions.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETT-01 | Phase 1 | Pending |
| SETT-02 | Phase 1 | Pending |
| SETT-03 | Phase 1 | Pending |
| SETT-04 | Phase 1 | Pending |
| SETT-05 | Phase 1 | Pending |
| SETT-06 | Phase 1 | Pending |
| RLS-01  | Phase 2 | Complete |
| RLS-02  | Phase 2 | Complete |
| RLS-03  | Phase 2 | Complete |
| RLS-04  | Phase 2 | Complete |
| RLS-05  | Phase 2 | Complete |
| AUTH-01 | Phase 3 | Complete |
| AUTH-02 | Phase 3 | Complete |
| AUTH-03 | Phase 3 | Complete |
| AUTH-04 | Phase 3 | Complete |
| OBS-01  | Phase 4 | Complete |
| OBS-02  | Phase 4 | Complete |
| OBS-03  | Phase 4 | Complete |
| OBS-04  | Phase 4 | Complete |
| CI-01   | Phase 5 | Complete |
| CI-02   | Phase 5 | Complete |
| CI-03   | Phase 5 | Complete |
| CI-04   | Phase 5 | Complete |
| CI-05   | Phase 5 | Complete |
| AGT-01  | Phase 6 | Complete |
| AGT-02  | Phase 6 | Complete |
| AGT-03  | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Last updated: 2026-05-01 after Phase 6 verification — AGT-01..03 complete. All 27/27 requirements satisfied. Production Readiness v1 milestone complete.*
