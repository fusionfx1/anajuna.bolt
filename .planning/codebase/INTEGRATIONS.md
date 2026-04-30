# External Integrations

**Analysis Date:** 2026-05-01

## APIs & External Services

**Supabase (platform):**
- **Postgres + Row Level Security** — Primary persisted data for strategies, positions, feeds, AI keys, paper trading, backtests, agent decisions (see migrations listed below).
- **Supabase Auth** — `user_id` references `auth.users` in core schema (`supabase/migrations/20260412082411_create_forex_trading_schema.sql`).
- **Edge Functions (Deno runtime)** — HTTP endpoints under `{SUPABASE_URL}/functions/v1/...`:
  - `supabase/functions/ai-signal-proxy/index.ts` — Proxies AI provider calls (uses `npm:@supabase/supabase-js@2`, OpenAI-compatible HTTP); invoked from `src/services/aiProviderService.ts` with `Authorization: Bearer` + anon key.
  - `supabase/functions/news-proxy/index.ts` — Economic calendar / news proxy (currently includes mock payloads for development); frontend builds URL from `import.meta.env.VITE_SUPABASE_URL` in `src/hooks/useNewsData.ts`.
  - `supabase/functions/candle-ingest/index.ts` — Server-side candle ingestion pipeline entry point for scheduled or triggered ingest.

**OANDA (broker / market data — browser path):**
- Used from `src/services/candleService.ts` via **`import.meta.env`**:
  - `VITE_OANDA_BASE_URL`
  - `VITE_OANDA_ACCESS_TOKEN`
  - `VITE_OANDA_ACCOUNT_ID`
- Python subsystem documents REST credentials as `OANDA_ACCOUNT_ID`, `OANDA_API_TOKEN`, `OANDA_ACCOUNT_TYPE` in `trading_system/.env.example` (practice vs live).

**LLM / embeddings (Python agents + optional full CrewAI):**
- **OpenAI API** — `OPENAI_API_KEY` in `trading_system/.env.example`; used for agent reasoning and embeddings (`gpt-4o-mini`, `text-embedding-3-small` noted in comments there).
- **LangGraph / CrewAI** — Orchestration toggles (`USE_LANGGRAPH`, `USE_CREWAI_KICKOFF`, `SIGNAL_MODE=agent`) in `trading_system/.env.example`.

**News and macro data providers:**
- Documented in `trading_system/.env.example` (names only — never commit values):
  - **NewsAPI** — `NEWS_API_KEY`
  - **Finnhub** — `FINNHUB_API_KEY` (also sentiment)
  - **Alpha Vantage** — `ALPHA_VANTAGE_API_KEY`
  - **FRED** — `FRED_API_KEY`
  - **Twitter/X v2** — `TWITTER_BEARER_TOKEN` (optional sentiment path)
  - Generic sentiment — `SENTIMENT_API_KEY` (Finnhub-oriented)

## Data Storage

