import { generateHistoricalCandles } from '../backtestService'
import type { FetchOptions, NormalizedCandle } from './types'

export class SyntheticClient {
  async getCandles(options: FetchOptions): Promise<NormalizedCandle[]> {
    const { symbol, startDate, endDate } = options

    const rawCandles = generateHistoricalCandles(
      symbol,
      'H1',
      startDate.toISOString(),
      endDate.toISOString()
    )

    const candles: NormalizedCandle[] = rawCandles
      .map((candle) => ({
        timestamp: (candle as { timestamp?: number; time?: number }).timestamp ?? (candle as { time?: number }).time ?? 0,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
        symbol,
        provider: 'synthetic' as const,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)

    return candles
  }
}

export function getSyntheticCandles(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<NormalizedCandle[]> {
  const client = new SyntheticClient()
  return client.getCandles({ symbol, startDate, endDate })
}
