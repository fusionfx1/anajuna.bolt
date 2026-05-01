# Phase 02 Plan 01: RLS Policy Replacement + Hook Cleanup + Seed Guard Summary

**One-liner:** Replaced narrow RLS SELECT policy blocking NULL user_id rows, removed dead useAuth dependency from hook, and added service role guard to seed script.

## What Was Built

### 1. RLS Migration — `supabase/migrations/20260501_agent_decisions_rls_contract.sql`
- DROPs `"Users can view own agent decisions"` (the narrow policy that blocked all rows where `user_id IS NULL`)
- CREATEs `"Authenticated users see own and shared agent decisions"` using `USING (auth.uid() = user_id OR user_id IS NULL)`
- Includes a full comment block documenting the contract, the root cause of the empty-feed bug, Realtime behaviour, and security rationale
- INSERT policies and service role policies are left unchanged

### 2. Hook Cleanup — `src/hooks/useAgentDecisions.ts`
- Removed `import { useAuth } from '../context/AuthContext';` (line 3)
- Removed `const { user } = useAuth();` from function body
- Replaced query comment with: `// RLS policy handles row filtering — SELECT allows auth.uid()=user_id OR user_id IS NULL.`
- Replaced Realtime comment with: `// No explicit channel filter needed — Supabase Realtime respects the SELECT RLS policy.`
- Hook is now self-contained with no auth context dependency

### 3. Seed Script Guard — `seed-agent-decisions.mjs`
- Added JSDoc block stating "REQUIRES SERVICE ROLE KEY"
- Reads `SERVICE_ROLE_KEY` from `process.env.SUPABASE_SERVICE_ROLE_KEY`
- Guard: exits 1 if `SERVICE_ROLE_KEY` is missing, with message: `"Error: seed-agent-decisions.mjs requires SUPABASE_SERVICE_ROLE_KEY. Running with anon key would silently produce no rows (RLS blocks INSERT)."`
- Guard: exits 1 if `SERVICE_ROLE_KEY === SUPABASE_ANON_KEY`
- `HEADERS` now uses `SERVICE_ROLE_KEY` instead of `SUPABASE_ANON_KEY`
- All seed data rows are unchanged

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260501_agent_decisions_rls_contract.sql` | Created (new migration) |
| `src/hooks/useAgentDecisions.ts` | Modified (removed useAuth, updated comments) |
| `seed-agent-decisions.mjs` | Modified (service role guard + header switch) |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pre-existing errors only — zero errors in our changed files (confirmed via grep) |
| `npm run lint` | Pre-existing errors only — zero lint issues in our changed files (confirmed via grep) |
| `node -e "...useAuth check..."` | `OK: useAuth removed` ✅ |
| `node -e "...service role guard check..."` | `OK: service role guard present` ✅ |
| `node seed-agent-decisions.mjs` (no env set) | Exit 1 with expected error message ✅ |

## Commit

`063317e` — `fix(rls): replace narrow agent_decisions SELECT policy, clean hook, guard seed script`

## Notes

- `supabase db push` is intentionally deferred — both Wave 1 (this plan) and Wave 2 migration changes will be pushed together after Wave 2 completes, avoiding two separate schema deployments
- The root cause of the empty Agent Feed: the original `USING (auth.uid() = user_id)` policy evaluates to FALSE (not NULL) for rows where `user_id IS NULL`, which Postgres treats as "deny" — so every system-inserted row was invisible to authenticated users
- No architectural changes required; the fix is purely a policy clause addition

## Self-Check

- [x] `supabase/migrations/20260501_agent_decisions_rls_contract.sql` — exists ✅
- [x] `src/hooks/useAgentDecisions.ts` — exists, `useAuth` removed ✅
- [x] `seed-agent-decisions.mjs` — exists, `SUPABASE_SERVICE_ROLE_KEY` guard present ✅
- [x] Commit `063317e` — confirmed in git log ✅

## Self-Check: PASSED
