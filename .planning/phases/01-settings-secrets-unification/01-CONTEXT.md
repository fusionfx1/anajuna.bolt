# Phase 1: Settings & Secrets Unification - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

ทุก credential ที่ operator ตั้งค่าผ่าน Settings UI ต้องมี:
1. **จุดเก็บที่ไว้ใจได้จุดเดียวต่อหนึ่งประเภท secret** (no `localStorage` for long-lived API keys)
2. **ปุ่ม Save ที่คาดเดาได้** ต่อ panel (ไม่มี side-effect แอบบันทึกขณะพิมพ์)
3. **UI ที่บอกชัดว่า key ตัวไหนทำงานฝั่งไหน** (browser bundle vs `trading_system/.env`)
4. **MT5 mock fields ถูกถอดออก** เพราะ real integration อยู่นอก v1 scope

ไฟล์ที่อยู่ใน scope:
- [src/components/Settings.tsx](src/components/Settings.tsx)
- [src/components/DataFeedConfig.tsx](src/components/DataFeedConfig.tsx)
- [src/pages/Settings/DataProviders.tsx](src/pages/Settings/DataProviders.tsx)
- [src/context/DataProviderContext.tsx](src/context/DataProviderContext.tsx) (จะถูก rewire ออกจาก localStorage)
- [src/lib/supabase.ts](src/lib/supabase.ts) (ถูก patch ใน Phase 3 — ไม่แตะ semantics ของ failsafe ใน Phase 1)
- ตาราง Supabase ใหม่/ขยาย (แนวทางใน decisions ด้านล่าง)

ไม่อยู่ใน scope (ไป phase อื่น):
- RLS hardening / empty-feed bug → Phase 2
- `localStorage.devMode` bypass + `supabase.ts` placeholder fail-fast → Phase 3
- AgentHealth / observability → Phase 4
- CI gates → Phase 5
- Crew runner unstub → Phase 6

</domain>

<decisions>
## Implementation Decisions

### Secret Storage Backend

- **D-01:** EODHD และ Tiingo API keys ย้ายจาก `localStorage` ไปเก็บฝั่ง Supabase ตาม **pattern เดียวกับ [supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql](supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql)** — RLS เปิด, **`SELECT` ถูกบล็อกสำหรับ `authenticated`** (key อ่านได้เฉพาะ service role ผ่าน Edge Function), `INSERT`/`DELETE` allowed for owning user, ไม่มี `UPDATE` (rotate ด้วย delete + insert)
- **D-02:** Pattern ถูกล็อก แต่ **planner เลือก implementation ได้** ระหว่าง:
  - (a) เพิ่ม EODHD/Tiingo เป็น rows ใน `ai_provider_configs` แล้วใช้ `ai_provider_api_keys` ที่มีอยู่
  - (b) สร้างตาราง mirror ชื่อ `data_provider_api_keys` ที่มี schema/policy เหมือนกัน
  - เกณฑ์ตัดสิน: ถ้า AI provider config schema (model, base_url ฯลฯ) ไม่เหมาะกับ EODHD/Tiingo (ที่ต้องการแค่ key + provider id) ให้เลือก (b). โดย default = (b) เพื่อความ explicit
- **D-03:** ไม่มี API key ใน `localStorage` หลัง migration — keys เก่าใน `localStorage` ต้อง migrate อัตโนมัติครั้งแรกที่ผู้ใช้เปิด Settings (one-shot upload + clear)
- **D-04:** ห้าม EODHD/Tiingo key รั่วผ่าน browser bundle หลัง migration. Backtest fetcher (`src/services/dataFetchers/{eodhd,tiingo}.ts`) ต้องเรียกผ่าน Edge Function ที่ใช้ service role อ่าน key (ทำเป็น Plan แยกได้ ถ้า scope ใหญ่)

### Save Flow & UX

- **D-05:** **Per-section save** ทุก panel — Broker/MT5 (จะถูกถอดเหลือเฉพาะ broker), Risk Management, Notifications, Data Feed (ใน `DataFeedConfig`), Backtest Providers (`DataProvidersSettings`). ไม่มี "Save All" บนสุด
- **D-06:** ปุ่ม Save ทุก panel ต้องมี state เดียวกัน: `idle` → `saving` (Loader2 spinner) → `saved` (CheckCircle2 + emerald) → กลับ `idle` ใน 2-2.5s
- **D-07:** ไม่มี auto-save / no save-on-blur — เปลี่ยน input = local state เท่านั้น จนกว่าจะกด Save
- **D-08:** ปุ่ม **"Save Settings"** ล่างขวาของ `Settings.tsx` ปัจจุบัน (ที่บันทึกแค่ `user_settings`) ถูก **ลบ** หรือ rename เป็น "Save Risk & Notifications" ให้ตรงกับ scope จริง

### MT5 Mock Treatment

