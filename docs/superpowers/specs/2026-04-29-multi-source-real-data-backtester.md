# Multi-Source Real Data Backtester Design

**Date:** 2026-04-29  
**Status:** Design Approved  
**Objective:** Enable backtesting with real historical data from multiple providers (EODHD, Tiingo, Synthetic fallback) with global configuration and per-backtest override capability.

---

## 1. Overview

### Problem Statement
Currently, backtesting uses synthetic data (`generateHistoricalCandles`) when no broker is configured. This prevents validating strategy performance against realistic market conditions—gaps, volatility spikes, true liquidity. The system needs:
- **Real historical data** from multiple reliable sources
- **Provider flexibility** to compare data quality and cost
- **Zero friction** for configuration and caching
- **Fallback safety** if APIs are unavailable or exhausted

### Solution
A multi-provider data pipeline with:
- **Global Settings** for API keys and default provider
- **Per-backtest override** for benchmarking and comparison
- **Unified normalization layer** (all providers → standard OHLCV)
- **Intelligent caching** (IndexedDB) to preserve API credits and boost speed
- **Graceful degradation** (API fails → cache → Synthetic)

### Success Criteria
1. Users can configure EODHD and Tiingo API keys in Settings
2. Backtests fetch real data by default; fall back gracefully if API unavailable
3. Results show which provider was used and cache status
4. "Compare providers" option runs identical backtest on EODHD, Tiingo, Synthetic and shows differences
5. Cache reduces API calls by 80%+ on repeated backtests

---

## 2. System Architecture

### Data Pipeline

