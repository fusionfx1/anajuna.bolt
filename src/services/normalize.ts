import { RawOHLCV, NormalizedCandle } from './dataFetchers/types'

/**
 * Validates a single candle object for data integrity
 * Checks: all fields present, positive values, low <= close <= high
 */
export function validateCandle(candle: unknown): boolean {
  if (!candle || typeof candle !== 'object') return false

  const c = candle as Record<string, unknown>

  // Check all fields exist and are numbers
  if (
    typeof c.timestamp !== 'number' ||
    typeof c.open !== 'number' ||
    typeof c.high !== 'number' ||
    typeof c.low !== 'number' ||
    typeof c.close !== 'number' ||
    typeof c.volume !== 'number'
  ) {
    return false
  }

  // Check for NaN or Infinity
  if (
    !Number.isFinite(c.timestamp) ||
    !Number.isFinite(c.open) ||
    !Number.isFinite(c.high) ||
    !Number.isFinite(c.low) ||
    !Number.isFinite(c.close) ||
    !Number.isFinite(c.volume)
  ) {
    return false
  }

  // All prices must be positive, volume can be 0 but not negative
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0 || c.volume < 0) {
    return false
  }

  // Check low <= close <= high relationship
  const tolerance = 0.0001
  if (
    c.low > c.close + tolerance ||
    c.close > c.high + tolerance ||
    c.low > c.high + tolerance
  ) {
    return false
  }

  return true
}

/**
 * Converts a raw candle to normalized form with symbol and provider info
 */
export function normalizeCandle(
  candle: RawOHLCV,
  symbol: string,
  provider: 'eodhd' | 'tiingo' | 'synthetic'
): NormalizedCandle {
  return {
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    symbol,
    provider,
  }
}

/**
 * Normalizes an array of raw candles, filtering out invalid entries
 * Returns sorted by timestamp ascending
 */
export function normalizeCandles(
  raw: unknown[],
  symbol: string,
  provider: 'eodhd' | 'tiingo' | 'synthetic'
): NormalizedCandle[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .filter((candle): candle is RawOHLCV => validateCandle(candle))
    .map((candle) => normalizeCandle(candle, symbol, provider))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Deduplicates candles by timestamp and sorts by timestamp ascending
 * Keeps the first occurrence when duplicates are found
 */
export function dedupAndSortCandles(
  candles: NormalizedCandle[]
): NormalizedCandle[] {
  const seen = new Set<number>()
  const deduped: NormalizedCandle[] = []

  for (const candle of candles) {
    if (!seen.has(candle.timestamp)) {
      seen.add(candle.timestamp)
      deduped.push(candle)
    }
  }

  return deduped.sort((a, b) => a.timestamp - b.timestamp)
}
