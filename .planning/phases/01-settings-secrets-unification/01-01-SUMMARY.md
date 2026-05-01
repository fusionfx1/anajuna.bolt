---
phase: 01-settings-secrets-unification
plan: 01
subsystem: ui-components, database
tags: [secret-input, rls, supabase, migration, accessibility]
dependency_graph:
  requires: []
  provides:
    - src/components/ui/SecretInput.tsx
    - supabase/migrations/20260501_add_data_provider_api_keys.sql
  affects:
    - src/components/DataFeedConfig.tsx (will import SecretInput in 01-02)
    - data-provider-proxy Edge Function (will read data_provider_api_keys via service role in 01-03)
tech_stack:
  added: []
  patterns:
    - Shared masked-credential input component (Eye/EyeOff toggle)
    - Supabase RLS: INSERT+DELETE for owner, no SELECT for authenticated (service-role reads only)
key_files:
  created:
    - src/components/ui/SecretInput.tsx
    - supabase/migrations/20260501_add_data_provider_api_keys.sql
  modified: []
decisions:
  - D-01: No UPDATE policy on data_provider_api_keys — key rotation = DELETE + INSERT
  - D-02: New table (data_provider_api_keys) rather than extending ai_provider_configs — different schema requirements
metrics:
  duration: ~10 min
  completed: 2026-05-01
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 01 Plan 01: Extract SecretInput + data_provider_api_keys Migration Summary

**One-liner:** Shared masked-credential component extracted with accessibility upgrades, plus RLS-gated Supabase table for EODHD/Tiingo keys (no SELECT for browser).

---

## Files Created

| File | Purpose |
|------|---------|
| `src/components/ui/SecretInput.tsx` | Shared reusable masked input component with Eye/EyeOff toggle |
| `supabase/migrations/20260501_add_data_provider_api_keys.sql` | Creates `data_provider_api_keys` table with RLS — INSERT/DELETE only for authenticated users |

---

## SecretInput Prop Interface (for 01-02 executor reference)

```typescript
interface SecretInputProps {
  id: string;          // required — tied to htmlFor on label (accessibility)
  label: string;       // displayed uppercase, text-xs, font-semibold, slate-400
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;       // optional — renders text-xs text-slate-600 below input
  disabled?: boolean;  // adds opacity-50 and cursor-not-allowed to input
}
```

**Import path** (from `src/components/`): `import { SecretInput } from './ui/SecretInput'`

**Key implementation details:**
- `<label htmlFor={id}>` — tied to input `id` for accessibility (D-17)
- Toggle button: `type="button"` (prevents form submit), `aria-label={show ? 'Hide X' : 'Show X'}`
- Input classes: `font-mono` (API keys), `py-3`, `focus:border-emerald-500/50`
- Label class: `font-semibold` (not `font-medium` — two-weight-only typography rule)

---

## Migration: data_provider_api_keys (for 01-03 executor reference)

**Table name:** `data_provider_api_keys`

**Schema:**
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
provider_id text NOT NULL CHECK (provider_id IN ('eodhd', 'tiingo'))
user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
api_key     text NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (provider_id, user_id)
```

**RLS Policy Summary:**

| Policy | Operation | Role | Condition |
|--------|-----------|------|-----------|
| Users can insert own data provider API keys | INSERT | authenticated | `WITH CHECK (auth.uid() = user_id)` |
| Users can delete own data provider API keys | DELETE | authenticated | `USING (auth.uid() = user_id)` |
| *(none)* | SELECT | authenticated | **BLOCKED** — intentional |
| *(none)* | UPDATE | authenticated | **BLOCKED** — rotate = DELETE + INSERT |

**Service role access:** Service role bypasses RLS automatically — Edge Function (`data-provider-proxy`) reads `api_key` without a SELECT policy being required.

---

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-01-02: api_key readable by authenticated users | No SELECT policy — only service role reads keys |
| T-01-04: Plaintext credential visible in form | SecretInput masks with password field + Eye toggle |
| T-01-05: RLS disabled or misconfigured | `ENABLE ROW LEVEL SECURITY` explicit; INSERT/DELETE use `auth.uid() = user_id` |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: SecretInput component | `9095cc7` | `feat(01-01): extract SecretInput to shared component` |
| Task 2: Migration | `2f6aba3` | `feat(01-01): add data_provider_api_keys migration with RLS` |

---

## Self-Check: PASSED

- [x] `src/components/ui/SecretInput.tsx` exists
- [x] `supabase/migrations/20260501_add_data_provider_api_keys.sql` exists
- [x] Commit `9095cc7` exists
- [x] Commit `2f6aba3` exists
- [x] No TypeScript errors (tsc --noEmit --strict returned exit 0 with no SecretInput errors)
- [x] Migration has ENABLE ROW LEVEL SECURITY, INSERT policy, DELETE policy
- [x] Migration has zero SELECT policies, zero UPDATE policies
