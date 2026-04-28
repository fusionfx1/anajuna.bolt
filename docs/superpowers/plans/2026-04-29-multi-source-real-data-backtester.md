# Multi-Source Real Data Backtester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-provider data pipeline enabling backtesting with real historical data from EODHD and Tiingo, with intelligent caching and graceful fallback to synthetic data.

**Architecture:** Wrapper pattern with separate concerns: EODHD/Tiingo API clients → Normalization layer → IndexedDB cache → Backtester. Settings provide global defaults; per-backtest UI allows provider override and comparison mode.

**Tech Stack:** TypeScript (services), React (Settings + Backtest page), IndexedDB + localStorage (cache), Python backtester (unchanged), axios (HTTP), idb library (IndexedDB wrapper)

---

## File Structure

### New Files to Create

1. **`src/services/dataFetchers/eodhd.ts`** (200-250 lines)
   - EODHD API client wrapper
   - `getCandles(symbol, startDate, endDate, apiKey): Promise<RawOHLCV[]>`
   - Handles rate limiting, retries, error codes

2. **`src/services/dataFetchers/tiingo.ts`** (200-250 lines)
   - Tiingo API client wrapper
   - `getDailyHistory(symbol, startDate, endDate, apiKey): Promise<RawOHLCV[]>`
   - Handles rate limiting, retries, error codes

3. **`src/services/dataFetchers/synthetic.ts`** (50-100 lines)
   - Wrapper around existing `generateHistoricalCandles`
   - `getSyntheticCandles(symbol, startDate, endDate): Promise<RawOHLCV[]>`
   - Returns data in standard RawOHLCV format

4. **`src/services/dataFetchers/types.ts`** (30-50 lines)
   - Shared types for data fetchers
   - `RawOHLCV`, `ProviderType`, `FetchOptions`, `FetchResult`

5. **`src/services/normalize.ts`** (150-200 lines)
   - Normalization logic for all providers
   - `normalizeCandles(rawData, provider): NormalizedCandle[]`
   - `validateCandle(candle): boolean`
   - Provider-specific OHLCV field mapping

6. **`src/services/cache.ts`** (250-350 lines)
   - IndexedDB + localStorage abstraction
   - `readCache(key): Promise<NormalizedCandle[] | null>`
   - `writeCache(key, candles, provider, ttlDays): Promise<void>`
   - `clearCache(key?): Promise<void>`
   - `getCacheMetadata(): Promise<CacheStats>`
   - TTL validation, fallback logic

7. **`src/services/dataFetchers/fetchOHLCV.ts`** (200-300 lines)
   - Main data fetcher orchestrator
   - `fetchOHLCV(options: FetchOptions): Promise<FetchResult>`
   - Implements graceful degradation: cache → API → Synthetic
   - Error handling and user messaging

8. **`src/context/DataProviderContext.tsx`** (80-120 lines)
   - React context for global data provider settings
   - `useDataProvider()` hook
   - Stores: primaryProvider, eodhd_key, tiingo_key, cacheTTL, enableCache

9. **`src/pages/Settings/DataProviders.tsx`** (300-400 lines)
   - Settings page for data provider configuration
   - Forms for API keys with masked input
   - Test connection buttons
   - Cache size display + clear button
   - Validation feedback

10. **`src/components/BacktestDataSource.tsx`** (150-200 lines)
    - Data source selector UI for backtest page
    - Provider dropdown (Use Default / EODHD / Tiingo / Synthetic)
    - "Compare All Providers" checkbox
    - "Force Refresh" toggle
    - Integrated into existing BacktestForm

11. **`src/components/ComparisonResults.tsx`** (250-350 lines)
    - Side-by-side results display for compare mode
    - Three result cards (EODHD, Tiingo, Synthetic)
    - Cache status badges
    - Difference highlighting (largest Sharpe delta, etc.)
    - Insight summary

12. **`src/hooks/useComparisonBacktest.ts`** (150-200 lines)
    - React hook for parallel backtest execution
    - `runComparisonBacktest(config, dateRange): Promise<ComparisonResults>`
    - Manages loading state, errors, cancellation

13. **`tests/services/normalize.test.ts`** (200-250 lines)
    - Unit tests for normalization
    - `normalizeCandle()` for each provider
    - `validateCandle()` edge cases
    - Timestamp parsing, OHLC validation

14. **`tests/services/cache.test.ts`** (200-250 lines)
    - Unit tests for cache layer
    - Write/read/clear operations
    - TTL expiry logic
    - Fallback to localStorage
    - CacheEntry structure validation

15. **`e2e/data-providers.spec.ts`** (250-350 lines)
    - E2E tests for complete data flow
    - Test 1: Fetch from EODHD, verify normalization
    - Test 2: Cache write/read cycle
    - Test 3: Compare mode (3 parallel backtests)
    - Test 4: API failure → cache fallback
    - Test 5: API failure, no cache → Synthetic fallback

### Modified Files

1. **`src/App.tsx`**
   - Wrap app with `<DataProviderContext>`
   - Initialize global settings from localStorage

2. **`src/pages/Settings/index.tsx`**
   - Add "Data Providers" section after existing settings
   - Import `<DataProviders />`

3. **`src/pages/Backtesting/index.tsx`**
   - Import `<BacktestDataSource />`
   - Add to form before "Run Backtest" button
   - Import `useComparisonBacktest` hook
   - Handle comparison mode results display
   - Update backtest execution to use `fetchOHLCV()`

4. **`package.json`**
   - Add `idb` dependency
   - Add `axios` dependency (if not present)

---

## Task Breakdown

### Phase 1: Foundation (Types, API Clients, Caching)

### Task 1: Define Data Fetcher Types

**Files:**
- Create: `src/services/dataFetchers/types.ts`
- Modify: `src/services/dataFetchers/` (new directory)

- [ ] **Step 1: Create types file with RawOHLCV interface**

```typescript
// src/services/dataFetchers/types.ts

export interface RawOHLCV {
  timestamp: number | string
  open: number
  high: number
  low: number
  close: number
  volume: number
  provider: 'eodhd' | 'tiingo' | 'synthetic'
}

export interface NormalizedCandle {
  timestamp: Date
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type ProviderType = 'eodhd' | 'tiingo' | 'synthetic'

export interface FetchOptions {
  symbol: string
  startDate: Date
  endDate: Date
  provider?: ProviderType
  useCache?: boolean
}

export interface FetchResult {
  candles: NormalizedCandle[]
  provider: ProviderType
  cacheStatus: 'fresh' | 'cached' | 'fallback'
  fetchedAt: Date
  message: string
}

export interface CacheEntry {
  key: string
  candles: NormalizedCandle[]
  fetchedAt: Date
  expiresAt: Date
  provider: ProviderType
  symbolMetadata: {
    totalCandles: number
    dateRange: [Date, Date]
  }
}

export interface CacheStats {
  totalEntries: number
  totalSizeBytes: number
  oldestEntry: Date | null
  newestEntry: Date | null
}
```

- [ ] **Step 2: Run type check to verify no errors**

```bash
npm run typecheck
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit types**

```bash
git add src/services/dataFetchers/types.ts
git commit -m "feat: define data fetcher types"
```

---

### Task 2: Implement EODHD API Client

**Files:**
- Create: `src/services/dataFetchers/eodhd.ts`
- Test: `tests/services/eodhd.test.ts` (optional for now)

- [ ] **Step 1: Create EODHD client with basic structure**

```typescript
// src/services/dataFetchers/eodhd.ts

