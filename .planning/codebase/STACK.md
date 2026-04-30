# Technology Stack

**Analysis Date:** 2026-05-01

## Languages

**Primary:**
- **TypeScript** (`typescript` ^5.9.3) — Application UI and client logic under `src/` (React components, hooks, services). Compiled via Vite in bundler mode; `tsconfig.app.json` sets `noEmit: true`.
- **Python** (3.x assumed for tooling and backend scripts; pin locally via `.python-version` if added) — `trading_system/` signal/backtest/agent pipeline (`requirements.txt`), AST graph refresh script `scripts/graphify_ast_update.py`, and optional Graphify CLI deps in `requirements-graphify.txt`.

**Secondary:**
- **SQL** — Postgres schema and RLS policies via Supabase migrations in `supabase/migrations/*.sql`.
- **JavaScript** — Config only (`eslint.config.js`, `tailwind.config.js`, `postcss.config.js`).

## Runtime

**Environment:**
- **Node.js** — Required for Vite dev server, production build, ESLint, Vitest, and Playwright test runner. `package.json` does **not** declare `engines`; use an active Node LTS that satisfies Vite 5 + ESLint 9 (typically Node 18+).

**Package Manager:**
- **npm** (lockfile v3) — `package-lock.json` present at repo root (compatible with npm 7+). No `pnpm-lock.yaml`.

## Frameworks

**Core:**
- **React** (^18.3.1) + **React DOM** — SPA mounted from `index.html` → `src/main.tsx`.
- **React Router** (^6.20.0) — Client-side routing (`BrowserRouter` pattern expected under `src/`).
- **Vite** (^5.4.21) with **`@vitejs/plugin-react`** — Dev (`npm run dev`), prod bundle (`npm run build`), preview (`npm run preview`).

**Testing:**
- **Vitest** (^3.2.4) — Unit/component tests; configured in `vitest.config.ts` with **jsdom**, globals on, setup `tests/setup.ts`, excludes `e2e/**/*`.
- **@testing-library/react** (^16.3.2) + **jsdom** (^29.1.0) — DOM testing utilities.
- **@playwright/test** (^1.59.1) — Browser E2E; config `playwright.config.ts`: tests in `e2e/`, `baseURL` `http://localhost:5173`, Chromium project.

**Build/Dev:**
- **TypeScript** — Project references in `tsconfig.json`: app (`tsconfig.app.json`), tooling (`tsconfig.node.json` includes `vite.config.ts`).
- **Tailwind CSS** (^3.4.1) + **PostCSS** (^8.4.35) + **Autoprefixer** (^10.4.18) — Utility-first styling (`tailwind.config.js`, `postcss.config.js`).
- **ESLint** (^9.9.1) flat config — `eslint.config.js` extends `@eslint/js` recommended + `typescript-eslint` recommended + React Hooks / Refresh plugins.

## Key Dependencies

**Critical:**
- **`@supabase/supabase-js`** (^2.57.4) — Browser Supabase client; singleton created in `src/lib/supabase.ts` using `import.meta.env` vars (see INTEGRATIONS).
- **`react` / `react-dom`** — UI rendering for forex/dashboard/backtest flows.
- **`react-router-dom`** — SPA navigation.
- **`axios`** (^1.15.2) — HTTP client usage alongside fetch patterns in services.
- **`lightweight-charts`** + **`recharts`** — Charting for price and analytics UI.

**Infrastructure:**
- **`idb`** (^8.0.3) — IndexedDB persistence patterns where offline/cache UX applies.
- **`date-fns` / `date-fns-tz`** — Timezone-aware date handling in trading UI.
- **`lucide-react`** — Icon set (also excluded from Vite pre-bundle optimization in `vite.config.ts`).

**Python (`trading_system/requirements.txt`):**
- **`pandas`**, **`numpy`**, **`pandas-ta`** — Indicators and time-series for signals/backtests.
- **`supabase`** (Py client ^2.3.0) + **`python-dotenv`** — Server-side persistence to Supabase from Python.
- **`crewai`**, **`langgraph`**, **`openai`**, **`httpx`**, **`tenacity`** — Agent orchestration, LLM calls, retries.

## Configuration

**Environment:**
- **Vite / frontend:** Variables prefixed `VITE_*` are injected at build time (example consumption in `src/lib/supabase.ts`, `src/services/candleService.ts`, `src/hooks/useNewsData.ts`). Use `.env` / `.env.local` at repo root (gitignored patterns typical); never commit secrets.
- **`vite.config.ts`:** Defines `__WS_TOKEN__` from `process.env.WS_TOKEN || 'dev'` for websocket-auth embedding at bundle time.
- **Trading scripts:** Documented variables live in `trading_system/.env.example` (Supabase service role, OANDA, LLM keys, news/macro APIs).

**Build:**
- `vite.config.ts` — Manual Rollup chunks (vendor-react, vendor-charts, vendor-ui, backtester, data-layer pointing at concrete `src/...` paths), **terser** minification with `drop_console: true`, chunk warning limit 600 KB.
- `vitest.config.ts` — Aligns Vite React plugin with Vitest `environment: 'jsdom'`.
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — Strict TS, ES2020 app target, bundler resolution.

**Lint/format:**
- `eslint.config.js` — Ignores `dist`; browser globals via `globals` package.

**Optional tooling:**
- `requirements-graphify.txt` — Pins **`graphifyy`** for AST-only graph refresh aligned with `npm run graphify:ast`.

## Build / Dev Commands

Run from repo root unless noted:

```bash
npm install              # Install JS deps (uses package-lock.json)
npm run dev              # Vite dev server (default http://localhost:5173)
npm run build            # Production bundle → dist/
npm run preview          # Serve production build locally
npm run lint             # ESLint across repo (respects eslint.config.js)
npm run typecheck        # tsc --noEmit -p tsconfig.app.json
npm run test             # vitest run (see vitest.config.ts)
npm run graphify:ast     # python scripts/graphify_ast_update.py
pip install -r trading_system/requirements.txt   # Python trading subsystem
pip install -r requirements-graphify.txt       # Graphify CLI/libs only
```

**E2E (requires dev server running):**
```bash
npx playwright test      # Uses playwright.config.ts
```

## Platform Requirements

**Development:**
- Node + npm for frontend and tests.
- Python 3 + pip for `trading_system` and graphify AST script.
- Supabase CLI optional for applying `supabase/migrations/` locally; Postgres-compatible target.

**Production:**
- Static SPA output from `npm run build` is suitable for static hosting (CDN, object storage + edge, or any static file server).
- Supabase hosts Postgres, Auth, and Edge Functions (`supabase/functions/*`) when deployed via Supabase project workflow.

## Macro structure (reference)

`graphify-out/GRAPH_REPORT.md` summarizes the repo as a large multi-community graph (thousands of nodes/edges); key application abstractions called out there include **`StrategyConfig`** and related trading-domain symbols — useful orientation before deep navigation, alongside direct reading of `src/` and `trading_system/`.

---

*Stack analysis: 2026-05-01*
*Update after major dependency changes*