**Databases:**
- **PostgreSQL (Supabase)** — Connection from browser via `@supabase/supabase-js` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`).
- **Python client** — `supabase` package in `trading_system/requirements.txt`; service-role access documented as `SUPABASE_SERVICE_ROLE_KEY` in `trading_system/.env.example` for inserts that bypass RLS (e.g. agent decision persistence).

**Migrations (authoritative schema evolution):**
- `supabase/migrations/20260412082411_create_forex_trading_schema.sql` — Core forex tables (`strategies`, `positions`, `trades`, etc.) + RLS tied to `auth.uid()`.
- `supabase/migrations/20260412180521_add_data_feed_and_order_management.sql`
- `supabase/migrations/20260412211702_add_oanda_credentials_to_data_feed_configs.sql`
- `supabase/migrations/20260412224612_add_circuit_breakers_to_user_settings.sql`
- `supabase/migrations/20260412094030_add_account_settings_and_seed_support.sql`
- `supabase/migrations/20260419224350_add_ai_engine_tables.sql`
- `supabase/migrations/20260419224445_add_ai_provider_api_keys_table.sql`
- `supabase/migrations/20260424234712_create_paper_trading_tables.sql`
- `supabase/migrations/20260426214256_create_backtest_tables.sql`
- `supabase/migrations/20260430120000_create_agent_decisions.sql`

**File Storage:**
- Not a dedicated S3-style integration detected in stack docs; user uploads or blobs would go through Supabase Storage only if added explicitly (not enumerated here).

**Caching:**
- Client-side **IndexedDB** via `idb` package where applicable; no Redis integration documented in env templates.

**Vector memory:**
- Optional **pgvector** usage gated by `USE_PGVECTOR` and `MEMORY_TOP_K` in `trading_system/.env.example`.

## Authentication & Identity

**Supabase Auth:**
- Frontend uses the **anon key** with Supabase JS (`src/lib/supabase.ts`). Missing vars log a console warning but fall back to placeholder URLs for failed builds — **set real values in local `.env.local`** for functional auth and data access.
- RLS policies assume authenticated JWT subject matching `user_id` columns (see migration comments in `20260412082411_create_forex_trading_schema.sql`).

**Edge Functions:**
- Called with **`Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}`** from `src/services/aiProviderService.ts` and `src/hooks/useNewsData.ts` — same anon identity model as the dashboard client.

**Service role (Python / automation):**
- **`SUPABASE_SERVICE_ROLE_KEY`** — Documented in `trading_system/.env.example` for privileged server-side writes (never expose in Vite `VITE_*` vars).

## Monitoring & Observability

**Error Tracking:**
- No Sentry/Datadog SDK detected in `package.json` dependencies.

**Logs:**
- **Loguru** (`trading_system/requirements.txt`) for Python-side structured logging.
- Browser and Edge Function logging rely on standard `console` / platform logs unless extended later.

## CI/CD & Deployment

**CI Pipeline:**
- **No `.github/workflows/` in this repo root** was found for automated test/deploy (nested reference docs under `claude-code-best-practice-main/` mention workflows generically only).

**Hosting:**
- **SPA**: Built artifacts from `npm run build` deploy to any static host.
- **Supabase**: Postgres + Edge Functions deployed via Supabase project settings (env secrets configured in Supabase dashboard for function runtime, not in-repo).

## Environment Configuration

**Frontend (Vite) — variables referenced in code:**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — `src/lib/supabase.ts`, `src/services/aiProviderService.ts`, `src/hooks/useNewsData.ts`.
- `VITE_OANDA_BASE_URL`, `VITE_OANDA_ACCESS_TOKEN`, `VITE_OANDA_ACCOUNT_ID` — `src/services/candleService.ts`.

**Build-time Node:**
- `WS_TOKEN` — Consumed in `vite.config.ts` as `process.env.WS_TOKEN` mapped to `__WS_TOKEN__`.

**Python trading / agents — see `trading_system/.env.example`:**
- Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- OANDA: `OANDA_ACCOUNT_ID`, `OANDA_API_TOKEN`, `OANDA_ACCOUNT_TYPE`
- Modes: `SIGNAL_MODE`, `USE_LANGGRAPH`, `USE_CREWAI_KICKOFF`, timeouts `AGENT_TIMEOUT_MS_PER_CALL`, `AGENT_BUDGET_MS`
- LLM: `OPENAI_API_KEY`
- News/macro/sentiment keys as listed in APIs section
- Vector: `USE_PGVECTOR`, `MEMORY_TOP_K`

**Secrets location:**
- Local developer copies of `.env` / `.env.local` (gitignored — **never commit**). Production: hosting provider env UI + Supabase dashboard secrets for Edge Functions.

## Webhooks & Callbacks

**Incoming:**
- No Stripe-style webhook routes detected in the React SPA; broker and ingest flows may use Edge Functions or scheduled jobs depending on deployment — verify Supabase dashboard triggers for `candle-ingest` if used in prod.

**Outgoing:**
- Python agents and `requests`/`httpx` clients call external REST APIs per configured keys (`trading_system/.env.example`).
- Frontend calls Supabase REST/RPC and Edge Function HTTPS endpoints only.

## Project context hooks

`CLAUDE.md` points maintainers to OpenWolf docs (`.wolf/OPENWOLF.md`) and Graphify refresh (`npm run graphify:ast`, `requirements-graphify.txt`) — orthogonal to third-party SaaS but relevant when extending integrations with documented repo hygiene.

---

*Integration audit: 2026-05-01*
*Update when adding/removing external services*