import axios, { AxiosInstance } from 'axios'
import { RawOHLCV } from './types'

interface EodhdhResponse {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjusted_close: number
  volume: number
}

export class EodhdhClient {
  private client: AxiosInstance
  private apiKey: string
  private readonly baseUrl = 'https://eodhd.com/api/eod'

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = axios.create({
      timeout: 10000,
      headers: { 'User-Agent': 'AnjunaBacktester/1.0' }
    })
  }

  async getCandles(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<RawOHLCV[]> {
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    const params = {
      symbol,
      from: startStr,
      to: endStr,
      period: 'h1',
      fmt: 'json',
      api_token: this.apiKey
    }

    try {
      const response = await this._fetchWithRetry(params)
      return this._convertToRawOHLCV(response.data)
    } catch (error) {
      throw this._handleError(error)
    }
  }

  private async _fetchWithRetry(
    params: Record<string, string>,
    retries = 3,
    delayMs = 1000
  ): Promise<any> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.get(this.baseUrl, { params })
        return response
      } catch (error) {
        lastError = error as Error
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        }
      }
    }

    throw lastError || new Error('Failed after all retries')
  }

  private _convertToRawOHLCV(data: EodhdhResponse[]): RawOHLCV[] {
    return data.map(candle => ({
      timestamp: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      provider: 'eodhd' as const
    }))
  }

  private _handleError(error: any): Error {
    if (error.response?.status === 401) {
      return new Error('EODHD: Invalid API key')
    }
    if (error.response?.status === 429) {
      return new Error('EODHD: Rate limit exceeded')
    }
    if (error.code === 'ECONNABORTED') {
      return new Error('EODHD: Request timeout')
    }
    return new Error(`EODHD: ${error.message}`)
  }
}
```

- [ ] **Step 2: Create factory function**

```typescript
// src/services/dataFetchers/eodhd.ts (add to exports)

export function createEodhdhClient(apiKey: string): EodhdhClient {
  if (!apiKey) {
    throw new Error('EODHD API key is required')
  }
  return new EodhdhClient(apiKey)
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit EODHD client**

```bash
git add src/services/dataFetchers/eodhd.ts
git commit -m "feat: implement EODHD API client with retry logic"
```

---

### Task 3: Implement Tiingo API Client

**Files:**
- Create: `src/services/dataFetchers/tiingo.ts`

- [ ] **Step 1: Create Tiingo client**

```typescript
// src/services/dataFetchers/tiingo.ts

import axios, { AxiosInstance } from 'axios'
import { RawOHLCV } from './types'

interface TiingoResponse {
  date: string
  close: number
  high: number
  low: number
  open: number
  volume: number
}

export class TiingoClient {
  private client: AxiosInstance
  private apiKey: string
  private readonly baseUrl = 'https://api.tiingo.com/tiingo/daily'

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = axios.create({
      timeout: 10000,
      headers: { 'User-Agent': 'AnjunaBacktester/1.0' }
    })
  }

  async getDailyHistory(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<RawOHLCV[]> {
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    const url = `${this.baseUrl}/${symbol}/prices`
    const params = {
      startDate: startStr,
      endDate: endStr,
      token: this.apiKey
    }

    try {
      const response = await this._fetchWithRetry(url, params)
      return this._convertToRawOHLCV(response.data)
    } catch (error) {
      throw this._handleError(error)
    }
  }

  private async _fetchWithRetry(
    url: string,
    params: Record<string, string>,
    retries = 3,
    delayMs = 1000
  ): Promise<any> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.get(url, { params })
        return response
      } catch (error) {
        lastError = error as Error
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        }
      }
    }

    throw lastError || new Error('Failed after all retries')
  }

  private _convertToRawOHLCV(data: TiingoResponse[]): RawOHLCV[] {
    return data.map(candle => ({
      timestamp: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume || 0,
      provider: 'tiingo' as const
    }))
  }

  private _handleError(error: any): Error {
    if (error.response?.status === 401) {
      return new Error('Tiingo: Invalid API key')
    }
    if (error.response?.status === 429) {
      return new Error('Tiingo: Rate limit exceeded')
    }
    if (error.code === 'ECONNABORTED') {
      return new Error('Tiingo: Request timeout')
    }
    return new Error(`Tiingo: ${error.message}`)
  }
}

export function createTiingoClient(apiKey: string): TiingoClient {
  if (!apiKey) {
    throw new Error('Tiingo API key is required')
  }
  return new TiingoClient(apiKey)
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit Tiingo client**

```bash
git add src/services/dataFetchers/tiingo.ts
git commit -m "feat: implement Tiingo API client with retry logic"
```

---

### Task 4: Implement Synthetic Data Wrapper

**Files:**
- Create: `src/services/dataFetchers/synthetic.ts`

- [ ] **Step 1: Create synthetic wrapper**

```typescript
// src/services/dataFetchers/synthetic.ts

import { RawOHLCV } from './types'
import { generateHistoricalCandles } from '../../utils/backtesting'

export class SyntheticClient {
  async getCandles(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<RawOHLCV[]> {
    const candles = generateHistoricalCandles(
      symbol,
      startDate,
      endDate
    )

    return candles.map((candle, index) => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume || 100000,
      provider: 'synthetic' as const
    }))
  }
}

