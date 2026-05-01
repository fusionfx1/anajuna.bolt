# Phase 3 Context: Auth Bypass + Env Failsafe

## Decisions

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| D-01 | devMode bypass gate | Wrap in import.meta.env.DEV | Strips in production build, preserves dev convenience |
| D-02 | Supabase failfast | Error overlay blocking UI | Visible, operator-safe, catches missing env at app start |
| D-03 | SECURITY.md location | New root SECURITY.md | Standard GitHub convention, discoverable |
| D-04 | .gitignore scope | Root + trading_system/ | Belt and suspenders — both locations covered |

## Implementation Notes

- **D-01:** In `src/App.tsx`, wrap the `localStorage.getItem('devMode')` check (lines 26–34) in `if (import.meta.env.DEV) { ... }`. Vite removes this entire block in production builds via dead code elimination — no code path can read `devMode` from localStorage in a prod bundle.

- **D-02:** In `src/lib/supabase.ts`, check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at module load. Export an `envError: string | null` alongside the `supabase` client. In `src/App.tsx`, read `envError` before rendering any route and display a full-screen error overlay when non-null (production). In dev (`import.meta.env.DEV`) with missing vars, show a visible yellow warning banner rather than a hard crash, allowing local work without a real Supabase project.

- **D-03:** `SECURITY.md` at repo root. Covers: service role key rules (SUPABASE_SERVICE_ROLE_KEY must NEVER appear in any `VITE_*` var), per-context permission matrix (browser anon key / Python service role), env file handling conventions, and the audit command `git ls-files | grep -E '\.env'` to verify no secrets are committed.

- **D-04:** Root `.gitignore` currently only has `.env` (no wildcard). Expand to `.env*` and `.env.*` to cover `.env.local`, `.env.production`, `.env.*.local`. Also add `trading_system/.gitignore` with Python-specific patterns (`.env`, `.env.*`, `__pycache__/`, `*.pyc`, `*.pyo`, `venv/`, `.venv/`).

## Observed Current State (from file inspection)

| File | Issue |
|------|-------|
| `src/App.tsx` L26–34 | `localStorage.getItem('devMode')` not gated — runs in production |
| `src/lib/supabase.ts` L3–4 | Placeholder URL/key fallbacks silently used in prod with only `console.warn` |
| `.gitignore` L23 | Only `.env` listed — `.env.local`, `.env.production`, etc. not covered |
| `trading_system/.gitignore` | Does not exist |

## Phase Scope Boundary

- **IN:** `src/App.tsx` devMode gate, `src/lib/supabase.ts` failfast + envError export, `src/App.tsx` error overlay consumer, `SECURITY.md`, root `.gitignore` hardening, `trading_system/.gitignore` creation
- **OUT:** actual MT5/broker connectivity, CI pipeline (Phase 5), Sentry integration (v2), trading_system Python auth changes