```
┌─ Settings (Global Config) ──────────┐
│  • EODHD API Key                    │
│  • Tiingo API Key                   │
│  • Primary Provider: [EODHD/Tiingo] │
│  • Cache TTL: 30 days               │
└────────────────────────────────────┘
                 ↓
┌─ Backtest Page (Instance Override) ─┐
│  • Provider Selector: [Use Default]  │
│  • Compare Providers checkbox        │
│  • Cache preference: [Use/Bypass]    │
└────────────────────────────────────┘
                 ↓
┌─ Data Fetcher (Wrapper Pattern) ────┐
│  fetchOHLCV(symbol, startDate,      │
│             endDate, provider?)      │
│  • Read Settings for default         │
│  • Route to EODHD or Tiingo client   │
│  • Fall back to Synthetic if needed  │
└────────────────────────────────────┘
                 ↓
┌─ Normalization Layer ───────────────┐
│  normalizeCandles(rawData, provider) │
│  • Convert to standard OHLCV format  │
│  • Validate timestamps & gaps        │
│  • Handle provider-specific quirks   │
└────────────────────────────────────┘
                 ↓
┌─ Cache Layer (IndexedDB) ───────────┐
│  Key: ${symbol}-${provider}-hourly   │
│  Value: NormalizedCandle[] + metadata│
│  TTL: 30 days (configurable)        │
└────────────────────────────────────┘
                 ↓
┌─ Backtester (Python) ───────────────┐
│  run_backtest(df, config)            │
│  Returns BacktestResult with metrics │
└────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Tech |
|-----------|-----------------|------|
| **Settings** | Store API keys, default provider, cache TTL | React + localStorage (persisted) |
| **Backtest Page** | Per-run provider override, compare mode toggle | React form |
| **Data Fetcher** | Route requests to correct API client, handle errors | TypeScript async function |
| **Normalization** | Convert raw API responses to standard format | TypeScript pure function |
| **Cache** | Store/retrieve candles, enforce TTL | IndexedDB (primary) or localStorage (fallback) |
| **Backtester** | Process OHLCV → trades → metrics | Python (existing) |

---

## 3. Settings Configuration

### New Section: "Data Providers"

**Location:** Settings > Data Providers

**Fields:**

1. **Primary Data Provider** (radio buttons)
   - [ ] EODHD
   - [ ] Tiingo
   - [ ] Synthetic
   - Default: EODHD

2. **EODHD Configuration**
   - API Key input (masked)
   - [Test Connection] button — validates key, shows "✓ Connected" or error
   - Shows last successful fetch timestamp (if cached)

3. **Tiingo Configuration**
   - API Key input (masked)
   - [Test Connection] button
   - Shows last successful fetch timestamp (if cached)

4. **Cache Settings**
   - ☑ Enable Local Cache (default: checked)
   - Cache expires after: [30] days (editable)
   - Cache size: "X MB" (read-only)
   - Oldest cached data: "YYYY-MM-DD" (read-only)
   - [Clear All Cache] button — clears IndexedDB + localStorage

**Validation:**
- API keys must be non-empty before save
- Test button makes a sample API call (e.g., fetch EURUSD H1 for last 7 days)
- Error message if test fails: "Invalid API key" or "Rate limit exceeded"

**UX Considerations:**
- Save only when form is valid
- Show warning if no API keys configured: "Backtests will use synthetic data"
- Disable primary provider radio if corresponding key is not configured

---

## 4. Backtest Page UI Enhancement

### Per-Backtest Provider Selection

**New form section (before "Run Backtest" button):**

```
Data Source
├─ Provider: [Use Default ▼]
│  Options:
│  - Use Default (global setting)
│  - Use EODHD
│  - Use Tiingo
│  - Use Synthetic
│
├─ ☐ Compare All Providers
│  (runs 3 backtests in parallel: EODHD, Tiingo, Synthetic)
│
└─ Cache Preference: [Use Cache] [Force Refresh]
```

**Results Display (when compare mode enabled):**
- Three result cards side-by-side: "EODHD", "Tiingo", "Synthetic"
- Each shows:
  - Total Return %
  - Sharpe Ratio
  - Max Drawdown
  - Win Rate
  - Data source badge + "From cache" or "Fresh API call"
- Highlighted row: biggest Sharpe difference (e.g., "Tiingo +0.8 vs EODHD")
- Summary: "Providers agree on direction; Tiingo shows higher volatility"

**Single Provider Results (default):**
- Show provider name + cache status
- E.g., "Results from EODHD (cached 2026-04-28)"

---

## 5. Data Fetcher Implementation

### fetchOHLCV Function

```typescript
interface FetchOptions {
  symbol: string              // e.g., "EURUSD" or "AAPL"
  startDate: Date
  endDate: Date
  provider?: 'eodhd' | 'tiingo'  // undefined = use Settings default
  useCache?: boolean              // default: true
}

interface NormalizedCandle {
  timestamp: Date
  o: number
  h: number
  l: number
  c: number
  v: number
}