- **D-09:** **ลบทั้งบล็อก "MT5 / Broker Connection"** ออกจาก [src/components/Settings.tsx](src/components/Settings.tsx) (Server, Login, Password, Test Connection, สถานะ "Connected to ...")
- **D-10:** เก็บ form fields `mt5Server`, `mt5Login`, `mt5Timeout` ใน database schema ไว้ก่อน (ไม่ลบ migration) แต่ UI ไม่แสดง — รอ v2 BROK-01
- **D-11:** Fields ที่เคยอ้าง MT5 ใน `useUserSettings` / `Layout.tsx` (`brokerServer`, `brokerLabel`) ต้องไม่พังหลังลบ UI — fallback เป็น "Demo Account" หรือดึงจาก `data_feed_configs.broker_provider` แทน

### Browser vs Python Key Boundary

- **D-12:** Settings UI แบ่งเป็น **2 section ชัดเจน** ที่ระดับ page-level:
  1. **Dashboard / Browser** — ทุก key ที่ frontend ใช้: Supabase URL/anon (read-only display เพราะมาจาก env), Polygon, Alpaca data, OANDA browser keys, EODHD/Tiingo (หลัง migrate)
  2. **Python Agents (`trading_system/.env`)** — *information-only* section อธิบายว่ามี key ไหนต้องตั้งใน `.env` (NewsAPI, Finnhub, Alpha Vantage, FRED, OpenAI, Twitter, sentiment, plus `SUPABASE_SERVICE_ROLE_KEY`) พร้อมลิงก์ไป `trading_system/.env.example` — **ไม่มีช่องกรอก** เพราะตั้งใน UI ไม่ได้
- **D-13:** Section "Python Agents" ต้องมีคำเตือนชัด: *"`SUPABASE_SERVICE_ROLE_KEY` ห้ามอยู่ใน `VITE_*` หรือเข้า browser bundle เด็ดขาด"*
- **D-14:** Section header design ต้องแยกด้วยสี/icon ที่ต่างกันชัดเจน (เช่น icon `Globe` vs `Server`) เพื่อให้ scanned ได้ใน 1 วินาที

### Theme & Visual Consistency (Claude's Discretion)

- **D-15:** [src/pages/Settings/DataProviders.tsx](src/pages/Settings/DataProviders.tsx) ปัจจุบันใช้ light-theme classes (`bg-yellow-50`, `bg-blue-500`, `bg-gray-50`) — ต้อง rewrite ให้ใช้ `Section`/`Field` primitives ของ `Settings.tsx` หรือ Tailwind dark-theme classes ที่ตรงกับ `DataFeedConfig.tsx`
- **D-16:** Spacing, border-radius, font sizes ตามแบบ `Settings.tsx` (`bg-slate-900 border-slate-800 rounded-xl p-5` per section, etc.)

### Credential Masking (Claude's Discretion)

- **D-17:** Extract `SecretInput` จาก [src/components/DataFeedConfig.tsx](src/components/DataFeedConfig.tsx) ไปเป็น shared component ที่ `src/components/ui/SecretInput.tsx` (หรือเทียบเท่า) — `Settings.tsx` MT5 password (จะถูกลบอยู่แล้ว) + Alpaca Key ID + EODHD/Tiingo inputs ต้องใช้ตัวเดียวกันทั้งหมด
- **D-18:** Alpaca Key ID เคยใช้ `type="text"` — เปลี่ยนเป็น `SecretInput` (masked + reveal toggle) เพื่อ consistency

### Folded Todos

ไม่มี — repo ยังไม่มี todos system เปิดใช้งาน

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Storage pattern (D-01)
- [supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql](supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql) — RLS pattern, service role + Edge Function, no UPDATE policy, INSERT/DELETE only by owner. **Use this as the template for any new secrets table.**
- [supabase/migrations/20260412180521_add_data_feed_and_order_management.sql](supabase/migrations/20260412180521_add_data_feed_and_order_management.sql) — existing `data_feed_configs` (broker keys); extension or replacement decision lives here
- [supabase/migrations/20260412211702_add_oanda_credentials_to_data_feed_configs.sql](supabase/migrations/20260412211702_add_oanda_credentials_to_data_feed_configs.sql) — precedent for adding broker creds

### Settings UI references
- [src/components/Settings.tsx](src/components/Settings.tsx) — current shell + Section/Field primitives
- [src/components/DataFeedConfig.tsx](src/components/DataFeedConfig.tsx) — current dark-theme primitives + `SecretInput`
- [src/pages/Settings/DataProviders.tsx](src/pages/Settings/DataProviders.tsx) — current EODHD/Tiingo UI + light-theme drift
- [src/context/DataProviderContext.tsx](src/context/DataProviderContext.tsx) — current `localStorage` writes (will be rewired)

### Boundary documentation source
- [trading_system/.env.example](trading_system/.env.example) — authoritative list of Python-side keys (used to populate the read-only "Python Agents" section in D-12)

