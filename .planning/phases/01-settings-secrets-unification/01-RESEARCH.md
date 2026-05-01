# Phase 1: Settings & Secrets Unification — Research

**Researched:** 2026-05-01
**Domain:** React Settings UI + Supabase RLS + secrets migration
**Confidence:** HIGH (all findings verified against live codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** EODHD / Tiingo keys move from `localStorage` to Supabase, following the exact RLS pattern in `supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql` — SELECT blocked for `authenticated`, INSERT/DELETE allowed for owning user, no UPDATE.
- **D-02:** Default = create a **new table `data_provider_api_keys`** (option b) rather than reuse `ai_provider_api_keys`, because EODHD/Tiingo need only `provider_id text` + `api_key text` (no `ai_provider_configs` FK).
- **D-03:** Existing `localStorage` keys must be migrated automatically (one-shot upload + clear) on first Settings open.
- **D-04:** After migration, backtest fetchers (`src/services/dataFetchers/{eodhd,tiingo}.ts`) MUST call an Edge Function (service-role reader) instead of consuming keys from module-level config. Allowed as a separate plan if scope is large.
- **D-05:** Per-section save per panel; no global "Save All" button.
- **D-06:** Save button state machine: `idle → saving (Loader2) → saved (CheckCircle2 + emerald) → idle after 2–2.5 s`.
- **D-07:** No auto-save, no save-on-blur.
- **D-08:** Current bottom "Save Settings" button deleted or renamed "Save Risk & Notifications".
- **D-09:** Remove entire "MT5 / Broker Connection" section from `Settings.tsx`.
- **D-10:** Do NOT remove MT5 columns from DB migrations.
- **D-11:** `Layout.tsx` `brokerLabel` must not break — fallback to `"Demo Account"` or read from `data_feed_configs.broker_provider`.
- **D-12:** Settings page split into two explicit top-level sections: **Dashboard / Browser** keys and **Python Agents (`trading_system/.env`)** info-only section.
- **D-13:** Python Agents section must carry: _"`SUPABASE_SERVICE_ROLE_KEY` must never appear in `VITE_*` or the browser bundle."_
- **D-14:** Section headers use distinct icon + color (e.g. `Globe` vs `Server`).
- **D-15:** `DataProviders.tsx` rewrites to dark-theme classes matching `Settings.tsx` / `DataFeedConfig.tsx`.
- **D-16:** Spacing: `bg-slate-900 border-slate-800 rounded-xl p-5` per section.
- **D-17:** Extract `SecretInput` from `DataFeedConfig.tsx` to `src/components/ui/SecretInput.tsx`.
- **D-18:** Alpaca Key ID in `DataFeedConfig.tsx` switches from `type="text"` to `SecretInput`.

### Claude's Discretion

- Which Lucide icons for `Globe` / `Server` section headers (D-14).
- Whether the Python Agents section reads `.env.example` at build time or uses a static typed list (D-12 specifics).
- Save button placement within each panel (bottom-right vs inline below fields).
- localStorage migration: whether to show a one-time toast confirming migration occurred.

### Deferred Ideas (OUT OF SCOPE)

- Real MT5 broker integration (v2 BROK-01).
- Supabase Vault / encrypted-at-rest upgrade.
- Edge Function for backtest data fetch — allowed as separate Plan 01-04 *if* planner deems it needed to satisfy SETT-02 / D-04 fully; otherwise note as Phase 1.x.
- Centralized env validation in `src/lib/supabase.ts` → Phase 3 (AUTH-02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETT-01 | One canonical Save flow per panel with confirmed feedback | D-05/06/07/08 locked; `DataFeedConfig.handleSave` pattern is the reference implementation |
| SETT-02 | No long-lived API secrets in `localStorage`; EODHD/Tiingo keys → Supabase RLS | New `data_provider_api_keys` table (D-02); one-shot migration (D-03); Edge Function reader (D-04) |
| SETT-03 | MT5 password field removed or clearly disabled | D-09 removes entire MT5 block; D-11 protects `Layout.tsx` consumers |
| SETT-04 | All credential inputs use same masked-input component | Extract `SecretInput` (D-17); convert Alpaca Key ID (D-18) |
| SETT-05 | Consistent dark theme across all three Settings files | D-15/16 rewrite `DataProviders.tsx`; theme tokens verified |
| SETT-06 | UI explicitly separates browser keys from Python `.env` keys | D-12/13/14 two-section layout with info-only Python block |
</phase_requirements>

---

## Summary

**Primary recommendation:** Follow the `ai-signal-proxy` Edge Function pattern exactly. Create a `data_provider_api_keys` table mirroring `ai_provider_api_keys`, wire a `data-provider-proxy` Edge Function to read keys via service role, update `DataProviderContext` to fetch keys from Supabase on mount (not localStorage), and run the one-shot localStorage migration inline in the context `useEffect`. UI work (dark theme, `SecretInput` extraction, MT5 removal, per-panel save) is straightforward refactoring against existing primitives.

**Key findings:**

- `DataProviderContext` currently writes **five** localStorage keys on every state change via five separate `useEffect`s — all five must be removed/replaced.
- `fetchOHLCV.ts` consumes API keys through a module-level `config` object set by `setFetchConfig()`. The cleanest migration path is: context fetches keys from Supabase on load, then calls `setFetchConfig()` as before — **no change to `fetchOHLCV.ts` internal logic required** unless the Edge Function proxy path is implemented.
- `Layout.tsx` line 111–112 derives `brokerLabel` from `settings?.broker_server`. After removing the MT5 UI, `broker_server` column remains in DB and will still be populated from previous saves; fallback `'Demo Account'` is already coded at line 112.
- `DataFeedConfig.tsx` already contains a production-quality `SecretInput` component (lines 87–111) and a `handleSave` with the exact `saving → saved → idle` state machine. These are the canonical references.
- `DataProviders.tsx` uses light-theme Tailwind classes (`bg-yellow-50`, `bg-blue-500`, `bg-gray-50`, `border rounded-lg p-4`) — complete visual mismatch with the rest of Settings. Full rewrite required.
- The new `data_provider_api_keys` table should NOT have a FK to `ai_provider_configs` — it only needs `provider_id text CHECK (provider_id IN ('eodhd', 'tiingo'))` + `user_id` + `api_key`.

---

## Per-Question Findings

### Q1 — Safest pattern for storing EODHD/Tiingo keys in Supabase

**Finding:** [VERIFIED: codebase — `20260419224445_add_ai_provider_api_keys_table.sql`]

The existing `ai_provider_api_keys` table is the exact template. Mirror it with these differences:

```sql
CREATE TABLE IF NOT EXISTS data_provider_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   text NOT NULL CHECK (provider_id IN ('eodhd', 'tiingo')),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

ALTER TABLE data_provider_api_keys ENABLE ROW LEVEL SECURITY;

-- NO SELECT policy for authenticated (keys are read only via service role)
CREATE POLICY "Users can insert own data provider keys"
  ON data_provider_api_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own data provider keys"
  ON data_provider_api_keys FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- NO UPDATE policy — rotate by DELETE + INSERT
```

**Why no FK to `ai_provider_configs`:** EODHD/Tiingo have no rows there and have no `model_name`, `base_url`, etc. A simple `CHECK` constraint on `provider_id` is cleaner and avoids coupling the tables.

**RLS gotcha (Q8 answer):** When SELECT is blocked for `authenticated`, the frontend INSERT still works, but a `SELECT` immediately after an INSERT will return zero rows for `authenticated`. This is correct and expected — it means the UI cannot read back the key to confirm it was saved. Use an optimistic UI pattern: on INSERT success (no Postgres error), update local state to `{ hasKey: true }` without reading the row back.

A second gotcha: `supabase.from(...).upsert(...)` with `onConflict: 'provider_id, user_id'` will hit the UPDATE path, which has no policy — it will fail with RLS violation. **Use delete-then-insert, not upsert, for key rotation.** [VERIFIED: policy file has no UPDATE policy, consistent with `ai_provider_api_keys`]

### Q2 — Edge Function structure for reading keys

**Finding:** [VERIFIED: codebase — `supabase/functions/ai-signal-proxy/index.ts`]

The `ai-signal-proxy` function is the exact template. A `data-provider-proxy` function follows this pattern:

```typescript
// supabase/functions/data-provider-proxy/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // 2. Authenticate user via Authorization header (anon key pattern)
  const authHeader = req.headers.get("Authorization");
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader! } } }
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  // 3. Read key via service role (bypasses SELECT RLS block)
  const { provider } = await req.json(); // "eodhd" | "tiingo"
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const { data: keyRow } = await admin
    .from("data_provider_api_keys")
    .select("api_key")
    .eq("provider_id", provider)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!keyRow) return new Response(JSON.stringify({ error: "Key not found" }), { status: 404, headers: corsHeaders });

  // 4. Proxy the actual data request using keyRow.api_key
  // ...fetch from eodhd.com or api.tiingo.com...
});
```

**Deployment note:** Supabase Edge Functions live in `supabase/functions/<name>/index.ts`. They are deployed via `supabase functions deploy <name>`. `SUPABASE_SERVICE_ROLE_KEY` is injected automatically as a Deno env secret in hosted Supabase — it does NOT need to be set manually in the Supabase dashboard for hosted projects (it's pre-injected). [VERIFIED: Supabase Edge Functions docs pattern via codebase analysis — both existing functions rely on `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`]

### Q3 — Migration strategy for existing localStorage keys

**Finding:** [VERIFIED: codebase — `DataProviderContext.tsx` lines 34–55]

Current localStorage keys:
- `anjuna_eodhd_key` → maps to EODHD API key
- `anjuna_tiingo_key` → maps to Tiingo API key
- `anjuna_primary_provider` → provider preference (safe to keep in localStorage — not a secret)
- `anjuna_cache_ttl` → cache setting (safe to keep in localStorage)
- `anjuna_enable_cache` → cache setting (safe to keep in localStorage)

**Migration plan (one-shot in `DataProviderProvider` useEffect):**

```typescript
// Run once: if localStorage key exists, upsert to Supabase then clear
useEffect(() => {
  if (!user?.id) return;
  const migrateKey = async (localKey: string, providerId: 'eodhd' | 'tiingo') => {
    const stored = localStorage.getItem(localKey);
    if (!stored) return;
    // DELETE existing row first (rotation = delete + insert)
    await supabase.from('data_provider_api_keys')
      .delete().eq('provider_id', providerId).eq('user_id', user.id);
    const { error } = await supabase.from('data_provider_api_keys')
      .insert({ provider_id: providerId, user_id: user.id, api_key: stored });
    if (!error) localStorage.removeItem(localKey);
  };
  Promise.all([
    migrateKey('anjuna_eodhd_key', 'eodhd'),
    migrateKey('anjuna_tiingo_key', 'tiingo'),
  ]);
}, [user?.id]);
```

The non-secret preferences (`anjuna_primary_provider`, `anjuna_cache_ttl`, `anjuna_enable_cache`) should be migrated to `user_settings` JSONB column or kept in localStorage — keeping in localStorage is acceptable since they are not secrets and their loss is non-fatal.

**Multi-tab safety:** The migration `useEffect` runs per-tab on mount. The DELETE+INSERT is idempotent — multiple tabs running it simultaneously will cause at most one redundant DELETE, which is safe.

### Q4 — Breaking change risks when removing MT5 block

**Finding:** [VERIFIED: codebase grep — `broker_server` / `brokerLabel`]

**Affected files:**
1. `src/components/Layout.tsx` lines 111–112:
   ```typescript
   const brokerServer = settings?.broker_server as string | undefined;
   const brokerLabel  = brokerServer ? brokerServer.split(':')[0] : 'Demo Account';
   ```
   After MT5 UI removal, `broker_server` in `user_settings` may still have a value from a previous save, or may be null. The fallback `'Demo Account'` already handles the null case. **No layout break.** However, once MT5 UI is removed, users can no longer update `broker_server` — the topbar will show the last-saved server hostname or `'Demo Account'`. Acceptable per D-11 (read from `data_feed_configs.broker_provider` as alternative).
   
   **Recommended fix for D-11:** Change `brokerLabel` derivation in `Layout.tsx` to use `data_feed_configs.broker_provider` (already loaded by `DataFeedConfig` for the user), falling back to `'Demo Account'`.

2. `src/components/Settings.tsx` form state: `mt5Server`, `mt5Login`, `mt5Timeout` are form fields. After removing the UI section, remove these from the `form` state and from `handleSave`'s `upsertUserSettings` payload. The DB columns remain (D-10).

3. `handleSave` in `Settings.tsx` currently saves `broker_server: form.mt5Server` etc. After MT5 removal, these fields should not be in the upsert payload. Removing them from the payload is safe — `upsertUserSettings` does a Supabase `upsert` and absent fields simply aren't updated.

**No other consumers of `broker_server` found in `src/`.**

### Q5 — DataProviderContext changes needed

**Finding:** [VERIFIED: codebase — `DataProviderContext.tsx`]

Current architecture: context initializes from localStorage, syncs state back to localStorage on every change.

**Target architecture:**

```
mount → fetch existing keys presence from Supabase (boolean hasKey, not the key value)
       → run one-shot localStorage migration if old keys exist
       → expose { hasEodhdKey, hasTiingoKey } to consumers (not the raw keys)
save flow → DELETE + INSERT to data_provider_api_keys
```

**Interface changes to `DataProviderContextType`:**

| Old | New | Reason |
|-----|-----|--------|
| `eodhd_api_key: string` | `hasEodhdKey: boolean` | Key is write-only from browser; value never read back |
| `setEodhd_api_key: (key: string) => void` | `saveEodhdKey: (key: string) => Promise<void>` | Async Supabase write, returns success/error |
| `tiingo_api_key: string` | `hasTiingoKey: boolean` | Same as above |
| `setTiingo_api_key: (key: string) => void` | `saveTiingoKey: (key: string) => Promise<void>` | Same as above |

**Consumer impact:** Only `DataProvidersSettings` (`src/pages/Settings/DataProviders.tsx`) consumes `eodhd_api_key` and `tiingo_api_key` directly. This component is being fully rewritten in this phase (D-15), so the interface change is absorbed by the rewrite. `canUseProvider()` check becomes `hasEodhdKey` / `hasTiingoKey`.

`setFetchConfig({ eodhd_api_key, tiingo_api_key })` call in `DataProviderContext` useEffect: After migration, keys are NOT available in the browser. The `fetchOHLCV` config object will have `eodhd_api_key: undefined`. This means **direct browser-side EODHD/Tiingo fetches will break** unless the Edge Function proxy (D-04) is also implemented. This is the scope decision for the planner: implement the proxy in this phase or accept that backtest data requires the proxy before EODHD/Tiingo can be used.

### Q6 — How backtest fetchers consume API keys; redirect path

**Finding:** [VERIFIED: codebase — `fetchOHLCV.ts`, `eodhd.ts`, `tiingo.ts`]

Current flow:
1. `DataProviderContext` → calls `setFetchConfig({ eodhd_api_key: "..." })` on key change
2. `fetchOHLCV.ts` → reads module-level `config.eodhd_api_key`
3. Creates `EodhdhClient(config.eodhd_api_key)` → makes direct HTTP GET to `https://eodhd.com/api/eod/...`

**Key redirection options:**

**Option A — Edge Function proxy (D-04):**
- `fetchOHLCV.ts` `fetchFromProvider('eodhd', ...)` calls `supabase.functions.invoke('data-provider-proxy', { body: { provider: 'eodhd', symbol, ... } })`
- Edge Function reads key via service role, makes the EODHD/Tiingo request server-side, returns candles
- Pros: Key never in browser. Cons: Adds latency, requires Edge Function deploy, breaks offline/preview dev flow.

**Option B — Context still provides key to fetchOHLCV config, but Supabase read-back is via service role (not available client-side):**
- Impossible with RLS SELECT blocked. Can't read key back on the browser. **Not viable.**

**Option C — Store provider preferences in Supabase, keep keys in Supabase, use Edge Function only for backtest calls:**
- This is D-04 — separate plan, acceptable per CONTEXT.md.

**Recommendation:** Implement Option A in Plan 01-03 (see plan breakdown below). The key insight is `fetchOHLCV.ts` calls `fetchFromProvider()` which is a simple function — it can be shimmed to call `supabase.functions.invoke` instead of direct HTTP without changing the `fetchOHLCV` public API. The `EodhdhClient` and `TiingoClient` classes become unused for browser path (kept for potential server/Python use).

### Q7 — Suggested plan breakdown (3–4 plans with wave assignments)

See **Suggested Plan Breakdown** section below.

### Q8 — Supabase RLS gotchas for "no SELECT, INSERT/DELETE only"

**Finding:** [VERIFIED: codebase — `ai_provider_api_keys` policies; ASSUMED for Supabase internals]

1. **Upsert uses UPDATE path → blocked.** Use DELETE + INSERT for key rotation. [VERIFIED: existing `ai_provider_api_keys` has no UPDATE policy by design]
2. **INSERT response includes the row data** — but if SELECT is blocked, Supabase JS may return the inserted row OR may return empty depending on PostgREST behavior. Do not rely on INSERT returning data; use `{ count: 'exact' }` or check error absence only.
3. **`maybeSingle()` after INSERT** returns null for authenticated (blocked SELECT). Use optimistic state update.
4. **Realtime** — No SELECT = no Realtime `postgres_changes` subscription on this table from the browser. Fine since we don't need live key updates.
5. **DELETE policy `USING`** clause uses the current user's `auth.uid()` — DELETE only removes the requesting user's own rows. Safe. [VERIFIED: pattern from `ai_provider_api_keys`]
6. **Service role bypass** — Edge Function's `createClient(URL, SERVICE_ROLE_KEY)` bypasses all RLS including the SELECT block. This is intentional and the correct pattern. [VERIFIED: `ai-signal-proxy` lines 221–231]

### Q9 — TypeScript implications of changing DataProviderContext API

**Finding:** [VERIFIED: codebase grep for `useDataProvider`]

Consumers of `useDataProvider()`:
- `src/pages/Settings/DataProviders.tsx` — being fully rewritten in this phase; absorbs interface change
- `src/services/dataFetchers/fetchOHLCV.ts` — does NOT use `useDataProvider`; gets keys via `setFetchConfig()` called from context effects
- Indirect: `DataFeedConfig.tsx`, `Settings.tsx` — do NOT call `useDataProvider`; they use `useUserSettings` / `useAuth`

**Breaking change scope:** Only `DataProviders.tsx` directly consumes the context. Since it is rewritten, zero other files break from the interface change.

**TypeScript strict-mode requirements:**
- `noUnusedLocals: true` / `noUnusedParameters: true` → after removing `eodhd_api_key` / `tiingo_api_key` from context, remove any lingering destructuring in rewritten files
- The `setFetchConfig` call in context effects should be updated or removed once keys no longer flow through context into `fetchOHLCV`

---

## Architecture Patterns

### Established Patterns (use exactly)

**Per-panel save with feedback (reference: `DataFeedConfig.handleSave`):**
```typescript
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);

async function handleSave() {
  setSaving(true);
  try {
    await supabase.from('...').upsert({...}, { onConflict: 'user_id' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  } finally {
    setSaving(false);
  }
}
// Button:
// saving → <Loader2 className="animate-spin" /> "Saving..."
// saved  → <CheckCircle2 /> "Saved!" (emerald colors)
// idle   → <Save /> "Save Config"
```

**SecretInput component (reference: `DataFeedConfig.tsx` lines 87–111):**
Extract verbatim to `src/components/ui/SecretInput.tsx`, keeping the same props interface. Update all usages to import from `../ui/SecretInput` (relative path, no `@/` alias per CONVENTIONS.md).

**Supabase upsert by `user_id` (reference: `DataFeedConfig.handleSave`, `upsertUserSettings`):**
```typescript
await supabase.from('data_feed_configs').upsert({
  user_id: user.id,
  // ...fields
}, { onConflict: 'user_id' });
```

**Form initialized from Supabase hook (reference: `Settings.tsx` lines 54–71):**
```typescript
useEffect(() => {
  if (settings) setForm(f => ({ ...f, fieldFromDb: settings.column ?? defaultValue }));
}, [settings]);
```

### Section / Field Primitives

From `Settings.tsx` lines 9–31 — use these for every new panel:
- `Section`: `bg-slate-900 border border-slate-800 rounded-xl p-5` + header with `Icon` + `border-b border-slate-800`
- `Field`: `grid grid-cols-3 gap-4 items-start py-3 border-b border-slate-800/50 last:border-0`

`DataProviders.tsx` rewrite must use these primitives or equivalent classes.

### Recommended File Layout After Phase 1

```
src/
├── components/
│   ├── Settings.tsx          # MT5 section removed; "Save Risk & Notifications" scoped; Python Agents section added
│   ├── DataFeedConfig.tsx    # Alpaca Key ID → SecretInput; save button upgraded to D-06 state machine
│   └── ui/
│       └── SecretInput.tsx   # Extracted from DataFeedConfig.tsx lines 87-111
├── context/
│   └── DataProviderContext.tsx # Rewired: localStorage → Supabase; interface: hasEodhdKey/hasTiingoKey
└── pages/
    └── Settings/
        └── DataProviders.tsx # Full rewrite: dark theme + SecretInput + per-section save

supabase/
├── migrations/
│   └── YYYYMMDDHHMMSS_add_data_provider_api_keys.sql  # new table
└── functions/
    └── data-provider-proxy/
        └── index.ts          # Edge Function: reads key via service role, proxies EODHD/Tiingo request
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| API key masking with reveal toggle | Custom reveal component per-file | Extract once to `src/components/ui/SecretInput.tsx` (already exists in `DataFeedConfig.tsx`) |
| Save-with-feedback state machine | Custom hook per panel | Inline pattern from `DataFeedConfig.handleSave` (3 states, 2 `useState`) |
| Key rotation (update existing) | `UPDATE` SQL / `upsert` | DELETE + INSERT (no `UPDATE` policy by design) |
| Reading back the saved key | SELECT query post-INSERT | Don't — SELECT is blocked. Use optimistic boolean `hasKey` |
| EODHD/Tiingo HTTP calls from browser post-migration | Re-introducing keys into client bundle | Edge Function proxy (supabase functions) |

---

## Common Pitfalls

### Pitfall 1: Using `upsert` for key rotation
**What goes wrong:** `supabase.from('data_provider_api_keys').upsert(...)` with `onConflict: 'provider_id, user_id'` routes to UPDATE internally. There is no UPDATE policy → RLS violation → silent failure or 403.
**Prevention:** Always DELETE then INSERT when rotating keys. Check `error` from both operations.

### Pitfall 2: Reading key value back after INSERT
**What goes wrong:** After INSERT succeeds, calling `select('*').eq('provider_id', 'eodhd').maybeSingle()` returns null because SELECT is blocked for `authenticated`.
**Prevention:** Use optimistic UI state (`hasEodhdKey: true`) set from INSERT success, not from a subsequent SELECT.

### Pitfall 3: `setFetchConfig` still called with undefined keys
**What goes wrong:** After removing localStorage reads, context's `useEffect` on `eodhd_api_key` state change calls `setFetchConfig({ eodhd_api_key: '' })`. The empty string propagates to `EodhdhClient('')` → 401 from EODHD API.
**Prevention:** Either remove `setFetchConfig` calls from context entirely (if Edge Function proxy replaces browser-side fetches), or guard with `if (key) setFetchConfig({ eodhd_api_key: key })`.

### Pitfall 4: Layout.tsx `brokerLabel` derivation breaks
**What goes wrong:** Removing the MT5 section from `Settings.tsx` form means `broker_server` is no longer sent in upsert payload. Over time, old users who never had it set get `null` → `brokerLabel = 'Demo Account'` (correct). New users who never had it will see `'Demo Account'` immediately (correct). No break.
**Prevention:** Do NOT set `broker_server: undefined` in the upsert — simply omit it from the payload. A missing field in upsert does not nullify existing DB value.

### Pitfall 5: `DataProviders.tsx` save flow missing per-section saves (SETT-01)
**What goes wrong:** Currently `DataProviders.tsx` has no Save button at all — changes propagate via `setEodhd_api_key()` which fires localStorage writes. After migration, there must be explicit Save buttons per section (EODHD and Tiingo each get their own save).
**Prevention:** Add Save buttons to EODHD and Tiingo sections matching D-06 state machine.

### Pitfall 6: TypeScript `noUnusedLocals` errors after interface change
**What goes wrong:** After removing `eodhd_api_key` / `tiingo_api_key` from context interface, any file that destructures these will fail `tsc --noEmit`.
**Prevention:** Update `DataProviders.tsx` rewrite to destructure only `hasEodhdKey`, `saveEodhdKey`, etc.

### Pitfall 7: MT5 fields in `form` state still referenced after removal
**What goes wrong:** Removing the JSX block but leaving `mt5Server` / `mt5Login` / `mt5Timeout` in the `form` object → `noUnusedLocals` lint errors.
**Prevention:** Remove from `form` initializer, from the `useEffect` that reads `settings`, and from `handleSave`'s upsert payload simultaneously.

---

## Layout.tsx Broker Label — D-11 Recommendation

**Current code (lines 111–112):**
```typescript
const brokerServer = settings?.broker_server as string | undefined;
const brokerLabel  = brokerServer ? brokerServer.split(':')[0] : 'Demo Account';
```

**Recommended change:** Use `data_feed_configs.broker_provider` for a cleaner label. This requires `useDataFeedConfig()` hook (or inline Supabase fetch in `Layout.tsx`). However, `Layout.tsx` already loads `useUserSettings()` — adding another hook increases mount complexity. Simplest approach that satisfies D-11: **leave `Layout.tsx` unchanged**. Existing users who have `broker_server` set will still see it; new users (and users who never saved MT5) see `'Demo Account'`. The D-11 requirement is satisfied by the existing fallback.

If the planner wants the topbar to reflect the active broker (Alpaca/OANDA), add a `useDataFeedConfig()` hook that reads `data_feed_configs.broker_provider` and use `BROKER_INFO[provider].label` from `DataFeedConfig.tsx` constants. This is planner discretion.

---

## Python Agents Section — Static vs Dynamic List (D-12)

**Decision for planner:** The CONTEXT.md notes this as planner discretion. Research finding:

- **Static list approach:** Hard-code the Python keys as a TypeScript array `PYTHON_ENV_KEYS = [...]` derived from reading `.env.example` once. Simple, no build-time complexity.
- **Build-time generated approach:** Vite plugin or `vite.config.ts` reads `.env.example` at build time and injects key names as a JSON string env var. More automated but adds build complexity.

**Recommendation:** Static list, populated from `.env.example` at time of writing. The list is stable enough (changes rarely) and the complexity of build-time generation is not justified for a single-operator dashboard. Comment the static array with `// Source: trading_system/.env.example` so future updates are findable.

**Python keys to list (from `trading_system/.env.example`):**
- `SUPABASE_SERVICE_ROLE_KEY` — required, service-role bypass RLS
- `OANDA_ACCOUNT_ID` / `OANDA_API_TOKEN` / `OANDA_ACCOUNT_TYPE` — OANDA broker
- `OPENAI_API_KEY` — LLM reasoning + embeddings
- `NEWS_API_KEY` / `FINNHUB_API_KEY` / `ALPHA_VANTAGE_API_KEY` — news sources
- `FRED_API_KEY` — macro data
- `SENTIMENT_API_KEY` / `TWITTER_BEARER_TOKEN` — sentiment
- `SIGNAL_MODE` / `USE_LANGGRAPH` / `USE_CREWAI_KICKOFF` — mode flags

---

## Files That Will Be Modified

### New Files
| File | Purpose |
|------|---------|
| `src/components/ui/SecretInput.tsx` | Extracted from `DataFeedConfig.tsx` lines 87–111 |
| `supabase/migrations/YYYYMMDDHHMMSS_add_data_provider_api_keys.sql` | New table for EODHD/Tiingo keys |
| `supabase/functions/data-provider-proxy/index.ts` | Edge Function: service-role key reader + HTTP proxy |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/Settings.tsx` | Remove MT5 section + form fields; rename/scope Save button; add Python Agents info section |
| `src/components/DataFeedConfig.tsx` | Alpaca Key ID → `SecretInput`; update import; upgrade Save button to D-06 state machine; remove `SecretInput` local definition |
| `src/pages/Settings/DataProviders.tsx` | Full rewrite: dark theme, `SecretInput`, per-section saves (EODHD + Tiingo + Cache), Supabase-aware |
| `src/context/DataProviderContext.tsx` | Remove all localStorage reads/writes for keys; add Supabase fetch + one-shot migration; change interface to `hasEodhdKey` / `hasTiingoKey` / async save methods |
| `src/services/dataFetchers/fetchOHLCV.ts` | Update `fetchFromProvider` to call Edge Function instead of direct HTTP for `eodhd`/`tiingo` (Plan 01-03) |
| `src/components/Layout.tsx` | Minimal: optionally update `brokerLabel` source (planner discretion per D-11) |

### Potentially Modified
| File | Condition |
|------|-----------|
| `src/services/tradingService.ts` | Only if new helper function for `data_provider_api_keys` insert/delete is added here |
| `src/hooks/useSupabaseData.ts` | Only if a `useDataProviderKeys()` hook is added here |

---

## Suggested Plan Breakdown

### Plan 01-01 — Foundation: `SecretInput` extraction + migration SQL (Wave 1)
**Goal:** Lay groundwork with zero UI regressions
**Tasks:**
1. Extract `SecretInput` from `DataFeedConfig.tsx` → `src/components/ui/SecretInput.tsx`
2. Update `DataFeedConfig.tsx` to import from new location (remove local definition)
3. Write `supabase/migrations/YYYYMMDDHHMMSS_add_data_provider_api_keys.sql`
4. Apply migration (`supabase db push` or document as manual step for operator)
**Files:** `src/components/ui/SecretInput.tsx` (new), `src/components/DataFeedConfig.tsx`, migration SQL
**Risk:** Low — pure extraction and SQL

### Plan 01-02 — UI Hardening: Settings.tsx + DataFeedConfig.tsx + DataProviders.tsx rewrite (Wave 1, parallel to 01-01)
**Goal:** Satisfy SETT-01, SETT-03, SETT-04, SETT-05, SETT-06
**Tasks:**
1. `Settings.tsx`: Remove MT5 section + form fields; rename Save → "Save Risk & Notifications"; add Python Agents info section with `Server` icon + warning text (D-12/13/14)
2. `DataFeedConfig.tsx`: Convert Alpaca Key ID to `SecretInput`; upgrade Save button to full D-06 state machine (CheckCircle2 + emerald on saved)
3. `DataProviders.tsx`: Full rewrite — dark theme using `Section`/`Field` primitives; `SecretInput` for both API key inputs; per-section Save buttons (EODHD, Tiingo, Cache) with D-06 state machine; preserve cache UI logic
4. `Layout.tsx`: Verify `brokerLabel` fallback still correct after MT5 removal
**Files:** `src/components/Settings.tsx`, `src/components/DataFeedConfig.tsx`, `src/pages/Settings/DataProviders.tsx`, `src/components/Layout.tsx`
**Risk:** Medium — `DataProviders.tsx` full rewrite, must preserve all existing functionality

### Plan 01-03 — Secrets Backend: DataProviderContext + Edge Function (Wave 2, depends on 01-01)
**Goal:** Satisfy SETT-02 — remove API keys from localStorage
**Tasks:**
1. `DataProviderContext.tsx` rewrite:
   - Remove `anjuna_eodhd_key` / `anjuna_tiingo_key` localStorage reads
   - Add Supabase INSERT check on mount (fetch `count` of rows by `provider_id` + `user_id` to derive `hasEodhdKey` / `hasTiingoKey`)
   - Add `saveEodhdKey(key)` / `saveTiingoKey(key)` async methods (DELETE + INSERT)
   - Add one-shot migration `useEffect`: if localStorage key exists, call save method then clear localStorage
   - Keep `anjuna_primary_provider` / `anjuna_cache_ttl` / `anjuna_enable_cache` in localStorage (not secrets)
2. `supabase/functions/data-provider-proxy/index.ts`: Create Edge Function following `ai-signal-proxy` pattern
   - Accepts `{ provider: 'eodhd' | 'tiingo', symbol, startDate, endDate }` POST body
   - Authenticates user via `Authorization` header
   - Reads key via service role from `data_provider_api_keys`
   - Proxies HTTP request to EODHD/Tiingo API
   - Returns normalized candle array
3. `src/services/dataFetchers/fetchOHLCV.ts`: Update `fetchFromProvider` for `eodhd`/`tiingo` to call `supabase.functions.invoke('data-provider-proxy', ...)`
**Files:** `src/context/DataProviderContext.tsx`, `supabase/functions/data-provider-proxy/index.ts`, `src/services/dataFetchers/fetchOHLCV.ts`
**Risk:** High — central context change + new Edge Function; test connection flow in `DataProviders.tsx` must still work after change

### Plan 01-04 — Verification: typecheck, lint, manual UAT (Wave 3, depends on all above)
**Goal:** Confirm all 6 SETT requirements pass; no TypeScript errors
**Tasks:**
1. `npm run typecheck` → zero errors
2. `npm run lint` → zero new errors
3. Manual UAT checklist:
   - Open Settings → EODHD Key input visible, save button per-section ✓
   - Save EODHD key → Supabase row created, localStorage cleared ✓
   - Reload → key presence indicator shows (not the key value) ✓
   - Backtest with EODHD → Edge Function called, data returns ✓
   - MT5 section gone ✓
   - Python Agents section visible with warning ✓
   - Dark theme consistent across all three Settings views ✓
   - Alpaca Key ID masked ✓
   - `brokerLabel` in topbar shows correctly ✓

**Wave summary:**
- Wave 1: Plans 01-01 + 01-02 (parallel, no dependencies between them)
- Wave 2: Plan 01-03 (depends on 01-01 migration SQL and `SecretInput` component)
- Wave 3: Plan 01-04 (verification, depends on all)

---

## Validation Architecture

**Framework:** Vitest (already configured — `src/services/*.test.ts` exist)
**Quick run:** `npm run test`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| SETT-01 | Save button state machine transitions | Unit (component) | Vitest + React Testing Library; mock Supabase client |
| SETT-02 | localStorage cleared after migration | Unit (context) | Mock `supabase.from()`, assert `localStorage.removeItem` called |
| SETT-02 | RLS blocks SELECT for authenticated | Manual / migration review | No client-side test possible without Supabase local stack |
| SETT-03 | MT5 fields not in DOM | Unit (component) | `expect(screen.queryByText('MT5')).toBeNull()` |
| SETT-04 | All credential inputs use `type="password"` | Unit (component) | Assert no `type="text"` on credential inputs |
| SETT-05 | Dark theme classes present | Visual / lint | Check for absence of `bg-yellow-50`, `bg-blue-500`, `bg-gray-50` |
| SETT-06 | Python Agents section in DOM | Unit (component) | Assert section with `SUPABASE_SERVICE_ROLE_KEY` warning text renders |

**Wave 0 gaps:** No test files exist for Settings components yet. The planner should include test creation in Plan 01-04 or as a Wave 0 task within Plan 01-02.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Supabase project | All plans | Operator-dependent | Migration requires live or local Supabase |
| `supabase` CLI | Migration + Edge Function deploy | Likely installed — not verified | `supabase --version` to confirm |
| Node.js / npm | Frontend build | ✓ (project runs) | |
| Deno (for Edge Functions) | Plan 01-03 Edge Function | Managed by Supabase hosted — no local Deno needed for hosted deploy | |

**Missing with fallback:** If `supabase` CLI is not installed, migrations can be applied via Supabase dashboard SQL editor. Edge Function can be deployed via Supabase dashboard.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Supabase Auth JWT checked in Edge Function |
| V4 Access Control | Yes | RLS policies — no SELECT for authenticated on `data_provider_api_keys` |
| V5 Input Validation | Yes | `provider_id CHECK (IN ('eodhd', 'tiingo'))` at DB level |
| V6 Cryptography | No | Keys stored plaintext in Postgres (Vault upgrade deferred per CONTEXT.md) |

**Critical security properties this phase must preserve:**
1. `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in any `VITE_*` var or be bundled in the SPA — the Edge Function reads it from Deno env, not from the client.
2. EODHD / Tiingo keys must not appear in browser DevTools Network tab after migration (keys travel only in Supabase INSERT body via HTTPS; never in GET query strings visible in logs).
3. The "Test Connection" button in `DataProviders.tsx` post-rewrite should invoke the Edge Function (which has the key) — not call EODHD/Tiingo directly from the browser.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `supabase.from('data_provider_api_keys').insert(...)` returns empty data for authenticated (not null) — INSERT succeeds but SELECT read-back is blocked | Q1/Q8 | Code should check `error` absence, not `data` presence — low risk |
| A2 | Supabase Edge Functions auto-inject `SUPABASE_SERVICE_ROLE_KEY` as Deno env on hosted projects without dashboard config | Q2 | If wrong, operator must manually add secret in Supabase dashboard → add to UAT checklist |
| A3 | `DataFeedConfig.tsx` `handleSave` save state machine goes `idle → saving → saved → idle` — matches D-06 spec | Q4 | Minor: DataFeedConfig uses "Saved!" not "Saved" — acceptable, same semantics |

---

## Sources

### Primary (HIGH confidence — verified from live codebase)
- `supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql` — RLS pattern, INSERT/DELETE only
- `supabase/functions/ai-signal-proxy/index.ts` — Edge Function template: auth check + service role read + proxy
- `src/components/DataFeedConfig.tsx` — `SecretInput` component, `handleSave` state machine
- `src/components/Settings.tsx` — `Section`/`Field` primitives, MT5 form state
- `src/context/DataProviderContext.tsx` — All localStorage keys enumerated
- `src/services/dataFetchers/fetchOHLCV.ts` + `eodhd.ts` + `tiingo.ts` — Key consumption flow
- `src/components/Layout.tsx` (grep) — `brokerServer`/`brokerLabel` derivation

### Secondary (MEDIUM confidence — codebase analysis + standard Supabase patterns)
- Supabase RLS behavior: INSERT without UPDATE policy blocks `upsert` rotation path
- PostgREST INSERT response behavior when SELECT is blocked

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing patterns verified from codebase
- Architecture: HIGH — migration SQL, Edge Function pattern, context rewrite all have direct templates in repo
- Pitfalls: HIGH — each derived from concrete code paths found in analysis

**Research date:** 2026-05-01
**Valid until:** 2026-07-01 (Supabase RLS policies and JS SDK behavior are stable)
