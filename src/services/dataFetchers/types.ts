// Data provider types for multi-source backtesting

export type ProviderType = 'eodhd' | 'tiingo' | 'synthetic'

// Raw OHLCV from external APIs (provider-specific formats)
export interface RawOHLCV {
  date?: string | number
  timestamp?: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  [key: string]: unknown
}

// Normalized candle format (all providers → this)
export interface NormalizedCandle {
  timestamp: Date
  o: number
  h: number
  l: number
  c: number
  v: number
}

// Fetch request options
export interface FetchOptions {
  symbol: string
  startDate: Date
  endDate: Date
  provider?: ProviderType
  useCache?: boolean
}

// Fetch result with metadata
export interface FetchResult {
  candles: NormalizedCandle[]
  provider: ProviderType
  fromCache: boolean
  cachedAt?: Date
  fetchedAt: Date
  count: number
}

// Cache entry structure
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

// Cache statistics
export interface CacheStats {
  totalEntries: number
  totalSizeBytes: number
  oldestEntry?: Date
  newestEntry?: Date
  byProvider: {
    [key in ProviderType]?: {
      count: number
      sizeBytes: number
    }
  }
}

// Provider-specific raw formats
export interface EodhhdRawCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjusted_close: number
  volume: number
}

export interface TiingoRawCandle {
  date: string
  close: number
  high: number
  low: number
  open: number
  volume: number
  adjClose: number
  adjHigh: number
  adjLow: number
  adjOpen: number
  adjVolume: number
  divCash: number
  splitFactor: number
}

// Error types
export class DataFetchError extends Error {
  constructor(
    public code: string,
    message: string,
    public provider: ProviderType,
    public recoverable: boolean = true
  ) {
    super(message)
    this.name = 'DataFetchError'
  }
}

export class RateLimitError extends DataFetchError {
  constructor(
    public provider: ProviderType,
    public retryAfterSeconds?: number
  ) {
    super(
      'RATE_LIMIT',
      `${provider} API rate limit exceeded`,
      provider,
      true
    )
    this.name = 'RateLimitError'
  }
}

export class InvalidApiKeyError extends DataFetchError {
  constructor(public provider: ProviderType) {
    super('INVALID_KEY', `Invalid API key for ${provider}`, provider, false)
    this.name = 'InvalidApiKeyError'
  }
}

export class NetworkError extends DataFetchError {
  constructor(
    public provider: ProviderType,
    message: string = 'Network timeout or connection failed'
  ) {
    super('NETWORK_ERROR', message, provider, true)
    this.name = 'NetworkError'
  }
}
