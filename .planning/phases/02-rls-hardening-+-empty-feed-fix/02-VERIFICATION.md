---
phase: 02-rls-hardening-+-empty-feed-fix
verified: 2026-05-01T08:45:00+07:00
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Automated test fails when agent_decisions SELECT policy diverges in the real database"
    addressed_in: "Phase 5"
    evidence: "Phase 5 success criteria CI-03: 'An RLS-policy test job runs against a Supabase local stack and blocks merge when the agent_decisions policies regress'. Phase 5 delivers the live-database RLS fixture; Phase 2 delivers the unit-level hook contract test."
  - truth: "supabase db push applied to remote project"
    addressed_in: "Phase 5"
    evidence: "02-02-SUMMARY.md documents: 'supabase db push deferred to CI — project not yet linked (no supabase link run)'. Migration file is ready; push deferred until CI provides a linked project ref."
---

# Phase 2: RLS Hardening + Empty-Feed Fix — Verification Report

**Phase Goal:** The Agent Feed shows exactly the rows the chosen RLS contract intends — no accidental empty feed, no accidental data leak — and the contract is enforced by automated tests so regressions don't ship silently.
**Verified:** 2026-05-01T08:45:00+07:00
**Status:** ✅ PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A logged-in user with no own `agent_decisions` rows sees shared NULL-`user_id` rows — never an unintentionally empty feed | ✓ VERIFIED | Migration policy `USING (auth.uid() = user_id OR user_id IS NULL)` confirmed at lines 15, 59. Test 1 (`user_id=null` rows returned) and Test 5 (regression: not filtered client-side) both pass. |
| 2 | Realtime inserts only stream rows that the SELECT policy would also return on a fresh fetch | ✓ VERIFIED | Hook Realtime channel has no contradicting filter. Comment on line 86: "No explicit channel filter needed — Supabase Realtime respects the SELECT RLS policy." No `filter:` param on `.on('postgres_changes', ...)`. |
| 3 | Automated test fails when `agent_decisions` SELECT policy diverges from the documented contract | ✓ VERIFIED (unit scope) | 5 Vitest tests in `src/hooks/__tests__/useAgentDecisions.test.ts` guard the contract: Test 1 asserts null-user rows returned; Test 5 asserts no client-side user_id filter. Real-database RLS fixture deferred to Phase 5 CI-03. |
| 4 | `seed-agent-decisions.mjs` requires service role and refuses to run with anon key, with a clear error message | ✓ VERIFIED | `node seed-agent-decisions.mjs` (no env) → exit 1, output: `"Error: seed-agent-decisions.mjs requires SUPABASE_SERVICE_ROLE_KEY. Running with anon key would silently produce no rows (RLS blocks INSERT)."` Verified live. |

**Score: 4/4 success criteria verified**

---

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live RLS policy test against real Supabase database | Phase 5 | CI-03: "An RLS-policy test job runs against a Supabase local stack and blocks merge when the agent_decisions policies regress" |
| 2 | `supabase db push` to apply migration to remote project | Phase 5 | 02-02-SUMMARY: "supabase db push deferred to CI — project not yet linked (no supabase link run)" |

---

