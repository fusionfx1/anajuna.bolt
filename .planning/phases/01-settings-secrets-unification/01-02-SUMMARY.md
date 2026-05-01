---
phase: 01-settings-secrets-unification
plan: 02
subsystem: ui-settings
tags: [settings, dark-theme, secret-input, mt5-removal, per-section-save, group-headers]
dependency_graph:
  requires:
    - src/components/ui/SecretInput.tsx (from 01-01)
  provides:
    - src/components/Settings.tsx (MT5 removed, group headers, per-section saves, Python Agents info)
    - src/components/DataFeedConfig.tsx (emerald save, alpacaKeyId masked, shared SecretInput)
    - src/pages/Settings/DataProviders.tsx (dark-theme rewrite, provider cards, SecretInput)
  affects:
    - src/context/DataProviderContext.tsx (API used as-is; migration to Supabase in 01-03)
tech_stack:
  added: []
  patterns:
    - Per-section save button with idle→saving→saved→idle state machine
    - Group header pattern (Globe/emerald for browser, Server/sky for Python)
    - Inline confirmation state machine for destructive actions (replaces window.confirm)
    - Provider card grid with role=radio/radiogroup accessibility
key_files:
  created: []
  modified:
    - src/components/Settings.tsx
    - src/components/DataFeedConfig.tsx
    - src/pages/Settings/DataProviders.tsx
decisions:
  - D-08: Global "Save Settings" button removed; per-section saves added to Risk and Notifications
  - D-09: Entire MT5 / Broker Connection section removed from Settings.tsx
  - D-15/D-16: DataProviders.tsx fully rewritten in dark theme (slate palette, no light-theme classes)
  - D-17/D-18: Local SecretInput removed from DataFeedConfig; shared component used; alpacaKeyId masked
metrics:
  duration: ~25 min
  completed: 2026-05-01
  tasks_completed: 3
  files_created: 0
  files_modified: 3
---

# Phase 01 Plan 02: Settings UI Hardening Summary

**One-liner:** MT5 removed, group headers added, per-section save buttons wired, DataFeedConfig emerald-upgraded, DataProviders fully rewritten in dark theme with provider card grid and inline cache confirmation.

---

## Files Modified

| File | Key Changes |
|------|------------|
| `src/components/Settings.tsx` | Removed MT5/Broker Connection section entirely; replaced global Save Settings with `handleSaveRisk` + `handleSaveNotify` per-section buttons; added Dashboard/Browser (Globe, emerald) and Python Agents (Server, sky) group headers; wrapped `DataProvidersSettings` in `<Section icon={Database}>`; added Python Agents info-only section with `SERVICE_ROLE_KEY` warning (AlertTriangle red), categorized env var list, and `.env.example` link |
| `src/components/DataFeedConfig.tsx` | Removed local `SecretInput` interface and function (lines 80–111); added `import { SecretInput } from './ui/SecretInput'`; added `id` prop to all SecretInput usages; converted `alpacaKeyId` `<input type="text">` to `<SecretInput id="alpaca-key-id">`; upgraded save button from `bg-slate-700` to emerald Per-Section Save Button Spec; removed `Settings2` import; label changed to "Save Feed Config" |
| `src/pages/Settings/DataProviders.tsx` | Full rewrite — replaced light-theme radio buttons with `role="radiogroup"` provider card grid (3 cards with `role="radio"`); added no-keys amber warning; replaced plain `<input type="password">` with `<SecretInput>` for EODHD and Tiingo; added sky test connection buttons with inline result display; replaced light `bg-gray-50`/`bg-yellow-50` cache stats with dark `bg-slate-800/50`; replaced `window.confirm()` + `alert()` with 4-state machine (`idle→confirming→clearing→done`); added emerald "Save Provider Settings" button |

---

## Context API Used by DataProviders.tsx (01-03 reference)

DataProviders.tsx continues using the **existing** `DataProviderContext` API unchanged:

```typescript
// From useDataProvider() — current interface (localStorage-backed, to be migrated in 01-03)
primaryProvider: ProviderType
setPrimaryProvider: (provider: ProviderType) => void
eodhd_api_key: string
setEodhd_api_key: (key: string) => void
tiingo_api_key: string
setTiingo_api_key: (key: string) => void
cacheTTLDays: number
setCacheTTLDays: (days: number) => void
enableCache: boolean
setEnableCache: (enabled: boolean) => void
testConnection: (provider: ProviderType) => Promise<boolean>
```

The `handleSave` in DataProviders.tsx currently calls `setEodhd_api_key(eodhd_api_key)` / `setTiingo_api_key(tiingo_api_key)` as a no-op placeholder. **01-03 must wire this to Supabase writes** via `data_provider_api_keys` (created in 01-01).

---

## Verification Results

| Check | Result |
|-------|--------|
| `grep "MT5\|mt5Server\|Save Settings" Settings.tsx` | PASS — 0 matches |
| `grep "bg-emerald-500" DataFeedConfig.tsx` | PASS — save button found |
| `grep "bg-yellow-50\|bg-blue-500\|window.confirm" DataProviders.tsx` | PASS — 0 matches |
| `grep "from.*ui/SecretInput" DataFeedConfig.tsx` | PASS — import present |
| `npx tsc --noEmit` | PASS — exit 0, no errors |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `handleSave` calls `setEodhd_api_key(eodhd_api_key)` (no-op) | `DataProviders.tsx` | Real Supabase write is 01-03's responsibility — context API still localStorage-backed |

This stub does not prevent the visual goal of this plan (dark-theme rewrite). The save button shows the saved state correctly; actual persistence will be wired in 01-03.

---

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: Settings.tsx | `c08f8e8` | `feat(01-02): Settings.tsx — remove MT5, add group headers, per-section saves, Python Agents info` |
| Task 2: DataFeedConfig.tsx | `d5e23e5` | `feat(01-02): DataFeedConfig.tsx — import SecretInput, emerald save, mask alpacaKeyId` |
| Task 3: DataProviders.tsx | `154e8ea` | `feat(01-02): DataProviders.tsx — dark-theme rewrite, provider cards, SecretInput` |

---

## Self-Check: PASSED

- [x] `src/components/Settings.tsx` modified — MT5 absent, group headers present, per-section saves present
- [x] `src/components/DataFeedConfig.tsx` modified — SecretInput imported, emerald save, alpacaKeyId masked
- [x] `src/pages/Settings/DataProviders.tsx` modified — dark theme, provider cards, no light-theme classes
- [x] Commit `c08f8e8` exists
- [x] Commit `d5e23e5` exists
- [x] Commit `154e8ea` exists
- [x] `npx tsc --noEmit` exits 0 (no TypeScript errors)
- [x] All 4 grep verification checks pass