async function fetchOHLCV(options: FetchOptions): Promise<NormalizedCandle[]>
```

### Execution Flow

1. **Check cache first** (if `useCache === true`)
   - Key: `${symbol}-${provider}-hourly`
   - If found and not expired → return cached data

2. **Fetch from API**
   - Get API key from Settings
   - Call appropriate client:
     - EODHD: `client.getCandles(symbol, startDate, endDate)`
     - Tiingo: `client.getDailyHistory(symbol, startDateISO, endDateISO)`
   - Handle rate limits: exponential backoff up to 3 retries

3. **Normalize**
   - Call `normalizeCandles(rawData, provider)`
   - Validate all timestamps are valid Dates
   - Sort by timestamp ascending
   - Ensure no duplicates

4. **Cache result**
   - Store with key and expiry metadata
   - Log cache write

5. **Return**
   - Return normalized candles to caller

### Error Handling

| Scenario | Action |
|----------|--------|
| API key missing | Check cache. If miss, use Synthetic with warning |
| API returns 401/403 | Show error, fall back to cache or Synthetic |
| API rate limit | Wait & retry (up to 3x). If still fail, use cache or Synthetic |
| Network timeout | Use cache if available, else Synthetic |
| Cache expired | Fetch fresh. If API fails, use Synthetic |
| Synthetic fallback | Log warning: "Using synthetic data for SYMBOL" |

---

## 6. Normalization Layer

### Standard Format

All providers convert to:

```typescript
interface NormalizedCandle {
  timestamp: Date          // UTC timezone
  o: number              // Open price
  h: number              // High price
  l: number              // Low price
  c: number              // Close price
  v: number              // Volume (units or base currency)
}
```

### Provider-Specific Normalization

**EODHD:**
- Raw: `{ date: "2024-01-15", open: 1.0850, high: 1.0875, ... }`
- Convert: Parse `date` as ISO string → Date object
- Validation: Ensure OHLC order (O ≤ H, O ≤ L, C ≤ H, C ≥ L)

**Tiingo:**
- Raw: `{ date: "2024-01-15T00:00:00.000Z", close: 1.0875, high: 1.0900, ... }`
- Convert: Use ISO string directly, rename fields (close→c, etc.)
- Validation: Same OHLC order check

**Synthetic:**
- Already in standard format (generated by `generateHistoricalCandles`)
- Pass-through with provider annotation

### Validation Rules

```typescript
function validateCandle(candle: NormalizedCandle): boolean {
  const { o, h, l, c } = candle
  return (
    o >= 0 && h >= 0 && l >= 0 && c >= 0 &&  // All positive
    o <= h && o <= l &&                         // O ≤ H, O ≤ L (or close to it)
    c <= h && c >= l &&                         // L ≤ C ≤ H (or close)
    candle.v >= 0                              // Volume non-negative
  )
}
```

If a candle fails validation → log warning, but include it (don't drop silently)

---

## 7. Caching Strategy

### IndexedDB Schema

```typescript
interface CacheEntry {
  key: string                    // "${symbol}-${provider}-hourly"
  candles: NormalizedCandle[]
  fetchedAt: Date               // When this was cached
  expiresAt: Date               // When it expires (fetchedAt + TTL)
  provider: 'eodhd' | 'tiingo'
  symbolMetadata: {
    totalCandles: number
    dateRange: [Date, Date]
  }
}
```

### Cache Operations

**Write:**
```typescript
async function writeCache(
  key: string,
  candles: NormalizedCandle[],
  provider: 'eodhd' | 'tiingo',
  ttlDays: number = 30
): Promise<void>
```

**Read:**
```typescript
async function readCache(key: string): Promise<NormalizedCandle[] | null>
  // Returns null if not found or expired
```

**Clear:**
```typescript
async function clearCache(key?: string): Promise<void>
  // If key provided, clear only that entry
  // If no key, clear all cache
