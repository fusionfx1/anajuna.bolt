---
phase: 03-auth-bypass-env-failsafe
plan: 01
subsystem: auth-security
tags: [auth, env-safety, gitignore, security]
key-files:
  modified:
    - src/lib/supabase.ts
    - src/App.tsx
    - .gitignore
  created:
    - trading_system/.gitignore
decisions:
  - envError is evaluated once at module load via IIFE; null-cast supabase avoids TS errors without unsafe assertions elsewhere
  - devMode guard uses import.meta.env.DEV so Vite dead-code-eliminates the block in production bundles
  - Production shows hard red overlay; dev shows non-blocking yellow banner — two separate UX paths for the same env problem
metrics:
  duration: ~8 minutes
  completed: 2026-05-01
  tasks: 3
  files: 4
---

# Phase 03 Plan 01: Auth Bypass + Env Fail-Fast Summary

**One-liner:** Env fail-fast with `envError` export, devMode guard behind `import.meta.env.DEV`, and full `.env.*` gitignore coverage.

## Tasks Completed

### Task 1 — `src/lib/supabase.ts`: Env fail-fast (AUTH-02)

Replaced the entire file. Key changes:

- **Removed** `|| 'https://placeholder.supabase.co'` and `|| 'placeholder-anon-key'` fallbacks
- **Added** `export const envError: string | null` — evaluated at module load via IIFE
- envError is non-null when `VITE_SUPABASE_URL` is missing, contains `placeholder`, or contains `your-project`
- envError is non-null when `VITE_SUPABASE_ANON_KEY` is missing, contains `your-anon-key`, or has length < 20
- **Exported** `supabase` as `null as unknown as ReturnType<typeof createClient>` when envError is set — avoids TS errors, App.tsx overlay blocks usage in prod before any call reaches supabase

Final shape:
```typescript
export const envError: string | null = (() => {
  if (!supabaseUrl || supabaseUrl.includes('placeholder') || supabaseUrl.includes('your-project')) {
    return 'VITE_SUPABASE_URL is not configured. Set it in .env.local and restart.';
  }
  if (!supabaseAnonKey || supabaseAnonKey.includes('your-anon-key') || supabaseAnonKey.length < 20) {
    return 'VITE_SUPABASE_ANON_KEY is not configured. Set it in .env.local and restart.';
  }
  return null;
})();

export const supabase = envError
  ? (null as unknown as ReturnType<typeof createClient>)
  : createClient(supabaseUrl!, supabaseAnonKey!);
```

### Task 2 — `src/App.tsx`: devMode guard + env overlays (AUTH-01, AUTH-02)

Three precise edits:

**A. Import added** (after NavPage import):
```typescript
import { envError } from './lib/supabase';
```

**B. devMode guard** — wrapped localStorage read behind `import.meta.env.DEV`:
```typescript
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const dev = localStorage.getItem('devMode') === 'true';
  ...
}
```
Vite's dead-code elimination removes this block entirely in production builds.

**C. Env overlays added** before `if (loading)`:
- **Production hard-stop**: When `envError && !import.meta.env.DEV` — returns full-screen red error overlay. App cannot render anything else.
- **Dev banner**: When `envError && import.meta.env.DEV` — renders fixed yellow top banner (`z-50`), non-blocking, app continues to function.

**D. Fragment wrapper**: `<Layout>` now wrapped in `<>...</>` with `{devEnvBanner}` above it.

### Task 3 — `.gitignore` hardening (AUTH-04)

**Root `.gitignore`** — expanded from single `.env` line to:
```
# Environment files — all variants must be excluded
.env
.env.*
.env.local
.env.*.local
!.env.example
!.env.*.example
```

**`trading_system/.gitignore`** — created new file covering:
- `.env`, `.env.*`, `.env.local` (with `!.env.example` exception)
- `__pycache__/`, `*.pyc`, `*.pyo`, `*.pyd`
- `venv/`, `.venv/`, `env/`, `.env/`
- `*.egg-info/`, `dist/`, `build/`
- `.pytest_cache/`, `.coverage`, `htmlcov/`

## Verification Results

```
git check-ignore -v .env.local .env.production .env.test.local
→ .gitignore:26:.env.local     .env.local
→ .gitignore:25:.env.*         .env.production
→ .gitignore:27:.env.*.local   .env.test.local

git check-ignore -v trading_system/.env.local
→ trading_system/.gitignore:4:.env.local  trading_system/.env.local
```

All env file variants are correctly ignored. `.env.example` is NOT ignored (negation entry present).

## TypeScript Status

`npm run typecheck` exits with pre-existing errors only (in `BacktestEquityCurve.tsx`, `BacktestResults.tsx`, `AIEngine.tsx`, etc.). **Zero new errors** introduced by this plan's changes. No errors reported for `src/lib/supabase.ts` or the `envError` import/usage in `src/App.tsx`.

## Deviations from Plan

None — plan executed exactly as written. The IIFE check was extended slightly to also include `supabaseAnonKey.length < 20` (per the user's task spec, which was consistent with the plan's intent).

## Commit

`d79cb8b` — `fix(auth): gate devMode bypass behind DEV, add env fail-fast overlay, harden gitignore`

## Self-Check: PASSED

- [x] `src/lib/supabase.ts` exports `envError` and null-cast `supabase`
- [x] `src/App.tsx` imports `envError`, wraps devMode in `import.meta.env.DEV`, renders prod overlay and dev banner
- [x] Root `.gitignore` covers `.env.*` and `.env.*.local`
- [x] `trading_system/.gitignore` exists with `__pycache__/` and `venv/` coverage
- [x] Commit `d79cb8b` verified in git log
