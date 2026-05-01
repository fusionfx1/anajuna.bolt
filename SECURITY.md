# Security Policy

## Environment Variables & Secret Handling

This document governs how credentials are handled across the Anjuna FX codebase.
It is the authoritative reference for anyone configuring or auditing the system.

---

## Service Role Key Rules

**SUPABASE_SERVICE_ROLE_KEY MUST NEVER appear in any `VITE_*` environment variable.**

The `VITE_` prefix causes Vite to embed the value into the browser bundle at build time,
making it visible to any user who inspects the JavaScript. The service role key bypasses
all Row-Level Security (RLS) policies — exposure is a full data compromise.

### Rules (non-negotiable)

1. `SUPABASE_SERVICE_ROLE_KEY` lives **only** in `trading_system/.env` (Python agents, never committed).
2. No `VITE_SUPABASE_SERVICE_ROLE_KEY` variable may ever be created.
3. CI will reject any PR that introduces a `VITE_*SERVICE_ROLE*` pattern (Phase 5 gate).
4. If you need server-side access from the frontend, route through a Supabase Edge Function
   that reads the service role key from Supabase Vault, not from the client environment.

---

## Per-Context Permission Matrix

| Context | Env Variable | Key Type | Permissions |
|---------|-------------|----------|-------------|
| Browser SPA (`src/`) | `VITE_SUPABASE_ANON_KEY` | anon / public | SELECT filtered by RLS, INSERT own rows, no service bypass |
| Python agents (`trading_system/`) | `SUPABASE_SERVICE_ROLE_KEY` | service role | Full access, bypasses RLS — use only for trusted server-side writes |
| Supabase Edge Functions | Read from Supabase Vault | service role | Full access — never hard-code in function source |

**Decision rationale:** The browser anon key is safe to commit to `VITE_*` vars (it is already
embedded in every request by the browser). The service role key is never safe in the browser context.

---

## Env File Locations

| Location | File | Committed? | Used by |
|----------|------|------------|---------|
| Repo root | `.env.local` | **NO** | Vite dev server / production build |
| Repo root | `.env.example` | YES (template only) | Onboarding reference |
| `trading_system/` | `.env` | **NO** | Python agents (SUPABASE_SERVICE_ROLE_KEY, API keys) |
| `trading_system/` | `.env.example` | YES (template only) | Onboarding reference |

Both `.gitignore` files enforce these rules. See the audit commands below to verify.

---

## Env Failsafe (Browser)

`src/lib/supabase.ts` exports `envError: string | null` checked at module load.
If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing in a production build,
`src/App.tsx` renders a full-screen error overlay before any data fetch occurs.
In development with missing vars, a yellow banner is shown instead (allows UI work without a live Supabase project).

---

## Auth Bypass Guard (Browser)

The `devMode` localStorage flag in `src/App.tsx` is wrapped in `import.meta.env.DEV`.
Vite eliminates this entire code branch in production builds via dead-code elimination.
Setting `localStorage.devMode = 'true'` in a production build has no effect.

---

## .gitignore Audit

Run the following command to verify no secret files are tracked by git.
**This must return zero output** (any output means a secret file is committed — investigate immediately).

### Bash / Git Bash / WSL
```bash
git ls-files | grep -E '\.env'
```

### PowerShell (Windows)
```powershell
git ls-files | Select-String -Pattern '\.env'
```

### Expected output
*(none — any match is a finding that must be remediated before merge)*

---

## Phase 5 Note

CI integration (Phase 5) will add an automated gate that:
- Runs `git ls-files | grep -E '\.env'` as a pre-merge check
- Rejects PRs that introduce any `VITE_*SERVICE_ROLE*` pattern in source files
- Runs `npm run build` to confirm the production bundle does not contain the devMode bypass path

Until Phase 5 is complete, run the audit commands manually before every release.

---

*Policy established: 2026-05-01 (Phase 3: Auth Bypass + Env Failsafe)*
*Next review: Phase 5 (CI/CD + Test Matrix) — automate the audit gate*