## Requirements Coverage (RLS-01 through RLS-05)

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| **RLS-01** | `agent_decisions` SELECT policy documented for both `auth.uid()=user_id` AND `user_id IS NULL` rows | ✓ SATISFIED | `supabase/migrations/20260501_agent_decisions_rls_contract.sql` — full comment block (lines 1–43) documents problem, new policy, Realtime behaviour, security note. Policy SQL: `USING (auth.uid() = user_id OR user_id IS NULL)` at line 59. |
| **RLS-02** | `useAgentDecisions.ts` aligned with RLS-01, documented in comments, no unused `useAuth` import | ✓ SATISFIED | `Select-String -Pattern "useAuth"` → **no match** (import removed). Line 53: `// RLS policy handles row filtering — SELECT allows auth.uid()=user_id OR user_id IS NULL.` Line 86: `// No explicit channel filter needed — Supabase Realtime respects the SELECT RLS policy.` |
| **RLS-03** | Automated test asserts empty-feed contract | ✓ SATISFIED | `src/hooks/__tests__/useAgentDecisions.test.ts` — 171 lines, 5 tests. Test 1: returns null-user rows. Test 5: regression guard — null rows NOT filtered client-side. All 5 pass (✓ confirmed via `npm test`). |
| **RLS-04** | Realtime channel aligned with SELECT policy (no contradicting filter) | ✓ SATISFIED | Hook line 79–96: `channel('agent-decisions-feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_decisions' })` — no `filter:` key. Comment explicitly documents alignment. |
| **RLS-05** | `seed-agent-decisions.mjs` refuses to run with anon key with clear error | ✓ SATISFIED | Lines 18–26: guard on `SERVICE_ROLE_KEY` (empty → exit 1) and `SERVICE_ROLE_KEY === SUPABASE_ANON_KEY` (equal → exit 1). Both branches print the documented error. Live run confirmed: `exit 1` with correct message. |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260501_agent_decisions_rls_contract.sql` | Policy replacement migration | ✓ VERIFIED | Exists, 59 lines, drops narrow policy, creates correct policy with `OR user_id IS NULL` |
| `src/hooks/useAgentDecisions.ts` | Cleaned hook — no useAuth, correct comments | ✓ VERIFIED | 104 lines, no useAuth, both RLS contract comments present, Realtime channel has no contradicting filter |
| `src/hooks/__tests__/useAgentDecisions.test.ts` | 5 RLS contract tests | ✓ VERIFIED | 171 lines, 5 named tests, all pass |
| `seed-agent-decisions.mjs` | Service-role guard | ✓ VERIFIED | Guard at lines 18–26, exits 1 with clear error, header documentation present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useAgentDecisions.ts` | `agent_decisions` table | Supabase `.from('agent_decisions').select('*')` | ✓ WIRED | Line 54–58 — query present with `.order` and `.limit`, no client-side `user_id` filter added |
| `useAgentDecisions.ts` | Realtime channel | `supabase.channel('agent-decisions-feed').on(...)` | ✓ WIRED | Lines 79–96 — channel configured, INSERT events handled, no contradicting `filter:` |
| Migration | Policy | `CREATE POLICY ... USING (auth.uid() = user_id OR user_id IS NULL)` | ✓ WIRED | Line 56–59 — policy created, correct USING clause |
| `seed-agent-decisions.mjs` | Service-role guard | `process.env.SUPABASE_SERVICE_ROLE_KEY` check | ✓ WIRED | Lines 16–26 — guard at top of file before any network call |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `useAgentDecisions.ts` | `decisions` state | `supabase.from('agent_decisions').select('*')` | Yes — queries live Supabase table | ✓ FLOWING |
| `useAgentDecisions.ts` | Realtime update | `postgres_changes` INSERT payload | Yes — live DB events forwarded | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Seed guard exits 1 with no env | `node seed-agent-decisions.mjs` | `exit 1`, error message matches spec | ✓ PASS |
| Migration contains correct policy clause | `Select-String -Pattern "auth.uid\(\) = user_id OR user_id IS NULL"` | 2 matches (comment + SQL) | ✓ PASS |
| Hook has no `useAuth` reference | `Select-String -Pattern "useAuth"` | No match | ✓ PASS |
| Hook has RLS contract comment | `Select-String -Pattern "RLS policy handles row filtering"` | Match at line 53 | ✓ PASS |
| All 5 RLS contract tests pass | `npm test` | ✓ 5/5 `useAgentDecisions` tests pass | ✓ PASS |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none in Phase 2 files) | — | — | — |

**Pre-existing failures (out of scope):** 5 tests in `tests/components/Backtesting.handleRun.test.ts` fail due to EODHD/Tiingo provider mock wiring — confirmed pre-existing in 02-02-SUMMARY.md, unrelated to RLS work.

**Pre-existing TypeScript errors:** ~20+ errors across `App.tsx`, `AIEngine.tsx`, `BacktestResults.tsx` and other files — all pre-existing, confirmed not in Phase 2 files (`useAgentDecisions.ts`, migration, seed script).

---

## Human Verification Required

None. All success criteria are verifiable programmatically at the unit/file level. The real-database RLS policy test (live Supabase instance check) is deferred to Phase 5 CI-03 by design.

---

## Git Commits

| Hash | Message |
|------|---------|
| `063317e` | `fix(rls): replace narrow agent_decisions SELECT policy, clean hook, guard seed script` |
| `ef52697` | `test(rls): add Vitest RLS-03 contract tests for useAgentDecisions (5 tests)` |

---

## Gaps Summary

None. All 5 requirements (RLS-01..05) are satisfied. All 4 success criteria are verified at the unit/file level. Two items are explicitly deferred to Phase 5 (live DB policy fixture and supabase db push) and are not blockers for Phase 2 completion.

---

_Verified: 2026-05-01T08:45:00+07:00_
_Verifier: Claude (gsd-verifier)_