```

### Fallback: localStorage

If IndexedDB quota exceeded or browser doesn't support:
- Compress candles as JSON
- Store under key: `cache_${symbol}_${provider}`
- Keep only 5 most recent symbols (FIFO)

### TTL Management

- Default: 30 days (configurable in Settings)
- Check expiry on every cache read
- Background cleanup: delete expired entries on app startup
- Show cache age in results: "From cache (4 days old)"

---

## 8. Compare Mode Implementation

### Parallel Execution

When user checks "Compare All Providers":

```typescript
async function runComparisonBacktest(
  config: StrategyConfig,
  dateRange: [Date, Date]
): Promise<{
  eodhd: BacktestResult
  tiingo: BacktestResult
  synthetic: BacktestResult
}> {
  return Promise.all([
    fetchAndBacktest('eodhd', config, dateRange),
    fetchAndBacktest('tiingo', config, dateRange),
    fetchAndBacktest('synthetic', config, dateRange),
  ])
}
```

### Results Comparison Card

Display three columns:

```
┌────────────────┬────────────────┬────────────────┐
│ EODHD          │ Tiingo         │ Synthetic      │
├────────────────┼────────────────┼────────────────┤
│ Return: 15.2%  │ Return: 14.8%  │ Return: 16.1%  │
│ Sharpe: 1.45   │ Sharpe: 1.52   │ Sharpe: 1.38   │
│ Max DD: -8.3%  │ Max DD: -7.9%  │ Max DD: -9.1%  │
│ Win Rate: 58%  │ Win Rate: 61%  │ Win Rate: 62%  │
│                │                │                │
│ ✓ From cache   │ ⟳ Fresh API    │ ⊗ Synthetic    │
│ (2 days old)   │ (just fetched) │ (deterministic)│
├────────────────┼────────────────┼────────────────┤
│ Insight: Tiingo shows strongest Sharpe (+0.07 vs EODHD) |
└────────────────────────────────────────────────────────┘
```

---

## 9. Integration Points

### Backend (Python) — No Changes
- Backtester remains unchanged
- Accepts DataFrame as input
- Returns BacktestResult

### Frontend (React/TypeScript) — New Files
1. `src/services/dataFetchers/` — Provider-specific clients
   - `eodhd.ts` — EODHD API wrapper
   - `tiingo.ts` — Tiingo API wrapper
   - `synthetic.ts` — Synthetic data generator
2. `src/services/cache.ts` — IndexedDB + localStorage cache layer
3. `src/services/normalize.ts` — Normalization logic
4. `src/pages/Settings/DataProviders.tsx` — Settings UI
5. `src/components/BacktestDataSource.tsx` — Backtest page UI additions
6. `src/components/ComparisonResults.tsx` — Compare mode results display

### API Calls
- EODHD: `https://eodhd.com/api/eod?symbol=EURUSD&period=h1&fmt=json&api_token=<key>`
- Tiingo: `https://api.tiingo.com/tiingo/daily/<symbol>/prices?startDate=<YYYY-MM-DD>&token=<key>`

---

## 10. Error Handling & Resilience

### Graceful Degradation Levels

| Level | Condition | Action |
|-------|-----------|--------|
| **1** | Both APIs available + cache | Use default provider |
| **2** | Default API available, cache not | Fetch fresh, cache it |
| **3** | Default API unavailable, cache valid | Use cache with age warning |
| **4** | All APIs unavailable, no cache | Use Synthetic with error banner |
| **5** | Settings incomplete (no API keys) | Use Synthetic on startup |

### User Messaging

**Success case:**
- "Results from EODHD (cached 4 days ago) • Updated now"

**Cache hit:**
- "✓ Using cached data (updated 2026-04-25)"

**API fail, cache hit:**
- "⚠ EODHD API unavailable. Using cached data from 2026-04-25"

**All fail:**
- "❌ Real data unavailable. Using synthetic data (results may not reflect live markets)"

---

## 11. Testing Strategy

**E2E Test Cases:**
1. Fetch EURUSD H1 from EODHD, verify normalization matches expected format
2. Fetch AAPL daily from Tiingo, verify cache writes and reads correctly
3. Run comparison backtest, verify all three results returned and displayed
4. Clear cache, verify IndexedDB and localStorage both cleared
5. Disable API key, verify fallback to Synthetic works
6. Backtest with cached vs. fresh data, verify results identical

**Unit Tests:**
- `normalizeCandle()` handles each provider's format
- `validateCandle()` accepts valid OHLC, rejects invalid
- Cache TTL logic: expired → null, valid → data
- Fallback logic: API fail → cache → Synthetic

---

## 12. Performance Targets

- **Cold start** (first backtest): ~3-5s (API call + normalization)
- **Warm start** (cached): <500ms (IndexedDB read + backtest)
- **Compare mode**: ~8-12s (3 parallel API calls + backtest)
- **Cache size**: <50MB for ~2 years of hourly data per symbol
- **API reduction**: 80%+ fewer calls after week of usage

---

## 13. Dependencies

**New npm packages:**
- `idb` — IndexedDB wrapper for simpler API
- `axios` (if not already present) — HTTP client

**No breaking changes** to existing backtester, auth, or UI.

---

## 14. Future Extensions (Out of Scope)

- Live data feed (real-time price updates)
- News/sentiment data integration
- Machine learning on backtests (strategy optimization)
- Multi-symbol correlation analysis
- Cloud storage for backtests (Supabase)