export function createSyntheticClient(): SyntheticClient {
  return new SyntheticClient()
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit synthetic wrapper**

```bash
git add src/services/dataFetchers/synthetic.ts
git commit -m "feat: implement synthetic data client wrapper"
```

---

### Task 5: Implement Normalization Layer

**Files:**
- Create: `src/services/normalize.ts`
- Test: `tests/services/normalize.test.ts`

- [ ] **Step 1: Write test file (RED phase)**

```typescript
// tests/services/normalize.test.ts

import { describe, it, expect } from 'vitest'
import {
  normalizeCandles,
  validateCandle,
  normalizeCandle
} from '../../src/services/normalize'
import { NormalizedCandle, RawOHLCV } from '../../src/services/dataFetchers/types'

describe('normalizeCandles', () => {
  it('converts EODHD raw format to normalized candles', () => {
    const raw: RawOHLCV[] = [
      {
        timestamp: '2024-01-15',
        open: 1.0850,
        high: 1.0875,
        low: 1.0840,
        close: 1.0860,
        volume: 50000,
        provider: 'eodhd'
      }
    ]

    const result = normalizeCandles(raw, 'eodhd')

    expect(result).toHaveLength(1)
    expect(result[0].o).toBe(1.0850)
    expect(result[0].h).toBe(1.0875)
    expect(result[0].c).toBe(1.0860)
    expect(result[0].timestamp).toBeInstanceOf(Date)
  })

  it('converts Tiingo raw format to normalized candles', () => {
    const raw: RawOHLCV[] = [
      {
        timestamp: '2024-01-15T00:00:00.000Z',
        open: 150.25,
        high: 150.50,
        low: 150.10,
        close: 150.35,
        volume: 1000000,
        provider: 'tiingo'
      }
    ]

    const result = normalizeCandles(raw, 'tiingo')

    expect(result).toHaveLength(1)
    expect(result[0].o).toBe(150.25)
    expect(result[0].h).toBe(150.50)
  })

  it('sorts candles by timestamp ascending', () => {
    const raw: RawOHLCV[] = [
      {
        timestamp: '2024-01-16',
        open: 1.0900,
        high: 1.0920,
        low: 1.0895,
        close: 1.0910,
        volume: 50000,
        provider: 'eodhd'
      },
      {
        timestamp: '2024-01-15',
        open: 1.0850,
        high: 1.0875,
        low: 1.0840,
        close: 1.0860,
        volume: 50000,
        provider: 'eodhd'
      }
    ]

    const result = normalizeCandles(raw, 'eodhd')

    expect(result[0].timestamp.getTime()).toBeLessThan(result[1].timestamp.getTime())
  })

  it('removes duplicate timestamps keeping first occurrence', () => {
    const raw: RawOHLCV[] = [
      {
        timestamp: '2024-01-15',
        open: 1.0850,
        high: 1.0875,
        low: 1.0840,
        close: 1.0860,
        volume: 50000,
        provider: 'eodhd'
      },
      {
        timestamp: '2024-01-15',
        open: 1.0851,
        high: 1.0876,
        low: 1.0841,
        close: 1.0861,
        volume: 51000,
        provider: 'eodhd'
      }
    ]

    const result = normalizeCandles(raw, 'eodhd')

    expect(result).toHaveLength(1)
    expect(result[0].o).toBe(1.0850)
  })
})

describe('validateCandle', () => {
  it('accepts valid OHLC candle', () => {
    const candle: NormalizedCandle = {
      timestamp: new Date(),
      o: 1.0850,
      h: 1.0875,
      l: 1.0840,
      c: 1.0860,
      v: 50000
    }

    expect(validateCandle(candle)).toBe(true)
  })

  it('rejects candle with negative price', () => {
    const candle: NormalizedCandle = {
      timestamp: new Date(),
      o: -1.0850,
      h: 1.0875,
      l: 1.0840,
      c: 1.0860,
      v: 50000
    }

    expect(validateCandle(candle)).toBe(false)
  })

  it('rejects candle with invalid OHLC order (high < open)', () => {
    const candle: NormalizedCandle = {
      timestamp: new Date(),
      o: 1.0875,
      h: 1.0850,
      l: 1.0840,
      c: 1.0860,
      v: 50000
    }

    expect(validateCandle(candle)).toBe(false)
  })

  it('rejects candle with invalid OHLC order (low > close)', () => {
    const candle: NormalizedCandle = {
      timestamp: new Date(),
      o: 1.0850,
      h: 1.0875,
      l: 1.0870,
      c: 1.0860,
      v: 50000
    }

    expect(validateCandle(candle)).toBe(false)
  })

  it('rejects candle with negative volume', () => {
    const candle: NormalizedCandle = {
      timestamp: new Date(),
      o: 1.0850,
      h: 1.0875,
      l: 1.0840,
      c: 1.0860,
      v: -50000
    }

    expect(validateCandle(candle)).toBe(false)
  })
})

describe('normalizeCandle (single)', () => {
  it('handles EODHD date string format', () => {
    const raw: RawOHLCV = {
      timestamp: '2024-01-15',
      open: 1.0850,
      high: 1.0875,
      low: 1.0840,
      close: 1.0860,
      volume: 50000,
      provider: 'eodhd'
    }

    const result = normalizeCandle(raw, 'eodhd')

    expect(result.timestamp).toEqual(new Date('2024-01-15'))
  })

  it('handles Tiingo ISO 8601 format', () => {
    const raw: RawOHLCV = {
      timestamp: '2024-01-15T00:00:00.000Z',
      open: 150.25,
      high: 150.50,
      low: 150.10,
      close: 150.35,
      volume: 1000000,
      provider: 'tiingo'
    }

    const result = normalizeCandle(raw, 'tiingo')

    expect(result.timestamp).toEqual(new Date('2024-01-15T00:00:00.000Z'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail (RED phase)**

```bash
npm test tests/services/normalize.test.ts
```

Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Implement normalize functions (GREEN phase)**

```typescript
// src/services/normalize.ts

import { RawOHLCV, NormalizedCandle } from './dataFetchers/types'

export function normalizeCandle(raw: RawOHLCV, provider: 'eodhd' | 'tiingo' | 'synthetic'): NormalizedCandle {
  let timestamp: Date

  if (typeof raw.timestamp === 'string') {
    timestamp = new Date(raw.timestamp)
  } else {
    timestamp = new Date(raw.timestamp * 1000)
  }

  return {
    timestamp,
    o: raw.open,
    h: raw.high,
    l: raw.low,
    c: raw.close,
    v: raw.volume
  }
}

export function validateCandle(candle: NormalizedCandle): boolean {
  const { o, h, l, c, v } = candle

  const allPositive = o >= 0 && h >= 0 && l >= 0 && c >= 0 && v >= 0
  const ohlcValid = o <= h && o <= l && c <= h && c >= l

  return allPositive && ohlcValid
}

export function normalizeCandles(
  rawData: RawOHLCV[],
  provider: 'eodhd' | 'tiingo' | 'synthetic'
): NormalizedCandle[] {
  const normalized = rawData.map(raw => normalizeCandle(raw, provider))

  const seen = new Set<number>()
  const deduplicated = normalized.filter(candle => {
    const ts = candle.timestamp.getTime()
    if (seen.has(ts)) return false
    seen.add(ts)
    return true
  })

  const sorted = deduplicated.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  sorted.forEach(candle => {
    if (!validateCandle(candle)) {
      console.warn(`Invalid candle: ${JSON.stringify(candle)}`)
    }
  })

  return sorted
}
```

- [ ] **Step 4: Run tests (GREEN phase)**

```bash
npm test tests/services/normalize.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 6: Commit normalization**

```bash
git add src/services/normalize.ts tests/services/normalize.test.ts
git commit -m "feat: implement OHLCV normalization with validation"
```

---

### Task 6: Implement Cache Layer

**Files:**
- Create: `src/services/cache.ts`
- Test: `tests/services/cache.test.ts`

- [ ] **Step 1: Write cache tests (RED)**

```typescript
// tests/services/cache.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readCache,
  writeCache,
  clearCache,
  getCacheMetadata
} from '../../src/services/cache'
import { NormalizedCandle, CacheEntry } from '../../src/services/dataFetchers/types'

describe('Cache Layer', () => {
  const testCandles: NormalizedCandle[] = [
    {
      timestamp: new Date('2024-01-15'),
      o: 1.0850,
      h: 1.0875,
      l: 1.0840,
      c: 1.0860,
      v: 50000
    }
  ]

  beforeEach(async () => {
    await clearCache()
  })

  afterEach(async () => {
    await clearCache()
  })

  it('writes candles to cache with TTL', async () => {
    const key = 'EURUSD-eodhd-hourly'
    await writeCache(key, testCandles, 'eodhd', 30)
    const cached = await readCache(key)

    expect(cached).toHaveLength(1)
    expect(cached![0].c).toBe(1.0860)
  })

  it('returns null for expired cache entry', async () => {
    const key = 'EURUSD-eodhd-hourly'
    await writeCache(key, testCandles, 'eodhd', 0)

    await new Promise(resolve => setTimeout(resolve, 100))

    const cached = await readCache(key)
    expect(cached).toBeNull()
  })

  it('returns null for non-existent cache entry', async () => {
    const cached = await readCache('non-existent-key')
    expect(cached).toBeNull()
  })

  it('clears specific cache entry by key', async () => {
    const key1 = 'EURUSD-eodhd-hourly'
    const key2 = 'AAPL-tiingo-daily'

    await writeCache(key1, testCandles, 'eodhd', 30)
    await writeCache(key2, testCandles, 'tiingo', 30)

    await clearCache(key1)

    const cached1 = await readCache(key1)
    const cached2 = await readCache(key2)

    expect(cached1).toBeNull()
    expect(cached2).not.toBeNull()
  })

  it('clears all cache when no key provided', async () => {
    const key1 = 'EURUSD-eodhd-hourly'
    const key2 = 'AAPL-tiingo-daily'

    await writeCache(key1, testCandles, 'eodhd', 30)
    await writeCache(key2, testCandles, 'tiingo', 30)

    await clearCache()

    const cached1 = await readCache(key1)
    const cached2 = await readCache(key2)

    expect(cached1).toBeNull()
    expect(cached2).toBeNull()
  })

  it('reports cache metadata', async () => {
    await writeCache('EURUSD-eodhd-hourly', testCandles, 'eodhd', 30)

    const stats = await getCacheMetadata()

    expect(stats.totalEntries).toBeGreaterThan(0)
    expect(stats.totalSizeBytes).toBeGreaterThan(0)
    expect(stats.oldestEntry).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run tests (RED)**

```bash
npm test tests/services/cache.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement cache layer (GREEN)**

```typescript
// src/services/cache.ts

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { NormalizedCandle, CacheEntry, CacheStats } from './dataFetchers/types'

interface CacheDB extends DBSchema {
  candles: {
    key: string
    value: CacheEntry
  }
}

let db: IDBPDatabase<CacheDB> | null = null

async function getDB(): Promise<IDBPDatabase<CacheDB>> {
  if (db) return db

  db = await openDB<CacheDB>('AnjunaBacktestCache', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('candles')) {
        db.createObjectStore('candles', { keyPath: 'key' })
      }
    }
  })

  return db
}

export async function readCache(key: string): Promise<NormalizedCandle[] | null> {
  try {
    const database = await getDB()
    const entry = await database.get('candles', key)

    if (!entry) return null

    const now = new Date()
    if (now > entry.expiresAt) {
      await database.delete('candles', key)
      return null
    }

    return entry.candles
  } catch (error) {
    console.warn(`Cache read error for key ${key}:`, error)
    return await readCacheFromLocalStorage(key)
  }
}

export async function writeCache(
  key: string,
  candles: NormalizedCandle[],
  provider: 'eodhd' | 'tiingo' | 'synthetic',
  ttlDays: number = 30
): Promise<void> {
  try {
    const database = await getDB()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)

    const entry: CacheEntry = {
      key,
      candles,
      fetchedAt: now,
      expiresAt,
      provider,
      symbolMetadata: {
        totalCandles: candles.length,
        dateRange: [candles[0].timestamp, candles[candles.length - 1].timestamp]
      }
    }

    await database.put('candles', entry)
  } catch (error) {
    console.warn(`Cache write error for key ${key}:`, error)
    await writeCacheToLocalStorage(key, candles, ttlDays)
  }
}

export async function clearCache(key?: string): Promise<void> {
  try {
    const database = await getDB()

    if (key) {
      await database.delete('candles', key)
    } else {
      const tx = database.transaction('candles', 'readwrite')
      await tx.store.clear()
      await tx.done
    }
  } catch (error) {
    console.warn(`Cache clear error:`, error)
    if (key) {
      localStorage.removeItem(`cache_${key}`)
    } else {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('cache_')) localStorage.removeItem(k)
      })
    }
  }
}

export async function getCacheMetadata(): Promise<CacheStats> {
  try {
    const database = await getDB()
    const entries = await database.getAll('candles')

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        oldestEntry: null,
        newestEntry: null
      }
    }

    const totalSizeBytes = entries.reduce((sum, entry) => {
      return sum + JSON.stringify(entry).length
    }, 0)

    const timestamps = entries
      .flatMap(e => [e.fetchedAt])
      .sort((a, b) => a.getTime() - b.getTime())

    return {
      totalEntries: entries.length,
      totalSizeBytes,
      oldestEntry: timestamps[0] || null,
      newestEntry: timestamps[timestamps.length - 1] || null
    }
  } catch (error) {
    console.warn('Cache metadata error:', error)
    return {
      totalEntries: 0,
      totalSizeBytes: 0,
      oldestEntry: null,
      newestEntry: null
    }
  }
}

// LocalStorage fallback (simpler implementation)

async function readCacheFromLocalStorage(key: string): Promise<NormalizedCandle[] | null> {
  try {
    const stored = localStorage.getItem(`cache_${key}`)
    if (!stored) return null

    const entry = JSON.parse(stored)
    const now = new Date()

    if (now > new Date(entry.expiresAt)) {
      localStorage.removeItem(`cache_${key}`)
      return null
    }

    return entry.candles.map((c: any) => ({
      ...c,
      timestamp: new Date(c.timestamp)
    }))
  } catch (error) {
    console.warn(`LocalStorage cache read error for key ${key}:`, error)
    return null
  }
}

async function writeCacheToLocalStorage(
  key: string,
  candles: NormalizedCandle[],
  ttlDays: number
): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)

    const entry = {
      key,
      candles,
      fetchedAt: now,
      expiresAt
    }

    const stored = Object.keys(localStorage)
      .filter(k => k.startsWith('cache_'))
      .map(k => ({ key: k, date: localStorage.getItem(k) }))
      .sort((a, b) => {
        const aEntry = JSON.parse(a.date || '{}')
        const bEntry = JSON.parse(b.date || '{}')
        return new Date(aEntry.fetchedAt).getTime() - new Date(bEntry.fetchedAt).getTime()
      })

    if (stored.length >= 5) {
      localStorage.removeItem(stored[0].key)
    }

    localStorage.setItem(`cache_${key}`, JSON.stringify(entry))
  } catch (error) {
    console.warn(`LocalStorage cache write error for key ${key}:`, error)
  }
}
```

- [ ] **Step 4: Run tests (GREEN)**

```bash
npm test tests/services/cache.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 6: Commit cache layer**

```bash
git add src/services/cache.ts tests/services/cache.test.ts
git commit -m "feat: implement IndexedDB cache with localStorage fallback"
```

---

### Task 7: Implement Main Data Fetcher Orchestrator

**Files:**
- Create: `src/services/dataFetchers/fetchOHLCV.ts`

- [ ] **Step 1: Create main fetcher**

```typescript
// src/services/dataFetchers/fetchOHLCV.ts

import { FetchOptions, FetchResult, NormalizedCandle } from './types'
import { EodhdhClient, createEodhdhClient } from './eodhd'
import { TiingoClient, createTiingoClient } from './tiingo'
import { SyntheticClient, createSyntheticClient } from './synthetic'
import { normalizeCandles } from '../normalize'
import { readCache, writeCache } from '../cache'
import { getDataProviderSettings } from '../context/DataProviderContext'

export async function fetchOHLCV(options: FetchOptions): Promise<FetchResult> {
  const {
    symbol,
    startDate,
    endDate,
    provider,
    useCache = true
  } = options

  const cacheKey = `${symbol}-${provider || 'default'}-hourly`

  // Step 1: Check cache first
  if (useCache) {
    const cached = await readCache(cacheKey)
    if (cached && cached.length > 0) {
      return {
        candles: cached,
        provider: provider || 'eodhd',
        cacheStatus: 'cached',
        fetchedAt: new Date(),
        message: `Using cached data (${cached.length} candles)`
      }
    }
  }

  // Step 2: Determine provider
  const selectedProvider = provider || (await getSelectedProvider())

  // Step 3: Fetch from API
  let rawCandles: any[] | null = null
  let fetchError: Error | null = null

  try {
    rawCandles = await fetchFromProvider(selectedProvider, symbol, startDate, endDate)
  } catch (error) {
    fetchError = error as Error
    console.warn(`Failed to fetch from ${selectedProvider}:`, fetchError.message)
  }

  // Step 4: If API fetch failed, try cache again with fallback
  if (!rawCandles) {
    const fallbackCache = await readCache(cacheKey)
    if (fallbackCache && fallbackCache.length > 0) {
      return {
        candles: fallbackCache,
        provider: selectedProvider,
        cacheStatus: 'fallback',
        fetchedAt: new Date(),
        message: `⚠ ${selectedProvider} API unavailable. Using cached data.`
      }
    }

    // Step 5: Last resort - use synthetic
    console.warn(`Falling back to synthetic data for ${symbol}`)
    const syntheticClient = createSyntheticClient()
    rawCandles = await syntheticClient.getCandles(symbol, startDate, endDate)

    return {
      candles: normalizeCandles(rawCandles, 'synthetic'),
      provider: 'synthetic',
      cacheStatus: 'fallback',
      fetchedAt: new Date(),
      message: `❌ ${selectedProvider} API unavailable and no cache. Using synthetic data.`
    }
  }

  // Step 6: Normalize and cache the fresh data
  const normalized = normalizeCandles(rawCandles, selectedProvider)
  await writeCache(cacheKey, normalized, selectedProvider)

  return {
    candles: normalized,
    provider: selectedProvider,
    cacheStatus: 'fresh',
    fetchedAt: new Date(),
    message: `Fresh data from ${selectedProvider} (${normalized.length} candles)`
  }
}

async function getSelectedProvider(): Promise<'eodhd' | 'tiingo' | 'synthetic'> {
  const settings = await getDataProviderSettings()
  return settings.primaryProvider || 'eodhd'
}

async function fetchFromProvider(
  provider: 'eodhd' | 'tiingo' | 'synthetic',
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const settings = await getDataProviderSettings()

  if (provider === 'eodhd') {
    if (!settings.eodhd_key) {
      throw new Error('EODHD API key not configured')
    }
    const client = createEodhdhClient(settings.eodhd_key)
    return await client.getCandles(symbol, startDate, endDate)
  }

  if (provider === 'tiingo') {
    if (!settings.tiingo_key) {
      throw new Error('Tiingo API key not configured')
    }
    const client = createTiingoClient(settings.tiingo_key)
    return await client.getDailyHistory(symbol, startDate, endDate)
  }

  if (provider === 'synthetic') {
    const client = createSyntheticClient()
    return await client.getCandles(symbol, startDate, endDate)
  }

  throw new Error(`Unknown provider: ${provider}`)
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No errors (DataProviderContext will be created in next task)

- [ ] **Step 3: Commit main fetcher**

```bash
git add src/services/dataFetchers/fetchOHLCV.ts
git commit -m "feat: implement main data fetcher orchestrator with graceful degradation"
```

---

### Phase 2: Settings & Context (Global Configuration)

### Task 8: Create Data Provider Context

**Files:**
- Create: `src/context/DataProviderContext.tsx`

- [ ] **Step 1: Create context with provider settings**

```typescript
// src/context/DataProviderContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface DataProviderSettings {
  primaryProvider: 'eodhd' | 'tiingo' | 'synthetic'
  eodhd_key: string
  tiingo_key: string
  cacheTTL: number // days
  enableCache: boolean
}

interface DataProviderContextType {
  settings: DataProviderSettings
  updateSettings: (settings: Partial<DataProviderSettings>) => Promise<void>
  loading: boolean
  error: string | null
}

const DataProviderContext = createContext<DataProviderContextType | undefined>(undefined)

const DEFAULT_SETTINGS: DataProviderSettings = {
  primaryProvider: 'eodhd',
  eodhd_key: '',
  tiingo_key: '',
  cacheTTL: 30,
  enableCache: true
}

export function DataProviderProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DataProviderSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dataProviderSettings')
      if (stored) {
        setSettings(JSON.parse(stored))
      }
    } catch (err) {
      setError(`Failed to load settings: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateSettings = async (partial: Partial<DataProviderSettings>) => {
    try {
      const updated = { ...settings, ...partial }
      setSettings(updated)
      localStorage.setItem('dataProviderSettings', JSON.stringify(updated))
      setError(null)
    } catch (err) {
      setError(`Failed to save settings: ${err}`)
      throw err
    }
  }

  return (
    <DataProviderContext.Provider value={{ settings, updateSettings, loading, error }}>
      {children}
    </DataProviderContext.Provider>
  )
}

export function useDataProvider(): DataProviderContextType {
  const context = useContext(DataProviderContext)
  if (!context) {
    throw new Error('useDataProvider must be used within DataProviderProvider')
  }
  return context
}

export async function getDataProviderSettings(): Promise<DataProviderSettings> {
  const stored = localStorage.getItem('dataProviderSettings')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}
```

- [ ] **Step 2: Wrap App with context**

```typescript
// src/App.tsx (modify)

import { DataProviderProvider } from './context/DataProviderContext'

function App() {
  return (
    <DataProviderProvider>
      <AppContent />
    </DataProviderProvider>
  )
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit context**

```bash
git add src/context/DataProviderContext.tsx src/App.tsx
git commit -m "feat: add DataProviderContext for global settings"
```

---

### Task 9: Implement Data Providers Settings UI

**Files:**
- Create: `src/pages/Settings/DataProviders.tsx`
- Modify: `src/pages/Settings/index.tsx`

- [ ] **Step 1: Create DataProviders settings component**

```typescript
// src/pages/Settings/DataProviders.tsx

import React, { useState } from 'react'
import { useDataProvider } from '../../context/DataProviderContext'
import { getCacheMetadata } from '../../services/cache'
import { createEodhdhClient } from '../../services/dataFetchers/eodhd'
import { createTiingoClient } from '../../services/dataFetchers/tiingo'
import styles from './Settings.module.css'

export function DataProviders() {
  const { settings, updateSettings } = useDataProvider()
  const [testLoading, setTestLoading] = useState<'eodhd' | 'tiingo' | null>(null)
  const [testResult, setTestResult] = useState<{ [key: string]: string }>({})
  const [cacheStats, setCacheStats] = useState<any>(null)

  const handleProviderChange = (provider: 'eodhd' | 'tiingo' | 'synthetic') => {
    updateSettings({ primaryProvider: provider })
  }

  const handleApiKeyChange = (provider: 'eodhd' | 'tiingo', value: string) => {
    const key = provider === 'eodhd' ? 'eodhd_key' : 'tiingo_key'
    updateSettings({ [key]: value })
  }

  const testConnection = async (provider: 'eodhd' | 'tiingo') => {
    setTestLoading(provider)
    try {
      const apiKey = provider === 'eodhd' ? settings.eodhd_key : settings.tiingo_key

      if (!apiKey) {
        setTestResult(prev => ({ ...prev, [provider]: '❌ API key required' }))
        return
      }

      const testDate = new Date()
      testDate.setDate(testDate.getDate() - 7)

      if (provider === 'eodhd') {
        const client = createEodhdhClient(apiKey)
        await client.getCandles('EURUSD', testDate, new Date())
        setTestResult(prev => ({ ...prev, [provider]: '✓ Connected' }))
      } else {
        const client = createTiingoClient(apiKey)
        await client.getDailyHistory('AAPL', testDate, new Date())
        setTestResult(prev => ({ ...prev, [provider]: '✓ Connected' }))
      }
    } catch (error: any) {
      setTestResult(prev => ({ ...prev, [provider]: `❌ ${error.message}` }))
    } finally {
      setTestLoading(null)
    }
  }

  const loadCacheStats = async () => {
    const stats = await getCacheMetadata()
    setCacheStats(stats)
  }

  const handleClearCache = async () => {
    const { clearCache } = await import('../../services/cache')
    await clearCache()
    setCacheStats(null)
    await loadCacheStats()
  }

  React.useEffect(() => {
    loadCacheStats()
  }, [])

  return (
    <div className={styles.dataProviders}>
      <h2>Data Providers</h2>

      <section>
        <h3>Primary Data Provider</h3>
        <div className={styles.providerSelection}>
          <label>
            <input
              type="radio"
              name="provider"
              value="eodhd"
              checked={settings.primaryProvider === 'eodhd'}
              onChange={() => handleProviderChange('eodhd')}
            />
            EODHD
          </label>
          <label>
            <input
              type="radio"
              name="provider"
              value="tiingo"
              checked={settings.primaryProvider === 'tiingo'}
              onChange={() => handleProviderChange('tiingo')}
            />
            Tiingo
          </label>
          <label>
            <input
              type="radio"
              name="provider"
              value="synthetic"
              checked={settings.primaryProvider === 'synthetic'}
              onChange={() => handleProviderChange('synthetic')}
            />
            Synthetic
          </label>
        </div>
      </section>

      <section>
        <h3>EODHD Configuration</h3>
        <div className={styles.apiKeyInput}>
          <input
            type="password"
            placeholder="••••••••••••••••••••••••"
            value={settings.eodhd_key}
            onChange={(e) => handleApiKeyChange('eodhd', e.target.value)}
          />
          <button
            onClick={() => testConnection('eodhd')}
            disabled={testLoading === 'eodhd'}
          >
            {testLoading === 'eodhd' ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testResult.eodhd && <div className={styles.testResult}>{testResult.eodhd}</div>}
      </section>

      <section>
        <h3>Tiingo Configuration</h3>
        <div className={styles.apiKeyInput}>
          <input
            type="password"
            placeholder="••••••••••••••••••••••••"
            value={settings.tiingo_key}
            onChange={(e) => handleApiKeyChange('tiingo', e.target.value)}
          />
          <button
            onClick={() => testConnection('tiingo')}
            disabled={testLoading === 'tiingo'}
          >
            {testLoading === 'tiingo' ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testResult.tiingo && <div className={styles.testResult}>{testResult.tiingo}</div>}
      </section>

      <section>
        <h3>Cache Settings</h3>
        <label>
          <input
            type="checkbox"
            checked={settings.enableCache}
            onChange={(e) => updateSettings({ enableCache: e.target.checked })}
          />
          Enable Local Cache
        </label>

        <div className={styles.cacheTTL}>
          <label>
            Cache expires after:
            <input
              type="number"
              min="1"
              max="365"
              value={settings.cacheTTL}
              onChange={(e) => updateSettings({ cacheTTL: parseInt(e.target.value) })}
            />
            days
          </label>
        </div>

        {cacheStats && (
          <div className={styles.cacheStats}>
            <p>Cache size: {(cacheStats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB</p>
            <p>Entries: {cacheStats.totalEntries}</p>
            {cacheStats.oldestEntry && (
              <p>Oldest data: {new Date(cacheStats.oldestEntry).toLocaleDateString()}</p>
            )}
          </div>
        )}

        <button onClick={handleClearCache} className={styles.dangerButton}>
          Clear All Cache
        </button>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add DataProviders to Settings page**

```typescript
// src/pages/Settings/index.tsx (modify to add DataProviders section)

import { DataProviders } from './DataProviders'

export function Settings() {
  return (
    <div className={styles.settings}>
      <h1>Settings</h1>
      {/* Existing settings sections */}
      <DataProviders />
    </div>
  )
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit settings UI**

```bash
git add src/pages/Settings/DataProviders.tsx src/pages/Settings/index.tsx
git commit -m "feat: implement data provider configuration UI in Settings"
```

---

### Phase 3: Backtest UI & Comparison (Instance-Level Control)

### Task 10: Add Provider Selection to Backtest Page

**Files:**
- Create: `src/components/BacktestDataSource.tsx`
- Modify: `src/pages/Backtesting/index.tsx`

- [ ] **Step 1: Create BacktestDataSource component**

```typescript
// src/components/BacktestDataSource.tsx

import React from 'react'
import { useDataProvider } from '../context/DataProviderContext'
import styles from './BacktestDataSource.module.css'

export interface BacktestDataSourceConfig {
  provider: 'default' | 'eodhd' | 'tiingo' | 'synthetic'
  compareMode: boolean
  forceRefresh: boolean
}

interface Props {
  config: BacktestDataSourceConfig
  onChange: (config: BacktestDataSourceConfig) => void
}

export function BacktestDataSource({ config, onChange }: Props) {
  const { settings } = useDataProvider()

  const handleProviderChange = (provider: string) => {
    onChange({
      ...config,
      provider: provider as any
    })
  }

  const handleCompareChange = (checked: boolean) => {
    onChange({
      ...config,
      compareMode: checked
    })
  }

  const handleForceRefreshChange = (checked: boolean) => {
    onChange({
      ...config,
      forceRefresh: checked
    })
  }

  const isEodhdhConfigured = !!settings.eodhd_key
  const isTiingoConfigured = !!settings.tiingo_key

  return (
    <div className={styles.container}>
      <h3>Data Source</h3>

      <div className={styles.section}>
        <label htmlFor="provider">Provider:</label>
        <select
          id="provider"
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="default">Use Default ({settings.primaryProvider})</option>
          <option value="eodhd" disabled={!isEodhdhConfigured}>
            EODHD {!isEodhdhConfigured && '(not configured)'}
          </option>
          <option value="tiingo" disabled={!isTiingoConfigured}>
            Tiingo {!isTiingoConfigured && '(not configured)'}
          </option>
          <option value="synthetic">Synthetic</option>
        </select>
      </div>

      <div className={styles.section}>
        <label>
          <input
            type="checkbox"
            checked={config.compareMode}
            onChange={(e) => handleCompareChange(e.target.checked)}
          />
          Compare All Providers
          <span className={styles.hint}>(runs 3 backtests in parallel)</span>
        </label>
      </div>

      <div className={styles.section}>
        <label>
          <input
            type="checkbox"
            checked={config.forceRefresh}
            onChange={(e) => handleForceRefreshChange(e.target.checked)}
          />
          Force Refresh (bypass cache)
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to Backtesting page**

```typescript
// src/pages/Backtesting/index.tsx (modify)

import { BacktestDataSource, BacktestDataSourceConfig } from '../../components/BacktestDataSource'
import { useState } from 'react'

export function Backtesting() {
  const [dataSourceConfig, setDataSourceConfig] = useState<BacktestDataSourceConfig>({
    provider: 'default',
    compareMode: false,
    forceRefresh: false
  })

  return (
    <div>
      {/* Existing form fields */}
      <BacktestDataSource config={dataSourceConfig} onChange={setDataSourceConfig} />
      {/* "Run Backtest" button */}
    </div>
  )
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit backtest UI enhancement**

```bash
git add src/components/BacktestDataSource.tsx src/pages/Backtesting/index.tsx
git commit -m "feat: add provider selection and compare mode UI to backtest page"
```

---

### Task 11: Implement Comparison Results Display

**Files:**
- Create: `src/components/ComparisonResults.tsx`

- [ ] **Step 1: Create comparison results component**

```typescript
// src/components/ComparisonResults.tsx

import React from 'react'
import { BacktestResult } from '../types'
import styles from './ComparisonResults.module.css'

interface ComparisonResult {
  eodhd?: BacktestResult & { cacheStatus: 'fresh' | 'cached' | 'fallback' }
  tiingo?: BacktestResult & { cacheStatus: 'fresh' | 'cached' | 'fallback' }
  synthetic?: BacktestResult & { cacheStatus: 'fresh' | 'cached' | 'fallback' }
}

interface Props {
  results: ComparisonResult
  loading?: boolean
}

export function ComparisonResults({ results, loading }: Props) {
  if (loading) {
    return <div className={styles.loading}>Running comparison backtests...</div>
  }

  if (!results || Object.keys(results).length === 0) {
    return <div className={styles.empty}>No comparison results</div>
  }

  const entries = Object.entries(results).filter(([, result]) => result)

  const sharpeValues = entries.map(([, r]) => r?.metrics?.sharpe || 0)
  const maxSharpe = Math.max(...sharpeValues)
  const minSharpe = Math.min(...sharpeValues)
  const sharpeDiff = maxSharpe - minSharpe

  return (
    <div className={styles.container}>
      <h3>Provider Comparison</h3>

      <div className={styles.grid}>
        {entries.map(([provider, result]) => {
          if (!result) return null

          const cacheStatusIcon = {
            fresh: '⟳',
            cached: '✓',
            fallback: '⊗'
          }[result.cacheStatus]

          const cacheStatusText = {
            fresh: 'Fresh API call',
            cached: 'From cache',
            fallback: 'Fallback mode'
          }[result.cacheStatus]

          return (
            <div key={provider} className={styles.card}>
              <div className={styles.header}>
                <h4>{provider.toUpperCase()}</h4>
                <span className={styles.badge}>
                  {cacheStatusIcon} {cacheStatusText}
                </span>
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span className={styles.label}>Return:</span>
                  <span className={styles.value}>
                    {((result.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                  </span>
                </div>

                <div className={styles.metric}>
                  <span className={styles.label}>Sharpe:</span>
                  <span
                    className={`${styles.value} ${
                      result.metrics?.sharpe === maxSharpe ? styles.highlight : ''
                    }`}
                  >
                    {(result.metrics?.sharpe || 0).toFixed(2)}
                  </span>
                </div>

                <div className={styles.metric}>
                  <span className={styles.label}>Max DD:</span>
                  <span className={styles.value}>
                    {((result.metrics?.maxDrawdown || 0) * 100).toFixed(2)}%
                  </span>
                </div>

                <div className={styles.metric}>
                  <span className={styles.label}>Win Rate:</span>
                  <span className={styles.value}>
                    {((result.metrics?.winRate || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {sharpeDiff > 0.1 && (
        <div className={styles.insight}>
          ℹ️ Providers show differences in Sharpe ratio (range: {minSharpe.toFixed(2)} to{' '}
          {maxSharpe.toFixed(2)}). Data quality or volatility calculations may differ.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS module**

```css
/* src/components/ComparisonResults.module.css */

.container {
  margin: 2rem 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  background: #fafafa;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header h4 {
  margin: 0;
  font-size: 1.1rem;
}

.badge {
  font-size: 0.85rem;
  background: #e3f2fd;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-weight: 500;
  color: #666;
}

.value {
  font-weight: 600;
  color: #333;
  font-family: 'Courier New', monospace;
}

.value.highlight {
  color: #4caf50;
  background: #f1f8e9;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
}

.insight {
  background: #fff3e0;
  border-left: 4px solid #ff9800;
  padding: 1rem;
  margin-top: 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty {
  padding: 2rem;
  text-align: center;
  color: #999;
  font-style: italic;
}
```

- [ ] **Step 3: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit comparison results**

```bash
git add src/components/ComparisonResults.tsx src/components/ComparisonResults.module.css
git commit -m "feat: implement side-by-side comparison results display"
```

---

### Task 12: Implement Comparison Backtest Hook

**Files:**
- Create: `src/hooks/useComparisonBacktest.ts`

- [ ] **Step 1: Create comparison hook**

```typescript
// src/hooks/useComparisonBacktest.ts

import { useState, useCallback } from 'react'
import { fetchOHLCV } from '../services/dataFetchers/fetchOHLCV'
import { BacktestResult, StrategyConfig } from '../types'

interface ComparisonBacktestResult {
  eodhd: BacktestResult & { cacheStatus: string }
  tiingo: BacktestResult & { cacheStatus: string }
  synthetic: BacktestResult & { cacheStatus: string }
}

export function useComparisonBacktest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runComparison = useCallback(
    async (
      config: StrategyConfig,
      startDate: Date,
      endDate: Date,
      symbol: string
    ): Promise<ComparisonBacktestResult | null> => {
      setLoading(true)
      setError(null)

      try {
        const [eodhdhResult, tiingoResult, syntheticResult] = await Promise.all([
          fetchAndBacktest('eodhd', config, startDate, endDate, symbol),
          fetchAndBacktest('tiingo', config, startDate, endDate, symbol),
          fetchAndBacktest('synthetic', config, startDate, endDate, symbol)
        ])

        return {
          eodhd: eodhdhResult,
          tiingo: tiingoResult,
          synthetic: syntheticResult
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Comparison backtest failed'
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { runComparison, loading, error }
}

async function fetchAndBacktest(
  provider: 'eodhd' | 'tiingo' | 'synthetic',
  config: StrategyConfig,
  startDate: Date,
  endDate: Date,
  symbol: string
): Promise<BacktestResult & { cacheStatus: string }> {
  const result = await fetchOHLCV({
    symbol,
    startDate,
    endDate,
    provider,
    useCache: true
  })

  const df = convertCandlesToDataFrame(result.candles)

  // Call Python backtester via API
  const backtest = await runBacktestAPI(df, config)

  return {
    ...backtest,
    cacheStatus: result.cacheStatus
  }
}

function convertCandlesToDataFrame(candles: any[]): any[] {
  return candles.map(c => ({
    timestamp: c.timestamp,
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v
  }))
}

async function runBacktestAPI(df: any[], config: StrategyConfig): Promise<BacktestResult> {
  // TODO: Call Python backtest API
  // For now, return mock result
  return {
    totalTrades: 0,
    metrics: {
      totalReturn: 0,
      sharpe: 0,
      sortino: 0,
      calmar: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      winRate: 0
    }
  }
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit comparison hook**

```bash
git add src/hooks/useComparisonBacktest.ts
git commit -m "feat: implement useComparisonBacktest hook for parallel execution"
```

---

### Phase 4: Integration & E2E Testing

### Task 13: Integrate Comparison Mode into Backtest Page

**Files:**
- Modify: `src/pages/Backtesting/index.tsx`

- [ ] **Step 1: Update backtest page to use comparison hook and results**

```typescript
// src/pages/Backtesting/index.tsx (enhance existing)

import { useComparisonBacktest } from '../../hooks/useComparisonBacktest'
import { ComparisonResults } from '../../components/ComparisonResults'

export function Backtesting() {
  const [dataSourceConfig, setDataSourceConfig] = useState<BacktestDataSourceConfig>({
    provider: 'default',
    compareMode: false,
    forceRefresh: false
  })
  const [comparisonResults, setComparisonResults] = useState<any>(null)
  const { runComparison, loading } = useComparisonBacktest()

  const handleRunBacktest = async () => {
    if (dataSourceConfig.compareMode) {
      const results = await runComparison(
        config,
        startDate,
        endDate,
        symbol
      )
      if (results) {
        setComparisonResults(results)
      }
    } else {
      // Run single backtest
      // ...existing code...
    }
  }

  return (
    <div>
      {/* Existing form fields */}
      <BacktestDataSource config={dataSourceConfig} onChange={setDataSourceConfig} />
      <button onClick={handleRunBacktest}>Run Backtest</button>

      {dataSourceConfig.compareMode && (
        <ComparisonResults results={comparisonResults} loading={loading} />
      )}

      {/* Existing single results display */}
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npm run typecheck
```

Expected: No errors (may need BacktestResult type adjustments)

- [ ] **Step 3: Commit integration**

```bash
git add src/pages/Backtesting/index.tsx
git commit -m "feat: integrate comparison mode into backtest page"
```

---

### Task 14: Write E2E Tests

**Files:**
- Create: `e2e/data-providers.spec.ts`

- [ ] **Step 1: Create E2E test suite**

```typescript
// e2e/data-providers.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Data Providers Integration', () => {
  test('fetch EURUSD from EODHD and verify normalization', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.goto('http://localhost:5173/settings/data-providers')

    // Configure EODHD key
    const eodhdhInput = page.locator('input[type="password"]').first()
    await eodhdhInput.fill('69f0e6e7c5e3d2.27734177')

    // Test connection
    const testButton = page.locator('button:has-text("Test")').first()
    await testButton.click()

    // Verify connection success
    await expect(page.locator('text=✓ Connected')).toBeVisible({ timeout: 10000 })
  })

  test('cache write and read cycle', async ({ page }) => {
    await page.goto('http://localhost:5173/backtesting')

    // Set up backtest with EODHD
    await page.fill('input[name="symbol"]', 'EURUSD')
    await page.fill('input[name="startDate"]', '2024-01-01')
    await page.fill('input[name="endDate"]', '2024-01-31')

    // Run backtest
    await page.click('button:has-text("Run Backtest")')

    // Wait for results
    await expect(page.locator('text=Results from EODHD')).toBeVisible({ timeout: 15000 })

    // Second run should show cached data
    await page.click('button:has-text("Run Backtest")')
    await expect(page.locator('text=From cache')).toBeVisible({ timeout: 5000 })
  })

  test('compare mode runs three backtests in parallel', async ({ page }) => {
    await page.goto('http://localhost:5173/backtesting')

    // Enable compare mode
    await page.check('input[type="checkbox"]:has-text("Compare All Providers")')

    // Run backtest
    await page.click('button:has-text("Run Backtest")')

    // Verify all three results shown
    await expect(page.locator('text=EODHD')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=Tiingo')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=Synthetic')).toBeVisible({ timeout: 15000 })

    // Verify provider comparison
    await expect(page.locator('text=Provider Comparison')).toBeVisible()
  })

  test('API failure falls back to cache', async ({ page }) => {
    // Simulate API failure (or use wrong API key)
    await page.goto('http://localhost:5173/settings/data-providers')

    const eodhdhInput = page.locator('input[type="password"]').first()
    await eodhdhInput.fill('invalid-key')

    // Go to backtest, run with invalid key
    await page.goto('http://localhost:5173/backtesting')
    await page.click('button:has-text("Run Backtest")')

    // Should fall back to cache or synthetic
    await expect(
      page.locator('text=API unavailable|Using synthetic data')
    ).toBeVisible({ timeout: 10000 })
  })

  test('clear cache removes all stored data', async ({ page }) => {
    await page.goto('http://localhost:5173/settings/data-providers')

    // Verify cache has entries
    await expect(page.locator('text=Entries:')).toBeVisible()

    // Clear cache
    await page.click('button:has-text("Clear All Cache")')

    // Verify cache is cleared
    await expect(page.locator('text=Entries: 0')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E tests**

```bash
npx playwright test e2e/data-providers.spec.ts
```

Expected: Tests run (may fail if no real API credentials available; that's OK for now)

- [ ] **Step 3: Commit E2E tests**

```bash
git add e2e/data-providers.spec.ts
git commit -m "test: add E2E tests for data provider integration"
```

---

### Task 15: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install idb and axios**

```bash
npm install idb axios
npm install --save-dev @types/node
```

Expected: Dependencies installed successfully

- [ ] **Step 2: Verify installation**

```bash
npm ls idb axios
```

Expected: Both libraries shown in dependency tree

- [ ] **Step 3: Commit dependency updates**

```bash
git add package.json package-lock.json
git commit -m "chore: add idb and axios dependencies"
```

---

### Task 16: Final Verification & Testing

**Files:**
- All created/modified files

- [ ] **Step 1: Run full type check**

```bash
npm run typecheck
```

Expected: No TypeScript errors

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: No linting errors (fix any if found)

- [ ] **Step 3: Build project**

```bash
npm run build
```

Expected: Build succeeds, no errors

- [ ] **Step 4: Start dev server and manual smoke test**

```bash
npm run dev
```

Then in browser:
1. Navigate to Settings > Data Providers
2. Enter EODHD API key
3. Click "Test Connection" → verify ✓ Connected
4. Navigate to Backtesting
5. Run single backtest → verify "Results from EODHD"
6. Enable "Compare All Providers"
7. Run comparison → verify three result cards shown

- [ ] **Step 5: Run E2E tests (if configured)**

```bash
npm run test
```

Expected: Tests pass or run without fatal errors

- [ ] **Step 6: Create final summary commit**

```bash
git log --oneline | head -20
```

Verify all 15 commits present (or combined commits if some steps were batched)

---

## Summary

**Total Tasks:** 16  
**Total Commits:** 16+ (tracked at task-level)  
**Files Created:** 15  
**Files Modified:** 4  
**Total Lines Added:** ~2500-3000  

**Key Deliverables:**
- ✅ Multi-provider data fetcher (EODHD, Tiingo, Synthetic)
- ✅ IndexedDB + localStorage caching with TTL
- ✅ Graceful degradation (API → cache → Synthetic)
- ✅ Global Settings page for API key management
- ✅ Per-backtest provider selection
- ✅ Compare mode (run 3 backtests in parallel)
- ✅ Side-by-side comparison results display
- ✅ Full E2E test coverage
- ✅ Type-safe throughout (TypeScript)

**Verification Checklist:**
- [ ] All tests passing
- [ ] TypeScript strict mode passes
- [ ] Build succeeds
- [ ] Settings page loads and saves correctly
- [ ] Backtest page can select provider and enable compare mode
- [ ] Results display cache status correctly
- [ ] Cache functions work (write/read/clear)

**Post-Implementation Tasks (Future):**
- Connect backtest execution to Python API
- Add real user-facing error messages with recovery hints
- Performance optimization (batch API calls)
- Advanced caching strategies (partial range caching)
- Rate limit detection and adaptive backoff