### Project-level
- [.planning/PROJECT.md](.planning/PROJECT.md) — Core value pinned to credential trust
- [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md) — Phase 1 reqs SETT-01..SETT-06
- [.planning/codebase/CONCERNS.md](.planning/codebase/CONCERNS.md) — Tech Debt + Security signals that drove these decisions
- [.planning/codebase/CONVENTIONS.md](.planning/codebase/CONVENTIONS.md) — naming, error handling, ESLint rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`SecretInput`** in [src/components/DataFeedConfig.tsx](src/components/DataFeedConfig.tsx) (lines 87-110) — masked input with reveal toggle. Extract to shared location.
- **`Section` / `Field`** primitives in [src/components/Settings.tsx](src/components/Settings.tsx) (lines 9-31) — Section is a `bg-slate-900 border border-slate-800 rounded-xl p-5` container with header + Icon; Field is a 3-col grid label+control.
- **`upsertUserSettings`** in [src/services/tradingService.ts](src/services/tradingService.ts) — already-tested pattern for Supabase upsert keyed by `user_id`.
- **`useUserSettings`** in [src/hooks/useSupabaseData.ts](src/hooks/useSupabaseData.ts) — fetch hook used by `Settings.tsx`, `Layout.tsx`, `Dashboard.tsx`, `RiskMonitor.tsx`.
- **Edge Function pattern** — [supabase/functions/ai-signal-proxy/index.ts](supabase/functions/ai-signal-proxy/index.ts) and [supabase/functions/news-proxy/index.ts](supabase/functions/news-proxy/index.ts) are the templates for any new Edge Function that reads `data_provider_api_keys` (or equivalent) via service role.

### Established Patterns

- **Per-section save with confirmation feedback** — `DataFeedConfig.handleSave` already does this (`saving → saved → idle in 2s`). New panels should mirror.
- **Supabase upsert keyed by `user_id` with `onConflict: 'user_id'`** — both `upsertUserSettings` and `data_feed_configs.upsert` use this; new tables should follow.
- **Form state initialized from Supabase via `useEffect` on hook data** — pattern in `Settings.tsx` lines 54-71 (`if (settings) setForm(...)`).
- **Browser dark theme** — `bg-slate-900 / border-slate-800 / rounded-xl / text-slate-200 / Inter font`. `DataProvidersSettings` is the only file out of compliance.
- **No path aliases (`@/`)** — use relative imports; new shared components live at `src/components/ui/` or near siblings.

### Integration Points

- `Settings.tsx` currently composes `<DataFeedConfig />` + `<DataProvidersSettings />` inside `<Section>` wrappers. New "Python Agents" info section becomes a sibling Section.
- `DataProviderContext` is consumed by `src/services/dataFetchers/fetchOHLCV.ts` via `setFetchConfig(...)`. After migrating storage, the context still needs to expose the same `eodhd_api_key` / `tiingo_api_key` interface — but reads should fetch from Supabase (or Edge Function for backtest path) instead of `localStorage`.
- `Layout.tsx` reads `settings?.broker_server` and renders `brokerLabel` in the topbar — needs alternative source after MT5 fields are removed (D-11).

</code_context>

<specifics>
## Specific Ideas

- ปุ่ม Save ใน `Settings.tsx` ปัจจุบันบันทึกแค่ `user_settings` แต่อยู่ที่ "ล่างสุดของหน้า" ทำให้ผู้ใช้คาดว่าจะ save ทุก section — **ลบหรือ rename ให้ตรงกับ scope จริง** (D-08)
- ตัวอย่าง dark theme ที่ดี: `<div className="bg-slate-900 border border-slate-800 rounded-xl p-5">` + `Section` header — ใช้แทน light-theme `border rounded-lg p-4` ที่ `DataProviders.tsx` ใช้
- "Python Agents" info section ควรอ่าน `.env.example` แล้ว render เป็น list (อย่าง hard-code) เพื่อกันลืมอัปเดตเวลามี key ใหม่ — **planner discretion** ว่าจะทำเป็น static list หรือ build-time generated

</specifics>

<deferred>
## Deferred Ideas

### Out of this phase

- **Real MT5 broker integration** — D-09 ลบ UI ออก แต่ implementation อยู่ที่ v2 BROK-01 ใน [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md)
- **Supabase Vault / encrypted-at-rest secrets** — Pattern `ai_provider_api_keys` เก็บ plaintext ใน DB row โดย rely on Supabase server-side security. Vault upgrade เป็นหัวข้อแยก (อาจเป็น Phase 1.x ภายหลังถ้าต้องการ)
- **Edge Function สำหรับ backtest data fetch** (D-04) — ถ้า scope ใหญ่ planner แยกเป็น Plan 01-03 หรือ insert เป็น Phase 1.1
- **Migration UX for existing localStorage keys** — D-03 บอกให้ migrate อัตโนมัติ; ถ้า edge case (offline, multi-tab) ใหญ่ planner เลือก strategy เอง
- **Centralized env validation** in `src/lib/supabase.ts` (placeholder fallback) — เป็น Phase 3 (AUTH-02), ไม่ทำใน Phase 1

### Reviewed Todos (not folded)

ไม่มี — repo ยังไม่มี todos system

</deferred>

---

*Phase: 01-settings-secrets-unification*
*Context gathered: 2026-05-01*
