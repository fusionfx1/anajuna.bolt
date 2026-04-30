# Codebase Concerns

**Analysis Date:** 2026-05-01

## Tech Debt

**Agent Feed UI not integrated into navigation:**
- Issue: `AgentFeed` is implemented but never imported in `src/App.tsx`, not included in `NavPage` in `src/types/trading.ts`, and has no entry in `src/components/Layout.tsx` nav items.
- Impact: Users cannot reach the feed from the shipping app; only `agent-feed-mockup.html` (root) and manual embedding would show it.
- Fix approach: Add a `agent_feed` (or similar) `NavPage`, register `case 'agent_feed': return <AgentFeed />;`, and add a sidebar item in `Layout.tsx`.

**“Real” agent modules bypassed by CrewAI wiring:**
- Issue: `trading_system/agents/news_agent.py`, `fred_agent.py`, and `sentiment_agent.py` implement HTTP/heuristic pipelines, but `trading_system/agents/crew_runner.py` imports `FredAgent`, `NewsAgent`, and `SentimentAgent` only from `stub_agents.py`. `trading_system/agents/__init__.py` also exports the stub classes only.
- Impact: Production-looking code in `*_agent.py` files is dead unless another caller uses it; behavior stays on Phase‑1 stubs unless LangGraph path differs.
- Fix approach: Swap imports in `crew_runner.py` (and `__init__.py` exports) to the real agents behind a feature flag, or delete/merge duplicate implementations to one canonical module.

**Agent health metrics are synthetic:**
- Issue: `AgentHealthCard` in `src/components/AgentFeed.tsx` derives `health` from `latency_ms` modulo and error flags, not from backend health endpoints or agent run metadata.
- Impact: UI suggests operational “health” that does not reflect true agent or provider status.
- Fix approach: Pass through real status fields from `contributions` (or a dedicated agents_health table/API) and render those; remove or label heuristics as “latency-based estimate”.

**`useAgentDecisions` carries unused auth dependency:**
- Issue: `useAuth()`/`user` is imported in `src/hooks/useAgentDecisions.ts` but never used; comments claim RLS governs visibility while queries omit `user_id`.
- Impact: Confusing for maintainers; suggests incomplete wiring to per-user feeds.
- Fix approach: Either remove the unused hook dependency or filter/bind `user_id` explicitly once RLS policies align with product intent (see Security).

**Seed script vs RLS contract:**
- Issue: `seed-agent-decisions.mjs` posts to `agent_decisions` with `VITE_SUPABASE_ANON_KEY` as `Bearer`. Table policies in `supabase/migrations/20260430120000_create_agent_decisions.sql` allow `INSERT` for `authenticated` (with `user_id = auth.uid()`) and `service_role` (unrestricted check), not for anonymous clients.
- Impact: Script likely fails with RLS errors unless run under a session JWT that satisfies `WITH CHECK`, or developers mistakenly use `SUPABASE_SERVICE_ROLE_KEY` locally and risk leaking it.
- Fix approach: Document service-role-only seeding in a secure dev doc, or add a migration-only seed path; update script header to require service role explicitly and never suggest pasting service keys into frontend env.

## Known Bugs

**Likely empty Agent Feed for authenticated sessions (RLS + NULL `user_id`):**
- Symptoms: Dashboard feed shows “No decisions yet” while Python `trading_system/agents/persistence.py` successfully inserts rows with `user_id` omitted for paper sessions.
- Trigger: Log in with a normal user; backend inserts via service role with `user_id` NULL; frontend uses anon key + user JWT (`src/lib/supabase.ts`). `SELECT` policy `"Users can view own agent decisions"` requires `auth.uid() = user_id`, which does not pass for NULL `user_id`.
- Files: `supabase/migrations/20260430120000_create_agent_decisions.sql`, `src/hooks/useAgentDecisions.ts`, `trading_system/agents/persistence.py`
- Fix approach: Add a narrow `SELECT` policy for `authenticated` (and realtime) for rows where `user_id IS NULL` if paper decisions are meant to be shared read-only, **or** always set `user_id` on insert when the operator is known, **or** expose decisions via a `SECURITY DEFINER` RPC/view with explicit rules.

## Security Considerations

**Client-side dev auth bypass:**
- Risk: `src/App.tsx` skips `LoginScreen` when `localStorage` sets `devMode=true`, granting full shell access without Supabase session.
- Current mitigation: None by default; requires manual localStorage change.
- Recommendations: Strip or gate behind `import.meta.env.DEV`; never enable in production builds.

**Supabase client fallback placeholders:**
- Risk: `src/lib/supabase.ts` falls back to `https://placeholder.supabase.co` and `placeholder-anon-key` when env vars are missing.
- Current mitigation: Console warning only.
- Recommendations: Fail fast in production builds or block queries so misconfiguration cannot silently hit a dummy host.

