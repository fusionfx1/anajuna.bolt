# Phase 1: Settings & Secrets Unification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in [01-CONTEXT.md](01-CONTEXT.md) — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 01-settings-secrets-unification
**Areas discussed:** Secret storage backend, Save flow, MT5 mock treatment, Browser vs Python boundary
**Areas deferred to Claude's discretion:** Theme consistency, Credential masking

---

## Gray Area Selection

User responded "แนะนำมา" (recommend) when asked which gray areas to discuss. Per the discuss-phase workflow, the agent selected the four most impactful areas (storage_backend, save_flow, mt5_mock, boundary) and treated theme + masking as Claude's discretion.

| Gray area | Description | Selected for discussion |
|-----------|-------------|--------------------------|
| Secret storage backend | Where do EODHD/Tiingo (currently localStorage) live | ✓ |
| Save flow / UX model | Per-section vs global vs auto-save | ✓ |
| MT5 mock treatment | Remove vs disable+label vs feature flag | ✓ |
| Browser vs Python boundary | How UI communicates which key feeds which runtime | ✓ |
| Theme consistency | Aligning DataProvidersSettings with dark theme | (Claude's discretion) |
| Credential masking | Standardising on shared SecretInput | (Claude's discretion) |

---

## Secret Storage Backend

| Option | Description | Selected |
|--------|-------------|----------|
| user_settings JSONB | Add EODHD/Tiingo into existing JSONB column on `user_settings` | |
| ai_provider_api_keys pattern | Mirror RLS-blocked SELECT + service-role read used for AI keys | ✓ |
| data_feed_configs extend | Add `eodhd_api_key` / `tiingo_api_key` columns to existing broker config table | |
| Claude's discretion | Decide at implementation time | |

**User's choice:** "แนะนำทุกคำถามเลย" → recommended option `ai_provider_api_keys pattern`.
**Notes:** Codebase already has [supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql](../../../supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql) with the exact security shape needed. Reusing the pattern (either by adding rows to `ai_provider_configs` or creating a parallel `data_provider_api_keys` table) keeps the security model consistent. Default to the parallel-table approach because AI provider config schema (model name, base URL) doesn't fit data providers cleanly. Locked in CONTEXT D-01 / D-02.

---

## Save Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Per-section save | Each panel has its own Save button (matches current `DataFeedConfig` model) | ✓ |
| Global save | Single page-level "Save" persists every panel | |
| Auto-save on blur | Debounced auto-save, no save button | |
| Claude's discretion | Decide at implementation time | |

**User's choice:** "แนะนำมา" → recommended option `Per-section save`.
**Notes:** Per-section is already partially in place (`DataFeedConfig.handleSave`), matches user expectation, and gives clear failure isolation per panel. Locked in CONTEXT D-05 / D-06 / D-07. Existing global "Save Settings" button at the bottom of `Settings.tsx` is renamed/removed because it currently misleads — it only persists `user_settings` despite living below `DataFeedConfig` and `DataProvidersSettings` (D-08).

---

## MT5 Mock Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Remove from Settings | Drop the entire MT5 Section since real integration is out of v1 scope | ✓ |
| Disable + label "demo only" | Keep visible but disabled with "not yet implemented" tag | |
| Feature flag | Hide by default, expose behind a flag | |

**User's choice:** "แนะนำมา" → recommended option `Remove from Settings`.
**Notes:** Real MT5 connectivity is explicitly Out of Scope in [.planning/PROJECT.md](../../PROJECT.md). Keeping mocked fields in production-readiness UI breaks the core trust loop ("the dashboard never lies about what works"). Locked in CONTEXT D-09 / D-10 / D-11. Database fields stay (no destructive migration) to preserve a path for v2 BROK-01.

---

## Browser vs Python Key Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Two top-level sections | Distinct "Dashboard / Browser" vs "Python Agents (.env)" sections | ✓ |
| Inline badges | Same layout, per-field badges saying "Browser only" / "Python .env" | |
| Single source via Supabase | Settings writes to Supabase; Python reads from Supabase instead of .env | |

**User's choice:** "แนะนำมา" → recommended option `Two top-level sections`.
**Notes:** Single-source-via-Supabase was rejected because it widens Phase 1 scope into the Python runtime and conflicts with the boundary that `SUPABASE_SERVICE_ROLE_KEY` must never live near the browser (would force the SPA to handle service-role secrets). Inline badges are weaker — easy to miss when scanning. Two distinct sections force the operator to think about each runtime explicitly. Locked in CONTEXT D-12 / D-13 / D-14. The "Python Agents" section is information-only (no inputs); content is sourced from [trading_system/.env.example](../../../trading_system/.env.example).

---

## Claude's Discretion

The following areas were deferred to Claude during planning:

- **D-15 / D-16 — Theme consistency:** [src/pages/Settings/DataProviders.tsx](../../../src/pages/Settings/DataProviders.tsx) rewrite to dark-theme primitives. No user-visible decision required — it's mechanical alignment with the existing `Section` / `Field` pattern in `Settings.tsx` and `DataFeedConfig.tsx`.
- **D-17 / D-18 — Credential masking:** Extracting `SecretInput` to a shared component and replacing the plaintext `Alpaca Key ID` input. Pure refactor; no behavior the user must opine on.

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section for future phases:

- Real MT5 integration (v2 BROK-01)
- Supabase Vault / encrypted-at-rest secrets (potential Phase 1.x)
- Edge Function for backtest data fetch (planner can split into a sub-plan or Phase 1.1)
- localStorage migration UX edge cases (planner discretion)
- `src/lib/supabase.ts` placeholder fail-fast → Phase 3 (AUTH-02)

---

*Phase: 01-settings-secrets-unification*
*Discussion log generated: 2026-05-01*
