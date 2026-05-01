---
phase: 01-settings-secrets-unification
plan: 03
subsystem: context, settings-ui, edge-functions
tags: [supabase, edge-function, secrets, boolean-flags, migration, rls]
dependency_graph:
  requires:
    - src/components/ui/SecretInput.tsx (from 01-01)
    - supabase/migrations/20260501_add_data_provider_api_keys.sql (from 01-01)
    - src/pages/Settings/DataProviders.tsx dark-theme rewrite (from 01-02)
  provides:
    - src/context/DataProviderContext.tsx (Supabase-backed, boolean key flags, save/delete API)
    - src/pages/Settings/DataProviders.tsx (wired to new context API)
    - supabase/functions/data-provider-proxy/index.ts (JWT-authenticated EODHD/Tiingo proxy)
  affects:
    - src/services/dataFetchers/fetchOHLCV.ts (01-04 must route EODHD/Tiingo calls through data-provider-proxy)
tech_stack:
  added: []
  patterns:
    - Boolean key flags (hasEodhdKey/hasTiingoKey) — raw secrets never returned to browser
    - DELETE+INSERT key rotation (no UPDATE policy on data_provider_api_keys)
    - One-shot localStorage migration on user login — upload then removeItem
    - HEAD count query for key existence check (SELECT blocked by RLS; count works without SELECT)
    - Edge Function JWT auth pattern: anon client verifies user, admin client reads secrets
    - Pre-save test path: inline apiKey passed to Edge Function action=test
key_files:
  created:
    - supabase/functions/data-provider-proxy/index.ts
  modified:
    - src/context/DataProviderContext.tsx
    - src/pages/Settings/DataProviders.tsx
decisions:
  - D-19: HEAD+count pattern used for hasEodhdKey/hasTiingoKey (no SELECT RLS policy; count works without it)
  - D-20: testConnection now accepts explicit apiKey param — enables pre-save testing without storing key first
  - D-21: Migration reads old localStorage keys on first load, uploads to Supabase, then removes from localStorage
  - D-22: saveEodhdKey calls setFetchConfig({primary_provider}) to keep non-secret config in sync on key save
metrics:
  duration: ~15 min
  completed: 2026-05-01
  tasks_completed: 3
  files_created: 1
  files_modified: 2
---

# Phase 01 Plan 03: DataProviderContext → Supabase with Boolean Key Flags Summary

**One-liner:** EODHD/Tiingo secrets migrated from localStorage to Supabase `data_provider_api_keys` via boolean flags, one-shot migration, and a JWT-authenticated Edge Function proxy — raw keys never return to the browser.

---

## New DataProviderContext Interface (for 01-04 executor reference)

```typescript
interface DataProviderContextType {
  primaryProvider: ProviderType;
  setPrimaryProvider: (provider: ProviderType) => void;

  // Boolean flags — raw keys NEVER returned to browser
  hasEodhdKey: boolean;
  hasTiingoKey: boolean;

  // Async save: deletes existing row, then inserts new (D-01: no UPDATE policy)
  saveEodhdKey: (key: string) => Promise<void>;
  saveTiingoKey: (key: string) => Promise<void>;

  // Delete key from Supabase
  deleteEodhdKey: () => Promise<void>;
  deleteTiingoKey: () => Promise<void>;

  // Non-secret localStorage prefs (unchanged)
  cacheTTLDays: number;
  setCacheTTLDays: (days: number) => void;
  enableCache: boolean;
  setEnableCache: (enabled: boolean) => void;

  // testConnection now accepts explicit key string (no longer reads context state)
  testConnection: (provider: ProviderType, apiKey: string) => Promise<boolean>;
}
```

**Import path:** `import { useDataProvider } from '../../context/DataProviderContext'`

---

## Edge Function URL Pattern (for fetchOHLCV update in 01-04)

```typescript
// Pattern used by testConnection in DataProviderContext.tsx:
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const res = await fetch(`${supabaseUrl}/functions/v1/data-provider-proxy`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    provider: 'eodhd' | 'tiingo',
    action: 'test' | 'fetch',
    // For action='test' with unsaved key:
    apiKey: '<inline-key>',
    // For action='fetch':
    symbol: 'EURUSD',
    from: '2024-01-01',   // ISO date string
    to: '2024-03-01',
    period: 'd',           // daily
  }),
});
const data = await res.json();
// action='test' response: { ok: boolean }
// action='fetch' response: { candles: unknown[] }
```

