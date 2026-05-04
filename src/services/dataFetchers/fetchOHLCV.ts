import { FetchOptions, FetchResult, ProviderType } from './types'
import { readCache, writeCache } from '../cache'
import { normalizeCandles, dedupAndSortCandles } from '../normalize'
import { getSyntheticCandles } from './synthetic'
import { createMassiveClient } from './massive'
import { supabase } from '../../lib/supabase'

export interface FetchOHLCVConfig {
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
    const normalized = normalizeCandles(rawCandles, symbol, resolveNormalizeProvider(provider))
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
        const normalized = normalizeCandles(rawCandles, symbol, (fallback === 'polygon' || fallback === 'alpaca' ? 'eodhd' : fallback === 'simulation' ? 'synthetic' : fallback) as 'eodhd' | 'tiingo' | 'synthetic')
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
  if (provider === 'eodhd' || provider === 'tiingo') {
    return fetchViaEdgeFunction(provider, symbol, startDate, endDate)
  }

  if (provider === 'massive') {
    const apiKey = localStorage.getItem('anjuna_devkey_massive') ?? ''
    if (!apiKey) throw new Error('No Massive API key configured')
    const client = createMassiveClient(apiKey)
    return (await client.getCandles({ symbol, startDate, endDate })) as never[]
  }

  if (provider === 'synthetic' || provider === 'simulation') {
    return (await getSyntheticCandles(symbol, startDate, endDate)) as never[]
  }

  // polygon, alpaca — treat as synthetic fallback for now
  console.warn(`[fetchOHLCV] Provider ${provider} not yet implemented, falling back to synthetic`)
  return (await getSyntheticCandles(symbol, startDate, endDate)) as never[]
}

async function fetchViaEdgeFunction(
  provider: 'eodhd' | 'tiingo',
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<never[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error(`[fetchOHLCV] Not authenticated — cannot fetch from ${provider}`)
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const from = startDate.toISOString().split('T')[0]
  const to = endDate.toISOString().split('T')[0]

  const res = await fetch(`${supabaseUrl}/functions/v1/data-provider-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ provider, action: 'fetch', symbol, from, to }),
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`[fetchOHLCV] ${provider} proxy error ${res.status}: ${errorBody.error ?? res.statusText}`)
  }

  const data = await res.json()
  return (data.candles ?? []) as never[]
}

function resolveNormalizeProvider(p: ProviderType): 'eodhd' | 'tiingo' | 'synthetic' {
  if (p === 'eodhd' || p === 'tiingo' || p === 'synthetic') return p
  if (p === 'massive') return 'eodhd' // same OHLC shape
  return 'synthetic'
}

function getFallbackProviders(primary: ProviderType): ProviderType[] {
  // Fallback order: if primary fails, try others, finally synthetic
  const order: Record<ProviderType, ProviderType[]> = {
    eodhd: ['tiingo', 'massive', 'synthetic'],
    tiingo: ['eodhd', 'massive', 'synthetic'],
    massive: ['eodhd', 'tiingo', 'synthetic'],
    synthetic: [],
    simulation: ['synthetic'],
    polygon: ['massive', 'eodhd', 'tiingo', 'synthetic'],
    alpaca: ['eodhd', 'tiingo', 'synthetic'],
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
  synthetic: FetchResult | null
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
