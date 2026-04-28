import { NormalizedCandle, RawOHLCV, ProviderType } from './dataFetchers/types'

export function normalizeCandles(
  rawData: RawOHLCV[],
  provider: ProviderType
): NormalizedCandle[] {
  return rawData.map((raw) => normalizeCandle(raw, provider))
}

export function normalizeCandle(
  raw: RawOHLCV,
  provider: ProviderType
): NormalizedCandle {
  let timestamp: Date
  let o: number
  let h: number
  let l: number
  let c: number
  let v: number

  if (provider === 'eodhd') {
    // EODHD format: { date: "YYYY-MM-DD", open, high, low, close, volume }
    timestamp = new Date(raw.date as string)
    o = raw.open
    h = raw.high
    l = raw.low
    c = raw.close
    v = raw.volume
  } else if (provider === 'tiingo') {
    // Tiingo format: { date: "YYYY-MM-DDTHH:mm:ss.000Z", open, high, low, close, volume }
    timestamp = new Date(raw.date as string)
    o = raw.open
    h = raw.high
    l = raw.low
    c = raw.close
    v = raw.volume
  } else if (provider === 'synthetic') {
    // Synthetic format: already close to standard, just ensure Date object
    timestamp = raw.date instanceof Date ? raw.date : new Date(raw.date as string)
    o = raw.open
    h = raw.high
    l = raw.low
    c = raw.close
    v = raw.volume
  } else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  // Validate the candle
  if (!validateCandle({ timestamp, o, h, l, c, v })) {
    console.warn(
      `[normalize] Invalid candle from ${provider}: ${timestamp.toISOString()}`
    )
  }

  return {
    timestamp,
    o: parseFloat(o.toFixed(8)),
    h: parseFloat(h.toFixed(8)),
    l: parseFloat(l.toFixed(8)),
    c: parseFloat(c.toFixed(8)),
    v: Math.floor(v),
  }
}

export function validateCandle(candle: NormalizedCandle): boolean {
  const { o, h, l, c, v, timestamp } = candle

  // All prices must be positive
  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
    return false
  }

  // Volume must be non-negative
  if (v < 0) {
    return false
  }

  // OHLC logic: High must be >= all others, Low must be <= all others
  // Allow small tolerance for floating point errors
  const tolerance = 0.0001
  if (h < o - tolerance || h < l - tolerance || h < c - tolerance) {
    return false
  }
  if (l > o + tolerance || l > h + tolerance || l > c + tolerance) {
    return false
  }

  // Timestamp must be a valid Date
  if (isNaN(timestamp.getTime())) {
    return false
  }

  return true
}

export function sortCandlesByTimestamp(
  candles: NormalizedCandle[]
): NormalizedCandle[] {
  return [...candles].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  )
}

export function removeDuplicateCandlesByTimestamp(
  candles: NormalizedCandle[]
): NormalizedCandle[] {
  const seen = new Set<number>()
  return candles.filter((candle) => {
    const timestamp = candle.timestamp.getTime()
    if (seen.has(timestamp)) {
      return false
    }
    seen.add(timestamp)
    return true
  })
}

export function dedupAndSortCandles(
  candles: NormalizedCandle[]
): NormalizedCandle[] {
  return sortCandlesByTimestamp(removeDuplicateCandlesByTimestamp(candles))
}
