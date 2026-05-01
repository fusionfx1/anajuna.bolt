// Shared types for data fetcher services

export type Provider = 'eodhd' | 'tiingo' | 'synthetic' | 'polygon' | 'alpaca' | 'simulation'
export type ProviderType = Provider // Alias for compatibility

export interface RawOHLCV {
  timestamp: number // Unix timestamp in milliseconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface NormalizedCandle {
  timestamp: number // Unix timestamp in milliseconds
  open: number
  high: number
  low: number
  close: number
  volume: number
  symbol: string
  provider: Provider
}

export interface FetchOptions {
  symbol: string
  startDate: Date
  endDate: Date
  timeframe?: '1m' | '5m' | '15m' | '1h' | '1d'
  provider?: Provider
  useCache?: boolean
}

export interface FetchResult {
  symbol?: string
  provider: Provider
  candles: NormalizedCandle[]
  fetchedAt: number | Date
  cacheHit?: boolean
  fromCache?: boolean
  cachedAt?: Date
  count?: number
  error?: string
}

export interface CacheEntry {
  key: string // "${provider}-${symbol}-${startDate}-${endDate}"
  data?: NormalizedCandle[]
  candles?: NormalizedCandle[]
  timestamp?: number // When cached
  fetchedAt?: string | Date
  expiresAt?: string | Date
  ttl?: number // Time-to-live in milliseconds
  provider?: 'eodhd' | 'tiingo' | 'synthetic'
  symbolMetadata?: {
    totalCandles: number
    dateRange: [number, number]
  }
}

export interface CacheStats {
  hits: number
  misses: number
  size: number // Number of entries
  lastCleared: number // Unix timestamp
  totalSizeBytes?: number
  totalEntries?: number
  oldestEntry?: Date
  newestEntry?: Date
  byProvider?: Record<string, { count: number; sizeBytes: number }>
}