**Service role usage in Python persistence:**
- Risk: `trading_system/agents/persistence.py` prefers `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS — correct for server-side writes but dangerous if duplicated in client or committed env files.
- Current mitigation: Env-based configuration only (sensitive files not read for this audit).
- Recommendations: Keep service role only in server/CI secrets; ensure `.env` patterns stay gitignored; never reuse `VITE_*` keys for service writes in documentation.

## Performance Bottlenecks

**Deferred vector index on `agent_decisions`:**
- Problem: Migration `20260430120000_create_agent_decisions.sql` intentionally omits `IVFFlat` on `embedding` until enough rows exist; `match_agent_decisions` RPC will full-scan at low volume.
- Measurement: Not profiled in-repo; risk grows with row count.
- Improvement path: After the documented row threshold, create `agent_decisions_embedding_idx` as commented in the migration; monitor `EXPLAIN` on `match_agent_decisions`.

**Agent Feed query fan-in:**
- Problem: `useAgentDecisions` loads 100 rows and opens a Realtime channel on full-table `INSERT` events (`src/hooks/useAgentDecisions.ts`).
- Cause: No server-side pagination or symbol-scoped channel filter tied to RLS-safe predicates.
- Improvement path: Narrow `postgres_changes` filter once policies support it; add paging for history.

## Fragile Areas

**Silent persistence failures:**
- Files: `trading_system/agents/persistence.py` (`save_decision` swallows exceptions after a warning).
- Why fragile: Trading audit trail can drop rows without failing the live loop.
- Safe modification: Add metrics/alerts or optional strict mode for environments that require durable audit.

**Dual orchestration paths (LangGraph vs legacy):**
- Files: `trading_system/agents/orchestrator.py`, `trading_system/agents/supervisor.py`
- Why fragile: `USE_LANGGRAPH` toggles behavior; failures fall back with logged warnings only.
- Test coverage: Exercise both paths in CI when changing fusion or guard semantics.

## Scaling Limits

**Realtime subscription scope:**
- Current capacity: Single channel per browser tab on all `agent_decisions` inserts.
- Limit: High insert rate from many symbols/users increases client memory and update churn (client caps list at 100 rows).
- Scaling path: Shard by symbol or user in the channel filter; move history to paginated REST/Edge.

## Dependencies at Risk

**CrewAI + optional LLM keys:**
- Risk: `trading_system/agents/crew_runner.py` pulls in CrewAI; optional `OPENAI_API_KEY` paths change behavior and failure modes.
- Impact: Silent degradation to stubs or runtime errors when misconfigured.
- Migration plan: Centralize env validation on startup (already documented in `trading_system/README.md`; enforce in code paths that call `build_trading_crew`).

## Missing Critical Features

**End-to-end Agent Feed product path:**
- Problem: DB schema, Python persistence, React UI, and `seed-agent-decisions.mjs` exist, but nav integration and RLS/read path for logged-in users are incomplete (see above).
- Blocks: Operators cannot rely on the feed inside the main app without additional fixes.

## Test Coverage Gaps

**No automated coverage for Agent Feed / RLS matrix:**
- What's not tested: Frontend hook behavior against Supabase RLS; seed script success; visibility of `user_id` NULL rows for `authenticated`.
- Files: `src/hooks/useAgentDecisions.ts`, `supabase/migrations/20260430120000_create_agent_decisions.sql`
- Risk: Regressions in security or empty-feed bugs ship unnoticed.
- Priority: High
- Difficulty to test: Requires Supabase local stack or policy fixture tests.

## Repository / analysis noise

**Graphify and Playwright outputs:**
- Issue: `graphify-out/` commits some artifacts (`GRAPH_REPORT.md`, `graph.html`, `graph.json` per workspace layout); `.gitignore` only excludes `graphify-out/cache/`, `manifest.json`, `cost.json` — remaining files clutter `git status` and repo-wide search. `playwright-report/` exists under the project root and is not ignored in the root `.gitignore`, so test reports pollute working trees.
- Fix approach: Extend `.gitignore` for `playwright-report/` and optional `graphify-out/*.html` / `graphify-out/*.json` if teams prefer reports generated locally only; keep policy aligned with `.cursor/rules/graphify.mdc`.

**TODO/FIXME scan:**
- No `TODO`/`FIXME`/`HACK`/`XXX` matches in primary `src/**/*.ts(x)` and `trading_system/**/*.py` at time of audit; debt is structural rather than comment-tagged.

---

*Concerns audit: 2026-05-01*
*Update as issues are fixed or new ones discovered*
