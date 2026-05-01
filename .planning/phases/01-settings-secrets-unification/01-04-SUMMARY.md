---
phase: 01-settings-secrets-unification
plan: 04
subsystem: data-fetchers, edge-functions
tags: [eodhd, tiingo, edge-function, jwt-auth, secrets, fetch-ohlcv]
dependency_graph:
  requires:
    - supabase/functions/data-provider-proxy/index.ts (from 01-03)
    - src/lib/supabase.ts (supabase client with auth)
  provides:
    - src/services/dataFetchers/fetchOHLCV.ts (routes eodhd/tiingo through Edge Function)
  affects:
    - Any caller of setFetchConfig (eodhd_api_key/tiingo_api_key args are now invalid)
tech_stack:
  added: []
  patterns:
    - Edge Function JWT auth pattern — supabase.auth.getSession() → Bearer token in Authorization header
    - Raw keys never reach browser — all eodhd/tiingo fetches go through data-provider-proxy
    - Fallback chain (eodhd → tiingo → synthetic) preserved — both remote providers now use same Edge Function pattern
key_files:
  created: []
  modified:
    - src/services/dataFetchers/fetchOHLCV.ts
decisions:
  - D-23: fetchViaEdgeFunction returns never[] cast to match normalizeCandles input — consistent with original fetchFromProvider pattern
  - D-24: supabase.auth.getSession() throws descriptive error when unauthenticated — not authenticated means EODHD/Tiingo cannot be reached (intentional gate)
metrics:
  duration: ~5 min
  completed: 2026-05-01
  tasks_completed: 1
  files_created: 0
  files_modified: 1
---

# Phase 01 Plan 04: fetchOHLCV — Edge Function Routing Summary

**One-liner:** EODHD and Tiingo data fetchers rerouted through data-provider-proxy Edge Function with JWT auth — raw API keys no longer exist in browser-accessible config or code paths.

---

## Task 1: Update fetchOHLCV.ts

**Commit:** `df0d1e3` — `feat(01-04): fetchOHLCV — route eodhd/tiingo through data-provider-proxy Edge Function`

**Changes made:**

| Change | Detail |
|--------|--------|
| Removed imports | `createEodhhdClient`, `createTiingoClient` |
| Added import | `supabase` from `../../lib/supabase` |
| Updated interface | `FetchOHLCVConfig` — removed `eodhd_api_key?: string` and `tiingo_api_key?: string` |
| Replaced logic | `fetchFromProvider` for eodhd/tiingo now delegates to `fetchViaEdgeFunction` |
| Added function | `fetchViaEdgeFunction` — gets session JWT, POSTs to `data-provider-proxy` with Bearer auth |
| Preserved | `synthetic` provider path, fallback chain, cache logic, `fetchAndBacktestCompare` |

---

## Verification Results

| Check | Result |
|-------|--------|
| `grep createEodhhdClient\|createTiingoClient\|eodhd_api_key.*string` in fetchOHLCV.ts | PASS — 0 matches |
| `grep setFetchConfig.*api_key` across src/ | PASS — 0 matches |
| `npx tsc --noEmit` | PASS — exit 0, zero TypeScript errors |
| `grep "data-provider-proxy"` in fetchOHLCV.ts | PASS — match found in fetchViaEdgeFunction |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — `fetchViaEdgeFunction` is fully wired to the real Edge Function endpoint. No hardcoded mock data.

---

## Checkpoint: Awaiting Human Verification (Task 2)

Task 2 is a `checkpoint:human-verify` gate. The following smoke test must be performed before Phase 01 can be marked complete.

### Steps

**1 — TypeScript build check:**
```powershell
npm run build
```
Expected: exits 0 with no errors.

**2 — Apply Supabase migration:**
```powershell
supabase db push
```
Expected: `20260501_add_data_provider_api_keys` applies without error.

```powershell
supabase db query "SELECT COUNT(*) FROM data_provider_api_keys;"
```

**3 — Visual smoke test** (run `npm run dev`, open http://localhost:5173):

**Settings page:**
- [ ] No "MT5 / Broker Connection" section
- [ ] "Dashboard / Browser" group header (Globe, emerald)
- [ ] "Python Agents (.env)" group header (Server, sky)
- [ ] Risk Management: "Save Risk Limits" button (emerald)
- [ ] Notifications: "Save Notifications" button (emerald)
- [ ] No "Save Settings" button at page bottom
- [ ] Python Agents: SERVICE_ROLE_KEY red warning box + env var table

**Backtest Data Providers:**
- [ ] 3 provider cards (EODHD, TIINGO, SYNTHETIC)
- [ ] EODHD and Tiingo inputs are masked (SecretInput)
- [ ] No light yellow/blue/gray backgrounds

**Data Feed & Broker API:**
- [ ] Alpaca API Key ID: masked (not type="text")
- [ ] Save button: emerald "Save Feed Config"

**Functionality:**
- [ ] "Save Risk Limits" → spinner → "Saved" confirmation
- [ ] "Save Notifications" → spinner → "Saved" confirmation
- [ ] Enter EODHD key → "Save Provider Settings" → saves without error
- [ ] Reload: EODHD input cleared, "Key saved — enter a new key to rotate" hint visible

---

## Self-Check

- [x] `src/services/dataFetchers/fetchOHLCV.ts` modified — `fetchViaEdgeFunction` present, no `createEodhhdClient`/`createTiingoClient`
- [x] Commit `df0d1e3` exists
- [x] `npx tsc --noEmit` exits 0 — zero TypeScript errors
- [x] No `eodhd_api_key`/`tiingo_api_key` in `FetchOHLCVConfig` interface

## Self-Check: PASSED