**01-04 fetchOHLCV update:** Replace direct EODHD/Tiingo HTTP calls in `fetchOHLCV.ts` with calls to `data-provider-proxy`. The session token is available via `supabase.auth.getSession()`.

---

## Files Created

| File | Purpose |
|------|---------|
| `supabase/functions/data-provider-proxy/index.ts` | JWT-authenticated proxy for EODHD/Tiingo — reads key via service role, proxies OHLCV requests |

## Files Modified

| File | Key Changes |
|------|------------|
| `src/context/DataProviderContext.tsx` | Full rewrite — localStorage secrets replaced with Supabase boolean flags, save/delete functions, one-shot migration, testConnection routes through Edge Function |
| `src/pages/Settings/DataProviders.tsx` | Wired to new context API — local state for key inputs, hasEodhdKey/hasTiingoKey for display, saveEodhdKey/saveTiingoKey in handleSave, testConnection passes local key, delete buttons added |

---

## Migration Edge Cases

**1. Old localStorage keys on first load**
- If `anjuna_eodhd_key` or `anjuna_tiingo_key` exist in localStorage on user login, the initKeys effect uploads them to Supabase then removes from localStorage.
- Failure to upload is logged as a warning but does not block the app — user can re-enter the key manually.
- This migration runs once per `user?.id` change (login). If migration fails, the old localStorage key remains and migration retries on next login.

**2. RLS + count query for key existence**
- Supabase RLS blocks SELECT for authenticated users on `data_provider_api_keys` (01-01 intentional).
- HEAD request with `{ count: 'exact', head: true }` returns the count without returning rows — this works even without a SELECT policy.
- Result: `hasEodhdKey = (eodhdResult.count ?? 0) > 0`.

**3. anjuna_eodhd_key references in DataProviderContext.tsx**
- The verification grep for `anjuna_eodhd_key` does match lines in the migration code (the `localStorage.getItem` and `localStorage.removeItem` calls).
- These are intentional — only reads/removes, no `setItem` writes. The old write API is completely absent.
- No `eodhd_api_key: string` or `tiingo_api_key: string` interface members remain.

---

## TypeScript Notes

- No TypeScript errors (`npx tsc --noEmit` exits 0).
- `user?.id` optional chain in `useEffect` dependency array is correct — `user` is `User | null` from AuthContext.
- `// eslint-disable-line react-hooks/exhaustive-deps` comment added to the migration useEffect, which intentionally uses `saveKeyToSupabase` and `refreshKeyFlags` from the render scope without listing them as dependencies (they close over `user` which is already in the dep array via `user?.id`).

---

## Verification Results

| Check | Result |
|-------|--------|
| `grep "setItem.*anjuna_eodhd_key\|eodhd_api_key.*string"` in DataProviderContext.tsx | PASS — 0 matches |
| `grep "hasEodhdKey\|hasTiingoKey"` in DataProviderContext.tsx | PASS — matches found |
| `grep "saveEodhdKey\|saveTiingoKey"` in DataProviders.tsx | PASS — matches found |
| `grep "SUPABASE_SERVICE_ROLE_KEY"` in data-provider-proxy/index.ts | PASS — match found |
| `npx tsc --noEmit` | PASS — exit 0, no errors |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: DataProviderContext.tsx | `6f9b2c6` | `feat(01-03): DataProviderContext — localStorage -> Supabase with boolean key flags` |
| Task 2: DataProviders.tsx | `16abf69` | `feat(01-03): DataProviders.tsx — wire save handlers to Supabase context API` |
| Task 3: data-provider-proxy Edge Function | `0f3889f` | `feat(01-03): data-provider-proxy Edge Function — JWT auth, service-role key read, EODHD/Tiingo proxy` |

---

## Self-Check: PASSED

- [x] `src/context/DataProviderContext.tsx` modified — hasEodhdKey/hasTiingoKey flags present, no raw key strings in interface
- [x] `src/pages/Settings/DataProviders.tsx` modified — saveEodhdKey/saveTiingoKey wired, local state for inputs
- [x] `supabase/functions/data-provider-proxy/index.ts` created — SUPABASE_SERVICE_ROLE_KEY, data_provider_api_keys, JWT auth
- [x] Commit `6f9b2c6` exists
- [x] Commit `16abf69` exists
- [x] Commit `0f3889f` exists
- [x] `npx tsc --noEmit` exits 0 — no TypeScript errors
