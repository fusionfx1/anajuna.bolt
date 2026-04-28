import { FetchOptions, FetchResult, ProviderType } from './types'
import { readCache, writeCache } from '../cache'
import { normalizeCandles, dedupAndSortCandles } from '../normalize'
import { createEodhhdClient } from './eodhd'
import { createTiingoClient } from './tiingo'
import { getSyntheticCandles } from './synthetic'

export interface FetchOHLCVConfig {
  eodhd_api_key?: string
  tiingo_api_key?: string
  primary_provider: ProviderType
  cache_ttl_days: number
}

let config: FetchOHLCVConfig = {
  primary_provider: 'synthetic',
  cache_ttl_days: 30,
}

export function setFetchConfig(newConfig: Partial<FetchOHLCVConfig>): void {
  config = { ...config, ...newConfig }
}

export async function fetchOHLCV(options: FetchOptions): Promise<FetchResult> {
  const {
    symbol,
    startDate,
    endDate,
    provider = config.primary_provider,
    useCache = true,
  } = options

  const cacheKey = `${symbol}-${provider}-hourly`

  // Step 1: Try cache first
  if (useCache) {
    const cached = await readCache(cacheKey, config.cache_ttl_days)
    if (cached && cached.length > 0) {
      return {
        candles: cached,
        provider,
        fromCache: true,
        cachedAt: new Date(),
        fetchedAt: new Date(),
        count: cached.length,
      }
    }
  }

  // Step 2: Try to fetch from primary provider
  try {
    const rawCandles = await fetchFromProvider(provider, symbol, startDate, endDate)
    const normalized = normalizeCandles(rawCandles, provider)
    const deduped = dedupAndSortCandles(normalized)

    // Cache the result
    await writeCache(cacheKey, deduped, provider, config.cache_ttl_days)

    return {
      candles: deduped,
      provider,
      fromCache: false,
      fetchedAt: new Date(),
      count: deduped.length,
    }
  } catch (primaryError) {
    console.warn(
      `[fetchOHLCV] Primary provider ${provider} failed:`,
      primaryError
    )

    // Step 3: Try fallback providers
    const fallbacks = getFallbackProviders(provider)
    for (const fallback of fallbacks) {
      try {
        const rawCandles = await fetchFromProvider(
          fallback,
          symbol,
          startDate,
          endDate
        )
        const normalized = normalizeCandles(rawCandles, fallback)
        const deduped = dedupAndSortCandles(normalized)

        // Don't cache fallback data with original provider key
        const fallbackKey = `${symbol}-${fallback}-hourly`
        await writeCache(fallbackKey, deduped, fallback, config.cache_ttl_days)

        console.warn(
          `[fetchOHLCV] Falling back to ${fallback} for ${symbol}`
        )

        return {
          candles: deduped,
          provider: fallback,
          fromCache: false,
          fetchedAt: new Date(),
          count: deduped.length,
        }
      } catch (fallbackError) {
        console.warn(
          `[fetchOHLCV] Fallback provider ${fallback} also failed:`,
          fallbackError
        )
        continue
      }
    }

    // Step 4: All providers failed, return empty or throw
    throw new Error(
      `Failed to fetch ${symbol} from ${provider} and all fallbacks`
    )
  }
}

async function fetchFromProvider(
  provider: ProviderType,
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<never[]> {
  if (provider === 'eodhd') {
    if (!config.eodhd_api_key) {
      throw new Error('EODHD API key not configured')
    }
    const client = createEodhhdClient(config.eodhd_api_key)
    return (await client.getCandles(symbol, startDate, endDate)) as never[]
  }

  if (provider === 'tiingo') {
    if (!config.tiingo_api_key) {
      throw new Error('Tiingo API key not configured')
    }
    const client = createTiingoClient(config.tiingo_api_key)
    return (await client.getDailyHistory(symbol, startDate, endDate)) as never[]
  }

  if (provider === 'synthetic') {
    return (await getSyntheticCandles(symbol, startDate, endDate)) as never[]
  }

  throw new Error(`Unknown provider: ${provider}`)
}

function getFallbackProviders(primary: ProviderType): ProviderType[] {
  // Fallback order: if primary fails, try others, finally synthetic
  const order: Record<ProviderType, ProviderType[]> = {
    eodhd: ['tiingo', 'synthetic'],
    tiingo: ['eodhd', 'synthetic'],
    synthetic: [],
  }

  return order[primary] || []
}

// For backwards compatibility and direct usage
export async function fetchAndBacktestCompare(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<{
  eodhd: FetchResult | null
  tiingo: FetchResult | null
  synthetic: FetchResult
}> {
  const results = {
    eodhd: null as FetchResult | null,
    tiingo: null as FetchResult | null,
    synthetic: null as FetchResult | null,
  }

  // Fetch from each provider in parallel
  const promises = [
    fetchOHLCV({
      symbol,
      startDate,
      endDate,
      provider: 'eodhd',
      useCache: true,
    }).then((r) => {
      results.eodhd = r
    }),
    fetchOHLCV({
      symbol,
      startDate,
      endDate,
      provider: 'tiingo',
      useCache: true,
    }).then((r) => {
      results.tiingo = r
    }),
    fetchOHLCV({
      symbol,
      startDate,
      endDate,
      provider: 'synthetic',
      useCache: true,
    }).then((r) => {
      results.synthetic = r
    }),
  ]

  // Wait for all, swallowing errors
  await Promise.allSettled(promises)

  return results
}
